import { start, delay } from './browser.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const { cdp, close } = await start();
const base = process.env.TECALLI_UI_URL || 'http://127.0.0.1:8000';
const results = [];
const check = (ok, label, detail) => { results.push({ label, passed: !!ok, detail }); if (!ok) throw new Error(label); };
try {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 500, deviceScaleFactor: 1, mobile: false });
  mkdirSync('../assets/banners/identidade-helionta', { recursive: true });
  for (const marca of ['helionta', 'tecalli']) {
    await cdp.send('Page.navigate', { url: base + '/brand/apresentacao.html?marca=' + marca });
    await delay(250);
    await cdp.wait(`document.title.includes('Identidades')&&getComputedStyle(document.getElementById('${marca}')).display!=='none'`);
    await cdp.evaluate('document.fonts.ready.then(()=>true)');
    await cdp.wait(`[...document.querySelectorAll('#${marca} img')].every(img=>img.complete&&img.naturalWidth>0)`);
    await cdp.screenshot('../assets/banners/identidade-helionta/' + marca + '-editorial-1500x500.png');
    check(true, 'Apresentação exportada: ' + marca);
  }
  for (const name of ['helionta-logo.png', 'tecalli-tecnologia-logo.png', 'helionta-simbolo.png']) {
    const inspection = await cdp.evaluate(`(async()=>{const image=new Image();image.src='/brand/${name}';await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);const data=context.getImageData(0,0,canvas.width,canvas.height).data;let transparent=0,visible=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)transparent++;if(data[i]>200)visible++;}return {width:canvas.width,height:canvas.height,cornerAlpha:data[3],transparentPixels:transparent,visiblePixels:visible};})()`);
    check(inspection.cornerAlpha === 0 && inspection.transparentPixels > 10000 && inspection.visiblePixels > 10000, 'Transparência real e conteúdo visível: ' + name, inspection);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: base });
  await cdp.wait('Boolean(document.querySelector(".getting-started"))');
  check(await cdp.evaluate('document.title.startsWith("Helionta")'), 'Nome do produto no título');
  check(await cdp.evaluate('document.querySelector(".helionta-logo").getAttribute("alt")==="Helionta"&&document.querySelector(".sidebar-signature img").getAttribute("alt")==="Tecalli Tecnologia"'), 'Produto e desenvolvedora têm identidades separadas');
  await cdp.wait('Boolean(document.querySelector(".forecast-kpis"))');
  await delay(300);
  await cdp.screenshot('artifacts/helionta-primeiro-acesso.png');
  await cdp.evaluate('document.querySelector(".getting-started-heading button").click()');
  await delay(100);
  await cdp.send('Page.reload');
  await delay(400);
  await cdp.wait('Boolean(document.querySelector(".forecast-kpis"))');
  check(await cdp.evaluate('!document.querySelector(".getting-started")'), 'Escolha de dispensar o guia persiste');
  await cdp.evaluate('document.querySelector(".nav-help").click()');
  await cdp.wait('Boolean(document.querySelector(".getting-started"))');
  check(true, 'Ajuda permite reabrir o guia');
  await cdp.evaluate('document.querySelector(".getting-started-step").click()');
  await cdp.wait('Boolean(document.querySelector("form"))');
  check(await cdp.evaluate('location.hash==="#usina"'), 'Primeiro passo leva ao cadastro da instalação');
  console.log(JSON.stringify({ passed: results.filter(r=>r.passed).length, results }, null, 2));
} catch (error) { results.push({ passed: false, error: error.message }); console.log('FAIL', error.message); process.exitCode = 1; }
finally { writeFileSync('artifacts/brand-validation.json', JSON.stringify(results, null, 2)); await close(); }
