const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const processes = [];

function startBackend() {
  const pythonExec = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
  const child = spawn(pythonExec, ['-m', 'backend.app'], {
    cwd: projectRoot,
    windowsHide: true,
    shell: true,
    stdio: 'ignore'
  });
  processes.push(child);
  return child;
}

function checkBackendReady(timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      http.get('http://127.0.0.1:5000/api/health', (res) => {
        if (res.statusCode === 200) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(check, 250);
      }).on('error', () => {
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(check, 250);
      });
    };
    check();
  });
}

let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    title: 'AI Academic Scheduling System (SKIT)',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  // 1. Start Python Flask backend server
  startBackend();

  // 2. Wait for backend health check
  await checkBackendReady(10000);

  // 3. Load UI from dist/index.html (standalone software mode)
  const distPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  processes.forEach((child) => {
    try { child.kill(); } catch (e) {}
  });
});
