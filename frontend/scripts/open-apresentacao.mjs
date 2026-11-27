import {start, delay} from './browser.mjs';
import {writeFileSync} from 'node:fs';

const {cdp, close, leaveOpen} = await start({visible:true});
let pronto = false;
try {
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:8000/#operacional'});
  await cdp.wait('Boolean(document.querySelector(".weather-online"))',60000);
  await cdp.evaluate('localStorage.setItem("helionta-guia-visto","sim");document.querySelector(".getting-started-heading .btn")?.click()');
  if(await cdp.evaluate('document.documentElement.dataset.theme==="dark"')) await cdp.evaluate('document.querySelector(".theme-toggle").click()');
  await cdp.evaluate('document.querySelector(".forecast-toolbar").scrollIntoView({block:"start"})');
  await cdp.send('Page.bringToFront');
  await delay(400);
  await cdp.screenshot('artifacts/apresentacao-pronta.png');
  const resultado = {navegador_aberto:true,clima_online:true,url:'http://127.0.0.1:8000',cidade:'Igarassu, Pernambuco',verificado_em:new Date().toISOString()};
  writeFileSync('artifacts/apresentacao-aberta.json',JSON.stringify(resultado,null,2));
  console.log(JSON.stringify(resultado));
  pronto = true;
} finally {
  if(pronto) leaveOpen(); else await close();
}
