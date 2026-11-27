import {start, delay} from './browser.mjs';
import {writeFileSync} from 'node:fs';
const {cdp,close}=await start();
const checks=[];
let error;
const check=(ok,label)=>{checks.push({label,passed:!!ok});if(!ok)throw new Error(label);};
const click=async text=>{await cdp.evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);await delay(150);};
try {
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:8000/#monitoramento'});
  await cdp.wait('Boolean(document.querySelector(".public-source-chart .recharts-surface"))',60000);
  check(await cdp.evaluate('document.querySelector(".monitoring-badge").innerText.includes("DADOS ONLINE")'), 'Fonte pública é a origem inicial e está identificada');
  check(await cdp.evaluate('!document.querySelector(".plant-overview")&&document.querySelector(".public-source-context").innerText.includes("não representam sua casa")'), 'Cadastro de Igarassu não aparece como origem das medições externas');
  check(await cdp.evaluate('document.querySelector(".public-source-attribution").innerText.includes("/0145/S1/G1/INV/2")'), 'Identificador verificável da fonte publicado na tela');
  check(await cdp.evaluate('document.querySelector(".public-source-details").innerText.includes("Brasil")&&document.querySelector(".public-source-details").innerText.includes("Nova York")'), 'Horário de origem e horário do Brasil estão explícitos');
  check(await cdp.evaluate('document.querySelectorAll(".public-source-kpis .card").length===3'), 'Potência, energia no período e contador têm indicadores separados');
  const api=await (await fetch('http://127.0.0.1:8000/api/fonte-publica/status')).json();
  check(api.ativo&&api.erro===null&&api.horas_com_dados>0, 'Interface usa coleta online e histórico recebidos pela API real');
  if(api.estado==='atrasado') check(await cdp.evaluate('document.querySelector(".monitoring-state").innerText.includes("atrasada")'), 'Leitura antiga não é anunciada como atual');
  await cdp.screenshot('artifacts/fonte-publica-desktop.png');
  await click('Desconectar API');
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("desconectada")');
  check(!(await (await fetch('http://127.0.0.1:8000/api/fonte-publica/status')).json()).ativo, 'Pausa da interface chega ao coletor real');
  await cdp.send('Page.reload');
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("desconectada")');
  check(await cdp.evaluate('Boolean(document.querySelector(".public-source-chart .recharts-surface"))'), 'Histórico reaparece após recarregar com a coleta pausada');
  await click('Conectar API');
  await cdp.wait('document.querySelector(".public-source-view button.btn-primary")?.disabled&&!document.querySelector(".public-source-view").getAttribute("aria-busy").includes("true")');
  check((await (await fetch('http://127.0.0.1:8000/api/fonte-publica/status')).json()).ativo, 'Retomada pela interface reativa a coleta');
  const url=await cdp.evaluate('document.querySelector(".public-source-view a[download]").href');
  const exported=await (await fetch(url)).text();
  check(exported.includes('SOLARNETWORK_PUBLICO_EXTERNO')&&exported.includes('source_id;qualidade;fuso_origem'), 'Exportação preserva identificação e qualidade dos dados');

  // Simula apenas a falha do serviço na resposta de status; não altera o banco nem o coletor.
  const last=await (await fetch('http://127.0.0.1:8000/api/fonte-publica/status')).json();
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/api/fonte-publica/status*',requestStage:'Request'}]});
  const fulfill=async event=>{
    const m=JSON.parse(event.data);
    if(m.method!=='Fetch.requestPaused')return;
    await cdp.send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({...last,estado:'erro',erro:'Falha externa verificada. Nenhum dado será simulado.'})).toString('base64')});
  };
  cdp.ws.addEventListener('message',fulfill);
  await cdp.wait('document.querySelector(".notice-banner.danger")?.innerText.includes("Falha externa verificada")',20000);
  check(await cdp.evaluate('Boolean(document.querySelector(".public-source-chart .recharts-surface"))&&document.querySelector(".monitoring-badge").innerText.includes("DADOS ONLINE")'), 'Falha externa mantém os últimos dados e o aviso sem trocar por simulador');
  await cdp.send('Fetch.disable');
  cdp.ws.removeEventListener('message',fulfill);
  await cdp.wait('!document.querySelector(".notice-banner.danger")',20000);
  check(true,'Interface recupera a conexão sem recarregar');
  for(const width of [375,768,1440]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await delay(300);
    for(const dark of [true,false]) {
      if(await cdp.evaluate(`(document.documentElement.dataset.theme==='dark')!==${dark}`))await cdp.evaluate('document.querySelector(".theme-toggle").click()');
      check(await cdp.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'), `Sem transbordamento em ${width}px, tema ${dark?'escuro':'claro'}`);
    }
    await cdp.evaluate('document.querySelector(".public-source-hourly").open=true');
    check(await cdp.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'), 'Tabela aberta fica contida em '+width+'px');
    await cdp.evaluate('document.querySelector(".public-source-hourly").open=false;scrollTo(0,0)');
    if(width===375)await cdp.screenshot('artifacts/fonte-publica-mobile.png');
  }
  await click('Simulador');
  await cdp.wait('Boolean(document.querySelector(".monitoring-view"))');
  check(await cdp.evaluate('document.querySelector(".monitoring-badge").innerText.includes("DADOS FICTÍCIOS")&&!document.querySelector(".public-source-kpis")'), 'Simulador continua disponível com outra origem e outro histórico');
  await click('Fonte pública online');
  await cdp.wait('Boolean(document.querySelector(".public-source-chart .recharts-surface"))');
  await cdp.send('Page.reload');
  await cdp.wait('Boolean(document.querySelector(".public-source-view"))');
  check(await cdp.evaluate('localStorage.getItem("helionta-monitor-origem")==="publica"'), 'Escolha da fonte permanece ao recarregar');
  check(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length===0,'Nenhuma exceção JavaScript no fluxo online');
}catch(e){error=e.message;process.exitCode=1;await cdp.screenshot('artifacts/fonte-publica-falha.png').catch(()=>{});}
finally{writeFileSync('artifacts/fonte-publica-browser.json',JSON.stringify({checks,error},null,2));console.log(JSON.stringify({passed:checks.filter(x=>x.passed).length,total:checks.length,error}));await close();}
