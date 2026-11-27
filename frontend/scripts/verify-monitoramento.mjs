import { start, delay } from './browser.mjs';
import { writeFileSync } from 'node:fs';
const { cdp, close } = await start();
const report = { checks: [], errors: [] };
const api = 'http://127.0.0.1:8000';
const check = (ok, label, detail) => { report.checks.push({ label, passed: !!ok, detail }); if (!ok) throw new Error(label); };
const snapshot = async () => (await fetch(api + '/api/monitoramento/status')).json();
const button = (text) => `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
async function click(text) { await cdp.evaluate(`${button(text)}.click()`); await delay(100); }
async function setValue(id, value) { await cdp.evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
const count = () => cdp.evaluate('Number(document.querySelectorAll(".monitoring-kpis .kpi-value")[2].textContent.replace(/[^0-9]/g,""))');
try {
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: api + '/#monitoramento' });
  await cdp.wait('Boolean(document.querySelector(".monitoring-source-switch"))');
  await click('Simulador');
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("ativa")');
  check(await cdp.evaluate('document.querySelector(".monitoring-badge").innerText.includes("DADOS FICTÍCIOS")'), 'Origem simulada visível');
  let before = await count();
  await delay(3000);
  check(await count() > before, 'Dashboard recebe novas leituras automaticamente');
  await click('Pausar');
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("pausada")');
  const paused = await snapshot();
  await delay(2500);
  check((await snapshot()).total_leituras === paused.total_leituras, 'Pausa no dashboard interrompe a coleta');
  await cdp.send('Page.reload');
  await delay(400);
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("pausada")');
  check(await count() === paused.total_leituras, 'Histórico reaparece ao recarregar');
  const firstSession = paused.sessao.id;
  await setValue('cenario-simulador', 'nublado');
  await click('Nova simulação');
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("ativa")');
  const fresh = await snapshot();
  check(fresh.sessao.id !== firstSession && fresh.sessao.cenario === 'nublado', 'Novo cenário inicia sessão separada');
  await delay(2500);
  await setValue('historico-simulador', firstSession);
  await cdp.wait('Boolean([...document.querySelectorAll("button")].find(e=>e.textContent==="Voltar à simulação atual"))');
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("pausada")');
  check(await count() === paused.total_leituras, 'Histórico anterior mantém seus dados');
  await click('Voltar à simulação atual');
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("ativa")');
  const csv = await (await fetch(api + '/api/monitoramento/exportar')).text();
  check(csv.includes('SIMULADOR_FICTICIO') && csv.includes('cobertura_minutos'), 'Exportação identifica origem e qualidade');
  const nodeBefore = await snapshot();
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("Sem conexão")');
  await delay(2500);
  check((await snapshot()).total_leituras > nodeBefore.total_leituras, 'Coletor continua sem comunicação com a página');
  check(await cdp.evaluate('!document.querySelector(".monitoring-state").classList.contains("collecting")'), 'Falha de rede não aparece como conexão saudável');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.wait('document.querySelector(".monitoring-state")?.innerText.includes("ativa")');
  check(await count() > nodeBefore.total_leituras, 'Reconexão recupera leituras persistidas');
  for (const width of [1440, 1024, 768, 375]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await delay(150);
    const layout = await cdp.evaluate('({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})');
    check(layout.scroll <= layout.client + 1, 'Sem rolagem horizontal em ' + width, layout);
    await cdp.evaluate('scrollTo(0,0)');
    await cdp.screenshot('artifacts/monitoramento-' + width + '.png');
  }
  const unlabeled = await cdp.evaluate('[...document.querySelectorAll(".monitoring-view input,.monitoring-view select")].filter(e=>!e.labels.length&&!e.getAttribute("aria-label")).length');
  check(unlabeled === 0, 'Controles têm rótulos acessíveis');
  await cdp.evaluate('document.querySelector(".theme-toggle").click()');
  await delay(150);
  await cdp.screenshot('artifacts/monitoramento-dark.png');
  report.errors = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown');
  check(report.errors.length === 0, 'Nenhuma exceção JavaScript no novo módulo');
  console.log(JSON.stringify({ checks: report.checks.length, passed: report.checks.filter(c=>c.passed).length }, null, 2));
} catch (error) {
  report.failure = error.message;
  await cdp.screenshot('artifacts/monitoramento-failure.png').catch(()=>{});
  console.log('FAIL', error.message);
  process.exitCode = 1;
} finally {
  writeFileSync('artifacts/monitoramento-ui-validation.json', JSON.stringify(report, null, 2));
  await close();
}
