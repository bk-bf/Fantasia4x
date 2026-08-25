const { app, BrowserWindow, protocol, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const BUILD_DIR = path.join(app.getAppPath(), 'build');
const APP_ORIGIN = 'app://bundle';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.map': 'application/json'
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true
    }
  }
]);

async function serve(reqUrl) {
  const { pathname } = new URL(reqUrl);
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(BUILD_DIR, rel));
  if (!filePath.startsWith(BUILD_DIR)) return new Response('forbidden', { status: 403 });

  try {
    const data = await fs.promises.readFile(filePath);
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return new Response(data, { headers: { 'content-type': mime } });
  } catch {
    if (path.extname(rel)) return new Response('not found', { status: 404 });
    const html = await fs.promises.readFile(path.join(BUILD_DIR, 'index.html'));
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  }
}

let debugMode = false;
ipcMain.on('f4x:set-debug-mode', (_event, on) => {
  debugMode = !!on;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 640,
    title: 'Fantasia4x',
    backgroundColor: '#0d0b07',
    frame: false,
    autoHideMenuBar: true,
    center: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_ORIGIN)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (debugMode || input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    const isDevTools =
      key === 'f12' ||
      (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c'));
    const isReload = key === 'f5' || ((input.control || input.meta) && key === 'r');
    if (isDevTools || isReload) event.preventDefault();
  });
  win.webContents.on('devtools-opened', () => {
    if (!debugMode) win.webContents.closeDevTools();
  });

  win.loadURL(`${APP_ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('app', (req) => serve(req.url));

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
