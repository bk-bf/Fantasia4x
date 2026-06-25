// Minimal preload — runs in an isolated context (contextIsolation: true). It exposes nothing
// sensitive; just a tiny read-only marker so the renderer can reliably detect the desktop shell and
// read versions, without granting Node/IPC access. Extend via contextBridge if real IPC is ever needed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fantasia', {
  desktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  // Mirror the renderer's persisted debug-mode setting to the main process so it can gate DevTools
  // (Ctrl+Shift+I / F12 …) on it. The only IPC this preload exposes — one-way, boolean, no return.
  setDebugMode: (on) => ipcRenderer.send('f4x:set-debug-mode', !!on)
});
