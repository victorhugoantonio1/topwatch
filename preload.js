'use strict';
// Ponte mínima entre a interface e o processo principal.
// A interface não tem acesso a Node, só a estas funções.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('topwatch', {
  // ilha
  setInteractive: (on) => ipcRenderer.send('island:interactive', !!on),
  getState: () => ipcRenderer.invoke('island:state'),
  refresh: () => ipcRenderer.send('island:refresh'),
  openSettings: () => ipcRenderer.send('island:settings'),
  unpin: () => ipcRenderer.send('island:unpin'),
  openUrl: (url) => ipcRenderer.send('open-url', url),
  acknowledge: (itemId, note) => ipcRenderer.invoke('zabbix:ack', itemId, note),
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
  onPinned: (fn) => ipcRenderer.on('pinned', (_e, p) => fn(p)),
  onAlert: (fn) => ipcRenderer.on('alert', () => fn()),
  onSound: (fn) => ipcRenderer.on('sound', () => fn()),
  onSoundData: (fn) => ipcRenderer.on('sound-data', (_e, d) => fn(d)),
  onNotice: (fn) => ipcRenderer.on('notice', (_e, items) => fn(items)),
  onDock: (fn) => ipcRenderer.on('dock', (_e, edge) => fn(edge)),
  // arrastar a barra
  dragStart: () => ipcRenderer.send('drag:start'),
  dragEnd: () => ipcRenderer.send('drag:end'),
  dragCancel: () => ipcRenderer.send('drag:cancel'),
  onDragMove: (fn) => ipcRenderer.on('drag:move', (_e, v) => fn(v)),
  onDragDrop: (fn) => ipcRenderer.on('drag:drop', (_e, d) => fn(d)),
  onDragLanded: (fn) => ipcRenderer.on('drag:landed', (_e, d) => fn(d)),

  // configurações
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (changes) => ipcRenderer.invoke('settings:save', changes),
  // which = 'zabbix' (id = servidor) ou 'plugin' (id = plugin)
  testConnection: (which, changes, id) => ipcRenderer.invoke('settings:test', which, changes, id),
  installPlugin: () => ipcRenderer.invoke('settings:install-plugin'),
  openPluginsFolder: () => ipcRenderer.send('settings:open-plugins-folder'),
  openPluginsSite: () => ipcRenderer.send('settings:open-plugins-site'),
  pickSound: () => ipcRenderer.invoke('settings:pick-sound'),
  resetSound: () => ipcRenderer.invoke('settings:reset-sound'),
  testSound: () => ipcRenderer.send('settings:test-sound'),
});
