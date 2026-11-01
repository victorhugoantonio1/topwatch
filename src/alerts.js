'use strict';
// Decide quais alertas são novos de verdade (pra tocar som, mostrar o aviso e notificar).
//
// Um servidor só começa a gerar aviso depois da primeira coleta que deu certo NELE: o que já
// estava aberto antes disso entra calado. Assim, abrir o app antes da VPN subir (ou com um
// servidor fora do ar) não dispara uma rajada de avisos de alertas antigos quando a conexão volta.

const MAX_SEEN = 5000;

function createNoticeTracker() {
  const seen = new Set(); // ids de alertas já vistos
  const seeded = new Set(); // servidores que já tiveram uma coleta que deu certo

  // items: alertas da coleta atual; okServers: ids dos servidores que responderam nesta coleta
  function fresh(items, okServers) {
    const ok = new Set(okServers);
    const out = [];
    for (const it of items) {
      if (seen.has(it.id)) continue;
      // alerta mantido de um servidor que falhou agora: espera ele voltar pra decidir
      if (it.stale || !ok.has(it.serverId)) continue;
      seen.add(it.id);
      if (seeded.has(it.serverId)) out.push(it);
    }
    for (const id of ok) seeded.add(id);
    if (seen.size > MAX_SEEN) {
      // poda: fica só com o que ainda está aberto
      const open = new Set(items.map((it) => it.id));
      for (const id of seen) if (!open.has(id)) seen.delete(id);
    }
    return out;
  }

  function reset() {
    seen.clear();
    seeded.clear();
  }

  return { fresh, reset, _seen: seen };
}

module.exports = { createNoticeTracker, MAX_SEEN };
