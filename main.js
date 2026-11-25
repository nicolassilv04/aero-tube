const { app, BrowserWindow, ipcMain, shell, session, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
// UA de Firefox: o Google costuma aceitar login assim em apps Electron
const FF = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';
app.userAgentFallback = FF;
let win;
app.whenReady().then(() => {
  app.setAppUserModelId('dev.aerotube.widget');
  const PF = path.join(app.getPath('userData'), 'pos.json');
  let pos = {}; try { pos = JSON.parse(fs.readFileSync(PF)); } catch {}
  const ses = session.fromPartition('persist:google');
  ses.setUserAgent(FF);
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    const h = d.requestHeaders;
    for (const k of Object.keys(h)) if (/^sec-ch-ua/i.test(k)) delete h[k];
    cb({ requestHeaders: h });
  });
  win = new BrowserWindow({
    ...pos, width: 380, height: 180, minWidth: 340, minHeight: 180,
    frame: false, backgroundMaterial: 'acrylic', backgroundColor: '#00000000',
    alwaysOnTop: true, title: 'AeroTube',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), webviewTag: true, backgroundThrottling: false }
  });
  win.loadFile('index.html');
  if (process.platform === 'win32') startMedia();
  win.on('moved', () => { const [x, y] = win.getPosition(); try { fs.writeFileSync(PF, JSON.stringify({ x, y })); } catch {} });
  const reg = (k, n) => globalShortcut.register(k, () => win.webContents.send('key', n));
  reg('Control+Alt+Space', 'pp'); reg('Control+Alt+Right', 'next'); reg('Control+Alt+Left', 'prev');
  reg('Control+Alt+Up', 'fwd'); reg('Control+Alt+Down', 'back');
});
ipcMain.on('size', (_, w, h) => { if (win) win.setSize(w, h, true); });
ipcMain.on('ext', (_, u) => shell.openExternal(u));
ipcMain.on('win', (_, a) => { if (a === 'close') app.quit(); if (a === 'min') win.minimize(); });
ipcMain.handle('pin', () => { const v = !win.isAlwaysOnTop(); win.setAlwaysOnTop(v); return v; });
let spS = null, spImg = '', spTi = '', ps;
function startMedia() {
  const dir = app.getPath('userData'), dst = path.join(dir, 'media.ps1'), cmd = path.join(dir, 'cmd.txt');
  fs.writeFileSync(dst, fs.readFileSync(path.join(__dirname, 'media.ps1'), 'utf8'));
  ipcMain.on('sp:cmd', (_, c) => { try { fs.writeFileSync(cmd, String(c)); } catch {} });
  ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', dst, cmd], { windowsHide: true });
  let buf = '';
  ps.stdout.on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).replace(/^\uFEFF/, '').trim(); buf = buf.slice(i + 1);
      try {
        const o = JSON.parse(l);
        if (o.none) { spS = null; continue; }
        if (o.img) spImg = o.img;
        if (o.ti !== spTi) { spTi = o.ti; if (!o.img) spImg = ''; }
        o.img = spImg; o.u = 'https://open.spotify.com/'; spS = o;
      } catch {}
    }
  });
}
ipcMain.handle('sp:get', () => spS);
app.on('will-quit', () => { if (ps) ps.kill(); });
let base = 1, fade = false;
ipcMain.on('op', (_, v) => { base = v; win.setOpacity(v); });
ipcMain.on('fade', (_, f) => { fade = f; if (!f) win.setOpacity(base); });
ipcMain.on('startup', (_, v) => app.setLoginItemSettings({ openAtLogin: v }));
setInterval(() => {
  if (!fade || !win) return;
  const p = screen.getCursorScreenPoint(), b = win.getBounds();
  const inside = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  win.setOpacity(inside ? base : base * 0.45);
}, 250);
app.on('will-quit', () => globalShortcut.unregisterAll());
ipcMain.handle('lyrics', async (_, ar, ti, d) => {
  const H = { headers: { 'User-Agent': 'AeroTubeWidget/1.0' } }, q = encodeURIComponent, tol = d ? 8 : 1e9;
  const J = async u => { try { const r = await fetch(u, H); return r.ok ? await r.json() : null; } catch { return null; } };
  const near = a => {
    a = (Array.isArray(a) ? a : []).filter(x => Math.abs(x.duration - d) <= tol).sort((x, y) => Math.abs(x.duration - d) - Math.abs(y.duration - d));
    return a.find(x => x.syncedLyrics) || a.find(x => x.plainLyrics) || null;
  };
  const g = await J(`https://lrclib.net/api/get?artist_name=${q(ar)}&track_name=${q(ti)}&duration=${Math.round(d)}`);
  if (g && (g.syncedLyrics || g.plainLyrics)) return g;
  for (const u of [`track_name=${q(ti)}&artist_name=${q(ar)}`, `q=${q(ar + ' ' + ti)}`, `q=${q(ti)}`]) {
    const r = near(await J(`https://lrclib.net/api/search?${u}`)); if (r) return r;
  }
  return null;
});
