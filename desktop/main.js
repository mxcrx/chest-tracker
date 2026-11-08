const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
let currentShortcut;

function registerShortcut(accelerator) {
  if (!accelerator || typeof accelerator !== 'string') return { ok: false, error: 'Ungültige Tastenkombination.' };
  if (currentShortcut) globalShortcut.unregister(currentShortcut);
  const registered = globalShortcut.register(accelerator, () => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('hotkey:pressed'));
  });
  if (!registered) return { ok: false, error: 'Diese Tastenkombination ist bereits belegt.' };
  currentShortcut = accelerator;
  return { ok: true };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#080b16',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('hotkey:set', (_, accelerator) => registerShortcut(accelerator));
  registerShortcut('F8');
  createWindow();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
