'use strict';
// Quais alertas geram aviso (src/alerts.js)

const test = require('node:test');
const assert = require('node:assert/strict');
const { createNoticeTracker, MAX_SEEN } = require('../src/alerts');

const alert = (id, serverId, extra = {}) => ({ id, serverId, severity: 5, ...extra });
const ids = (list) => list.map((it) => it.id);

test('Avisos: primeira coleta de um servidor entra calada; as seguintes avisam só o que é novo', () => {
  const t = createNoticeTracker();
  assert.deepEqual(t.fresh([alert('a', 's1')], ['s1']), []);
  assert.deepEqual(ids(t.fresh([alert('a', 's1'), alert('b', 's1')], ['s1'])), ['b']);
  assert.deepEqual(t.fresh([alert('a', 's1'), alert('b', 's1')], ['s1']), []);
});

test('Avisos: app abriu sem rede; quando a conexão volta, os alertas antigos não disparam', () => {
  const t = createNoticeTracker();
  // VPN ainda fora: nenhum servidor respondeu
  assert.deepEqual(t.fresh([], []), []);
  assert.deepEqual(t.fresh([], []), []);
  // VPN subiu: o que já estava aberto entra calado
  assert.deepEqual(t.fresh([alert('a', 's1'), alert('b', 's1')], ['s1']), []);
  // e só depois o novo avisa
  assert.deepEqual(ids(t.fresh([alert('a', 's1'), alert('b', 's1'), alert('c', 's1')], ['s1'])), ['c']);
});

test('Avisos: servidor que respondeu sem nenhum alerta já conta como conhecido', () => {
  const t = createNoticeTracker();
  assert.deepEqual(t.fresh([], ['s1']), []);
  assert.deepEqual(ids(t.fresh([alert('a', 's1')], ['s1'])), ['a']);
});

test('Avisos: um servidor fora do ar não atrapalha o outro e entra calado quando volta', () => {
  const t = createNoticeTracker();
  t.fresh([alert('a', 's1')], ['s1']); // s2 fora
  assert.deepEqual(ids(t.fresh([alert('a', 's1'), alert('n', 's1')], ['s1'])), ['n']);
  // s2 voltou com alertas antigos: calado
  assert.deepEqual(t.fresh([alert('a', 's1'), alert('n', 's1'), alert('x', 's2')], ['s1', 's2']), []);
  assert.deepEqual(ids(t.fresh([alert('x', 's2'), alert('y', 's2')], ['s1', 's2'])), ['y']);
});

test('Avisos: alerta mantido (stale) de servidor que falhou não avisa nem é marcado como visto', () => {
  const t = createNoticeTracker();
  t.fresh([], ['s1']);
  assert.deepEqual(t.fresh([alert('a', 's1', { stale: true })], []), []);
  assert.equal(t._seen.has('a'), false);
  assert.deepEqual(ids(t.fresh([alert('a', 's1')], ['s1'])), ['a']);
});

test('Avisos: reset() volta ao começo (ao trocar configurações)', () => {
  const t = createNoticeTracker();
  t.fresh([alert('a', 's1')], ['s1']);
  t.reset();
  assert.deepEqual(t.fresh([alert('a', 's1'), alert('b', 's1')], ['s1']), []);
});

test('Avisos: a lista de vistos é podada quando passa do limite', () => {
  const t = createNoticeTracker();
  t.fresh([], ['s1']);
  const many = Array.from({ length: MAX_SEEN + 1 }, (_, i) => alert(`old${i}`, 's1'));
  t.fresh(many, ['s1']);
  t.fresh([alert('keep', 's1')], ['s1']);
  assert.ok(t._seen.size <= MAX_SEEN);
});
