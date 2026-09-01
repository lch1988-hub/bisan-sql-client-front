"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// main.ts
const electron_1 = require("electron");
const path = __importStar(require("path"));
electron_1.protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // CORS 규제 철폐
        },
    });
    if (!electron_1.app.isPackaged) {
        win.loadURL('http://localhost:3000');
    }
    else {
        win.loadFile(path.join(__dirname, 'out', 'index.html'));
        // win.webContents.openDevTools({ mode: 'detach' });
    }
}
electron_1.app.whenReady().then(() => {
    //  [핵심] 일렉트론 내부에서 발생하는 모든 /api/... 요청을
    // 로컬 파일 시스템이 아닌 실제 작동 중인 파이썬 waitress(127.0.0.1:5000) 주소로 강제 바인딩하여 리다이렉트합니다.
    electron_1.protocol.handle('app', (request) => {
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
