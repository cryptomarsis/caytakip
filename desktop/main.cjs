const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_SCHEME = 'caylik';
const webRoot = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const isSafeExternalUrl = (url) => /^(https?:|mailto:|tel:)/i.test(url);

const saveBase64File = async ({ defaultFileName, base64, filters }) => {
  const safeName = path.basename(defaultFileName || 'Caylik_rapor');
  const result = await dialog.showSaveDialog({
    title: 'Raporu Kaydet',
    defaultPath: path.join(app.getPath('downloads'), safeName),
    filters: Array.isArray(filters) ? filters : [],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  await fs.writeFile(result.filePath, Buffer.from(base64, 'base64'));
  return { canceled: false, filePath: result.filePath };
};

const getRequestedFile = (url) => {
  const requestUrl = new URL(url);
  const requestPath = decodeURIComponent(requestUrl.pathname || '/');
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(webRoot, relativePath);

  if (!filePath.startsWith(`${webRoot}${path.sep}`) && filePath !== path.join(webRoot, 'index.html')) {
    return null;
  }
  return filePath;
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#F8F3E7',
    title: 'Çaylık',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  window.setMenuBarVisibility(false);
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://`)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
    }
  });

  // Expo Router, /index.html adresini bir uygulama sayfası olarak algılar.
  // Kök adresten açıldığında hem yönlendirme hem de statik dosyalar doğru çalışır.
  void window.loadURL(`${APP_SCHEME}://app/`);
};

app.setAppUserModelId('com.cryptomarsis.caylik.desktop');

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, (request) => {
    const requestedFile = getRequestedFile(request.url);
    if (!requestedFile) return new Response('Geçersiz dosya yolu.', { status: 400 });
    return net.fetch(pathToFileURL(requestedFile).toString());
  });

  ipcMain.handle('caylik:save-base64-file', (_event, payload) => saveBase64File(payload || {}));
  ipcMain.handle('caylik:print-pdf', async (_event, { defaultFileName, html } = {}) => {
    const reportWindow = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    try {
      await reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(html || ''))}`);
      const pdf = await reportWindow.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      return saveBase64File({
        defaultFileName: defaultFileName || 'Caylik_rapor.pdf',
        base64: pdf.toString('base64'),
        filters: [{ name: 'PDF dosyası', extensions: ['pdf'] }],
      });
    } finally {
      if (!reportWindow.isDestroyed()) reportWindow.destroy();
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
