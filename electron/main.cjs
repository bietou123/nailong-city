const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const smokeTest = process.argv.includes('--smoke-test');

if (smokeTest) {
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#a9dce1',
    show: !smokeTest,
    autoHideMenuBar: true,
    title: '奶龙之城：犯罪都市',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  if (smokeTest) {
    let attempts = 0;
    const verify = async () => {
      try {
        const ready = await window.webContents.executeJavaScript(
          "document.documentElement.dataset.gameReady === 'true'");
        if (ready) { console.log('GAME_READY'); app.exit(0); return; }
      } catch (error) { console.error(error); }
      if (++attempts > 90) app.exit(1);
      else setTimeout(verify, 300);
    };
    window.webContents.on('did-finish-load', verify);
    window.webContents.on('did-fail-load', () => app.exit(1));
  }
  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
