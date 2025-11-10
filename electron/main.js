// main.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const waitOn = require('wait-on');

let nextProcess;
let win;
const port = '9002';

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Be cautious with this in production
    },
  });

  const startUrl = `http://localhost:${port}`;

  if (isDev) {
    // In development, Next.js server is started by npm script, so we just wait for it
    const waitOnOpts = {
      resources: [startUrl],
      timeout: 10000,
    };
    waitOn(waitOnOpts).then(() => {
        win.loadURL(startUrl);
        win.webContents.openDevTools();
    }).catch(err => {
        console.error('Error waiting for Next.js dev server:', err);
    });
  } else {
    // In production, we need to spawn the Next.js server
    const serverPath = path.join(app.getAppPath(), 'node_modules/.bin/next');
    nextProcess = spawn(serverPath, ['start', '-p', port], {
      cwd: app.getAppPath(),
      // The `detached: true` option is important for ensuring the child process
      // doesn't stay alive when the parent Electron app exits.
      detached: true, 
      stdio: 'inherit' // Pipe server output to Electron's console
    });

    const waitOnOpts = {
      resources: [startUrl],
      timeout: 15000, // Increased timeout for production server start
    };
    
    waitOn(waitOnOpts).then(() => {
        win.loadURL(startUrl);
    }).catch(err => {
        console.error('Error waiting for Next.js production server:', err);
    });
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // If there's a Next.js server process, kill it.
    if (nextProcess) {
      // Use the detached PID to kill the process group. This is more reliable.
      process.kill(-nextProcess.pid);
    }
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (nextProcess) {
    process.kill(-nextProcess.pid);
  }
});