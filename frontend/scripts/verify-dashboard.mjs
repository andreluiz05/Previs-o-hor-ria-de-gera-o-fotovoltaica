import {start,delay} from './browser.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
const {cdp,close}=await start();
const report={checks:[],errors:[],networkErrors:[],layout:[]};
const assert=(condition,label,detail)=>{report.checks.push({label,passed:!!condition,detail});if(!condition)throw new Error(label+' '+JSON.stringify(detail));};
async function navigate(id,ready){await cdp.evaluate(`location.hash=${JSON.stringify(id)}`);await cdp.wait(`document.querySelector('.nav-link[aria-current="page"]')?.getAttribute('href')===${JSON.stringify('#'+id)}`);await cdp.wait(ready);await delay(160);}
async function click(selector){await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(100);}
async function setValue(selector,value){return cdp.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
const screens=[['operacional','Boolean(document.querySelector(".forecast-kpis"))'],['usina','Boolean(document.querySelector("form"))'],['consulta','document.querySelectorAll(".data-table tbody tr").length>0'],['benchmark','Boolean(document.querySelector(".model-chip"))&&document.querySelectorAll(".recharts-surface").length>0'],['fisica','document.querySelectorAll(".range-input").length===6'],['treino','Boolean(document.querySelector(".form-grid-3"))']];
try{
 await cdp.send('Network.enable');
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await cdp.send('Page.navigate',{url:process.env.TECALLI_UI_URL || 'http://127.0.0.1:5173'});
 await cdp.wait('Boolean(document.querySelector(".forecast-kpis"))',60000);
 assert(await cdp.evaluate('Boolean(document.querySelector(".getting-started"))'),'Primeiro acesso: guia inicial disponível');
 assert(await cdp.evaluate('!document.querySelector(".advanced-navigation").open'),'Primeiro acesso: ferramentas técnicas recolhidas');
 await click('.getting-started-heading .btn');
 assert(await cdp.evaluate('!document.querySelector(".getting-started")'),'Guia inicial pode ser ignorado');
 if(await cdp.evaluate('document.documentElement.dataset.theme==="dark"')) await click('.theme-toggle');
 assert(await cdp.evaluate('document.querySelectorAll(".forecast-kpis .card").length===3'),'Previsão: três indicadores principais com resposta real da API');
 await click('.forecast-controls > summary');
 await setValue('.forecast-controls select',12);
 await click('.forecast-controls .field-group button[aria-pressed]');
 await cdp.wait('document.querySelector(".forecast-view").getAttribute("aria-busy")==="false"');
 assert(await cdp.evaluate('document.querySelector(".forecast-kpis").innerText.includes("12h")'),'Previsão: horizonte de 12h e contingência');
 await click('.forecast-controls > summary');
 await click('.theme-toggle');
 assert(await cdp.evaluate('document.documentElement.dataset.theme==="dark"'),'Alternar tema escuro');
 await cdp.screenshot('artifacts/dashboard-dark.png');
 await cdp.send('Page.reload');
 await delay(400);
 await cdp.wait('Boolean(document.querySelector(".forecast-kpis"))',60000);
 assert(await cdp.evaluate('document.documentElement.dataset.theme==="dark"'),'Tema persiste após recarregar');
 await click('.theme-toggle');
 for(const [id,ready] of screens){
   await navigate(id,ready);
   const data=await cdp.evaluate(`({title:document.querySelector('h1').innerText,width:innerWidth,scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,fields:[...document.querySelectorAll('input, select')].filter(e=>e.getClientRects().length&&!e.disabled&&!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).map(e=>({type:e.type,cls:e.className})),fonts:document.fonts.check('14px "Plus Jakarta Sans"')})`);
   report.layout.push({screen:id,viewport:1440,...data});
   assert(data.scroll<=data.client+1,'Sem rolagem horizontal: '+id+' desktop',data);
   assert(data.fields.length===0,'Campos com rótulos: '+id,data.fields);
   if(id==='usina'){
     await click('button[aria-controls="parametros-avancados"]');
     assert(await cdp.evaluate('Boolean(document.querySelector("#parametros-avancados"))'),'Usina: parâmetros avançados');
     await cdp.evaluate('document.querySelectorAll(".guide-panel").forEach(e=>e.open=true)');
     assert(await cdp.evaluate('document.querySelectorAll("button.journey-step").length===3'),'Guia acessível por teclado');
   }
   if(id==='consulta'){
     assert(await cdp.evaluate('document.querySelector("main").innerText.includes("histórico abaixo usa dados de demonstração")'),'Histórico sintético identificado como demonstração');
     await setValue('select', 'RandomForest');
     await cdp.wait('!document.querySelector("main").innerText.includes("Atualizando consulta…")');
     assert(await cdp.evaluate('document.querySelector("main").innerText.includes("Random Forest")'),'Consulta: mudança de modelo');
   }
   if(id==='benchmark'){
     const first='.model-chip';
     const old=await cdp.evaluate('document.querySelector(".model-chip").getAttribute("aria-pressed")');
     await click(first);
     assert(await cdp.evaluate(`document.querySelector('.model-chip').getAttribute('aria-pressed')!==${JSON.stringify(old)}`),'Benchmark: seleção de séries');
   }
   if(id==='fisica'){
     await setValue('input.range-input',12);
     await delay(700);
     assert(await cdp.evaluate('document.querySelector(".slider-top").innerText.includes("12 un")'),'Laboratório: alterar simulação');
   }
   if(id==='treino'){
     await cdp.evaluate('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("Treino Rápido")).click()');
     assert(await cdp.evaluate('[...document.querySelectorAll("input")].some(e=>e.value==="2")'),'Treinamento: predefinição rápida');
   }
   await cdp.evaluate('window.scrollTo(0,0)');
   await cdp.screenshot('artifacts/'+id+'-desktop.png');
 }
 for(const width of [375,768,1024]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   for(const [id,ready] of screens){
     await navigate(id,ready);
     const layout=await cdp.evaluate('({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})');
     report.layout.push({screen:id,viewport:width,...layout});
     assert(layout.scroll<=layout.client+1,'Sem rolagem horizontal: '+id+' '+width,layout);
     if(width===375 && id==='usina'){
       await cdp.evaluate('document.querySelectorAll("details").forEach(e=>e.open=true)');
       const expanded=await cdp.evaluate('({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})');
       assert(expanded.scroll<=expanded.client+1,'Usina: guias abertos em celular',expanded);
     }
     if(width===375) {await cdp.evaluate('scrollTo(0,0)');await cdp.screenshot('artifacts/'+id+'-mobile.png');}
   }
 }
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
 assert(await cdp.evaluate('document.querySelector(".export-button").getBoundingClientRect().width>0&&Boolean(document.querySelector(".export-button").getAttribute("aria-label"))'),'Exportação ZIP acessível e visível no celular');
 await click('#abrir-menu');
 assert(await cdp.evaluate('document.querySelector(".sidebar").classList.contains("is-open")'),'Menu móvel abre');
 assert(await cdp.evaluate('document.querySelector(".sidebar").contains(document.activeElement)'),'Menu móvel recebe foco');
 await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await delay(100);
 assert(await cdp.evaluate('!document.querySelector(".sidebar").classList.contains("is-open")&&document.activeElement.id==="abrir-menu"'),'Menu móvel: Escape fecha e devolve foco');
 await click('.skip-link');
 assert(await cdp.evaluate('document.activeElement.id==="conteudo"&&location.hash==="#treino"'),'Pular para o conteúdo preserva módulo ativo');
 await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert(await cdp.evaluate('getComputedStyle(document.querySelector(".view-stack")).animationName==="none"'),'Movimento reduzido respeitado');
 report.errors=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails);
 report.networkErrors=cdp.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400).map(e=>({url:e.params.response.url,status:e.params.response.status}));
 assert(report.errors.length===0,'Nenhuma exceção JavaScript nas seis telas',report.errors);
 assert(report.networkErrors.length===0,'Nenhuma resposta HTTP com erro',report.networkErrors);
 console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.filter(x=>x.passed).length,layout:report.layout},null,2));
} catch(error){report.failure=error.message;console.log('FAIL',error.message);await cdp.screenshot('artifacts/validation-failure.png').catch(()=>{});process.exitCode=1;}
finally{writeFileSync('artifacts/validation.json',JSON.stringify(report,null,2));await close();}


