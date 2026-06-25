// Preload for the dev/profiling spike — copied from the packaged build (electron/preload.cjs) so the
// spike has the same DevTools-gating IPC. Exposes a tiny read-only bridge; the only channel is the
// one-way debug-mode mirror the main process uses to gate DevTools (Ctrl+Shift+I) on the in-app setting.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fantasia', {
  desktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  setDebugMode: (on) => ipcRenderer.send('f4x:set-debug-mode', !!on)
});
