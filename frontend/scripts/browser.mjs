import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Chrome DevTools Protocol com módulos nativos do Node; sem dependências de teste.
class BrowserPage {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id) { this.events.push(message); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }
  get ws() { return this.socket; }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tempo excedido: ${method}`));
      }, 20000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async wait(expression, timeout = 45000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return;
      await delay(250);
    }
    throw new Error(`Condição não atendida: ${expression}`);
  }
  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(data, 'base64'));
  }
}

export async function start({ visible = false } = {}) {
  const executable = process.env.TECALLI_BROWSER || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  if (!executable) throw new Error('Defina TECALLI_BROWSER com o caminho do Chrome ou Edge.');
  mkdirSync('artifacts', { recursive: true });
  const temporaryRoot = resolve('artifacts/browser-profiles');
  mkdirSync(temporaryRoot, { recursive: true });
  const profile = mkdtempSync(join(temporaryRoot, 'tecalli-ui-'));
  const browser = spawn(executable, [
    ...(visible ? [] : ['--headless=new']), '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-extensions', '--no-sandbox', '--in-process-gpu',
    '--disable-software-rasterizer', 'about:blank',
  ], { windowsHide: !visible, detached: visible, stdio: 'ignore' });
  let cdp;
  const close = async () => {
    if (cdp) {
      await cdp.send('Browser.close').catch(() => {});
      cdp.socket.close();
    }
    browser.kill();
    await delay(750);
    // Remove somente o perfil isolado criado por esta execução.
    if (dirname(resolve(profile)) !== temporaryRoot || !profile.includes('tecalli-ui-')) {
      throw new Error('Diretório temporário fora da raiz esperada.');
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    const portFile = join(profile, 'DevToolsActivePort');
    for (let attempt = 0; attempt < 40 && !existsSync(portFile); attempt++) await delay(500);
    if (!existsSync(portFile)) throw new Error('O navegador não iniciou o protocolo de automação.');
    const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find(item => item.type === 'page');
    if (!target) throw new Error('Página de verificação não encontrada.');
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    cdp = new BrowserPage(socket);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const leaveOpen = () => {
      if (!visible) throw new Error('Somente a revisão visível pode permanecer aberta.');
      cdp.socket.close();
      browser.unref();
    };
    return { cdp, close, leaveOpen };
  } catch (error) {
    await close();
    throw error;
  }
}
