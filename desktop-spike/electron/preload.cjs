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
