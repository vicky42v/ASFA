const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const processes = [];

const BACKEND_URL = 'http://127.0.0.1:5000';
const FRONTEND_HOST = '127.0.0.1';
const FRONTEND_PORT = 5173;

function startBackend() {
  const pythonExec = path.join(
    projectRoot,
    '.venv',
    'Scripts',
    'python.exe'
  );

  if (!fs.existsSync(pythonExec)) {
    throw new Error(`Python virtual environment not found: ${pythonExec}`);
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

  server.listen(
    FRONTEND_PORT,
    FRONTEND_HOST,
    () => {
      console.log(
        `Frontend running at http://${FRONTEND_HOST}:${FRONTEND_PORT}`
      );
    }
  );

  processes.push(server);

  return server;
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
      webSecurity: true
    }
  });

  // 1. Start Flask backend
  startBackend();

  // 2. Wait until Flask is ready
  const backendReady = await checkBackendReady();

  if (!backendReady) {
    console.error('Backend failed to start.');
    await mainWindow.loadURL(
      'data:text/html,<h1>Backend failed to start</h1><p>Check the backend configuration.</p>'
    );
    return;
  }

  // 3. Start local HTTP server for React
  startFrontendServer();

  // 4. Load React through HTTP instead of file://
  await mainWindow.loadURL(
    `http://${FRONTEND_HOST}:${FRONTEND_PORT}`
  );
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
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