const { app, BrowserWindow, ipcMain, shell, session, globalShortcut, screen, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http'), https = require('https');
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
    ...pos, width: 380, height: 180, minWidth: 380, minHeight: 180,
    frame: false, backgroundMaterial: 'acrylic', backgroundColor: '#00000000',
    alwaysOnTop: true, title: 'AeroTube',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), webviewTag: true, backgroundThrottling: false }
  });
  win.loadFile('index.html');
  // Captura do audio do sistema (visualizador)
  win.webContents.session.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(s => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({}));
  }, { useSystemPicker: false });
  if (process.platform === 'win32') startMedia();
  win.webContents.once('did-finish-load', () => setTimeout(checkUpdate, 3000));
  globalShortcut.register('Control+Alt+H', () => win.isVisible() ? win.hide() : win.show());
  globalShortcut.register('Control+Alt+L', () => { ghost = !ghost; win.setIgnoreMouseEvents(ghost); win.setOpacity(ghost ? base * 0.6 : base); });
  win.on('moved', () => { const [x, y] = win.getPosition(); try { fs.writeFileSync(PF, JSON.stringify({ x, y })); } catch {} });
  const reg = (k, n) => globalShortcut.register(k, () => win.webContents.send('key', n));
  reg('Control+Alt+Space', 'pp'); reg('Control+Alt+Right', 'next'); reg('Control+Alt+Left', 'prev');
  reg('Control+Alt+Up', 'fwd'); reg('Control+Alt+Down', 'back'); reg('Control+Alt+M', 'mini');
  globalShortcut.register('Control+Alt+G', () => setGame(!game));
});
ipcMain.on('size', (_, w, h) => { if (win) { win.setMinimumSize(Math.min(380, w), Math.min(180, h)); win.setSize(w, h, true); } });
ipcMain.on('ext', (_, u) => shell.openExternal(u));
ipcMain.on('win', (_, a) => { if (a === 'close') app.quit(); if (a === 'min') win.minimize(); });
ipcMain.handle('pin', () => { const v = !win.isAlwaysOnTop(); win.setAlwaysOnTop(v); return v; });
let spS = null, spImg = '', spTi = '', ps, sysVol = null;
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
        if (o.vol !== undefined) { sysVol = { v: o.vol, m: o.mute }; continue; }
        if (o.none) { spS = null; continue; }
        if (o.img) spImg = o.img;
        if (o.ti !== spTi) { spTi = o.ti; if (!o.img) spImg = ''; }
        o.img = spImg; o.u = 'https://open.spotify.com/'; spS = o;
      } catch {}
    }
  });
}
ipcMain.handle('sp:get', () => spS);
ipcMain.handle('vol:get', () => sysVol);
app.on('will-quit', () => { if (ps) ps.kill(); });
const RB = ['de1', 'de2', 'nl1', 'fi1', 'at1'];
ipcMain.handle('radio:search', async (_, qs) => {
  const get = async q => {
    for (const s of RB) {
      try {
        const r = await fetch(`https://${s}.api.radio-browser.info/json/stations/search?${q}&hidebroken=true&order=votes&reverse=true&limit=40`, { headers: { 'User-Agent': 'AeroTube/1.0' }, signal: AbortSignal.timeout(6000) });
        if (r.ok) return await r.json();
      } catch {}
    }
    return [];
  };
  const seen = new Set(), out = [];
  for (const arr of await Promise.all(qs.map(get)))
    for (const x of arr) if (!seen.has(x.stationuuid) && !x.hls && x.url_resolved) {
      seen.add(x.stationuuid);
      out.push({ id: x.stationuuid, name: (x.name || '').trim(), url: x.url_resolved, tags: (x.tags || '').split(',').slice(0, 2).join(', '), country: x.countrycode, favicon: x.favicon, votes: x.votes });
    }
  return out.sort((a, b) => b.votes - a.votes).slice(0, 40);
});
ipcMain.handle('radio:meta', (_, url) => new Promise(res => {
  let done = false; const fin = v => { if (!done) { done = true; res(v); } };
  try {
    const req = (url.startsWith('https') ? https : http).get(url, { headers: { 'Icy-MetaData': '1', 'User-Agent': 'AeroTube/1.0' } }, r => {
      const mi = +r.headers['icy-metaint']; if (!mi) { req.destroy(); return fin(null); }
      let buf = Buffer.alloc(0);
      r.on('data', d => {
        buf = Buffer.concat([buf, d]);
        if (buf.length > mi) { const n = buf[mi] * 16; if (buf.length >= mi + 1 + n) { const t = /StreamTitle='(.*?)';/.exec(buf.slice(mi + 1, mi + 1 + n).toString('utf8')); req.destroy(); fin(t && t[1] || null); } }
      });
    });
    req.on('error', () => fin(null)); setTimeout(() => { try { req.destroy(); } catch {} fin(null); }, 9000);
  } catch { fin(null); }
}));
async function checkUpdate() {
  try {
    const r = await fetch('https://api.github.com/repos/nicolassilv04/aero-tube/releases/latest', { headers: { 'User-Agent': 'AeroTube' } });
    if (!r.ok) return;
    const j = await r.json(), n = s => s.replace(/^v/, '').split('.').map(Number), a = n(j.tag_name), b = n(app.getVersion());
    if ((a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0) win.webContents.send('update', { tag: j.tag_name, url: j.html_url, packaged: app.isPackaged, asset: ((j.assets || []).find(x => x.name === 'AeroTube-win.zip') || {}).browser_download_url });
  } catch {}
}
const DISCORD_ID = ''; // Application ID criado em discord.com/developers (veja DOCUMENTACAO.md)
let rpc = null, rpcReady = false, rpcLast = null;
function rpcSend() {
  if (!rpcReady || !rpc) return;
  const a = rpcLast;
  if (!a) return rpc.clearActivity().catch(() => {});
  const act = { details: String(a.ti).slice(0, 120), state: a.p ? 'Pausado' : String(a.ar || 'AeroTube').slice(0, 120), instance: false };
  if (!a.p) { act.startTimestamp = Math.round(Date.now() - a.t * 1000); if (a.d > 0) act.endTimestamp = Math.round(Date.now() + (a.d - a.t) * 1000); }
  rpc.setActivity(act).catch(() => {});
}
ipcMain.on('rpc', (_, a) => {
  rpcLast = a;
  if (!DISCORD_ID) return;
  try {
    if (!rpc && a) {
      const R = require('discord-rpc');
      rpc = new R.Client({ transport: 'ipc' });
      rpc.on('ready', () => { rpcReady = true; rpcSend(); });
      rpc.login({ clientId: DISCORD_ID }).catch(() => { rpc = null; rpcReady = false; });
    } else rpcSend();
  } catch { rpc = null; }
});
app.on('will-quit', () => { try { if (rpc) rpc.destroy(); } catch {} });
const UPD = `param($p,$zip,$dir,$exe)
Wait-Process -Id $p -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
$t = Join-Path $env:TEMP 'aerotube-upd'
Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $t -Force
robocopy $t $dir /E /R:5 /W:1 /NFL /NDL /NJH /NJS | Out-Null
Start-Process $exe`;
ipcMain.handle('update:apply', async (_, url) => {
  if (!app.isPackaged) return false;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'AeroTube' } });
    if (!r.ok) return false;
    const tmp = app.getPath('temp'), zip = path.join(tmp, 'AeroTube-update.zip'), ps1 = path.join(tmp, 'aerotube-update.ps1');
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    fs.writeFileSync(ps1, UPD);
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, String(process.pid), zip, path.dirname(process.execPath), process.execPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    setTimeout(() => app.quit(), 300);
    return true;
  } catch { return false; }
});
let game = false, flashT;
function setGame(v) {
  game = v; ghost = v;
  win.setAlwaysOnTop(true, v ? 'screen-saver' : 'floating', 1);
  win.setFocusable(!v); win.setIgnoreMouseEvents(v);
  win.setOpacity(v ? Math.min(base, 0.45) : base);
  win.webContents.send('game', v);
}
ipcMain.on('game', (_, v) => setGame(!!v));
ipcMain.on('flash', () => { if (!game) return; win.setOpacity(1); clearTimeout(flashT); flashT = setTimeout(() => win.setOpacity(Math.min(base, 0.45)), 5000); });
let base = 1, fade = false, ghost = false;
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
ipcMain.handle('lyrics', async (_, ar, ti, d, extra) => {
  const H = { 'User-Agent': 'AeroTubeWidget/1.0' }, q = encodeURIComponent, tol = d ? 8 : 1e9;
  const J = async (u, h = H) => { try { const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(7000) }); return r.ok ? await r.json() : null; } catch { return null; } };
  const near = a => {
    a = (Array.isArray(a) ? a : []).filter(x => Math.abs(x.duration - d) <= tol).sort((x, y) => Math.abs(x.duration - d) - Math.abs(y.duration - d));
    return a.find(x => x.syncedLyrics) || a.find(x => x.plainLyrics) || null;
  };
  let r = await J(`https://lrclib.net/api/get?artist_name=${q(ar)}&track_name=${q(ti)}&duration=${Math.round(d)}`);
  if (r && (r.syncedLyrics || r.plainLyrics)) return { ...r, src: 'lrclib' };
  for (const u of [`track_name=${q(ti)}&artist_name=${q(ar)}`, `q=${q(ar + ' ' + ti)}`, `q=${q(ti)}`]) {
    r = near(await J(`https://lrclib.net/api/search?${u}`)); if (r) return { ...r, src: 'lrclib' };
  }
  if (extra) {
    const NH = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com' };
    const s = await J(`https://music.163.com/api/search/get/web?csrf_token=&s=${q(ar + ' ' + ti)}&type=1&offset=0&limit=5`, NH);
    const songs = ((s && s.result && s.result.songs) || []).filter(x => !d || Math.abs(x.duration / 1000 - d) <= 8);
    if (songs[0]) {
      const l = await J(`https://music.163.com/api/song/lyric?id=${songs[0].id}&lv=1`, NH), t = l && l.lrc && l.lrc.lyric;
      if (t && /\[\d+:\d+/.test(t)) return { syncedLyrics: t, src: 'NetEase' };
    }
  }
  const o = await J(`https://api.lyrics.ovh/v1/${q(ar)}/${q(ti)}`);
  if (o && o.lyrics) return { plainLyrics: o.lyrics, src: 'lyrics.ovh' };
  return null;
});
