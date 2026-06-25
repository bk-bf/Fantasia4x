// Minimal preload — runs in an isolated context (contextIsolation: true). It exposes nothing
// sensitive; just a tiny read-only marker so the renderer can reliably detect the desktop shell and
// read versions, without granting Node/IPC access. Extend via contextBridge if real IPC is ever needed.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('fantasia', {
  desktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});
