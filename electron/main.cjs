// Production Electron main process for the packaged Fantasia4x binary (DISTRIBUTION Phase B/C).
//
// This is NOT the dev/profiling spike (desktop-spike/electron, which loads the live dev server) — this
// is the shippable shell electron-builder packages. It serves the adapter-static `build/` output over
// a custom `app://` scheme rather than file://, because the SvelteKit SPA fallback emits root-absolute
// asset paths (/_app/…) that break under file:// (they'd point at the OS filesystem root). Registering
// `app` as a STANDARD + SECURE scheme gives the page a real origin (app://bundle), so /_app/… resolves
// to app://bundle/_app/…, the sim Worker + WASM load, and a clean CSP can target a single origin.
const { app, BrowserWindow, protocol, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const BUILD_DIR = path.join(app.getAppPath(), 'build');
const APP_ORIGIN = 'app://bundle';

// Minimal extension→mime map. .wasm MUST be application/wasm for WebAssembly streaming instantiation.
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

// `app://` must be declared privileged BEFORE the app is ready, or the renderer won't treat it as a
// secure origin (no Workers / crypto / fetch). standard+secure = behaves like https for the page.
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

// Serve a request against build/. fs.readFile reads transparently through asar, so this works whether
// the app is packed (asar) or unpacked. Unknown paths with no extension fall back to index.html so the
// client-side router owns routing (standard SPA behaviour).
async function serve(reqUrl) {
  const { pathname } = new URL(reqUrl);
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  // Block path traversal out of BUILD_DIR.
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

// Whether DevTools may be opened — mirrored from the renderer's persisted `debugMode` setting (uiPrefs)
// over the preload IPC bridge. A normal player build keeps this false (DevTools unreachable); toggling
// "Debug mode" in Settings flips it. Gates the DevTools shortcuts in createWindow().
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
    backgroundColor: '#0d0b07', // app --bg, so the first paint isn't a white flash
    frame: false, // chromeless — the game provides its own menu/Exit (matches the spike's design)
    autoHideMenuBar: true,
    center: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, // Phase B hardening
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Avoid a flash of unpainted window — reveal once the renderer's first frame is ready.
  win.once('ready-to-show', () => win.show());

  // Keep navigation inside the app; any external link opens in the OS browser, never in-window.
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

  // Gate browser shortcuts on the in-app Debug setting. When debug mode is off, block:
  //   • DevTools open    — Ctrl+Shift+I/J/C, F12
  //   • Reload / hard reload — F5, Ctrl+R, Ctrl+Shift+R (Cmd+R on macOS)
  // A shipped player build is a game, not a browser tab: a stray reload wipes the in-memory session,
  // so reload is debug-only just like DevTools. Enabling Debug mode in Settings restores both.
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

// Single-instance: focus the existing window instead of spawning a second copy.
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

    // ── Content-Security-Policy (Phase B hardening) ───────────────────────────────────────────────
    // Deferred until the first packaged smoke-test confirms the app loads — a too-tight CSP is the #1
    // cause of a blank Electron window, and this build is not yet runtime-verified. To enable: uncomment
    // the block below and adjust if the sim Worker / WASM / audio get blocked (check DevTools console).
    //
    // const { session } = require('electron');
    // session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    //   cb({
    //     responseHeaders: {
    //       ...details.responseHeaders,
    //       'Content-Security-Policy': [
    //         "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';" +
    //         " img-src 'self' data:; font-src 'self' data:; media-src 'self' data: blob:;" +
    //         " worker-src 'self' blob:; connect-src 'self' data: blob:;"
    //       ]
    //     }
    //   });
    // });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
