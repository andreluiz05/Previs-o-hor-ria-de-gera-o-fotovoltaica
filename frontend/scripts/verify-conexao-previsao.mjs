import {start,delay} from './browser.mjs';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:8000';
const original=(await (await fetch(base+'/api/status')).json()).config;
const estadoOriginal=await (await fetch(base+'/api/fonte-publica/status')).json();
const {cdp,close}=await start();
const checks=[];
let error;
const check=(ok,label)=>{checks.push({label,passed:!!ok});if(!ok)throw new Error(label);};
const click=async text=>{await cdp.evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);await delay(120);};
const setValue=async (id,value)=>{await cdp.evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
try{
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:base+'/#inversor-publico'});
  await cdp.wait('Boolean(document.querySelector(".public-source-forecast"))&&Boolean(document.querySelector(".public-source-view button.btn-primary:not(:disabled)"))||Boolean(document.querySelector(".public-source-view button.btn:not(.btn-primary):not(:disabled)"))');
  if(!(await (await fetch(base+'/api/fonte-publica/status')).json()).ativo){await click('Conectar API');await cdp.wait('document.querySelector(".public-source-view button.btn-primary").disabled&&document.querySelector(".public-source-view").getAttribute("aria-busy")==="false"');}
  await click('Desconectar API');
  await cdp.wait('Boolean(document.querySelector(".public-disconnected"))&&document.querySelector(".public-source-view").getAttribute("aria-busy")==="false"');
  const desligada=await (await fetch(base+'/api/fonte-publica/status')).json();
  check(!desligada.ativo,'Desconectar API interrompe a coleta no servidor');
  check(await cdp.evaluate('document.querySelector(".monitoring-state").dataset.estado==="pausado"&&document.querySelector(".public-disconnected").innerText.includes("histórico permanece")'),'Estado desconectado e preservação do histórico explícitos');
  const calls=cdp.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
  check(calls.some(url=>url.endsWith('/api/fonte-publica/desconectar')),'Botão utiliza o endpoint de desconexão');
  await cdp.send('Page.reload');
  await cdp.wait('Boolean(document.querySelector(".public-disconnected"))');
  check(!(await (await fetch(base+'/api/fonte-publica/status')).json()).ativo,'Desconexão permanece ao recarregar');
  await cdp.screenshot('artifacts/api-desconectada.png');
  await click('Configurar minha usina');
  await cdp.wait('Boolean(document.getElementById("painelminhausina-campo-3"))');
  check(await cdp.evaluate('location.hash==="#usina"'),'Atalho abre o cadastro da instalação');
  const placas=original.quantidade_placas===8?12:8;
  await setValue('painelminhausina-campo-3',placas);
  await setValue('painelminhausina-campo-2',1.1);
  await click('Salvar configuração');
  await cdp.wait('document.querySelector("main").innerText.includes("Configuração da usina salva com sucesso")');
  const saved=(await (await fetch(base+'/api/status')).json()).config;
  check(saved.quantidade_placas===placas&&saved.tarifa_energia_rs===1.1,'Placas e tarifa digitadas foram salvas pela interface real');
  await click('Ver Previsão das Próximas 24h Agora');
  await cdp.wait('Boolean(document.querySelector(".forecast-kpis"))&&document.querySelector(".forecast-view").getAttribute("aria-busy")==="false"',60000);
  const evento=cdp.events.findLast(e=>e.method==='Network.responseReceived'&&e.params.response.url.endsWith('/api/forecast/live'));
  const resposta=await cdp.send('Network.getResponseBody',{requestId:evento.params.requestId});
  const forecast=JSON.parse(resposta.base64Encoded?Buffer.from(resposta.body,'base64').toString():resposta.body);
  check(forecast.kwp_instalado===Number((placas*original.potencia_placa_wp/1000).toFixed(2))&&forecast.tarifa_energia_rs===1.1,'Previsão utiliza os equipamentos e a tarifa informados');
  check(forecast.serie.length===24&&Number.isFinite(forecast.energia_total_lstm_kwh),'Previsão de 24 horas calculada com a fonte pública desconectada');
  const final=await (await fetch(base+'/api/fonte-publica/status')).json();
  check(!final.ativo&&final.ultima_tentativa_em===desligada.ultima_tentativa_em,'Previsão não reativa nem consulta a SolarNetwork');
  check(final.total_leituras===desligada.total_leituras,'Histórico da fonte pública preservado durante a demonstração');
  await cdp.screenshot('artifacts/previsao-com-api-publica-desconectada.png');
  await cdp.evaluate('location.hash="inversor-publico"');
  await cdp.wait('Boolean(document.querySelector(".public-disconnected"))');
  await click('Conectar API');
  await cdp.wait('!document.querySelector(".public-disconnected")&&document.querySelector(".public-source-view").getAttribute("aria-busy")==="false"');
  check((await (await fetch(base+'/api/fonte-publica/status')).json()).ativo,'Conectar API reabilita a coleta após a demonstração');
  await click('Ver minha previsão');
  await cdp.wait('location.hash==="#operacional"&&Boolean(document.querySelector(".forecast-kpis"))',60000);
  check(true,'Atalho Ver minha previsão abre o painel de previsão');
  check(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length===0,'Nenhuma exceção JavaScript no fluxo completo');
}catch(e){error=e.message;process.exitCode=1;await cdp.screenshot('artifacts/conexao-previsao-falha.png').catch(()=>{});}
finally{
  const restore=await fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(original)});
  if(!restore.ok){error=(error||'')+' Falha ao restaurar cadastro.';process.exitCode=1;}
  await fetch(base+'/api/fonte-publica/'+(estadoOriginal.ativo?'conectar':'desconectar'),{method:'POST'});
  writeFileSync('artifacts/conexao-previsao-browser.json',JSON.stringify({checks,error},null,2));
  console.log(JSON.stringify({passed:checks.filter(c=>c.passed).length,total:checks.length,error}));
  await close();
}
