import { start, delay } from './browser.mjs';
const response = await fetch('http://127.0.0.1:8000/api/monitoramento/iniciar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'acelerado', cenario: 'sol', nova_sessao: true }) });
if (!response.ok) throw new Error('Não foi possível ativar a simulação.');
const session = await response.json();
const { cdp, close, leaveOpen } = await start({ visible: true });
let ready = false;
try {
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8000/#monitoramento' });
  await cdp.wait('Boolean(document.querySelector(".monitoring-source-switch"))');
  await cdp.evaluate('[...document.querySelectorAll(".monitoring-source-switch button")].find(e=>e.textContent.includes("Simulador")).click()');
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("ativa")');
  await cdp.wait('Number(document.querySelectorAll(".monitoring-kpis .kpi-value")[2]?.textContent.replace(/[^0-9]/g,""))>=5', 20000);
  await cdp.evaluate('document.querySelector(".monitoring-kpis").scrollIntoView({block:"start"})');
  await cdp.send('Page.bringToFront');
  await delay(300);
  await cdp.screenshot('artifacts/monitoramento-ativo.png');
  console.log(JSON.stringify({ navegador_aberto: true, coleta_ativa: true, fonte: session.fonte, modo: session.sessao.modo, cidade: session.sessao.config.cidade, url: 'http://127.0.0.1:8000/#monitoramento' }));
  ready = true;
} finally { if (ready) leaveOpen(); else await close(); }
