const { app, BrowserWindow, session, shell, ipcMain } = require('electron');
const path = require('path');

const APP_URL = process.env.SPIKE_URL || 'http://localhost:5173';

const SHELL_UA_MARKER = 'Fantasia4xShell';

const PLAY_MODE = process.env.F4X_PLAY === 'true';

let debugMode = false;
ipcMain.on('f4x:set-debug-mode', (_event, on) => {
  debugMode = !!on;
});

app.commandLine.appendSwitch('js-flags', '--max-semi-space-size=128');

app.commandLine.appendSwitch('remote-debugging-port', process.env.ELECTRON_DEBUG_PORT || '9222');

app.commandLine.appendSwitch('log-level', '3');

function createWindow() {
  const shellUA = `${session.defaultSession.getUserAgent()} ${SHELL_UA_MARKER}`;
  session.defaultSession.setUserAgent(shellUA);

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    title: 'Fantasia4x — Electron / V8',
    backgroundColor: '#0d0b07',
    frame: false,
    autoHideMenuBar: true,
    center: true,
    backgroundThrottling: false,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      devTools: true
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (!PLAY_MODE || debugMode || input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    const isDevTools =
      key === 'f12' ||
      (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c'));
    const isReload = key === 'f5' || ((input.control || input.meta) && key === 'r');
    if (isDevTools || isReload) event.preventDefault();
  });
  win.webContents.on('devtools-opened', () => {
    if (PLAY_MODE && !debugMode) win.webContents.closeDevTools();
  });

  const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
  const APP = (() => {
    try {
      const u = new URL(APP_URL);
      return {
        origin: u.origin,
        port: u.port,
        protocol: u.protocol,
        loopback: LOOPBACK_HOSTS.has(u.hostname)
      };
    } catch {
      return null;
    }
  })();
  const isLoopbackUrl = (u) => {
    try {
      return LOOPBACK_HOSTS.has(new URL(u).hostname);
    } catch {
      return false;
    }
  };
  const isAppOrigin = (u) => {
    if (!APP) return false;
    try {
      const x = new URL(u);
      if (x.origin === APP.origin) return true;
      return (
        APP.loopback &&
        LOOPBACK_HOSTS.has(x.hostname) &&
        x.port === APP.port &&
        x.protocol === APP.protocol
      );
    } catch {
      return false;
    }
  };
  const shouldOpenExternal = (url) =>
    /^https?:\/\//i.test(url) && !isLoopbackUrl(url) && !isAppOrigin(url);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppOrigin(url) || isLoopbackUrl(url)) return;
    e.preventDefault();
    if (shouldOpenExternal(url)) shell.openExternal(url);
  });
  win.webContents.on('will-redirect', (e, url) => {
    if (!isAppOrigin(url) && !isLoopbackUrl(url)) e.preventDefault();
  });

  win.webContents.setUserAgent(shellUA);
  const load = () => win.loadURL(APP_URL, { userAgent: shellUA }).catch(() => {});
  load();

  let waitLogged = false;
  win.webContents.on('did-fail-load', () => {
    if (!waitLogged) {
      console.log(`waiting for dev server at ${APP_URL}…`);
      waitLogged = true;
    }
    setTimeout(load, 1000);
  });
  win.webContents.on('did-finish-load', () => {
    if (waitLogged) console.log('dev server connected.');
    waitLogged = false;
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
