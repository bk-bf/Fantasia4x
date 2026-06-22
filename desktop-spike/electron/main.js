// Electron (V8 / Chromium) viability shell for the cross-engine TPS spike.
// Loads the RUNNING dev server (default http://localhost:5173) in a Chromium webview, so the sim
// executes on V8 — the same engine Electron ships everywhere, and a proxy for Windows WebView2.
//
//   Terminal 1:  ./dev.sh --profiler-autorun        (heavy scene, auto-unpaused at 4x)
//   Terminal 2:  cd desktop-spike/electron && pnpm start
//
// Read the on-screen "NNFPS · NNTPS" counter (top controls bar) and compare to your Zen number.
const { app, BrowserWindow, shell } = require('electron');

const URL = process.env.SPIKE_URL || 'http://localhost:5173';

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
  // This is a GAME, not a browser. No in-app window may ever be spawned, and the window must never
  // navigate away from the app's own origin (a stray link, a dropped file, window.open…). Anything
  // that genuinely wants the web (an external credit/support URL) is handed to the OS's default
  // browser via shell.openExternal — it opens out there, not in our Chromium shell.
  const appOrigin = () => {
    try {
      return new URL(win.webContents.getURL() || URL).origin;
    } catch {
      return new URL(URL).origin;
    }
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url).origin === appOrigin();
    } catch {
      /* unparseable → treat as foreign */
    }
    if (!sameOrigin) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  // Belt-and-suspenders: also refuse navigation to a brand-new document via will-frame-navigate
  // (covers iframes/subframes), same origin rule.
  win.webContents.on('will-redirect', (e, url) => {
    try {
      if (new URL(url).origin !== appOrigin()) e.preventDefault();
    } catch {
      e.preventDefault();
    }
  });

  const load = () => win.loadURL(URL);
  load();

  // Dev server may not be up yet / may restart — retry instead of showing Chromium's error page.
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.warn(`load failed (${code} ${desc}) — retrying ${URL} in 1s`);
    setTimeout(load, 1000);
  });

  // Uncomment to inspect / profile inside Electron's DevTools (same profiler UI as Chrome):
  // win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
