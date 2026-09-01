// main.ts
import { app, BrowserWindow, protocol } from 'electron';
import * as path from 'path';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // CORS 규제 철폐
    },
  });

  if (!app.isPackaged) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, 'out', 'index.html'));
    // win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  //  [핵심] 일렉트론 내부에서 발생하는 모든 /api/... 요청을
  // 로컬 파일 시스템이 아닌 실제 작동 중인 파이썬 waitress(127.0.0.1:5000) 주소로 강제 바인딩하여 리다이렉트합니다.
  protocol.handle('app', (request) => {
    const url = request.url.replace('app://', '');

    if (url.startsWith('api/')) {
      // 프론트엔드가 쏜 주소가 app://api/... 형태라면 파이썬 서버로 직접 배달 처리
      return Response.redirect(`http://127.0.0{url}`);
    }

    // 일반 CSS, JS 파일들은 out 폴더 내부 자원으로 연결
    const filePath = path.join(__dirname, 'out', url);
    return Response.redirect(`file:///${filePath}`);
  });

  createWindow();
});
