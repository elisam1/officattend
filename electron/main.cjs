const { app, BrowserWindow, Tray, Menu, dialog, session, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let tray;
let serverProcess;

const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = 3001;

// Wait for server to be ready
function waitForServer(port, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://localhost:${port}/health`, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Server on port ${port} not ready after ${maxAttempts} attempts`));
        } else {
          setTimeout(check, 500);
        }
      });
      req.end();
    };
    check();
  });
}

// Start the backend server
function startBackendServer() {
  return new Promise((resolve, reject) => {
    const serverPath = isDev 
      ? path.join(__dirname, '..', 'server', 'index.js')
      : path.join(process.resourcesPath, 'server', 'index.js');
    
    console.log('Starting backend server from:', serverPath);
    
    if (!fs.existsSync(serverPath)) {
      console.error('Server file not found at:', serverPath);
      reject(new Error('Server file not found'));
      return;
    }
    
    serverProcess = spawn('node', [serverPath], {
      cwd: isDev ? path.join(__dirname, '..') : process.resourcesPath,
      env: { 
        ...process.env, 
        PORT: BACKEND_PORT,
        NODE_ENV: 'development' // Keep as development so server doesn't try to serve frontend
      },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server Error: ${data}`);
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });

    // Wait a bit then resolve
    setTimeout(resolve, 2000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    show: false,
    title: 'OfficAttend'
  });

  // Remove menu bar
  mainWindow.setMenuBarVisibility(false);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from file
    const distPath = path.join(process.resourcesPath, 'dist', 'index.html');
    console.log('Loading from:', distPath);
    mainWindow.loadFile(distPath);
  }

  // Allow DevTools with Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico');
  
  try {
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open OfficAttend',
        click: () => mainWindow && mainWindow.show()
      },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setToolTip('OfficAttend');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => mainWindow && mainWindow.show());
  } catch (e) {
    console.log('Tray creation failed:', e);
  }
}

function showLoadingWindow() {
  const loading = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  loading.loadURL(`data:text/html,
    <html>
      <body style="
        display:flex; justify-content:center; align-items:center;
        height:100vh; margin:0;
        background:linear-gradient(135deg,#1e3a5f,#0f172a);
        border-radius:12px; font-family:system-ui; color:white;
        flex-direction:column;
      ">
        <h2 style="margin:0 0 16px">OfficAttend</h2>
        <p style="margin:0;opacity:0.8">Starting up...</p>
        <div style="margin-top:20px;width:200px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden">
          <div style="width:40%;height:100%;background:#3b82f6;animation:load 1.5s ease-in-out infinite"></div>
        </div>
        <style>@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}</style>
      </body>
    </html>
  `);

  return loading;
}

// Setup permissions for camera access
function setupPermissions() {
  // Grant all media permissions automatically
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('Permission requested:', permission);
    // Allow camera, microphone, and other media permissions
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'geolocation', 'notifications'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'geolocation', 'notifications'];
    return allowed.includes(permission);
  });
}

app.whenReady().then(async () => {
  const loading = showLoadingWindow();

  try {
    // Setup permissions first
    setupPermissions();

    // Start backend
    console.log('Starting backend...');
    await startBackendServer();
    await waitForServer(BACKEND_PORT, 20);
    console.log('Backend ready');

    // Close loading and open main window
    loading.close();
    createWindow();
    createTray();

  } catch (error) {
    console.error('Startup error:', error);
    loading.close();
    dialog.showErrorBox('Startup Error', `Failed to start: ${error.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess) serverProcess.kill();
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
