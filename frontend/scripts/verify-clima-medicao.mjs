import assert from 'node:assert/strict';
import { start } from './browser.mjs';

const url = process.env.TECALLI_UI_URL || 'http://127.0.0.1:8000';
const configSalva = async () => (await (await fetch(url + '/api/status')).json()).config;
const antes = await configSalva();
const { cdp, close } = await start();
try {
  await cdp.send('Network.enable');
  await cdp.send('Page.navigate', { url: url + '/#usina' });
  await cdp.wait('Boolean(document.querySelector("#usina-nome"))');
  await cdp.evaluate(`{
    const nome = document.querySelector('#usina-nome');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(nome, 'Rascunho da demonstração');
    nome.dispatchEvent(new Event('input', { bubbles: true }));
    const clima = document.querySelector('[aria-label="Provedor da API de Clima"]');
    clima.value = 'open_meteo';
    clima.dispatchEvent(new Event('change', { bubbles: true }));
  }`);

  for (const modo of ['Sem conexão (Manual)', 'API do Inversor', 'Webhook Local']) {
    await cdp.evaluate(`[...document.querySelectorAll('[role="radio"]')].find(el => el.innerText.includes(${JSON.stringify(modo)})).click()`);
    assert.equal(await cdp.evaluate(`document.querySelector('[aria-label="Provedor da API de Clima"]').value`), 'open_meteo');
    await cdp.evaluate(`[...document.querySelectorAll('button')].find(el => el.innerText.includes('Testar clima neste endereço')).click()`);
    await cdp.wait(`Boolean(document.querySelector('.connection-selector-section .api-test-result')) &&
      !document.querySelector('.connection-selector-section button').disabled`);
    assert.ok(await cdp.evaluate(`document.querySelector('[role="radio"][aria-checked="true"]').innerText.includes(${JSON.stringify(modo)})`));
    assert.equal(await cdp.evaluate('document.querySelector("#usina-nome").value'), 'Rascunho da demonstração');
    const estado = await cdp.evaluate(`document.querySelector('.connection-selector-section .api-test-result').classList.contains('is-ok')`);
    console.log(modo, estado ? '· clima consultado' : '· indisponibilidade informada');
  }

  const escritas = cdp.events.filter(e => e.method === 'Network.requestWillBeSent')
    .map(e => e.params.request).filter(r => r.method === 'POST' && r.url.startsWith(url + '/api/'));
  assert.deepEqual(escritas.map(r => new URL(r.url).pathname), Array(3).fill('/api/apis/clima/testar'));
  assert.ok(escritas.every(r => JSON.parse(r.postData).provedor_clima === 'open_meteo'));
  assert.ok(JSON.stringify(await configSalva()) === JSON.stringify(antes), 'A consulta alterou a configuração salva.');
  console.log('Os três modos preservaram o provedor, o rascunho e a configuração salva.');
} finally {
  await close();
}
