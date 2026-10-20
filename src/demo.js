'use strict';
// Dados de mentira pra ver o app funcionando sem configurar nada.

const { SEVERITY_LABELS } = require('./zabbix');

const MIN = 60 * 1000;

const PROBLEMS = [
  { title: 'Servidor sem resposta ao ICMP', host: 'srv-app02', severity: 5, ago: 4, srv: 'Zabbix 7' },
  { title: 'Espaço em disco C: abaixo de 10%', host: 'srv-db01', severity: 4, ago: 38, srv: 'Zabbix 6' },
  { title: 'Link principal com perda de pacotes > 20%', host: 'fw-matriz', severity: 4, ago: 12, ack: true, srv: 'Zabbix 6' },
  { title: 'Uso de CPU acima de 90% há 15 min', host: 'srv-rds03', severity: 3, ago: 22 },
  { title: 'Serviço "Spooler" parado', host: 'srv-print01', severity: 2, ago: 95, srv: 'Zabbix 6' },
  { title: 'Certificado SSL expira em 14 dias', host: 'web-portal', severity: 2, ago: 600 },
];

let tick = 0;
const acked = new Set();

// Simulação pela bandeja: injeta alertas novos (Alta ou Desastre) e "resolve tudo",
// pra testar a barra crescendo, o som e a notificação sem servidor nenhum.
const SIMULATED = {
  4: [
    ['Serviço W3SVC (IIS) parado', 'srv-web01'],
    ['Fila do banco acima de 500 conexões', 'srv-db02'],
    ['Backup noturno falhou', 'srv-bkp01'],
    ['Interface Gi0/1 sem tráfego', 'sw-core01'],
  ],
  5: [
    ['Servidor sem resposta ao ICMP', 'srv-erp01'],
    ['Datastore com 98% de uso', 'esx-cluster01'],
    ['Firewall principal fora do ar', 'fw-matriz'],
  ],
};
const injected = [];
let seq = 0;
let cleared = false;

function simulate(severity) {
  const list = SIMULATED[severity] || SIMULATED[4];
  const [title, host] = list[seq % list.length];
  seq++;
  cleared = false;
  injected.unshift({ id: `zbx-sim-${seq}`, eventid: `sim-${seq}`, title, host, severity, since: Date.now() });
}

function resolveAll() {
  injected.length = 0;
  cleared = true;
}

function reset() {
  injected.length = 0;
  cleared = false;
  acked.clear();
}

function acknowledge(eventid) {
  acked.add(String(eventid));
}

function snapshot() {
  const now = Date.now();
  tick++;
  // De vez em quando "resolve" o primeiro alerta, pra ver a luz mudar de cor.
  const problems = PROBLEMS.map((p, i) => ({
    id: `zbx-demo-${i}`,
    eventid: `demo-${i}`,
    serverId: p.srv === 'Zabbix 6' ? 'demo6' : 'demo7',
    serverName: p.srv || 'Zabbix 7',
    source: 'zabbix',
    title: p.title,
    severity: p.severity,
    severityLabel: SEVERITY_LABELS[p.severity],
    hosts: [p.host],
    since: now - p.ago * MIN,
    acknowledged: !!p.ack || acked.has(`demo-${i}`),
    url: 'https://www.zabbix.com/documentation/current/en/manual/api',
  })).filter((p) => !(p.eventid === 'demo-0' && tick % 4 === 0));
  const sims = injected.map((p) => ({
    id: p.id,
    eventid: p.eventid,
    serverId: 'demo7',
    serverName: 'Zabbix 7',
    source: 'zabbix',
    title: p.title,
    severity: p.severity,
    severityLabel: SEVERITY_LABELS[p.severity],
    hosts: [p.host],
    since: p.since,
    acknowledged: acked.has(p.eventid),
    url: 'https://www.zabbix.com/documentation/current/en/manual/api',
  }));
  return { problems: [...sims, ...(cleared ? [] : problems)] };
}

module.exports = { snapshot, acknowledge, simulate, resolveAll, reset };
