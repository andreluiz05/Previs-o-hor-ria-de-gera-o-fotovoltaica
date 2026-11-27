import {start, delay} from './browser.mjs';
import {writeFileSync} from 'node:fs';
const {cdp, close} = await start();
const checks = [];
const assert = (ok, label) => { checks.push({label, passed: !!ok}); if (!ok) throw new Error(label); };
const clickText = async text => {
  await cdp.evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(text)})).click()`);
  await delay(100);
};
let error;
try {
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate', {url:'http://127.0.0.1:8000'});
  await cdp.wait('Boolean(document.querySelector(".weather-online"))',60000);
  assert(await cdp.evaluate('document.querySelector(".weather-panel").innerText.includes("Clima atualizado · Open-Meteo")'), 'Clima online identificado na tela');
  assert(await cdp.evaluate('document.querySelector(".weather-panel").innerText.includes("Consultado em")&&document.querySelectorAll(".weather-facts dd").length===3'), 'Horário, temperatura, nuvens e chuva acessíveis');
  await clickText('Explorar por conta própria');
  await cdp.screenshot('artifacts/pronto-clima-online.png');
  await cdp.evaluate(`URL.createObjectURL=blob=>{window.__csv=blob.text();return 'blob:verificacao'};HTMLAnchorElement.prototype.click=function(){};`);
  await clickText('Exportar CSV');
  assert((await cdp.evaluate('window.__csv')).includes('fonte_clima;clima_simulado;clima_atualizado_em') && (await cdp.evaluate('window.__csv')).includes(';online;false;'), 'CSV conserva origem do clima e data da consulta');
  await cdp.evaluate('document.querySelector(".forecast-controls").open=true;document.querySelector(".forecast-controls button[aria-pressed]").click()');
  await cdp.wait('document.querySelector(".weather-panel")?.innerText.includes("Clima de demonstração")');
  assert(await cdp.evaluate('document.querySelector(".weather-notice").innerText.includes("não representa")'), 'Demonstração avisa que o clima é ilustrativo');
  await cdp.evaluate('document.querySelector(".forecast-controls").open=false');
  await cdp.screenshot('artifacts/pronto-clima-demonstracao.png');
  await cdp.evaluate('document.querySelector(".forecast-controls").open=true;document.querySelector(".forecast-controls button[aria-pressed]").click()');
  await cdp.wait('Boolean(document.querySelector(".weather-online"))');
  assert(await cdp.evaluate('document.querySelector(".forecast-controls button[aria-pressed]").getAttribute("aria-pressed")==="false"'), 'É possível voltar à API sem recarregar');
  await cdp.evaluate('document.querySelector(".forecast-controls").open=false');
  for (const width of [375,768,1440]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false});
    for (const dark of [true,false]) {
      if (await cdp.evaluate(`(document.documentElement.dataset.theme==='dark')!==${dark}`)) await cdp.evaluate('document.querySelector(".theme-toggle").click()');
      assert(await cdp.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'), `Cartão de clima sem transbordamento ${width}, tema ${dark?'escuro':'claro'}`);
    }
    if(width===375) await cdp.screenshot('artifacts/pronto-clima-mobile.png');
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await cdp.evaluate('location.hash="consulta"');
  await cdp.wait('Boolean(document.querySelector(".sample-controls"))');
  await clickText('Testar com exemplo de 24h');
  await cdp.wait('document.querySelector("main").innerText.includes("Teste com geração fictícia")',60000);
  assert(await cdp.evaluate('document.querySelector("main").innerText.includes("Geração informada · exemplo")&&!document.querySelector("main").innerText.includes("Geração Real Medida (Inversor)")'), 'Exemplo importa com um clique sem anunciar medição real');
  assert(await cdp.evaluate('document.querySelector("main").innerText.includes("Comparação com dados de exemplo")'), 'Comparação não apresenta diagnóstico de equipamento real para dados inventados');
  await cdp.screenshot('artifacts/pronto-exemplo-importado.png');
  const csv = (await (await fetch('http://127.0.0.1:8000/api/modelo-inversor-simples')).text()).trim().split('\n').map((line,index)=>index===0?line:line.split(';')[0]+';'+(index===10?'1,50':'0,00')).join('\n');
  writeFileSync('artifacts/manual-teste.csv',csv);
  await cdp.send('DOM.enable');
  const root=await cdp.send('DOM.getDocument');
  const file=await cdp.send('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input[type=file]'});
  await cdp.send('DOM.setFileInputFiles',{nodeId:file.nodeId,files:[process.cwd()+'/artifacts/manual-teste.csv']});
  await cdp.wait('!document.querySelector(".sample-controls button").disabled');
  assert(await cdp.evaluate('[...document.querySelectorAll(".kpi-value")].some(e=>e.textContent.includes("1,50"))'), 'CSV digitado com vírgula decimal calcula exatamente 1,50 kWh');
  assert(await cdp.evaluate('document.querySelector(".sample-controls input[type=checkbox]").checked'), 'Valores de teste continuam identificados como fictícios');
  for (const width of [375,768]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    assert(await cdp.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'), 'Importador com resultado sem transbordamento '+width);
  }
  assert(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length===0, 'Nenhuma exceção JavaScript no roteiro');
} catch (e) { error=e.message; process.exitCode=1; await cdp.screenshot('artifacts/pronto-falha.png').catch(()=>{}); }
finally { writeFileSync('artifacts/pronto-uso-browser.json',JSON.stringify({checks,error},null,2)); console.log(JSON.stringify({passed:checks.filter(c=>c.passed).length,total:checks.length,error})); await close(); }
