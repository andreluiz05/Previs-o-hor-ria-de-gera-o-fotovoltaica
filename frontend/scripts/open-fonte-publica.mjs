import {start,delay} from './browser.mjs';
import {writeFileSync} from 'node:fs';

const response=await fetch('http://127.0.0.1:8000/api/fonte-publica/iniciar',{method:'POST'});
if(!response.ok)throw new Error('A coleta pública não pôde ser ativada.');
const dados=await response.json();
if(dados.erro||!dados.horas_com_dados)throw new Error('A fonte pública não carregou dados válidos.');
const {cdp,close,leaveOpen}=await start({visible:true});
let pronto=false;
try{
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:8000/#monitoramento'});
  await cdp.wait('Boolean(document.querySelector(".public-source-chart .recharts-surface"))',60000);
  const destino=process.argv.includes('--controles')?'.monitoring-source':'.public-source-kpis';
  await cdp.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(destino)});scrollTo(0,Math.max(0,scrollY+el.getBoundingClientRect().top-80));})()`);
  await cdp.send('Page.bringToFront');
  await delay(400);
  await cdp.screenshot('artifacts/fonte-publica-pronta.png');
  const report={navegador_aberto:true,coleta_ativa:dados.ativo,fonte:dados.fonte,estado:dados.estado,ultima_leitura:dados.ultima_leitura,energia_48h_kwh:dados.energia_periodo_kwh,horas_com_dados:dados.horas_com_dados,url:'http://127.0.0.1:8000/#monitoramento'};
  writeFileSync('artifacts/fonte-publica-aberta.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  pronto=true;
}finally{if(pronto)leaveOpen();else await close();}
