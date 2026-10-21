'use strict';
/* global topwatch */

const $ = (id) => document.getElementById(id);
const island = $('island');

let state = null;
let tab = 'zabbix';
let pinned = false;
let openTimer = null;
let closeTimer = null;
let heroItem = null;

// o vigia: um no card de destaque, outro no estado calmo
const heroBot = createBot($('hero-bot'));
const calmBot = createBot($('calm-bot'));
calmBot.setMood('sleep');

const UI_DEFAULT = { display: 'both', highlight: true, mascot: true };

function ui(s) {
  return { ...UI_DEFAULT, ...((s && s.ui) || {}) };
}

// plugins com aba (ativos, ou com dados de exemplo no demo)
function pluginTabs(s) {
  return (s.plugins || []).filter((p) => p.enabled);
}

function pluginById(s, id) {
  return pluginTabs(s).find((p) => p.id === id) || null;
}

// modo de exibição: 'both' (tudo), 'zabbix' ou o id de um plugin
function display(s) {
  const d = ui(s).display;
  if (d === 'both' || d === 'zabbix' || pluginById(s, d)) return d;
  return 'both'; // plugin escolhido não está mais instalado/ativo
}

function shows(s, source) {
  const d = display(s);
  return d === 'both' || d === source;
}

// ---------- utilidades ----------

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text; // sempre textContent: nada de HTML vindo da API
  return n;
}

function ago(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

function sevColor(sev) {
  return `var(--sev-${Math.min(5, Math.max(0, sev))})`;
}

function dur(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h < 24) return r ? `${h} h ${r} min` : `${h} h`;
  return `${Math.round(h / 24)} d`;
}

function ackedProblems(s) {
  return s.zabbix.items.filter((p) => p.acknowledged);
}

function openProblems(s) {
  return s.zabbix.items.filter((p) => !p.acknowledged);
}

function sortedProblems(items) {
  return items.slice().sort((a, b) => a.acknowledged - b.acknowledged || b.severity - a.severity || b.since - a.since);
}

function sortedPluginItems(items) {
  return items.slice().sort((a, b) => b.level - a.level || (b.updated || b.since || 0) - (a.updated || a.since || 0));
}

// ---------- abrir / fechar ----------

function expand() {
  clearTimeout(closeTimer);
  island.classList.add('expanded');
  $('panel').setAttribute('aria-hidden', 'false');
}

function collapse() {
  if (pinned) return;
  island.classList.remove('expanded');
  $('panel').setAttribute('aria-hidden', 'true');
}

island.addEventListener('mouseenter', () => {
  topwatch.setInteractive(true);
  clearTimeout(closeTimer);
  openTimer = setTimeout(expand, 140); // passar o mouse por cima sem querer não abre
});

island.addEventListener('mouseleave', () => {
  clearTimeout(openTimer);
  if (pinned) return;
  closeTimer = setTimeout(() => {
    collapse();
    topwatch.setInteractive(false);
  }, 400);
});

// ---------- pílula ----------

// todos os servidores do Zabbix fora do ar (a coleta continua tentando, com espera crescente)
function offline(s) {
  return !s.demo && s.zabbix.enabled && !!s.zabbix.offlineSince;
}

function worstLevel(s) {
  if (shows(s, 'zabbix') && offline(s)) return 'error';
  if (shows(s, 'zabbix')) {
    const open = openProblems(s);
    if (open.length) return String(Math.max(...open.map((p) => p.severity)));
  } else {
    const p = pluginById(s, display(s));
    if (p && p.items.length) return String(Math.max(...p.items.map((it) => it.level)));
  }
  const visibleErrors = [shows(s, 'zabbix') && s.zabbix.error, ...pluginTabs(s).map((p) => shows(s, p.id) && p.error)];
  if (visibleErrors.some(Boolean)) return 'error';
  return 'ok';
}

function renderSummary(s) {
  const summary = $('summary');
  summary.textContent = '';
  island.classList.remove('alerting');

  if (!s.zabbix.enabled && !pluginTabs(s).length) {
    summary.append(el('span', null, 'Configure o TopWatch'));
    return;
  }

  // sem conexão: os alertas que aparecem são da última vez que deu certo
  if (shows(s, 'zabbix') && offline(s)) {
    summary.append(el('b', 'off', 'Sem conexão'));
    summary.append(el('span', 'sep', '·'));
    summary.append(el('span', null, ago(s.zabbix.offlineSince) === 'agora' ? 'agora' : `há ${ago(s.zabbix.offlineSince)}`));
    return;
  }

  // alerta grave aberto: a pílula mostra qual é (se essa opção estiver ligada)
  const worst = sortedProblems(openProblems(s))[0];
  if (ui(s).highlight && shows(s, 'zabbix') && worst && worst.severity >= 4) {
    island.classList.add('alerting');
    summary.append(el('b', null, worst.severityLabel));
    summary.append(el('span', 'sep', '·'));
    summary.append(el('span', null, worst.hosts[0] || worst.title));
    return;
  }

  const z = openProblems(s).length;
  const parts = [];
  if (s.zabbix.enabled && shows(s, 'zabbix')) parts.push(`${z} alerta${z === 1 ? '' : 's'}`);
  for (const p of pluginTabs(s)) {
    if (!shows(s, p.id)) continue;
    const n = p.items.length;
    parts.push(`${n} ${n === 1 ? p.tab.singular : p.tab.plural}`);
  }
  if (!parts.length) parts.push('Zabbix desativado');
  parts.forEach((p, i) => {
    if (i) summary.append(el('span', 'sep', '·'));
    summary.append(el('span', null, p));
  });
}

// ---------- painel ----------

let lastHeroId = null;
function renderHero(item) {
  heroItem = item;
  const hero = $('hero');
  hero.classList.toggle('hidden', !item);
  if (item && lastHeroId && item.id !== lastHeroId && !reduceMotion) {
    hero.animate([{ opacity: 0, transform: 'translateY(-6px) scale(0.985)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
  lastHeroId = item ? item.id : null;
  if (!item) return;
  hero.classList.toggle('stale', !!item.stale);

  const mascot = ui(state).mascot;
  $('hero-bot').classList.toggle('hidden', !mascot);
  $('hero-orb').classList.toggle('hidden', mascot);
  heroBot.setMood(item.source === 'zabbix' && item.severity >= 4 ? 'alarm' : 'watch');

  const meta = $('hero-meta');
  meta.textContent = '';
  const ack = $('hero-ack');

  if (item.source === 'zabbix') {
    hero.style.setProperty('--c', sevColor(item.severity));
    hero.classList.toggle('pulse', item.severity >= 4);
    meta.append(el('span', 'sev', item.severityLabel));
    meta.append(el('span', null, '·'));
    meta.append(el('span', 'host', item.hosts.join(', ') || '—'));
    if (state.zabbix.multi && item.serverName) meta.append(el('span', 'srv', item.serverName));
    meta.append(el('span', null, '·'));
    meta.append(el('span', null, ago(item.since)));
    ack.classList.remove('hidden');
    // sem conexão, o alerta é da última coleta: não dá pra reconhecer agora
    ack.disabled = !!item.stale;
    ack.title = item.stale ? 'Sem conexão com o Zabbix agora' : '';
    ack.textContent = 'Reconhecer';
    $('hero-open').textContent = 'Abrir';
  } else {
    // item de plugin
    const p = pluginById(state, item.source);
    hero.style.setProperty('--c', sevColor(item.level));
    hero.classList.toggle('pulse', item.level >= 5);
    const bits = [item.levelLabel, item.tag, item.detail].filter(Boolean);
    bits.forEach((b, i) => {
      if (i) meta.append(el('span', null, '·'));
      meta.append(el('span', i === 0 ? 'sev' : i === 1 ? 'host' : null, b));
    });
    ack.classList.add('hidden');
    $('hero-open').textContent = (p && p.tab.openLabel) || 'Abrir';
    $('hero-open').classList.toggle('hidden', !item.url);
  }
  if (item.source === 'zabbix') $('hero-open').classList.remove('hidden');
  $('hero-title').textContent = item.title;
}

function row(item) {
  const li = el('li', `row${item.acknowledged ? ' ack' : ''}${item.stale ? ' stale' : ''}`);
  li.title = item.title;
  const isZbx = item.source === 'zabbix';
  li.style.setProperty('--c', sevColor(isZbx ? item.severity : item.level));
  li.append(el('span', 'dot'));
  li.append(el('span', 'title', item.title));
  const where = el('span', 'where', isZbx ? item.hosts.join(', ') : [item.tag, item.detail].filter(Boolean).join(' · '));
  if (item.source === 'zabbix' && state.zabbix.multi && item.serverName) where.prepend(el('span', 'srv', item.serverName));
  li.append(where);
  li.append(el('span', 'age', ago(isZbx ? item.since : item.updated || item.since)));
  if (item.url) li.append(el('span', 'go', '↗'));
  li.addEventListener('click', () => {
    if (item.url) topwatch.openUrl(item.url);
  });
  li.addEventListener('mouseenter', () => {
    const r = li.getBoundingClientRect();
    heroBot.lookAt(r.left + r.width * 0.35, r.top + r.height / 2);
  });
  return li;
}

// Lista com chave por alerta: alerta novo entra deslizando, resolvido sai encolhendo e o resto
// escorrega pro lugar novo (técnica FLIP: mede antes, mede depois, anima a diferença).
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function renderList(list, items) {
  const switched = list.dataset.tab !== tab;
  list.dataset.tab = tab;
  if (switched) list.textContent = '';
  const before = new Map();
  list.querySelectorAll('.row[data-id]:not(.leave)').forEach((li) => before.set(li.dataset.id, { top: li.getBoundingClientRect().top, el: li }));
  const nextIds = new Set(items.map((it) => it.id));
  const oldOrder = [...before.keys()];
  list.textContent = '';
  const fresh = new Map();
  for (const it of items) {
    const li = row(it);
    li.dataset.id = it.id;
    if (before.size && !before.has(it.id) && !reduceMotion) li.classList.add('enter');
    list.append(li);
    fresh.set(it.id, li);
  }
  if (reduceMotion) return;
  // quem saiu volta pro lugar antigo só pra encolher e sumir
  oldOrder.forEach((id, i) => {
    if (nextIds.has(id)) return;
    const ghost = before.get(id).el;
    ghost.classList.add('leave');
    const nextKept = oldOrder.slice(i + 1).find((x) => fresh.has(x));
    if (nextKept) list.insertBefore(ghost, fresh.get(nextKept));
    else list.append(ghost);
    setTimeout(() => ghost.remove(), 320);
  });
  for (const [id, li] of fresh) {
    const b = before.get(id);
    if (!b) continue;
    const dy = b.top - li.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
  list.classList.toggle('scrolls', list.scrollHeight > list.clientHeight + 2);
}

// linha do histórico: duas linhas, com quem reconheceu e a mensagem, ou quando resolveu e quanto durou
function histRow(item, kind) {
  const li = el('li', `row two${kind === 'resolved' ? ' done' : ' ack'}`);
  li.dataset.id = `${kind}:${item.id}`;
  li.style.setProperty('--c', sevColor(item.severity));
  li.append(el('span', 'dot'));
  const text = el('span', 'text');
  text.append(el('span', 'title', item.title));
  const sub = el('span', 'sub');
  if (kind === 'resolved') {
    sub.append(el('b', 'ok', 'Resolvido'));
    sub.append(document.createTextNode(` há ${ago(item.resolvedAt) === 'agora' ? 'menos de 1 min' : ago(item.resolvedAt)} · durou ${dur(item.resolvedAt - item.since)}`));
  } else {
    const last = (item.updates || []).find((u) => u.ack) || (item.updates || [])[0];
    sub.append(el('b', 'ackd', 'Em tratativa'));
    if (last) {
      const who = last.mine ? 'você' : last.by || 'alguém do time';
      sub.append(document.createTextNode(` · ${who}, ${ago(last.at) === 'agora' ? 'agora' : `há ${ago(last.at)}`}`));
      if (last.message) sub.append(el('span', 'msg', `“${last.message}”`));
    }
  }
  text.append(sub);
  li.append(text);
  const where = el('span', 'where', (item.hosts || []).join(', '));
  if (state.zabbix.multi && item.serverName) where.prepend(el('span', 'srv', item.serverName));
  li.append(where);
  li.append(el('span', 'age', kind === 'resolved' ? '' : ago(item.since)));
  if (item.url) {
    li.append(el('span', 'go', '↗'));
    li.addEventListener('click', () => topwatch.openUrl(item.url));
  }
  li.title = item.title;
  return li;
}

function renderHistory(s) {
  const working = sortedProblems(ackedProblems(s));
  const resolved = (s.history || []).slice(0, 50);
  renderHero(null);
  const list = $('list');
  const animate = list.dataset.tab === 'history';
  list.dataset.tab = 'history';
  const before = animate ? new Set([...list.querySelectorAll('.row[data-id]')].map((li) => li.dataset.id)) : null;
  list.textContent = '';
  const section = (label, n) => list.append(el('li', 'section', `${label} · ${n}`));
  if (working.length) {
    section('Em tratativa', working.length);
    working.forEach((it) => list.append(histRow(it, 'working')));
  }
  if (resolved.length) {
    section('Resolvidos nas últimas 24 h', resolved.length);
    resolved.forEach((it) => list.append(histRow(it, 'resolved')));
  }
  if (before && !reduceMotion) list.querySelectorAll('.row[data-id]').forEach((li) => !before.has(li.dataset.id) && li.classList.add('enter'));
  list.classList.toggle('scrolls', list.scrollHeight > list.clientHeight + 2);
  const quiet = !working.length && !resolved.length;
  $('calm').classList.toggle('hidden', !quiet);
  island.classList.toggle('quiet', quiet);
  $('calm-text').textContent = 'Nada em tratativa e nada resolvido nas últimas 24 h.';
  const errBox = $('error');
  errBox.classList.add('hidden');
}

function renderPanel(s) {
  if (tab === 'history') return renderHistory(s);
  const plugin = tab === 'zabbix' ? null : pluginById(s, tab);
  const src = plugin || s.zabbix;

  const errBox = $('error');
  errBox.classList.toggle('hidden', !src.error);
  errBox.textContent = src.error || '';
  if (!plugin && offline(s)) {
    const secs = src.retryAt ? Math.max(0, Math.round((src.retryAt - Date.now()) / 1000)) : null;
    const since = ago(src.offlineSince);
    errBox.textContent = '';
    errBox.classList.add('offline');
    errBox.append(el('b', null, `Sem conexão com o Zabbix ${since === 'agora' ? 'agora' : `há ${since}`}.`));
    errBox.append(document.createTextNode(` Mostrando os alertas ${src.lastOkAt ? `de há ${ago(src.lastOkAt) === 'agora' ? 'menos de 1 min' : ago(src.lastOkAt)}` : 'da última coleta'}.`));
    if (secs !== null) errBox.append(el('span', 'retry', secs > 60 ? ` Nova tentativa em ${Math.round(secs / 60)} min.` : ` Nova tentativa em ${secs} s.`));
    if (src.error) errBox.append(el('small', 'detail', src.error));
  } else {
    errBox.classList.remove('offline');
  }

  let items;
  let hero = null;
  if (tab === 'zabbix') {
    items = sortedProblems(src.items.filter((p) => !p.acknowledged));
    if (items[0]) hero = items.shift();
  } else {
    items = sortedPluginItems(src.items);
    hero = items.shift() || null;
  }

  renderHero(hero);

  renderList($('list'), items);

  // calmo = nada pendente nessa aba
  const calm = !hero && !src.error;
  const quiet = calm && items.length === 0;
  $('calm').classList.toggle('hidden', !quiet);
  island.classList.toggle('quiet', quiet);
  const mascot = ui(s).mascot;
  $('calm-bot').classList.toggle('hidden', !mascot);
  $('calm-orb').classList.toggle('hidden', mascot);
  if (!src.enabled) $('calm-text').textContent = 'Zabbix desativado nas configurações.';
  else if (!plugin) {
    const n = ackedProblems(s).length;
    $('calm-text').textContent = n ? `Nada pendente. ${n} em tratativa no Histórico.` : 'Nenhum alerta pendente. Tudo calmo.';
  }
  else $('calm-text').textContent = plugin.tab.empty;
}

// abas dos plugins: recriadas só quando o conjunto de plugins muda
let tabsKey = '';
function syncPluginTabs(s) {
  const list = pluginTabs(s);
  const key = list.map((p) => `${p.id}:${p.tab.label}`).join('|');
  if (key === tabsKey) return;
  tabsKey = key;
  document.querySelectorAll('.tab[data-plugin]').forEach((b) => b.remove());
  const nav = $('tabs');
  for (const p of list) {
    const b = el('button', 'tab');
    b.dataset.tab = p.id;
    b.dataset.plugin = '1';
    b.setAttribute('role', 'tab');
    b.append(document.createTextNode(p.tab.label));
    const c = el('span', 'count', '0');
    c.dataset.count = p.id;
    b.append(c);
    nav.append(b);
  }
  if (tab !== 'zabbix' && tab !== 'history' && !pluginById(s, tab)) tab = 'zabbix';
}

function applyDisplay(s) {
  syncPluginTabs(s);
  const d = display(s);
  if (d !== 'both' && !(d === 'zabbix' && tab === 'history')) tab = d;
  document.querySelectorAll('.tab').forEach((x) => {
    x.classList.toggle('active', x.dataset.tab === tab);
    x.classList.toggle('hidden', !shows(s, x.dataset.tab === 'history' ? 'zabbix' : x.dataset.tab));
  });
}

function setCount(node, n) {
  const next = String(n);
  if (node.textContent === next) return;
  const had = node.textContent !== '';
  node.textContent = next;
  if (!had || reduceMotion) return;
  node.classList.remove('tick');
  void node.offsetWidth;
  node.classList.add('tick');
}

function renderHeader(s) {
  const zHot = openProblems(s).some((p) => p.severity >= 4);
  setCount($('count-zabbix'), openProblems(s).length);
  setCount($('count-history'), ackedProblems(s).length);
  $('count-zabbix').classList.toggle('hot', zHot);
  for (const p of pluginTabs(s)) {
    const c = document.querySelector(`.count[data-count="${p.id}"]`);
    if (c) setCount(c, p.items.length);
  }
  if (offline(s)) {
    const t = s.zabbix.lastOkAt;
    $('updated').textContent = t ? `dados de ${ago(t) === 'agora' ? 'agora há pouco' : `há ${ago(t)}`}` : 'sem dados ainda';
  } else {
    $('updated').textContent = s.updatedAt ? (ago(s.updatedAt) === 'agora' ? 'atualizado agora' : `há ${ago(s.updatedAt)}`) : '';
  }
  $('demo-badge').classList.toggle('hidden', !s.demo);
}

function render() {
  if (!state) return;
  applyDisplay(state);
  island.dataset.level = worstLevel(state);
  renderSummary(state);
  renderHeader(state);
  renderPanel(state);
}

// ---------- eventos ----------

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  tab = b.dataset.tab;
  render();
});

$('btn-refresh').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  btn.classList.remove('spin');
  void btn.offsetWidth;
  btn.classList.add('spin');
  topwatch.refresh();
});

$('btn-settings').addEventListener('click', () => topwatch.openSettings());
$('btn-unpin').addEventListener('click', () => topwatch.unpin());

$('hero-open').addEventListener('click', () => {
  if (heroItem) topwatch.openUrl(heroItem.url);
});

async function acknowledgeHero(note) {
  if (!heroItem || heroItem.source !== 'zabbix') return;
  closeNote();
  const btn = $('hero-ack');
  btn.disabled = true;
  btn.textContent = 'Reconhecendo…';
  const res = await topwatch.acknowledge(heroItem.id, note);
  if (res.ok) heroBot.celebrate();
  if (!res.ok) {
    btn.disabled = false;
    btn.textContent = 'Reconhecer';
    const errBox = $('error');
    errBox.textContent = `Não deu pra reconhecer: ${res.message}`;
    errBox.classList.remove('hidden');
  }
  // em caso de sucesso o processo principal manda o estado novo
}
$('hero-ack').addEventListener('click', () => acknowledgeHero());

// ✎: escreve uma nota pro time e reconhece com ela
const noteInput = $('hero-note-input');
function openNote() {
  $('hero').classList.add('noting');
  noteInput.classList.remove('hidden');
  noteInput.value = '';
  noteInput.focus();
}
function closeNote() {
  $('hero').classList.remove('noting');
  noteInput.classList.add('hidden');
}
$('hero-note').addEventListener('click', () => (noteInput.classList.contains('hidden') ? openNote() : closeNote()));
noteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && noteInput.value.trim()) acknowledgeHero(noteInput.value.trim());
  if (e.key === 'Escape') closeNote();
});

$('panel').addEventListener('mousemove', (e) => {
  if (e.target.closest('.row')) return; // nas linhas, ela olha pra linha
  heroBot.lookAt(e.clientX, e.clientY);
});
$('list').addEventListener('mouseleave', () => heroBot.lookDown());
island.addEventListener('mouseleave', () => heroBot.lookDown());

topwatch.onState((s) => {
  state = s;
  render();
});

topwatch.onPinned((p) => {
  pinned = p;
  $('btn-unpin').classList.toggle('hidden', !p);
  if (p) expand();
  else collapse();
});

// som do alerta grave (sintetizado em scripts/alert-sound.py); toca mesmo com o Windows em silêncio de notificações
const DEFAULT_SOUND = 'sounds/alerta.wav';
const alertSound = new Audio(DEFAULT_SOUND);
alertSound.volume = 0.8;
let soundUrl = null;
// som escolhido nas configurações (o processo principal manda os bytes; null = padrão)
if (topwatch.onSoundData) {
  topwatch.onSoundData((d) => {
    if (soundUrl) URL.revokeObjectURL(soundUrl);
    soundUrl = d ? URL.createObjectURL(new Blob([d.data], { type: d.mime })) : null;
    alertSound.src = soundUrl || DEFAULT_SOUND;
  });
}
if (topwatch.onSound) {
  topwatch.onSound(() => {
    alertSound.currentTime = 0;
    alertSound.play().catch(() => {});
  });
}

// alerta grave chegando: a própria barra cresce e mostra por alguns segundos; clicar abre a barra
let noticeTimer;
function hideNotice() {
  clearTimeout(noticeTimer);
  island.classList.remove('noticing');
}
function showNotice(items) {
  if (!items || !items.length || island.classList.contains('expanded') || document.body.classList.contains('dragging')) return;
  const top = items.slice().sort((a, b) => b.level - a.level)[0];
  $('notice-meta').textContent = `${top.label}${top.host ? ` · ${top.host}` : ''}${items.length > 1 ? `  +${items.length - 1}` : ''}`;
  $('notice-title').textContent = top.title;
  island.classList.add('noticing');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(hideNotice, 8000);
}
$('noticebox').addEventListener('click', () => {
  hideNotice();
  expand();
});
if (topwatch.onNotice) topwatch.onNotice(showNotice);

// ---------- borda onde a barra fica ----------
if (topwatch.onDock) topwatch.onDock((edge) => (document.body.dataset.edge = edge));

// ---------- arrastar: a barra vira o Vigia de corpo inteiro; ao soltar, ele mergulha e vira a barra ----------
const dragbotEl = $('dragbot');
const buddy = createBuddy(dragbotEl);
let press = null; // { x, y, id, el }
let dragging = false;

function dragZone(target) {
  if (target.closest('button, .tab, .row, #list, input, a')) return false;
  return !!target.closest('#pill, header, #noticebox, #hero, #calm');
}

island.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !dragZone(e.target)) return;
  press = { x: e.screenX, y: e.screenY, id: e.pointerId, el: e.target };
});
window.addEventListener('pointermove', (e) => {
  if (!press || dragging) return;
  if (Math.hypot(e.screenX - press.x, e.screenY - press.y) > 6) startDrag();
});
window.addEventListener('pointerup', () => {
  if (dragging) endDrag();
  press = null;
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dragging) {
    dragging = false;
    topwatch.dragCancel();
  }
});

function startDrag() {
  dragging = true;
  try {
    press.el.setPointerCapture(press.id);
  } catch {
    // sem captura também funciona: a janela anda junto com o cursor
  }
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  hideNotice();
  island.classList.remove('expanded');
  $('panel').setAttribute('aria-hidden', 'true');
  dragbotEl.className = 'dragbot';
  dragbotEl.style.transform = '';
  // a cabeça usa a cor do estado atual (olho e antena laranja num alerta Alta, por exemplo)
  dragbotEl.style.setProperty('--level', getComputedStyle(island).getPropertyValue('--level'));
  document.body.classList.add('dragging');
  buddy.setEyesShut(true);
  buddy.start();
  topwatch.dragStart();
}

function endDrag() {
  dragging = false;
  topwatch.dragEnd();
}

if (topwatch.onDragMove) topwatch.onDragMove((v) => buddy.setVelocity(v.vx, v.vy));

// onde a luz da pílula fica dentro da janela, em cada borda
const PILL = { top: [320, 15], bottom: [320, 315], left: [15, 165], right: [625, 165] };
// centro do olho da cabeça, com a cabeça na posição de arrasto (veja .dragbot no CSS)
const EYE = [320, 184.6];

// soltou: a cabeça abre o olho e voa até o lugar da luz da pílula, encolhendo; perde a casca, depois o visor,
// e sobra só a cor do olho (a janela anda junto até a borda)
if (topwatch.onDragDrop) {
  topwatch.onDragDrop((d) => {
    const [lx, ly] = PILL[d.edge];
    buddy.setEyesShut(false);
    buddy.stop();
    dragbotEl.style.setProperty('--fly', `${d.ms}ms`);
    dragbotEl.classList.add('flying');
    dragbotEl.style.transform = `translate(${lx - EYE[0]}px, ${ly - EYE[1]}px) scale(0.7)`;
  });
}

// chegou: no lugar do olho fica só o ponto de luz da barra, e ela estica pro lado e mostra o conteúdo
if (topwatch.onDragLanded) {
  topwatch.onDragLanded((d) => {
    document.body.dataset.edge = d.edge;
    island.classList.add('seed', 'flash');
    document.body.classList.remove('dragging');
    dragbotEl.className = 'dragbot';
    dragbotEl.style.transform = '';
    void island.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => island.classList.remove('seed')));
    setTimeout(() => island.classList.remove('flash'), 650);
    setTimeout(() => topwatch.setInteractive(island.matches(':hover')), 400);
  });
}

topwatch.onAlert(() => {
  heroBot.jolt();
  island.classList.remove('ping');
  void island.offsetWidth;
  island.classList.add('ping');
});

// atualiza os "há X min" sem esperar a próxima coleta
setInterval(render, 30000);

topwatch.getState().then((s) => {
  state = s;
  render();
});
