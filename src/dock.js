'use strict';
// Conta de onde a barra fica: em qual borda, em qual monitor e em que ponto ao longo da borda.
// Funções puras (recebem os monitores, não falam com o Electron), pra dar pra testar.
//
// dock: { edge: 'top'|'bottom'|'left'|'right', displayId, displayBounds, ratio }
// display: { id, bounds: {x,y,width,height}, workArea: {x,y,width,height} } (como o screen do Electron)

const EDGES = ['top', 'bottom', 'left', 'right'];

function normalizeDock(d) {
  const x = d || {};
  return {
    edge: EDGES.includes(x.edge) ? x.edge : 'top',
    displayId: x.displayId,
    displayBounds: x.displayBounds,
    ratio: Number.isFinite(x.ratio) ? Math.min(1, Math.max(0, x.ratio)) : 0.5,
  };
}

// monitor salvo pelo id; se o id mudou (acontece depois de reiniciar), pelo tamanho/posição; senão, o principal
function displayFor(dock, displays, primary) {
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  return displays.find((d) => d.id === dock.displayId) || displays.find((d) => same(d.bounds, dock.displayBounds)) || primary;
}

// retângulo da janela da barra (tamanho fixo w x h) pra esse dock
function islandBounds(dock, display, w, h) {
  const b = display.bounds;
  const wa = display.workArea; // embaixo e nas laterais, respeita a barra de tarefas
  const clamp = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), Math.max(lo, hi)));
  let x;
  let y;
  if (dock.edge === 'top' || dock.edge === 'bottom') {
    x = clamp(b.x + dock.ratio * b.width - w / 2, b.x, b.x + b.width - w);
    y = dock.edge === 'top' ? b.y : wa.y + wa.height - h;
  } else {
    x = dock.edge === 'left' ? wa.x : wa.x + wa.width - w;
    y = clamp(wa.y + dock.ratio * wa.height - h / 2, wa.y, wa.y + wa.height - h);
  }
  return { x, y, width: w, height: h };
}

// soltou num ponto: gruda na borda mais perto, no monitor desse ponto
function dockFromPoint(p, display) {
  const b = display.bounds;
  const dist = { top: p.y - b.y, bottom: b.y + b.height - p.y, left: p.x - b.x, right: b.x + b.width - p.x };
  const edge = EDGES.reduce((best, e) => (dist[e] < dist[best] ? e : best), 'top');
  let ratio = edge === 'top' || edge === 'bottom' ? (p.x - b.x) / b.width : (p.y - b.y) / b.height;
  ratio = Math.min(Math.max(ratio, 0), 1);
  if (Math.abs(ratio - 0.5) < 0.05) ratio = 0.5; // perto do meio, centraliza
  return { edge, displayId: display.id, displayBounds: { ...b }, ratio: Math.round(ratio * 1000) / 1000 };
}

module.exports = { EDGES, normalizeDock, displayFor, islandBounds, dockFromPoint };
