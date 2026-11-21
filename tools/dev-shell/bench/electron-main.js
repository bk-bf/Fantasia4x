const { app, ipcMain, session } = require('electron');
const fs = require('fs');
const path = require('path');

ipcMain.on('f4x-bench:recorder', (event) => {
  event.returnValue = fs.readFileSync(process.env.F4X_BENCH_RECORDER, 'utf8');
});

app.whenReady().then(() => {
  session.defaultSession.registerPreloadScript({
    type: 'frame',
    filePath: path.join(__dirname, 'electron-preload.cjs')
  });
});

require('../main.js');
