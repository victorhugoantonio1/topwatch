'use strict';
// Cabeça do Vigia que aparece quando você arrasta a barra.
// Fica pendurada no ponto onde você segura (o topo da cabeça) e balança com molas: a cabeça
// inclina com o movimento, a antena chacoalha e ela estica/amassa de leve. Enquanto você
// arrasta, o olho fica fechado num "^" contente; ao soltar, ele abre e a cabeça vira a pílula.

// eslint-disable-next-line no-unused-vars
function createBuddy(container) {
  container.innerHTML = `
<svg class="buddy" viewBox="0 0 100 92" aria-hidden="true">
  <defs>
    <linearGradient id="bd-shell" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#727a8a"/>
      <stop offset="0.48" stop-color="#3b414d"/>
      <stop offset="1" stop-color="#1b1e25"/>
    </linearGradient>
    <radialGradient id="bd-hl" cx="0.28" cy="0.16" r="0.62">
      <stop offset="0" stop-color="#fff" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bd-glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#121519"/>
      <stop offset="1" stop-color="#040506"/>
    </linearGradient>
    <filter id="bd-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="2.6"/></filter>
  </defs>
  <g class="bd-all">
    <g class="bd-antenna">
      <rect x="47.8" y="9" width="4.4" height="15" rx="2.2" fill="#5d6574"/>
      <circle class="bd-tip-glow" cx="50" cy="8" r="6.5" filter="url(#bd-glow)"/>
      <circle class="bd-tip" cx="50" cy="8" r="4.8"/>
    </g>
    <g class="bd-shellparts">
      <rect x="6" y="44" width="9" height="20" rx="4.5" fill="#2f343d"/>
      <rect x="85" y="44" width="9" height="20" rx="4.5" fill="#2f343d"/>
      <rect x="12" y="22" width="76" height="62" rx="21" fill="url(#bd-shell)"/>
      <rect x="12" y="22" width="76" height="62" rx="21" fill="url(#bd-hl)"/>
      <rect x="12.6" y="22.6" width="74.8" height="60.8" rx="20.4" fill="none" stroke="rgba(200,210,225,.32)" stroke-width="1.2"/>
    </g>
    <rect class="bd-visor" x="21" y="34" width="58" height="37" rx="16" fill="url(#bd-glass)"/>
    <g class="bd-eye">
      <rect class="bd-eye-glow" x="39" y="43" width="22" height="19" rx="8" filter="url(#bd-glow)"/>
      <rect class="bd-eye-core" x="40.5" y="44.5" width="19" height="16" rx="7"/>
      <path class="bd-eye-shut" d="M40.5 56 Q50 45.5 59.5 56" fill="none" stroke-width="4.2" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;
  const svg = container.querySelector('svg');
  const all = svg.querySelector('.bd-all');
  const antenna = svg.querySelector('.bd-antenna');

  const spring = (k, d) => ({ x: 0, v: 0, k, d });
  const S = { swing: spring(60, 8), antenna: spring(230, 7), stretch: spring(240, 13) };
  let vel = { x: 0, y: 0 };
  let prev = { x: 0, y: 0 };
  let acc = { x: 0, y: 0 };
  let running = false;
  let last = 0;
  const clamp = (v, a) => Math.max(-a, Math.min(a, v));
  const step = (sp, target, dt, kick = 0) => {
    sp.v += (-(sp.k * (sp.x - target)) - sp.d * sp.v + kick) * dt;
    sp.x += sp.v * dt;
  };

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000) || 0.016;
    last = now;
    acc.x += ((vel.x - prev.x) / Math.max(dt, 0.008) - acc.x) * 0.3;
    acc.y += ((vel.y - prev.y) / Math.max(dt, 0.008) - acc.y) * 0.3;
    prev = { ...vel };
    // pendurada pelo topo: puxou pra direita, a parte de baixo fica pra trás
    step(S.swing, clamp(vel.x * 0.016, 22), dt, clamp(acc.x * 0.009, 260));
    step(S.antenna, clamp(-S.swing.x * 1.1, 34), dt, clamp(acc.x * 0.045, 1400));
    step(S.stretch, clamp(-vel.y * 0.00006, 0.06), dt, clamp(-acc.y * 0.00005, 3));
    const sy = 1 + S.stretch.x;
    const sx = 1 - S.stretch.x * 0.7;
    all.setAttribute('transform', `rotate(${S.swing.x.toFixed(2)} 50 22) translate(50 53) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-50 -53)`);
    antenna.setAttribute('transform', `rotate(${S.antenna.x.toFixed(2)} 50 24)`);
    vel = { x: vel.x * 0.9, y: vel.y * 0.9 };
    requestAnimationFrame(frame);
  }

  return {
    el: svg,
    setVelocity(vx, vy) {
      vel = { x: vx, y: vy };
    },
    // olho fechado (arrastando) ou aberto
    setEyesShut(shut) {
      svg.classList.toggle('shut', !!shut);
    },
    start() {
      Object.values(S).forEach((sp) => {
        sp.x = 0;
        sp.v = 0;
      });
      S.antenna.v = 240; // pegou: a antena dá um pulinho
      vel = { x: 0, y: 0 };
      prev = { x: 0, y: 0 };
      acc = { x: 0, y: 0 };
      if (!running) {
        running = true;
        last = 0;
        requestAnimationFrame(frame);
      }
    },
    stop() {
      running = false;
      all.removeAttribute('transform');
      antenna.removeAttribute('transform');
    },
  };
}
