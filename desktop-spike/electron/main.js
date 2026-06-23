// Electron (V8 / Chromium) viability shell for the cross-engine TPS spike.
// Loads the RUNNING dev server (default http://localhost:5173) in a Chromium webview, so the sim
// executes on V8 — the same engine Electron ships everywhere, and a proxy for Windows WebView2.
//
//   Terminal 1:  ./dev.sh --profiler-autorun        (heavy scene, auto-unpaused at 4x)
//   Terminal 2:  cd desktop-spike/electron && pnpm start
//
// Read the on-screen "NNFPS · NNTPS" counter (top controls bar) and compare to your Zen number.
const { app, BrowserWindow, session, shell } = require('electron');

// NOTE: do NOT name this `URL` — that shadows the global WHATWG `URL` constructor for the whole module,
// making every `new URL(...)` below throw "URL is not a constructor". That bug silently broke the
// navigation hardening (every origin check fell into its catch and returned false), so the shell punted
// its OWN dev-server URL out to the OS browser — a stray Zen tab on every HMR reload / "Exit to Main
// Menu" reload. Keep it `APP_URL`.
const APP_URL = process.env.SPIKE_URL || 'http://localhost:5173';

// The dev/preview server (vite.config.ts SHELL_UA_MARKER guard) 403s any request that doesn't carry
// this marker — so the game can't be opened in a plain browser tab. We append it to the default
// session's User-Agent, which covers the document, every subresource, the sim worker, and its WASM
// fetch (they all ride the default session). Keep this string in sync with SHELL_UA_MARKER.
const SHELL_UA_MARKER = 'Fantasia4xShell';

// GC tuning experiment (§D). The renderer deserializes the whole sim snapshot every flush → high
// transient-garbage rate → the GC sawtooth you see (TPS/FPS recover on pause, dip on resume). A
// bigger V8 young generation lets that per-flush garbage die in cheap "scavenge" GCs instead of being
// promoted to old space (which triggers the expensive MAJOR GCs felt as dips). Applies to renderer +
// worker V8. Band-aid — the real fix is a smaller snapshot — and it's an A/B knob: comment out to
// compare. 128 = MB; dial down if individual scavenge pauses grow.
app.commandLine.appendSwitch('js-flags', '--max-semi-space-size=128');

// Expose the Chrome DevTools Protocol so an external debugger (the electron-debug
// MCP server) can attach to the renderer/main: targets at http://localhost:9222/json.
// Debug-only shell, so it's always on; override the port with ELECTRON_DEBUG_PORT.
app.commandLine.appendSwitch('remote-debugging-port', process.env.ELECTRON_DEBUG_PORT || '9222');

function createWindow() {
  // Stamp the shell marker into the default session UA before any request goes out.
  const shellUA = `${session.defaultSession.getUserAgent()} ${SHELL_UA_MARKER}`;
  session.defaultSession.setUserAgent(shellUA);

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    title: 'Fantasia4x — Electron / V8',
    // Paint the window with the app's --bg before the renderer's first paint, so startup shows the
    // loading screen's dark brown instead of a white flash.
    backgroundColor: '#0d0b07',
    // Frameless: no OS title bar / menu bar. (No close button as a result — quit with Ctrl-C in the
    // launch terminal, or Alt+F4.)
    frame: false,
    autoHideMenuBar: true,
    center: true,
    // Chromium throttles timers + rAF in unfocused/background windows; that would tank the TPS
    // reading the moment you click away. Disable it so the spike measures the engine, not throttling.
    backgroundThrottling: false,
    webPreferences: {
      backgroundThrottling: false
    }
  });

  // ── Navigation hardening: the engine-level guarantee that the Chromium webview is NEVER exposed ──
  // This is a GAME, not a browser. The window must never navigate away from the app, and no local URL
  // may ever leak to the OS browser. We FAIL CLOSED: a URL is opened externally ONLY if it is a
  // genuinely external (non-loopback, non-app) http(s) URL. Anything loopback — the app itself, the dev
  // server under any alias/port, HMR, Vite tooling — stays in-app, full stop. (localhost / 127.0.0.1 /
  // ::1 are the same server but different URL origins, and Vite/HMR/reloads surface any of them.)
  const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
  const APP = (() => {
    try {
      const u = new URL(APP_URL);
      return { origin: u.origin, port: u.port, protocol: u.protocol, loopback: LOOPBACK_HOSTS.has(u.hostname) };
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
      // Same server reached via a different loopback alias (localhost ⇄ 127.0.0.1 ⇄ ::1).
      return APP.loopback && LOOPBACK_HOSTS.has(x.hostname) && x.port === APP.port && x.protocol === APP.protocol;
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
    if (isAppOrigin(url) || isLoopbackUrl(url)) return; // app / local dev — allow, never punt
    e.preventDefault(); // never let the window navigate away from the app
    if (shouldOpenExternal(url)) shell.openExternal(url);
  });
  // Belt-and-suspenders: refuse cross-origin redirects (covers iframes/subframes). Loopback is in-app.
  win.webContents.on('will-redirect', (e, url) => {
    if (!isAppOrigin(url) && !isLoopbackUrl(url)) e.preventDefault();
  });

  win.webContents.setUserAgent(shellUA);
  const load = () => win.loadURL(APP_URL, { userAgent: shellUA });
  load();

  // Dev server may not be up yet / may restart — retry instead of showing Chromium's error page.
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.warn(`load failed (${code} ${desc}) — retrying ${APP_URL} in 1s`);
    setTimeout(load, 1000);
  });

  // Uncomment to inspect / profile inside Electron's DevTools (same profiler UI as Chrome):
  // win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
