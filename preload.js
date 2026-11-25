const { contextBridge, ipcRenderer: i } = require('electron');
contextBridge.exposeInMainWorld('api', {
  opacity: v => i.send('op', v), onKey: cb => i.on('key', (_, k) => cb(k)),
  fade: f => i.send('fade', f), startup: v => i.send('startup', v),
  spGet: () => i.invoke('sp:get'), spCmd: c => i.send('sp:cmd', c),
  radio: q => i.invoke('radio:search', q), radioMeta: u => i.invoke('radio:meta', u), onUpdate: cb => i.on('update', (_, u) => cb(u)),
  rpc: a => i.send('rpc', a),
  volGet: () => i.invoke('vol:get'), updateNow: a => i.invoke('update:apply', a), game: v => i.send('game', v), flash: () => i.send('flash'), onGame: cb => i.on('game', (_, v) => cb(v)),
  size: (w, h) => i.send('size', w, h), ext: u => i.send('ext', u), win: a => i.send('win', a),
  pin: () => i.invoke('pin'), lyrics: (a, t, d, x) => i.invoke('lyrics', a, t, d, x)
});
