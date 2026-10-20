'use strict';
// Vigia de corpo inteiro: aparece quando você arrasta a barra.
// Cabeça de tela com o olho, antena, corpinho, bracinhos e perninhas. Tudo em SVG, animado por
// molas: ele fica "pendurado" no ponto onde você segura e o corpo, a cabeça, a antena, os braços e
// as pernas reagem ao movimento com atraso e balanço, como um bonequinho de verdade.

// eslint-disable-next-line no-unused-vars
function createBuddy(container) {
  container.innerHTML = `
<svg class="buddy" viewBox="0 0 120 170" aria-hidden="true">
  <defs>
    <linearGradient id="bd-shell" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#6a7282"/>
      <stop offset="0.5" stop-color="#3a404c"/>
      <stop offset="1" stop-color="#1c1f26"/>
    </linearGradient>
    <linearGradient id="bd-limb" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4c5361"/>
      <stop offset="1" stop-color="#2a2e37"/>
    </linearGradient>
    <radialGradient id="bd-hl" cx="0.3" cy="0.2" r="0.6">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="bd-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="2.4"/></filter>
  </defs>
  <g class="bd-all">
    <g class="bd-leg" data-side="l">
      <rect x="46" y="120" width="10" height="26" rx="5" fill="url(#bd-limb)"/>
      <rect x="42" y="141" width="17" height="9" rx="4.5" fill="#22262e"/>
    </g>
    <g class="bd-leg" data-side="r">
      <rect x="64" y="120" width="10" height="26" rx="5" fill="url(#bd-limb)"/>
      <rect x="61" y="141" width="17" height="9" rx="4.5" fill="#22262e"/>
    </g>
    <g class="bd-arm" data-side="l">
      <rect x="31" y="90" width="9" height="25" rx="4.5" fill="url(#bd-limb)"/>
      <circle cx="35.5" cy="117" r="5.5" fill="#2c3039"/>
    </g>
    <g class="bd-arm" data-side="r">
      <rect x="80" y="90" width="9" height="25" rx="4.5" fill="url(#bd-limb)"/>
      <circle cx="84.5" cy="117" r="5.5" fill="#2c3039"/>
    </g>
    <g class="bd-body">
      <rect x="38" y="84" width="44" height="42" rx="16" fill="url(#bd-shell)"/>
      <rect x="38" y="84" width="44" height="42" rx="16" fill="url(#bd-hl)"/>
      <circle class="bd-chest-glow" cx="60" cy="104" r="5" filter="url(#bd-glow)"/>
      <circle class="bd-chest" cx="60" cy="104" r="3.4"/>
    </g>
    <rect x="54" y="76" width="12" height="11" rx="3" fill="#2a2e37"/>
    <g class="bd-head">
      <g class="bd-antenna">
        <rect x="58" y="10" width="4" height="17" rx="2" fill="#5a6170"/>
        <circle class="bd-tip-glow" cx="60" cy="9" r="6" filter="url(#bd-glow)"/>
        <circle class="bd-tip" cx="60" cy="9" r="4.6"/>
      </g>
      <rect x="21" y="43" width="8" height="18" rx="4" fill="#2e333c"/>
      <rect x="91" y="43" width="8" height="18" rx="4" fill="#2e333c"/>
      <rect x="26" y="25" width="68" height="55" rx="17" fill="url(#bd-shell)"/>
      <rect x="26" y="25" width="68" height="55" rx="17" fill="url(#bd-hl)"/>
      <rect x="26.5" y="25.5" width="67" height="54" rx="16.5" fill="none" stroke="rgba(190,200,215,.35)"/>
      <rect x="34" y="36" width="52" height="32" rx="13" fill="#07080b"/>
      <g class="bd-eye">
        <rect class="bd-eye-glow" x="51" y="45" width="18" height="15" rx="6.5" filter="url(#bd-glow)"/>
        <rect class="bd-eye-core" x="52.5" y="46" width="15" height="13" rx="5.5"/>
        <path class="bd-eye-happy" d="M52.5 56 Q60 46 67.5 56" fill="none" stroke-width="3.6" stroke-linecap="round"/>
      </g>
    </g>
  </g>
</svg>`;
  const svg = container.querySelector('svg');
  const q = (s) => svg.querySelector(s);
  const parts = {
    all: q('.bd-all'),
    body: q('.bd-body'),
    head: q('.bd-head'),
    antenna: q('.bd-antenna'),
    eye: q('.bd-eye'),
    armL: q('.bd-arm[data-side="l"]'),
    armR: q('.bd-arm[data-side="r"]'),
    legL: q('.bd-leg[data-side="l"]'),
    legR: q('.bd-leg[data-side="r"]'),
  };

  // molas: valor, velocidade, rigidez, amortecimento
  const spring = (k, d) => ({ x: 0, v: 0, k, d });
  const S = {
    swing: spring(70, 9), // o corpo todo, pendurado no ponto de pega
    head: spring(160, 11),
    antenna: spring(240, 7),
    armL: spring(90, 6),
    armR: spring(90, 6),
    legL: spring(110, 8),
    legR: spring(110, 8),
    stretch: spring(260, 14),
  };
  let vel = { x: 0, y: 0 };
  let prev = { x: 0, y: 0 };
  let acc = { x: 0, y: 0 };
  let running = false;
  let last = 0;
  let t = 0;
  let nextBlink = 1.5;
  let blinkT = -1;

  function step(sp, target, dt, kick = 0) {
    sp.v += (-(sp.k * (sp.x - target)) - sp.d * sp.v + kick) * dt;
    sp.x += sp.v * dt;
  }
  const clamp = (v, a) => Math.max(-a, Math.min(a, v));

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000) || 0.016;
    last = now;
    t += dt;
    // aceleração (suavizada) vinda da velocidade do arrasto
    const ax = (vel.x - prev.x) / Math.max(dt, 0.008);
    const ay = (vel.y - prev.y) / Math.max(dt, 0.008);
    acc.x += (ax - acc.x) * 0.3;
    acc.y += (ay - acc.y) * 0.3;
    prev = { ...vel };
    const speed = Math.hypot(vel.x, vel.y);

    // corpo pendurado: arrastou pra direita, a parte de baixo fica pra trás (gira pro lado positivo)
    step(S.swing, clamp(vel.x * 0.022, 30), dt, clamp(acc.x * 0.012, 400));
    step(S.head, clamp(-S.swing.x * 0.35, 14), dt, clamp(acc.x * 0.01, 300));
    step(S.antenna, clamp(-S.swing.x * 0.9, 40), dt, clamp(acc.x * 0.05, 1600));
    // bracinhos: ficam pra trás e chacoalham; rápido, abrem pros lados
    const flail = speed > 500 ? Math.sin(t * 22) * Math.min(26, speed * 0.02) : 0;
    const open = Math.min(38, speed * 0.03);
    step(S.armL, clamp(vel.x * 0.03, 40) + open + flail + Math.sin(t * 2.1) * 3, dt, acc.x * 0.02);
    step(S.armR, clamp(vel.x * 0.03, 40) - open - flail + Math.sin(t * 2.1 + 1) * 3, dt, acc.x * 0.02);
    // perninhas: pra trás do movimento e "correndo" quando vai rápido; paradas, balançam
    const run = speed > 220 ? Math.sin(t * 18) * Math.min(34, speed * 0.035) : Math.sin(t * 2.6) * 4;
    step(S.legL, clamp(vel.x * 0.035, 45) + run, dt, acc.x * 0.025);
    step(S.legR, clamp(vel.x * 0.035, 45) - run, dt, acc.x * 0.025);
    // subindo rápido estica, descendo amassa
    step(S.stretch, clamp(-vel.y * 0.00008, 0.08), dt, clamp(-acc.y * 0.00006, 4));

    const sy = 1 + S.stretch.x;
    const sx = 1 - S.stretch.x * 0.6;
    parts.all.setAttribute('transform', `rotate(${S.swing.x.toFixed(2)} 60 14) translate(60 104) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-60 -104)`);
    parts.head.setAttribute('transform', `rotate(${S.head.x.toFixed(2)} 60 80)`);
    parts.antenna.setAttribute('transform', `rotate(${S.antenna.x.toFixed(2)} 60 26)`);
    parts.armL.setAttribute('transform', `rotate(${S.armL.x.toFixed(2)} 41 94)`);
    parts.armR.setAttribute('transform', `rotate(${S.armR.x.toFixed(2)} 79 94)`);
    parts.legL.setAttribute('transform', `rotate(${S.legL.x.toFixed(2)} 51 124)`);
    parts.legR.setAttribute('transform', `rotate(${S.legR.x.toFixed(2)} 69 124)`);

    // olho: olha pra onde está indo; muito rápido, fica feliz (^); de vez em quando pisca
    const ex = clamp(vel.x / 90, 11);
    const ey = clamp(vel.y / 160, 5);
    let sY = 1;
    if (t > nextBlink && blinkT < 0) blinkT = 0;
    if (blinkT >= 0) {
      blinkT += dt;
      sY = Math.max(0.08, Math.abs(1 - blinkT / 0.07));
      if (blinkT > 0.14) {
        blinkT = -1;
        nextBlink = t + 2 + Math.random() * 2.5;
      }
    }
    parts.eye.setAttribute('transform', `translate(${ex.toFixed(1)} ${ey.toFixed(1)}) translate(60 52) scale(1 ${sY.toFixed(2)}) translate(-60 -52)`);
    svg.classList.toggle('happy', speed > 1100);

    vel = { x: vel.x * 0.9, y: vel.y * 0.9 }; // sem posição nova, desacelera
    requestAnimationFrame(frame);
  }

  return {
    el: svg,
    setVelocity(vx, vy) {
      vel = { x: vx, y: vy };
    },
    start() {
      Object.values(S).forEach((sp) => {
        sp.x = 0;
        sp.v = 0;
      });
      vel = { x: 0, y: 0 };
      prev = { x: 0, y: 0 };
      acc = { x: 0, y: 0 };
      // pegou: dá um susto (pulinho da antena e dos braços)
      S.antenna.v = 260;
      S.armL.v = 220;
      S.armR.v = -220;
      if (!running) {
        running = true;
        last = 0;
        requestAnimationFrame(frame);
      }
    },
    stop() {
      running = false;
    },
  };
}
