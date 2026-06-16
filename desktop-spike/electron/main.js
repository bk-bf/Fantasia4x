// Electron (V8 / Chromium) viability shell for the cross-engine TPS spike.
// Loads the RUNNING dev server (default http://localhost:5173) in a Chromium webview, so the sim
// executes on V8 — the same engine Electron ships everywhere, and a proxy for Windows WebView2.
//
//   Terminal 1:  ./dev.sh --profiler-autorun        (heavy scene, auto-unpaused at 4x)
//   Terminal 2:  cd desktop-spike/electron && pnpm start
//
// Read the on-screen "NNFPS · NNTPS" counter (top controls bar) and compare to your Zen number.
const { app, BrowserWindow } = require('electron');

const URL = process.env.SPIKE_URL || 'http://localhost:5173';

// GC tuning experiment (§D). The renderer deserializes the whole sim snapshot every flush → high
// transient-garbage rate → the GC sawtooth you see (TPS/FPS recover on pause, dip on resume). A
// bigger V8 young generation lets that per-flush garbage die in cheap "scavenge" GCs instead of being
// promoted to old space (which triggers the expensive MAJOR GCs felt as dips). Applies to renderer +
// worker V8. Band-aid — the real fix is a smaller snapshot — and it's an A/B knob: comment out to
// compare. 128 = MB; dial down if individual scavenge pauses grow.
app.commandLine.appendSwitch('js-flags', '--max-semi-space-size=128');

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
