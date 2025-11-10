// main.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let serverProc;
let win;
const port = '9002';
const startUrl = `http://localhost:${port}`;
const isDev = !app.isPackaged;

function waitForHttp(url, timeoutMs = 40000, intervalMs = 300) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            const req = http.get(url, res => {
                res.resume();
                if (res.statusCode && res.statusCode < 500) return resolve();
                next();
            });
            req.on('error', next);
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
  const standaloneDir = path.join(process.resourcesPath, '.next/standalone');
  const serverJs = path.join(standaloneDir, 'server.js');

  const logDir = app.getPath('userData');
  const logFile = path.join(logDir, 'next-server.log');
  const out = fs.createWriteStream(logFile, { flags: 'a' });
  const err = fs.createWriteStream(logFile, { flags: 'a' });

  serverProc = spawn(process.execPath, [serverJs], {
    cwd: standaloneDir,
    env: { ...process.env, PORT: port },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: true,
  });
  
  serverProc.stdout?.pipe(out);
  serverProc.stderr?.pipe(err);
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

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('did-fail-load', code, desc, url);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('renderer gone', details);
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
