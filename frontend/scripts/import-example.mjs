import { start, delay } from './browser.mjs';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve('public/exemplos/EXEMPLO_FICTICIO_24H_EDITAVEL.csv');
if (!existsSync(file)) throw new Error('CSV de exemplo não encontrado.');
const { cdp, close, leaveOpen } = await start({ visible: true });
let imported = false;
try {
  await cdp.send('Network.enable');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8000/#consulta' });
  await cdp.wait('Boolean(document.querySelector(".file-picker input[type=file]"))');
  await cdp.send('DOM.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.file-picker input[type=file]' });
  await cdp.send('DOM.setFileInputFiles', { nodeId, files: [file] });
  await cdp.wait('document.querySelector("main").innerText.includes("Geração Real Medida (Inversor)")', 60000);
  const event = [...cdp.events].reverse().find(item => item.method === 'Network.responseReceived' && item.params.response.url.endsWith('/api/importar-inversor'));
  if (!event || event.params.response.status !== 200) throw new Error('Resposta de importação não confirmada.');
  const body = await cdp.send('Network.getResponseBody', { requestId: event.params.requestId });
  const result = JSON.parse(body.base64Encoded ? Buffer.from(body.body, 'base64').toString() : body.body);
  if (result.horas_analisadas !== 24) throw new Error('Quantidade de horas importadas diferente da esperada.');
  const report = { arquivo: file, natureza: 'EXEMPLO FICTÍCIO — simulação sem placas instaladas', horas_analisadas: result.horas_analisadas, periodo_inicio: result.periodo_inicio, periodo_fim: result.periodo_fim, energia_exemplo_kwh: result.energia_real_total_kwh, fonte_meteorologia: result.fonte_meteorologia, treinamento_executado: false, resultado: result };
  writeFileSync('artifacts/importacao-exemplo-igarassu.json', JSON.stringify(report, null, 2));
  await cdp.evaluate('document.querySelector("main section.card").scrollIntoView({block:"start"}); document.title="Helionta · CSV de exemplo importado"');
  await cdp.send('Page.bringToFront');
  await delay(500);
  await cdp.screenshot('artifacts/importacao-exemplo-igarassu.png');
  imported = true;
  console.log(JSON.stringify({ importado: true, horas: result.horas_analisadas, geracao_ficticia_kwh: result.energia_real_total_kwh, navegador_aberto: true, resultado_salvo: 'artifacts/importacao-exemplo-igarassu.json' }));
} finally {
  if (imported) leaveOpen();
  else await close();
}
