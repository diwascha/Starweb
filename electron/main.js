
// main.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let serverProc;
let win;
const port = '9002';
const startUrl = `http://localhost:${port}`;
const isDev = !app.isPackaged;

function waitForHttp(url, timeoutMs = 30000, intervalMs = 300) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            const req = http.request(url, { method: 'GET' }, res => {
                res.resume();
                if (res.statusCode && res.statusCode < 500) return resolve();
                next();
            });
            req.on('error', next);
            req.end();
        };
        const next = () => {
            if (Date.now() - start > timeoutMs) {
                reject(new Error(`Timeout waiting for ${url}`));
            } else {
                setTimeout(tick, intervalMs);
            }
        };
        tick();
    });
}

function startNextProdServer() {
  const serverPath = path.join(process.resourcesPath, 'app/.next/standalone/server.js');
  serverProc = spawn(process.execPath, [serverPath, '-p', port], {
    stdio: 'ignore',
    windowsHide: true,
    detached: true,
  });
}

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true, 
    },
  });


  if (isDev) {
    const waitOn = require('wait-on');
    const waitOnOpts = {
      resources: [startUrl],
      timeout: 30000,
    };
    waitOn(waitOnOpts).then(() => {
        win.loadURL(startUrl);
        win.webContents.openDevTools();
    }).catch(err => {
        console.error('Error waiting for Next.js dev server:', err);
    });
  } else {
    startNextProdServer();
    waitForHttp(startUrl, 30000, 300)
    .then(() => {
        win.loadURL(startUrl);
    }).catch(err => {
        console.error('Error waiting for Next.js production server:', err);
    });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverProc && !serverProc.killed) {
       try { process.kill(serverProc.pid); } catch { /* ignore */ }
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverProc && !serverProc.killed) {
    try { process.kill(serverProc.pid); } catch { /* ignore */ }
  }
});
