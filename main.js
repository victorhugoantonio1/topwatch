'use strict';

const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
  Notification,
  safeStorage,
  globalShortcut,
  dialog,
  powerMonitor,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { createStore } = require('./src/config');
const zabbix = require('./src/zabbix');
const { request } = require('./src/http');
const pluginKit = require('./src/plugins');
const demo = require('./src/demo');
const dockMath = require('./src/dock');

// Tamanho da janela da ilha. A janela é transparente e deixa o mouse passar,
// então esse retângulo todo não atrapalha nada quando a ilha está recolhida.
// página com os plugins disponíveis (site do TopWatch no GitHub Pages)
const PLUGINS_SITE = 'https://victorhugoantonio1.github.io/topwatch/plugins/';

const ISLAND_W = 640;
const ISLAND_H = 330;
const FORCE_DEMO = process.argv.includes('--demo');

let island = null;
let settingsWin = null;
let tray = null;
let store = null;
// plugins carregados: [{ mod, dir, info, instance }]
let plugins = [];
let pluginErrors = [];
let pollTimer = null;
let polling = false;
let hidden = false;
let pinned = false;
let firstPoll = true;
const seenProblems = new Set();
const allowedUrls = new Set();

let state = {
  demo: true,
  updatedAt: null,
  zabbix: { enabled: true, items: [], error: null, multi: false },
  // uma entrada por plugin instalado: { id, name, tab, enabled, items, error }
  plugins: [],
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------- log ----------
// userData/topwatch.log: erros do processo principal e das janelas (pra diagnosticar travamentos)
function logLine(...parts) {
  try {
    const file = path.join(app.getPath('userData'), 'topwatch.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.renameSync(file, `${file}.1`);
    fs.appendFileSync(file, `${new Date().toISOString()} ${parts.join(' ')}\n`);
  } catch {
    // log é ajuda, não pode derrubar o app
  }
}
process.on('uncaughtException', (err) => logLine('[erro]', err.stack || err.message));
process.on('unhandledRejection', (err) => logLine('[promessa]', (err && err.stack) || String(err)));

function watchRenderer(win, name) {
  const wc = win.webContents;
  wc.on('render-process-gone', (_e, d) => {
    logLine(`[${name}] processo da janela caiu: ${d.reason} (${d.exitCode})`);
    if (!win.isDestroyed()) wc.reload(); // tela cinza: recarrega em vez de ficar parada
  });
  wc.on('unresponsive', () => logLine(`[${name}] janela não responde`));
  wc.on('responsive', () => logLine(`[${name}] janela voltou a responder`));
  wc.on('console-message', (e) => {
    const level = e.level ?? e.params?.level;
    if (level === 'error' || level === 3) logLine(`[${name}] ${e.message ?? e.params?.message}`);
  });
  wc.on('did-fail-load', (_e, code, desc) => logLine(`[${name}] não carregou: ${desc} (${code})`));
}

// ---------- identidade no Windows (nome e ícone nas notificações) ----------
// O Windows mostra nas notificações o nome e o ícone do atalho do menu Iniciar que tem o mesmo
// AppUserModelID do app. O instalador (.exe/.msi) cria esse atalho. Rodando sem instalador
// (npm start ou a versão portátil) não existe atalho e a notificação aparece como "Electron";
// por isso o próprio app cria um atalho com o ID certo.
const APP_ID = 'io.github.victorhugoantonio1.topwatch';
const PORTABLE_EXE = process.env.PORTABLE_EXECUTABLE_FILE;
const APP_USER_MODEL_ID = app.isPackaged ? APP_ID : `${APP_ID}.dev`;
app.setAppUserModelId(APP_USER_MODEL_ID);

// Os ícones precisam estar num caminho de verdade no disco (o Windows não lê de dentro do app.asar,
// e a versão portátil roda de uma pasta temporária). Cópia na pasta de dados do app.
function stableIcon(name) {
  const dest = path.join(app.getPath('userData'), name);
  try {
    const data = fs.readFileSync(path.join(__dirname, 'assets', name));
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== data.length) fs.writeFileSync(dest, data);
  } catch (err) {
    logLine('[ícone]', err.message);
  }
  return dest;
}

// Nome e ícone que o Windows mostra no topo da notificação. Pra app sem pacote (npm start, portátil),
// o jeito documentado é registrar o AppUserModelID em HKCU\Software\Classes\AppUserModelId\<id>.
// Só o atalho não bastava: a notificação continuava com "Electron".
function registerAppIdentity() {
  if (process.platform !== 'win32') return;
  const { execFile } = require('node:child_process');
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${APP_USER_MODEL_ID}`;
  const values = [
    ['DisplayName', app.isPackaged ? 'TopWatch' : 'TopWatch (dev)'],
    ['IconUri', stableIcon('icon.png')],
    ['IconBackgroundColor', '00000000'],
  ];
  for (const [name, data] of values) {
    execFile('reg', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', data, '/f'], { windowsHide: true }, (err) => {
      if (err) logLine('[identidade]', `não deu pra registrar ${name}:`, err.message);
    });
  }
}

// Ícone da janela: no Windows o .ico (vários tamanhos, nítido na barra de tarefas).
function windowIcon() {
  return process.platform === 'win32' ? stableIcon('icon.ico') : path.join(__dirname, 'assets', 'icon.png');
}

// Botão na barra de tarefas: rodando pelo npm start, o Windows usava o ícone do electron.exe (o átomo).
// setAppDetails diz pro Windows qual app é essa janela e qual ícone mostrar.
function brandTaskbar(win) {
  if (process.platform !== 'win32') return;
  try {
    win.setAppDetails({
      appId: APP_USER_MODEL_ID,
      appIconPath: stableIcon('icon.ico'),
      appIconIndex: 0,
      relaunchDisplayName: 'TopWatch',
    });
  } catch (err) {
    logLine('[barra de tarefas]', err.message);
  }
}

function ensureStartMenuShortcut() {
  if (process.platform !== 'win32' || (app.isPackaged && !PORTABLE_EXE)) return;
  try {
    const dir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const link = path.join(dir, app.isPackaged ? 'TopWatch.lnk' : 'TopWatch (dev).lnk');
    const options = {
      target: PORTABLE_EXE || process.execPath,
      args: PORTABLE_EXE ? '' : `"${app.getAppPath()}"`,
      icon: stableIcon('icon.ico'),
      iconIndex: 0,
      appUserModelId: APP_USER_MODEL_ID,
      description: 'TopWatch',
    };
    const ok = shell.writeShortcutLink(link, fs.existsSync(link) ? 'replace' : 'create', options);
    if (!ok) logLine('[atalho] o Windows recusou criar', link);
  } catch (err) {
    logLine('[atalho]', err.message);
  }
}

// ---------- plugins ----------

function pluginsRoot() {
  return path.join(app.getPath('userData'), 'plugins');
}

// TOPWATCH_PLUGINS: pastas extras (separadas por ; ou :) pra desenvolver plugins sem instalar
function pluginRoots() {
  const extra = (process.env.TOPWATCH_PLUGINS || '').split(path.delimiter).filter(Boolean);
  return [pluginsRoot(), ...extra];
}

function loadAllPlugins() {
  for (const p of plugins) closePlugin(p);
  const res = pluginKit.loadPlugins(pluginRoots(), { log: (m) => console.warn(`[TopWatch] ${m}`) });
  pluginErrors = res.errors;
  plugins = res.plugins.map((p) => {
    let instance = null;
    try {
      instance = p.mod.create({ request, version: app.getVersion() });
    } catch (err) {
      pluginErrors.push({ dir: p.dir, message: `create() falhou: ${err.message}` });
    }
    return { ...p, instance };
  }).filter((p) => p.instance);
  if (store) store.setPlugins(plugins.map((p) => p.mod));
}

function closePlugin(p) {
  try {
    if (p.instance && typeof p.instance.close === 'function') p.instance.close(store ? store.get().plugins[p.mod.id] : {});
  } catch {
    // saindo, não importa
  }
}

function pluginState(p, cfg, extra) {
  return {
    id: p.info.id,
    name: p.info.name,
    tab: p.info.tab,
    enabled: !!(cfg.plugins[p.info.id] && cfg.plugins[p.info.id].enabled),
    items: [],
    error: null,
    ...extra,
  };
}

// ---------- janelas ----------

// ---------- onde a barra fica ----------
// dock: { edge: 'top'|'bottom'|'left'|'right', displayId, displayBounds, ratio }
// ratio = posição ao longo da borda (0 a 1; 0.5 = no meio). A janela tem sempre o mesmo tamanho;
// a ilha se ancora na borda certa dentro dela (renderer/island.css, body[data-edge]).
function dockOf(cfg = store.get()) {
  return dockMath.normalizeDock(cfg.ui && cfg.ui.dock);
}

function islandBounds(dock) {
  return dockMath.islandBounds(dock, dockMath.displayFor(dock, screen.getAllDisplays(), screen.getPrimaryDisplay()), ISLAND_W, ISLAND_H);
}

function positionIsland() {
  if (!island || drag) return;
  const dock = dockOf();
  island.setBounds(islandBounds(dock));
  island.webContents.send('dock', dock.edge);
}

function dockFromPoint(p) {
  return dockMath.dockFromPoint(p, screen.getDisplayNearestPoint(p));
}

function saveDock(dock) {
  store.save({ ui: { dock } });
}

// ---------- arrastar a barra ----------
let drag = null;

function moveWindowTo(target, ms, done) {
  const from = island.getBounds();
  const t0 = Date.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const timer = setInterval(() => {
    if (!island || island.isDestroyed()) return clearInterval(timer);
    const t = Math.min(1, (Date.now() - t0) / ms);
    const e = ease(t);
    island.setBounds({ x: Math.round(from.x + (target.x - from.x) * e), y: Math.round(from.y + (target.y - from.y) * e), width: ISLAND_W, height: ISLAND_H });
    if (t >= 1) {
      clearInterval(timer);
      done();
    }
  }, 16);
}

function dragTick() {
  if (!drag || !island || island.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  const now = Date.now();
  const dt = Math.max(1, now - drag.t);
  const vx = ((p.x - drag.last.x) / dt) * 1000;
  const vy = ((p.y - drag.last.y) / dt) * 1000;
  drag.last = p;
  drag.t = now;
  // setBounds com o tamanho fixo: no Windows com escala (125%, 150%), setPosition repetido faz a janela
  // crescer de pouquinho em pouquinho e o boneco "escorrega" pra baixo do cursor
  island.setBounds({ x: Math.round(p.x - ISLAND_W / 2), y: Math.round(p.y - ISLAND_H / 2), width: ISLAND_W, height: ISLAND_H });
  island.webContents.send('drag:move', { vx, vy });
}

function finishDrag(dock) {
  if (!drag) return;
  clearInterval(drag.timer);
  drag = null;
  const target = islandBounds(dock);
  // onde a pílula vai ficar dentro da janela; a janela anda até a borda e o robozinho voa até esse ponto junto
  const pill = { top: [ISLAND_W / 2, 15], bottom: [ISLAND_W / 2, ISLAND_H - 15], left: [15, ISLAND_H / 2], right: [ISLAND_W - 15, ISLAND_H / 2] }[dock.edge];
  island.webContents.send('drag:drop', { edge: dock.edge, x: pill[0], y: pill[1], ms: 300 });
  moveWindowTo(target, 300, () => {
    island.setBounds(target); // acerta o tamanho (trocar de monitor com escala diferente pode mexer nele)
    island.webContents.send('drag:landed', { edge: dock.edge });
  });
}

ipcMain.on('drag:start', (e) => {
  if (!fromWindow(e, island) || drag) return;
  if (pinned) setPinned(false);
  island.setIgnoreMouseEvents(false);
  const p = screen.getCursorScreenPoint();
  drag = { last: p, t: Date.now(), prev: dockOf(), timer: setInterval(dragTick, 16) };
  dragTick();
});

ipcMain.on('drag:end', (e) => {
  if (!fromWindow(e, island) || !drag) return;
  const dock = dockFromPoint(screen.getCursorScreenPoint());
  saveDock(dock);
  finishDrag(dock);
});

ipcMain.on('drag:cancel', (e) => {
  if (fromWindow(e, island) && drag) finishDrag(drag.prev);
});

function setInteractive(on) {
  if (!island) return;
  if (process.platform === 'linux') return; // "forward" não existe no Linux; lá a janela fica sempre clicável
  island.setIgnoreMouseEvents(!on, { forward: true });
}

function createIsland() {
  island = new BrowserWindow({
    width: ISLAND_W,
    height: ISLAND_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false, // nunca rouba o foco do que você está fazendo
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', // o som do alerta toca sem clique
    },
  });
  island.setAlwaysOnTop(true, 'screen-saver');
  island.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setInteractive(false);
  island.loadFile(path.join(__dirname, 'renderer', 'island.html'));
  island.once('ready-to-show', () => {
    positionIsland();
    if (!hidden) island.showInactive();
  });
  island.webContents.on('will-navigate', (e) => e.preventDefault());
  island.webContents.on('did-finish-load', () => {
    pushSoundToIsland();
    island.webContents.send('dock', dockOf().edge);
  });
  watchRenderer(island, 'barra');
  island.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 480,
    minHeight: 520,
    title: 'TopWatch – Configurações',
    autoHideMenuBar: true,
    backgroundColor: '#14161a',
    icon: windowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const win = settingsWin;
  brandTaskbar(win);
  win.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  watchRenderer(win, 'configurações');
  win.on('closed', () => {
    // fechar e abrir rápido: o "closed" da janela velha chega depois da nova existir.
    // Sem essa conferência ele apagava a referência da nova, e ela ficava sem dados e sem responder.
    if (settingsWin === win) settingsWin = null;
  });
}

function setHidden(value) {
  hidden = value;
  if (!island) return;
  if (hidden) island.hide();
  else {
    positionIsland();
    island.showInactive();
  }
  buildTrayMenu();
}

function setPinned(value) {
  pinned = value;
  if (island) island.webContents.send('pinned', pinned);
  setInteractive(pinned);
}

// ---------- coleta ----------

function isDemo(cfg) {
  return FORCE_DEMO || cfg.demo;
}

// estado + preferências de exibição, que a ilha precisa pra se desenhar
function snapshotForUi() {
  return { ...state, history, ui: store ? store.get().ui : undefined };
}

function broadcast() {
  allowedUrls.clear();
  for (const it of [...state.zabbix.items, ...state.plugins.flatMap((p) => p.items)]) if (it.url) allowedUrls.add(it.url);
  if (island && !island.isDestroyed()) island.webContents.send('state', snapshotForUi());
  updateTrayTooltip();
}

function notifyNewProblems(items) {
  const cfg = store.get();
  const fresh = items.filter((p) => !seenProblems.has(p.id));
  items.forEach((p) => seenProblems.add(p.id));
  if (firstPoll) return;
  const grave = fresh.filter((x) => x.severity >= 4);
  if (!grave.length) return;
  if (island && !island.isDestroyed()) {
    if (cfg.notifySound) island.webContents.send('sound');
    if (cfg.notifyBar) {
      island.webContents.send(
        'notice',
        grave.slice(0, 5).map((p) => ({ id: p.id, level: p.severity, label: p.severityLabel, host: p.hosts.join(', '), title: p.title })),
      );
    }
  }
  if (!cfg.notify || !Notification.isSupported()) return;
  for (const p of grave.slice(0, 3)) {
    const n = new Notification({
      title: `${p.severityLabel}: ${p.hosts.join(', ') || 'Zabbix'}`,
      body: p.title,
      icon: path.join(__dirname, 'assets', 'icon.png'),
      // com o som do TopWatch ligado, a notificação fica muda; desligado, vale o som do próprio Windows
      silent: !!cfg.notifySound,
    });
    n.on('click', () => {
      if (allowedUrls.has(p.url)) shell.openExternal(p.url);
    });
    n.show();
  }
  if (island && !island.isDestroyed()) island.webContents.send('alert');
}

async function poll() {
  if (polling) return;
  polling = true;
  const cfg = store.get();
  const before = state.zabbix.items;
  const wasFirst = firstPoll;
  try {
    if (isDemo(cfg)) {
      const snap = demo.snapshot();
      state = {
        demo: true,
        updatedAt: Date.now(),
        zabbix: { enabled: true, items: snap.problems, error: null, multi: true },
        // no demo, plugin com demo() aparece com os dados de exemplo dele
        plugins: plugins
          .filter((p) => typeof p.instance.demo === 'function')
          .map((p) => {
            let items = [];
            try {
              items = (p.instance.demo() || []).map((it, i) => pluginKit.normalizeItem(p.mod, it, i));
            } catch {
              // demo quebrado: aba vazia
            }
            return pluginState(p, cfg, { enabled: true, items });
          }),
      };
    } else {
      const active = plugins.filter((p) => cfg.plugins[p.mod.id] && cfg.plugins[p.mod.id].enabled);
      const [z, ...pr] = await Promise.allSettled([
        cfg.zabbix.enabled ? zabbix.fetchAll(cfg.zabbix) : Promise.resolve({ items: [], errors: [], servers: 0 }),
        ...active.map((p) => p.instance.fetch(cfg.plugins[p.mod.id])),
      ]);
      // servidor que falhou nesta rodada mantém os alertas da rodada anterior (sem piscar a lista)
      const zr = z.status === 'fulfilled' ? z.value : { items: [], errors: [{ serverId: '*', message: z.reason.message }], servers: 0 };
      const failed = new Set(zr.errors.map((er) => er.serverId));
      const kept = state.zabbix.items.filter((it) => failed.has(it.serverId) || failed.has('*')).map((it) => ({ ...it, stale: true }));
      // todos os servidores falharam nesta rodada: "sem conexão"
      const allDown = cfg.zabbix.enabled && (z.status === 'rejected' || (zr.servers > 0 && failed.size >= zr.servers) || failed.has('*'));
      if (allDown) {
        failStreak++;
        offlineSince = offlineSince || Date.now();
      } else {
        failStreak = 0;
        offlineSince = null;
        if (cfg.zabbix.enabled) lastOkAt = Date.now();
      }
      const previous = new Map(state.plugins.map((p) => [p.id, p.items]));
      state = {
        demo: false,
        updatedAt: Date.now(),
        zabbix: {
          enabled: cfg.zabbix.enabled,
          items: [...zr.items, ...kept],
          error: zr.errors.length ? zr.errors.map((er) => er.message).join(' · ') : null,
          multi: zabbix.activeServers(cfg.zabbix).length > 1,
          offlineSince,
          lastOkAt,
          retryAt: allDown ? Date.now() + nextDelay() : null,
        },
        plugins: plugins.map((p) => {
          const i = active.indexOf(p);
          if (i < 0) return pluginState(p, cfg);
          const r = pr[i];
          if (r.status === 'fulfilled') {
            const items = (Array.isArray(r.value) ? r.value : []).slice(0, 200).map((it, k) => pluginKit.normalizeItem(p.mod, it, k));
            return pluginState(p, cfg, { items });
          }
          const msg = (r.reason && r.reason.message) || String(r.reason);
          return pluginState(p, cfg, {
            items: previous.get(p.info.id) || [],
            error: msg.toLowerCase().startsWith(p.info.name.toLowerCase()) ? msg : `${p.info.name}: ${msg}`,
          });
        }),
      };
    }
    if (!wasFirst) {
      const failedNow = new Set((state.zabbix.items || []).filter((it) => it.stale).map((it) => it.serverId));
      const okServers = new Set(before.map((it) => it.serverId).filter((id) => !failedNow.has(id)));
      if (!state.zabbix.offlineSince) recordResolved(before, state.zabbix.items, okServers);
    }
    notifyNewProblems(state.zabbix.items);
    firstPoll = false;
  } finally {
    polling = false;
    broadcast();
  }
}

// ---------- histórico: alertas resolvidos nas últimas 24 h ----------
// Guardado só no seu PC (userData/history.json). Entra aqui o alerta que sumiu do Zabbix entre
// duas coletas que deram certo, ou seja, o problema normalizou.
const HISTORY_MS = 24 * 60 * 60 * 1000;
let history = [];
function historyFile() {
  return path.join(app.getPath('userData'), 'history.json');
}
function loadHistory() {
  try {
    const list = JSON.parse(fs.readFileSync(historyFile(), 'utf8'));
    history = Array.isArray(list) ? list.filter((h) => h && Date.now() - h.resolvedAt < HISTORY_MS) : [];
  } catch {
    history = [];
  }
}
let historySaveTimer = null;
function saveHistory() {
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => {
    fs.promises.writeFile(historyFile(), JSON.stringify(history)).catch((err) => logLine('[histórico]', err.message));
  }, 500);
}
function recordResolved(before, after, okServers) {
  const still = new Set(after.map((it) => it.id));
  const now = Date.now();
  let changed = false;
  for (const it of before) {
    if (still.has(it.id) || it.stale || !okServers.has(it.serverId)) continue;
    history.unshift({
      id: it.id,
      title: it.title,
      severity: it.severity,
      severityLabel: it.severityLabel,
      hosts: it.hosts,
      serverName: it.serverName,
      since: it.since,
      resolvedAt: now,
      url: it.url,
      updates: (it.updates || []).slice(0, 3),
    });
    changed = true;
  }
  const fresh = history.filter((h) => now - h.resolvedAt < HISTORY_MS).slice(0, 200);
  if (fresh.length !== history.length) changed = true;
  history = fresh;
  if (changed) saveHistory();
}

// ---------- agenda da coleta ----------
// Tudo certo: coleta a cada pollSeconds. Servidores fora do ar: espera cada vez mais entre as
// tentativas (2x, 4x, 8x, 16x, até 5 min), pra não martelar um servidor caído nem a rede.
let failStreak = 0;
let offlineSince = null;
let lastOkAt = null;

function nextDelay() {
  const base = store.get().pollSeconds * 1000;
  if (!failStreak) return base;
  return Math.min(base * 2 ** Math.min(failStreak, 4), Math.max(base, 5 * 60 * 1000));
}

function schedule() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    await poll();
    schedule();
  }, nextDelay());
}

function restartPolling() {
  clearTimeout(pollTimer);
  firstPoll = true;
  seenProblems.clear();
  failStreak = 0;
  offlineSince = null;
  poll().finally(schedule);
}

// voltou do modo suspenso ou desbloqueou a tela: atualiza na hora, sem esperar a próxima rodada
function pollNow() {
  failStreak = 0;
  clearTimeout(pollTimer);
  poll().finally(schedule);
}

function simulateDemo(fn) {
  fn();
  pollNow();
}

// ---------- bandeja ----------

// O ícone é o Vigia em miniatura, animado como um GIF em loop: os quadros ficam numa
// folha só (assets/tray, gerada por scripts/tray-icons.py) e trocam a cada TRAY_TICK ms.
// A cor do olho segue o pior alerta; em Alta/Desastre o olho "respira" em vez de olhar pros lados.
const TRAY_DIR = path.join(__dirname, 'assets', 'tray');
const TRAY_TICK = 60; // ~16 quadros por segundo
const trayCache = new Map();
let trayMeta = null;
let traySheet = null;
let trayLevelNow = 'ok';
let trayFrameNow = null;
let trayQueue = [];
let trayTicker = null;

// uma folha por resolução: 16 px (100%), 24 px (150%) e 32 px (200%)
const TRAY_SCALES = [
  [1, 'sheet.png'],
  [1.5, 'sheet@1.5x.png'],
  [2, 'sheet@2x.png'],
];

function loadTraySheet() {
  try {
    trayMeta = JSON.parse(fs.readFileSync(path.join(TRAY_DIR, 'frames.json'), 'utf8'));
    // lidas como imagem comum (sem a mágica do @2x), pra recortar em pixels de cada folha
    traySheet = TRAY_SCALES.map(([scale, file]) => [scale, nativeImage.createFromBuffer(fs.readFileSync(path.join(TRAY_DIR, file)))]).filter(
      ([, img]) => !img.isEmpty()
    );
    if (!traySheet.length) traySheet = null;
  } catch {
    traySheet = null;
  }
}

// recorta o quadro em cada resolução e junta tudo numa imagem só (o Windows escolhe a certa)
function trayImage(level, frame) {
  if (!traySheet) return null;
  const key = `${level}:${frame}`;
  if (!trayCache.has(key)) {
    const row = trayMeta.levels.indexOf(level);
    const col = trayMeta.frames.indexOf(frame);
    let img = null;
    if (row >= 0 && col >= 0) {
      img = nativeImage.createEmpty();
      for (const [scale, sheet] of traySheet) {
        const s = Math.round(trayMeta.size * scale);
        const part = sheet.crop({ x: col * s, y: row * s, width: s, height: s });
        img.addRepresentation({ scaleFactor: scale, width: s, height: s, buffer: part.toPNG() });
      }
    }
    trayCache.set(key, img);
  }
  return trayCache.get(key);
}

function trayIcon() {
  loadTraySheet();
  return trayImage('ok', 'x0') || nativeImage.createEmpty();
}

function setTrayFrame(frame) {
  if (!tray || tray.isDestroyed() || frame === trayFrameNow) return;
  const img = trayImage(trayLevelNow, frame);
  if (!img) return;
  tray.setImage(img);
  trayFrameNow = frame;
}

// ---- roteiros da animação (listas de quadros, um por TRAY_TICK) ----

const hold = (frame, ms) => Array(Math.max(1, Math.round(ms / TRAY_TICK))).fill(frame);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
// desliza o olho de "from" até "to" (de -5 a 5) com aceleração suave
function slide(from, to, ms) {
  const n = Math.max(1, Math.round(ms / TRAY_TICK));
  const out = [];
  for (let i = 1; i <= n; i++) out.push(`x${Math.round(from + (to - from) * easeInOut(i / n))}`);
  return out;
}
const BLINK = ['b1', 'b2', 'b3', 'b3', 'b2', 'b1'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// tudo calmo ou alerta leve: olha em volta, pisca
function calmLoop() {
  const side = Math.random() < 0.5 ? -5 : 5;
  return pick([
    // varre de um lado ao outro
    () => [...hold('x0', 700), ...slide(0, side, 420), ...hold(`x${side}`, 650), ...slide(side, -side, 760), ...hold(`x${-side}`, 650), ...slide(-side, 0, 420), ...hold('x0', 300), ...BLINK, ...hold('x0', 600)],
    // olha pra um lado, volta, pisca duas vezes
    () => [...hold('x0', 500), ...BLINK, ...hold('x0', 700), ...slide(0, side, 450), ...hold(`x${side}`, 1100), ...slide(side, 0, 450), ...hold('x0', 400), ...BLINK, ...hold('x0', 120), ...BLINK, ...hold('x0', 500)],
    // olhadinhas curtas, como quem lê
    () => [...hold('x0', 400), ...slide(0, -2, 260), ...hold('x-2', 380), ...slide(-2, 2, 380), ...hold('x2', 420), ...slide(2, -3, 420), ...hold('x-3', 500), ...slide(-3, 0, 300), ...hold('x0', 300), ...BLINK, ...hold('x0', 700)],
  ])();
}

// Alta/Desastre: o olho "respira" (apaga e acende suave) e pisca de vez em quando
function pulseLoop(level) {
  const step = level === '5' ? 100 : 170;
  const breath = ['x0', 'p1', 'p2', 'p3', 'p4', 'p4', 'p3', 'p2', 'p1', 'x0'].flatMap((f) => hold(f, step));
  return [...breath, ...hold('x0', step * 2), ...breath, ...hold('x0', step * 2), ...breath, ...hold('x0', step), ...BLINK, ...hold('x0', step * 2)];
}

function trayTick() {
  if (!trayQueue.length) trayQueue = trayLevelNow === '4' || trayLevelNow === '5' ? pulseLoop(trayLevelNow) : calmLoop();
  setTrayFrame(trayQueue.shift());
}

function startTrayAnimation() {
  clearInterval(trayTicker);
  if (traySheet) trayTicker = setInterval(trayTick, TRAY_TICK);
}

// mesma regra da luz da ilha: o que a barra está mostrando define a cor
function trayLevel() {
  const display = store ? store.get().ui.display : 'both';
  const plugin = state.plugins.find((p) => p.id === display && p.enabled);
  if (!plugin) {
    const open = state.zabbix.items.filter((p) => !p.acknowledged);
    if (open.length) return String(Math.max(...open.map((p) => p.severity)));
  } else if (plugin.items.length) {
    return String(Math.max(...plugin.items.map((it) => it.level)));
  }
  const errors = [state.zabbix.error, ...state.plugins.filter((p) => p.enabled).map((p) => p.error)];
  return errors.some(Boolean) ? 'error' : 'ok';
}

function updateTrayIcon() {
  const level = trayLevel();
  if (level === trayLevelNow) return;
  const wasPulsing = trayLevelNow === '4' || trayLevelNow === '5';
  const pulsing = level === '4' || level === '5';
  trayLevelNow = level;
  // mesmo quadro, cor nova; troca de roteiro só se mudou de calmo pra alerta grave (ou o contrário)
  const frame = trayFrameNow || 'x0';
  trayFrameNow = null;
  setTrayFrame(frame);
  if (wasPulsing !== pulsing) trayQueue = [...slide(Number((frame.match(/^x(-?\d)/) || [0, 0])[1]), 0, 240)];
}

function updateTrayTooltip() {
  if (!tray) return;
  const z = state.zabbix.items.length;
  const parts = [`${z} alerta${z === 1 ? '' : 's'}`];
  for (const p of state.plugins.filter((x) => x.enabled)) {
    const n = p.items.length;
    parts.push(`${n} ${n === 1 ? p.tab.singular : p.tab.plural}`);
  }
  tray.setToolTip(`TopWatch – ${parts.join(', ')}${state.demo ? ' (demo)' : ''}`);
  updateTrayIcon();
}

function buildTrayMenu() {
  if (!tray) return;
  const cfg = store.get();
  const login = app.getLoginItemSettings();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: hidden ? 'Mostrar a barra' : 'Esconder a barra', click: () => setHidden(!hidden) },
      { label: 'Atualizar agora', click: () => pollNow() },
      {
        label: 'Simular (modo demo)',
        enabled: isDemo(cfg),
        submenu: [
          { label: 'Alerta Alta', click: () => simulateDemo(() => demo.simulate(4)) },
          { label: 'Desastre', click: () => simulateDemo(() => demo.simulate(5)) },
          { type: 'separator' },
          { label: 'Resolver tudo', click: () => simulateDemo(() => demo.resolveAll()) },
          { label: 'Voltar aos dados de exemplo', click: () => simulateDemo(() => demo.reset()) },
        ],
      },
      {
        label: 'Voltar a barra pro topo da tela principal',
        click: () => {
          const d = screen.getPrimaryDisplay();
          saveDock({ edge: 'top', displayId: d.id, displayBounds: { ...d.bounds }, ratio: 0.5 });
          positionIsland();
        },
      },
      { type: 'separator' },
      { label: 'Configurações…', click: openSettings },
      {
        label: 'Modo demo',
        type: 'checkbox',
        checked: isDemo(cfg),
        enabled: !FORCE_DEMO,
        click: (item) => {
          store.setFlag('demo', item.checked);
          restartPolling();
        },
      },
      {
        label: 'Iniciar com o Windows',
        type: 'checkbox',
        visible: process.platform === 'win32',
        checked: login.openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ])
  );
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.on('click', () => setHidden(!hidden));
  buildTrayMenu();
  updateTrayTooltip();
  startTrayAnimation();
}

// ---------- som do alerta ----------
// Padrão: renderer/sounds/alerta.wav. O usuário pode escolher um arquivo dele; a cópia fica em userData/sounds.
const SOUND_TYPES = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
function soundsDir() {
  return path.join(app.getPath('userData'), 'sounds');
}
function pushSoundToIsland() {
  if (!island || island.isDestroyed()) return;
  const name = store.get().soundFile;
  const file = name ? path.join(soundsDir(), path.basename(name)) : null;
  if (!file || !fs.existsSync(file)) return island.webContents.send('sound-data', null);
  island.webContents.send('sound-data', { mime: SOUND_TYPES[path.extname(file).toLowerCase()] || 'audio/mpeg', data: fs.readFileSync(file) });
}

// ---------- IPC ----------

function fromWindow(e, win) {
  return win && !win.isDestroyed() && e.sender === win.webContents;
}

ipcMain.on('island:interactive', (e, on) => {
  if (!fromWindow(e, island)) return;
  if (pinned || drag) return;
  setInteractive(!!on);
});

ipcMain.handle('island:state', () => snapshotForUi());
ipcMain.on('island:refresh', () => pollNow());
ipcMain.on('island:settings', () => openSettings());
ipcMain.on('island:unpin', (e) => {
  if (fromWindow(e, island)) setPinned(false);
});

ipcMain.on('open-url', (_e, url) => {
  // Só abre links que vieram dos próprios dados (nada de URL arbitrária).
  if (typeof url === 'string' && allowedUrls.has(url) && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.handle('zabbix:ack', async (e, itemId, note) => {
  if (!fromWindow(e, island)) return { ok: false, message: 'Origem inválida' };
  // só aceita alertas que estão na lista atual; o id já diz de qual servidor ele veio
  const item = state.zabbix.items.find((p) => p.id === itemId);
  if (!item) return { ok: false, message: 'Esse alerta não está mais aberto.' };
  const typed = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  const message = typed || (store.get().ackMessage || '').trim() || zabbix.ACK_MESSAGE;
  try {
    if (state.demo) demo.acknowledge(item.eventid, message);
    else {
      const server = store.get().zabbix.servers.find((s) => s.id === item.serverId);
      if (!server) return { ok: false, message: 'O servidor desse alerta foi removido das configurações.' };
      await zabbix.acknowledge(server, item.eventid, message);
    }
    item.acknowledged = true;
    // aparece na hora no Histórico; a próxima coleta traz o registro oficial do Zabbix
    item.updates = [{ by: 'você', mine: true, at: Date.now(), message, ack: true }, ...(item.updates || [])];
    broadcast();
    setTimeout(poll, 1500);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle('settings:get', (e) => {
  if (!fromWindow(e, settingsWin)) return null;
  return {
    ...store.getMasked(),
    forcedDemo: FORCE_DEMO,
    plugins: plugins.map((p) => p.info),
    pluginErrors: pluginErrors.map((er) => ({ folder: path.basename(er.dir), message: er.message })),
  };
});

ipcMain.handle('settings:pick-sound', async (e) => {
  if (!fromWindow(e, settingsWin)) return { ok: false, message: 'Origem inválida' };
  const pick = await dialog.showOpenDialog(settingsWin, {
    title: 'Escolha o som do alerta',
    properties: ['openFile'],
    filters: [{ name: 'Áudio', extensions: Object.keys(SOUND_TYPES).map((x) => x.slice(1)) }],
  });
  if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
  const src = pick.filePaths[0];
  const ext = path.extname(src).toLowerCase();
  if (!SOUND_TYPES[ext]) return { ok: false, message: 'Use um arquivo .wav, .mp3, .ogg ou .m4a.' };
  if (fs.statSync(src).size > 3 * 1024 * 1024) return { ok: false, message: 'O arquivo passa de 3 MB. Use um som curto.' };
  fs.mkdirSync(soundsDir(), { recursive: true });
  for (const old of fs.readdirSync(soundsDir())) fs.rmSync(path.join(soundsDir(), old), { force: true });
  const name = `alerta${ext}`;
  fs.copyFileSync(src, path.join(soundsDir(), name));
  store.setFlag('soundFile', name);
  store.setFlag('soundLabel', path.basename(src).slice(0, 80));
  pushSoundToIsland();
  return { ok: true, label: store.get().soundLabel };
});

ipcMain.handle('settings:reset-sound', (e) => {
  if (!fromWindow(e, settingsWin)) return { ok: false };
  store.setFlag('soundFile', '');
  store.setFlag('soundLabel', '');
  pushSoundToIsland();
  return { ok: true };
});

ipcMain.on('settings:test-sound', (e) => {
  if (fromWindow(e, settingsWin) && island && !island.isDestroyed()) island.webContents.send('sound');
});

// "Instalar plugin…": escolhe a pasta do plugin, copia pra pasta de plugins e recarrega
ipcMain.handle('settings:install-plugin', async (e) => {
  if (!fromWindow(e, settingsWin)) return { ok: false, message: 'Origem inválida' };
  const pick = await dialog.showOpenDialog(settingsWin, {
    title: 'Escolha a pasta do plugin (a que tem o index.js)',
    properties: ['openDirectory'],
  });
  if (pick.canceled || !pick.filePaths[0]) return { ok: false, canceled: true };
  try {
    const id = pluginKit.installPlugin(pick.filePaths[0], pluginsRoot());
    loadAllPlugins();
    restartPolling();
    const p = plugins.find((x) => x.mod.id === id);
    if (!p) {
      const er = pluginErrors.find((x) => path.basename(x.dir) === id);
      throw new Error(er ? er.message : 'o plugin não carregou');
    }
    return { ok: true, message: `Plugin ${p.info.name} ${p.info.version} instalado.` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.on('settings:open-plugins-site', (e) => {
  if (fromWindow(e, settingsWin)) shell.openExternal(PLUGINS_SITE);
});

ipcMain.on('settings:open-plugins-folder', (e) => {
  if (!fromWindow(e, settingsWin)) return;
  fs.mkdirSync(pluginsRoot(), { recursive: true });
  shell.openPath(pluginsRoot());
});

ipcMain.handle('settings:save', (e, changes) => {
  if (!fromWindow(e, settingsWin)) return { ok: false, message: 'Origem inválida' };
  const before = store.get();
  store.save(changes);
  buildTrayMenu();
  // mudou só a aparência? redesenha na hora, sem refazer a coleta
  const after = store.get();
  const onlyUi = JSON.stringify({ ...before, ui: null }) === JSON.stringify({ ...after, ui: null });
  if (onlyUi) broadcast();
  else restartPolling();
  positionIsland(); // a borda pode ter mudado
  return { ok: true };
});

// which = 'zabbix' (id = servidor) ou 'plugin' (id = plugin)
ipcMain.handle('settings:test', async (e, which, changes, id) => {
  if (!fromWindow(e, settingsWin)) return { ok: false, message: 'Origem inválida' };
  const cfg = store.withChanges(changes); // testa o que está na tela, sem salvar
  try {
    let message;
    if (which === 'zabbix') {
      const server = cfg.zabbix.servers.find((s) => s.id === id);
      if (!server) throw new Error('Servidor não encontrado.');
      message = await zabbix.test(server, { minSeverity: cfg.zabbix.minSeverity });
    } else {
      const p = plugins.find((x) => x.mod.id === id);
      if (!p) throw new Error('Plugin não encontrado.');
      if (typeof p.instance.test !== 'function') throw new Error('Esse plugin não tem teste de conexão.');
      message = String(await p.instance.test(cfg.plugins[id]));
    }
    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

// ---------- ciclo de vida ----------

app.on('second-instance', () => setHidden(false));

app.whenReady().then(() => {
  loadHistory();
  // voltou do modo suspenso ou desbloqueou a tela: atualiza na hora
  powerMonitor.on('resume', () => pollNow());
  powerMonitor.on('unlock-screen', () => pollNow());
  registerAppIdentity();
  ensureStartMenuShortcut();
  store = createStore({ dir: app.getPath('userData'), safeStorage });
  loadAllPlugins();

  createIsland();
  createTray();

  // Ctrl+Alt+F: fixa a barra aberta (pra usar sem depender do hover)
  globalShortcut.register('CommandOrControl+Alt+F', () => {
    if (hidden) setHidden(false);
    setPinned(!pinned);
  });

  screen.on('display-metrics-changed', positionIsland);
  screen.on('display-added', positionIsland);
  screen.on('display-removed', positionIsland);

  restartPolling();

  const cfg = store.get();
  if (!FORCE_DEMO && cfg.demo && !cfg.zabbix.servers.length) {
    // primeira vez: mostra a ilha em demo e abre as configurações
    setTimeout(openSettings, 800);
  }
});

app.on('window-all-closed', (e) => e.preventDefault()); // vive na bandeja

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  clearTimeout(pollTimer);
  clearInterval(trayTicker);
  for (const p of plugins) closePlugin(p);
});
