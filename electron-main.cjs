const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

app.setName('AI-ASFA');

// Disable disk cache, GPU shader disk cache, and program cache to prevent Windows EACCES (0x5) lock collisions
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-cache');

const projectRoot = __dirname;
const processes = [];

// Single-instance lock to prevent duplicate instances locking cache files
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance of AI-ASFA is already running.');
  app.quit();
  process.exit(0);
}

const BACKEND_URL = 'http://127.0.0.1:5000';
const FRONTEND_HOST = '127.0.0.1';
const FRONTEND_PORT = 5173;

function startBackend() {
  let pythonExec = path.join(
    projectRoot,
    '.venv',
    'Scripts',
    'python.exe'
  );

  if (!fs.existsSync(pythonExec)) {
    const unixVenv = path.join(projectRoot, '.venv', 'bin', 'python');
    if (fs.existsSync(unixVenv)) {
      pythonExec = unixVenv;
    } else {
      pythonExec = 'python';
    }
  }

  const child = spawn(
    pythonExec,
    ['-m', 'backend.app'],
    {
      cwd: projectRoot,
      windowsHide: true,
      shell: false,
      stdio: 'ignore'
    }
  );

  processes.push(child);

  return child;
}

function checkBackendReady(timeout = 15000) {
  const start = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(
        `${BACKEND_URL}/api/health`,
        (res) => {
          res.resume();

          if (res.statusCode === 200) {
            console.log('Backend is ready.');
            resolve(true);
            return;
          }

          if (Date.now() - start > timeout) {
            resolve(false);
            return;
          }

          setTimeout(check, 250);
        }
      );

      req.on('error', () => {
        if (Date.now() - start > timeout) {
          resolve(false);
          return;
        }

        setTimeout(check, 250);
      });
    };

    check();
  });
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json'
  };

  return types[ext] || 'application/octet-stream';
}

function startFrontendServer() {
  const distPath = path.join(projectRoot, 'dist');

  if (!fs.existsSync(distPath)) {
    throw new Error(
      'dist folder does not exist. Run "npm run build" first.'
    );
  }

  return new Promise((resolve, reject) => {
    // Check if server is already responding
    const ping = http.get(`http://${FRONTEND_HOST}:${FRONTEND_PORT}/`, (res) => {
      res.resume();
      console.log(`Frontend server already responding on port ${FRONTEND_PORT}.`);
      resolve(null);
    });

    ping.on('error', () => {
      // Not running, start server
      const server = http.createServer((req, res) => {
        let requestPath = decodeURIComponent(req.url.split('?')[0]);

        if (requestPath === '/') {
          requestPath = '/index.html';
        }

        let filePath = path.join(
          distPath,
          requestPath.replace(/^\/+/, '')
        );

        // Prevent paths outside dist/
        if (!filePath.startsWith(distPath)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        // React SPA fallback
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distPath, 'index.html');
        }

        fs.readFile(filePath, (error, data) => {
          if (error) {
            res.writeHead(500);
            res.end('Failed to load frontend.');
            return;
          }

          res.writeHead(200, {
            'Content-Type': getContentType(filePath),
            'Cache-Control': 'no-cache'
          });

          res.end(data);
        });
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Frontend server port ${FRONTEND_PORT} in use, reusing existing instance.`);
          resolve(server);
        } else {
          console.error('Frontend server error:', err);
          reject(err);
        }
      });

      server.listen(
        FRONTEND_PORT,
        FRONTEND_HOST,
        () => {
          console.log(
            `Frontend running at http://${FRONTEND_HOST}:${FRONTEND_PORT}`
          );
          resolve(server);
        }
      );

      processes.push(server);
    });
  });
}

// Set Application User Model ID for Windows Taskbar pinning and icon display
if (process.platform === 'win32') {
  app.setAppUserModelId('com.skit.ai-asfa');
}

let mainWindow = null;

async function createWindow() {
  const iconIco = path.join(projectRoot, 'public', 'icon.ico');
  const iconPng = path.join(projectRoot, 'public', 'skit-emblem.png');
  const appIcon = fs.existsSync(iconIco) ? iconIco : (fs.existsSync(iconPng) ? iconPng : undefined);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    title: 'AI Academic Scheduling System (SKIT)',
    icon: appIcon,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  if (appIcon) {
    try {
      mainWindow.setIcon(appIcon);
    } catch (e) {
      console.warn('Failed to set window icon:', e.message);
    }
  }

  // Set up fail-load retry and console logging
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Electron] Failed to load ${validatedURL}: ${errorDescription} (${errorCode}). Retrying in 400ms...`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://${FRONTEND_HOST}:${FRONTEND_PORT}`);
      }
    }, 400);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`);
  });

  // Enable Ctrl + and Ctrl - zoom in/out shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control || input.meta) {
      if (input.key === '=' || input.key === '+' || input.code === 'NumpadAdd' || input.code === 'Equal') {
        const currentZoom = mainWindow.webContents.getZoomFactor();
        const newZoom = Math.min(Math.round((currentZoom + 0.1) * 10) / 10, 2.5);
        mainWindow.webContents.setZoomFactor(newZoom);
        event.preventDefault();
      } else if (input.key === '-' || input.key === '_' || input.code === 'NumpadSubtract' || input.code === 'Minus') {
        const currentZoom = mainWindow.webContents.getZoomFactor();
        const newZoom = Math.max(Math.round((currentZoom - 0.1) * 10) / 10, 0.4);
        mainWindow.webContents.setZoomFactor(newZoom);
        event.preventDefault();
      } else if (input.key === '0' || input.code === 'Numpad0' || input.code === 'Digit0') {
        mainWindow.webContents.setZoomFactor(1.0);
        event.preventDefault();
      }
    }
  });

  // 1. Check if backend is already running, otherwise start it
  const alreadyRunning = await checkBackendReady(1000);
  if (!alreadyRunning) {
    startBackend();
  }

  // 2. Wait until Flask is ready
  const backendReady = await checkBackendReady();

  if (!backendReady) {
    console.error('Backend failed to start.');
    await mainWindow.loadURL(
      'data:text/html,<h1>Backend failed to start</h1><p>Check the backend configuration.</p>'
    );
    return;
  }

  // 3. Start local HTTP server for React and wait for it to listen
  await startFrontendServer();

  // 4. Load React through HTTP
  await mainWindow.loadURL(
    `http://${FRONTEND_HOST}:${FRONTEND_PORT}`
  );
}

app.whenReady().then(createWindow);

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.loadURL(`http://${FRONTEND_HOST}:${FRONTEND_PORT}`);
  }
});

app.on('window-all-closed', () => {
  for (const process of processes) {
    try {
      if (process && typeof process.kill === 'function') {
        process.kill();
      }
    } catch (error) {
      // Ignore shutdown errors
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  for (const process of processes) {
    try {
      if (process && typeof process.kill === 'function') {
        process.kill();
      }
    } catch (error) {
      // Ignore shutdown errors
    }
  }
});