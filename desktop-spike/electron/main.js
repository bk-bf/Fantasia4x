// Electron (V8 / Chromium) viability shell for the cross-engine TPS spike.
// Loads the RUNNING dev server (default http://localhost:5173) in a Chromium webview, so the sim
// executes on V8 — the same engine Electron ships everywhere, and a proxy for Windows WebView2.
//
//   Terminal 1:  ./dev.sh --profiler-autorun        (heavy scene, auto-unpaused at 4x)
//   Terminal 2:  cd desktop-spike/electron && pnpm start
//
// Read the on-screen "NNFPS · NNTPS" counter (top controls bar) and compare to your Zen number.
const { app, BrowserWindow, session, shell } = require('electron');

// ── TEMPORARY DIAGNOSTIC: hunt the stray-tab opener ──────────────────────────────────────────────
// Suppress ALL external opening (no tab can open from this process) AND log every attempt with a
// stack trace, so we can see exactly what calls it. Remove this whole block once the cause is found.
const _diag = (m) => {
  try {
    require('fs').appendFileSync(
      require('path').join(require('os').homedir(), '.cache/f4x-electron-diag.log'),
      `[${new Date().toISOString()}] ${m}\n`
    );
  } catch {
    /* ignore */
  }
};
try {
  Object.defineProperty(shell, 'openExternal', {
    configurable: true,
    writable: true,
    value: (url) => {
      _diag(`shell.openExternal SUPPRESSED url=${url}\n  ${new Error().stack.split('\n').slice(2, 7).join('\n  ')}`);
      return Promise.resolve(false);
    }
  });
  _diag('=== main start; openExternal patched + SUPPRESSED ===');
} catch (e) {
  _diag('FAILED to patch openExternal: ' + e);
}

const URL = process.env.SPIKE_URL || 'http://localhost:5173';

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
  // This is a GAME, not a browser. No in-app window may ever be spawned, and the window must never
  // navigate away from the app's own origin (a stray link, a dropped file, window.open…). Anything
  // that genuinely wants the web (an external credit/support URL) is handed to the OS's default
  // browser via shell.openExternal — it opens out there, not in our Chromium shell.
  // The shell only ever hosts ONE origin: the app's own dev/prod server (URL). Judge "is this the
  // app's origin?" against THAT fixed origin — never against win.webContents.getURL(), which goes
  // opaque/error during a dev-server restart or HMR reconnect. The old getURL()-based check misfired
  // exactly then: a same-origin reload to http://localhost:<port>/ was misread as foreign and punted
  // to the OS browser (shell.openExternal), spawning a stray Zen tab on every HMR/restart. Compare to
  // the stable APP_ORIGIN so the app's own reloads are always recognised as in-app.
  // localhost / 127.0.0.1 / ::1 are the SAME server but DIFFERENT URL origins. Vite (`--host`), HMR,
  // and redirects freely surface either alias, so comparing raw origins punted the app's own
  // 127.0.0.1 reload out to the OS browser when it had loaded as localhost (and vice-versa in the
  // sandboxed run). Treat any loopback host on the app's port+protocol as in-app.
  const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
  const APP = (() => {
    try {
      const u = new URL(URL);
      return { origin: u.origin, port: u.port, protocol: u.protocol, loopback: LOOPBACK_HOSTS.has(u.hostname) };
    } catch {
      return null;
    }
  })();
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
  const isLoopbackUrl = (u) => {
    try {
      return LOOPBACK_HOSTS.has(new URL(u).hostname);
    } catch {
      return false;
    }
  };
  // FAIL CLOSED: only ever hand a GENUINELY EXTERNAL (non-loopback, non-app) http(s) URL to the OS
  // browser. Any loopback URL — the app itself, the dev server under any alias/port, HMR, Vite
  // tooling — is NEVER punted, even if the origin-string match misfires. This is what stops the
  // recurring "stray Zen tab at http://127.0.0.1:<port>/" for good: a local URL can no longer leak
  // out, full stop. (A game shell has no legitimate reason to open localhost in your browser.)
  const shouldOpenExternal = (url) =>
    /^https?:\/\//i.test(url) && !isLoopbackUrl(url) && !isAppOrigin(url);
  _diag(`createWindow: URL=${URL}  APP=${JSON.stringify(APP)}`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    _diag(`windowOpenHandler: url=${url} should=${shouldOpenExternal(url)} loop=${isLoopbackUrl(url)} app=${isAppOrigin(url)}`);
    if (shouldOpenExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    _diag(`will-navigate: url=${url} loop=${isLoopbackUrl(url)} app=${isAppOrigin(url)}`);
    if (isAppOrigin(url) || isLoopbackUrl(url)) return; // app / local dev — allow, never punt
    e.preventDefault(); // never let the window navigate away from the app
    if (shouldOpenExternal(url)) shell.openExternal(url);
  });
  // Belt-and-suspenders: refuse cross-origin redirects (covers iframes/subframes). Loopback is in-app.
  win.webContents.on('will-redirect', (e, url) => {
    _diag(`will-redirect: url=${url} loop=${isLoopbackUrl(url)} app=${isAppOrigin(url)}`);
    if (!isAppOrigin(url) && !isLoopbackUrl(url)) e.preventDefault();
  });
  // Catch any other path that might surface a new window / external open.
  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      _diag(`web-contents-created.windowOpenHandler: url=${url}`);
      if (shouldOpenExternal(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  });

  win.webContents.setUserAgent(shellUA);
  const load = () => win.loadURL(URL, { userAgent: shellUA });
  load();

  // Dev server may not be up yet / may restart — retry instead of showing Chromium's error page.
  win.webContents.on('did-fail-load', (_e, code, desc, validatedURL) => {
    _diag(`did-fail-load: code=${code} desc=${desc} url=${validatedURL}`);
    console.warn(`load failed (${code} ${desc}) — retrying ${URL} in 1s`);
    setTimeout(load, 1000);
  });

  // Uncomment to inspect / profile inside Electron's DevTools (same profiler UI as Chrome):
  // win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
