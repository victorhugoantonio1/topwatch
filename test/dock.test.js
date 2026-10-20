'use strict';
// Conta das bordas e monitores (src/dock.js)

const test = require('node:test');
const assert = require('node:assert/strict');
const dock = require('../src/dock');

const W = 640;
const H = 330;
// monitor principal 1920x1080 com barra de tarefas embaixo; segundo monitor à direita, 1536x864, mais alto
const main = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } };
const side = { id: 2, bounds: { x: 1920, y: -200, width: 1536, height: 864 }, workArea: { x: 1920, y: -200, width: 1536, height: 816 } };

test('Dock: topo centralizado no principal', () => {
  const b = dock.islandBounds(dock.normalizeDock(null), main, W, H);
  assert.deepEqual(b, { x: 640, y: 0, width: W, height: H });
});

test('Dock: embaixo fica acima da barra de tarefas', () => {
  const b = dock.islandBounds(dock.normalizeDock({ edge: 'bottom', ratio: 0.5 }), main, W, H);
  assert.equal(b.y, 1032 - H);
});

test('Dock: laterais grudam na borda e não saem da tela nas pontas', () => {
  const l = dock.islandBounds(dock.normalizeDock({ edge: 'left', ratio: 0 }), main, W, H);
  assert.equal(l.x, 0);
  assert.equal(l.y, 0);
  const r = dock.islandBounds(dock.normalizeDock({ edge: 'right', ratio: 1 }), side, W, H);
  assert.equal(r.x, 1920 + 1536 - W);
  assert.equal(r.y, -200 + 816 - H);
});

test('Dock: soltar perto de cada borda escolhe a borda certa', () => {
  assert.equal(dock.dockFromPoint({ x: 900, y: 20 }, main).edge, 'top');
  assert.equal(dock.dockFromPoint({ x: 900, y: 1060 }, main).edge, 'bottom');
  assert.equal(dock.dockFromPoint({ x: 15, y: 500 }, main).edge, 'left');
  assert.equal(dock.dockFromPoint({ x: 1920 + 1530, y: 100 }, side).edge, 'right');
});

test('Dock: perto do meio centraliza; longe guarda a posição', () => {
  assert.equal(dock.dockFromPoint({ x: 980, y: 10 }, main).ratio, 0.5);
  assert.equal(dock.dockFromPoint({ x: 384, y: 10 }, main).ratio, 0.2);
});

test('Dock: monitor salvo pelo id, pelo tamanho se o id mudou, ou o principal', () => {
  const all = [main, side];
  assert.equal(dock.displayFor({ displayId: 2 }, all, main), side);
  assert.equal(dock.displayFor({ displayId: 99, displayBounds: { ...side.bounds } }, all, main), side);
  assert.equal(dock.displayFor({ displayId: 99, displayBounds: { x: 5, y: 5, width: 1, height: 1 } }, all, main), main);
});

test('Dock: valor estragado vira topo no meio', () => {
  assert.deepEqual(dock.normalizeDock({ edge: 'diagonal', ratio: 'x' }).edge, 'top');
  assert.equal(dock.normalizeDock({ ratio: 7 }).ratio, 1);
});
