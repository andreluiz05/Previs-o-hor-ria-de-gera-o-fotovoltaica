import {start,delay} from './browser.mjs';
import {writeFileSync} from 'node:fs';
const {cdp,close}=await start();
const checks=[]; const requests=[];
const assert=(ok,label)=>{checks.push({label,passed:!!ok});if(!ok)throw new Error(label);};
const evaluate=expression=>cdp.evaluate(expression);
async function clickText(text){await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(text)})).click()`);await delay(100);}
async function setValue(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(80);}
let finalStatus;let error='';
try{
 const baseline=await (await fetch('http://127.0.0.1:8000/api/status')).json();
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/api/config',requestStage:'Request'},{urlPattern:'*/api/train',requestStage:'Request'},{urlPattern:'*/api/train/status',requestStage:'Request'}]});
 cdp.ws.addEventListener('message',async event=>{
   const message=JSON.parse(event.data);
   if(message.method!=='Fetch.requestPaused')return;
   const {requestId,request}=message.params;let body;
   requests.push({url:request.url,body:request.postData});
   if(request.url.endsWith('/api/config'))body={mensagem:'Configuração salva (verificação de interface).',config:JSON.parse(request.postData)};
   else if(request.url.endsWith('/api/train'))body={estado:{em_andamento:true,progresso_pct:10,mensagem:'Verificando interação de treinamento'}};
   else body={em_andamento:false,progresso_pct:100,mensagem:'Interação de treinamento verificada',erro:null};
   await cdp.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
 });
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await cdp.send('Page.navigate',{url:(process.env.TECALLI_UI_URL || 'http://127.0.0.1:5173')+'/#usina'});
 await cdp.wait('Boolean(document.querySelector("form"))');
 await setValue('input[id="painelminhausina-campo-1"]','Teste de interface');
 await clickText('Salvar configuração');
 await cdp.wait('document.querySelector("main").innerText.includes("Configuração salva (verificação de interface).")');
 const configRequest=requests.find(r=>r.url.endsWith('/api/config'));
 assert(configRequest&&JSON.parse(configRequest.body).nome==='Teste de interface','Salvar usina: payload editado e confirmação na interface (HTTP simulado)');
 await clickText('Ver Previsão');
 await cdp.wait('Boolean(document.querySelector(".forecast-kpis"))',60000);
 assert(await evaluate('location.hash==="#operacional"'),'Link após salvar abre a previsão');
 await evaluate(`URL.createObjectURL=(blob)=>{window.__csv=blob.text();return 'blob:teste'};HTMLAnchorElement.prototype.click=function(){};`);
 await clickText('Exportar CSV');
 assert((await evaluate('window.__csv')).includes('data_hora;referencia_fisica_kwh;previsao_lstm_kwh;economia_rs'),'CSV da previsão contém colunas e dados reais');
 await evaluate('location.hash="consulta"');
 await cdp.wait('Boolean(document.getElementById("painelconsultacomparacao-campo-1"))&&document.querySelectorAll(".data-table tbody tr").length>0');
 await evaluate(`window.__csv=undefined`);
 const exportText=await evaluate('[...document.querySelectorAll("button")].map(e=>e.textContent).filter(t=>t.includes("Exportar"))');
 console.log('Export buttons',exportText);
 if(exportText.length){await clickText(exportText[0].trim());assert((await evaluate('window.__csv')).includes('geracao_real_kwh;previsao_kwh'),'CSV da consulta contém histórico comparativo');}
 writeFileSync('artifacts/invalid.csv','coluna_invalida\n1\n');
 await cdp.send('DOM.enable');
 const root=await cdp.send('DOM.getDocument');
 const file=await cdp.send('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input[type=file]'});
 await cdp.send('DOM.setFileInputFiles',{nodeId:file.nodeId,files:[process.cwd()+'/artifacts/invalid.csv']});
 await cdp.wait('Boolean(document.querySelector(".notice-banner.danger"))');
 assert(await evaluate('document.querySelector(".notice-banner.danger").innerText.length>5'),'Importação do inversor: erro de CSV inválido visível (API real)');
 await evaluate('location.hash="treino"');
 await cdp.wait('Boolean(document.querySelector(".form-grid-3"))&&document.querySelector("h1").innerText.includes("Treinamento")');
 await clickText('Modo CSV Medido');
 assert(await evaluate('document.querySelector("input[type=file]").labels.length>0'),'Upload de treinamento possui rótulo acessível');
 await clickText('Modo Demo');
 await clickText('Treino Rápido');
 await clickText('Iniciar Treinamento');
 await cdp.wait('document.querySelector("main").innerText.includes("Interação de treinamento verificada")');
 const trainRequest=requests.find(r=>r.url.endsWith('/api/train'));
 assert(trainRequest&&JSON.parse(trainRequest.body).epocas===2&&JSON.parse(trainRequest.body).seeds[0]===42,'Treinamento: predefinição enviada, progresso e conclusão (HTTP simulado)');
 finalStatus=await (await fetch('http://127.0.0.1:8000/api/status')).json();
 assert(JSON.stringify(finalStatus.config)===JSON.stringify(baseline.config),'Configuração real da usina preservada durante os testes');
 assert(!(await (await fetch('http://127.0.0.1:8000/api/health')).json()).training_running,'Nenhum treinamento real iniciado');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
}catch(e){error=e.message;console.log('FAIL',error);process.exitCode=1;await cdp.screenshot('artifacts/actions-failure.png').catch(()=>{});}
finally{writeFileSync('artifacts/actions-validation.json',JSON.stringify({checks,error},null,2));await close();}

