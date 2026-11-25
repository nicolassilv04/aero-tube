const { contextBridge, ipcRenderer: i } = require('electron');
contextBridge.exposeInMainWorld('api', {
  opacity: v => i.send('op', v), onKey: cb => i.on('key', (_, k) => cb(k)),
  fade: f => i.send('fade', f), startup: v => i.send('startup', v),
  spGet: () => i.invoke('sp:get'), spCmd: c => i.send('sp:cmd', c),
  size: (w, h) => i.send('size', w, h), ext: u => i.send('ext', u), win: a => i.send('win', a),
  pin: () => i.invoke('pin'), lyrics: (a, t, d) => i.invoke('lyrics', a, t, d)
});
