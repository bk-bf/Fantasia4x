const { ipcRenderer, webFrame } = require('electron');

webFrame.executeJavaScript(ipcRenderer.sendSync('f4x-bench:recorder'));
