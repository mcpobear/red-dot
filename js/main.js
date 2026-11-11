// UI layer: renders the radar map, HUD, action panel and crisis sheets from engine state.
import { NATIONS, POWERS, ACTIONS, CRISES, INTENTS, CATS, LEADERS, STYLES } from './data.js';
import * as E from './engine.js';
import { sfx, music } from './audio.js';
import { VERSION, BUILD_DATE, CHANGELOG } from './version.js';
import { UNITS, unitById, SUPPLIERS, POLITICS_NOTE, DOMAINS, powers, upkeep, detGain, edge, effMe, effFoe, foeFactor } from './forces.js';

const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];
const ALL = { ...NATIONS, ...POWERS };
const CX = 50, CY = 62;
const pos = (a, r) => ({ x: CX + Math.sin((a * Math.PI) / 180) * r, y: CY - Math.cos((a * Math.PI) / 180) * r });
const store = {
  get(k, d = null) { try { return localStorage.getItem('reddot.' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('reddot.' + k, v); } catch { /* private mode */ } },
};

let S = null;
const ui = { target: null, tab: 'act', cat: 'dip', fcat: 'ov', warSnap: null, seed: null, mode: 'random' };
let lastCommit = 0;

// ---------- audio + haptics (best effort) ----------
store.get('sfx') === '0' && music.setSfx(false);
store.get('music') === '0' && music.setMusic(false);
let hapticLabel = null;
function haptic(ms = 10) {
  if (!music.sfxOn) return;
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* ignore */ } return; }
  try { // iOS Safari: toggling a switch checkbox gives a light tap
    if (!hapticLabel) {
      hapticLabel = document.createElement('label');
      hapticLabel.setAttribute('aria-hidden', 'true');
      hapticLabel.style.cssText = 'position:fixed;left:-99px;top:-99px;opacity:0;pointer-events:none';
      const i = document.createElement('input');
      i.type = 'checkbox'; i.setAttribute('switch', '');
      hapticLabel.appendChild(i); document.body.appendChild(hapticLabel);
    }
    hapticLabel.click();
  } catch { /* ignore */ }
}

// ---------- map ----------
const nodes = {};

function buildMap() {
  const svg = $('#map');
  let h = `<defs><linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2ee6c9" stop-opacity="0"/><stop offset="1" stop-color="#2ee6c9" stop-opacity=".28"/></linearGradient></defs>`;
  h += [14, 28, 40, 52].map((r) => `<circle class="ring" cx="${CX}" cy="${CY}" r="${r}"/>`).join('');
  h += `<line class="cross" x1="${CX}" y1="0" x2="${CX}" y2="100"/><line class="cross" x1="0" y1="${CY}" x2="100" y2="${CY}"/>`;
  h += `<g><path class="sweep" d="M${CX} ${CY} L${CX + 56} ${CY} A56 56 0 0 0 ${CX + 56 * Math.cos(-0.5)} ${CY + 56 * Math.sin(-0.5)} Z"/><animateTransform attributeName="transform" type="rotate" from="0 ${CX} ${CY}" to="360 ${CX} ${CY}" dur="9s" repeatCount="indefinite"/></g>`;
  Object.entries(ALL).forEach(([code, n], i) => {
    const p = pos(n.a, n.r);
    h += `<path id="lane-${code}" class="lane" d="M${CX} ${CY} L${p.x.toFixed(2)} ${p.y.toFixed(2)}"/>`;
    h += `<circle class="ship" r=".75"><animateMotion dur="${5 + (i % 4) * 1.4}s" begin="${-i}s" repeatCount="indefinite"><mpath href="#lane-${code}"/></animateMotion></circle>`;
  });
  for (const [code, n] of Object.entries(ALL)) {
    const p = pos(n.a, n.r), isP = !!POWERS[code];
    h += `<g class="node ${isP ? 'power' : ''}" data-code="${code}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})">
      <circle class="hit" r="${n.sz + 3.5}" fill="transparent"/>
      <circle class="glow" r="${n.sz + 2.6}"/>
      <circle class="body" r="${n.sz}"/>
      <circle class="arc" r="${n.sz + 1.2}"/>
      <circle class="selring" r="${n.sz + 2.6}"/>
      <text class="code" y=".2">${code}</text>
      <text class="name" y="${n.sz + 3.6}">${n.name}</text>
      <text class="intent" y="${-n.sz - 2}"></text>
      <g class="badge" transform="translate(${n.sz * 0.78} ${-n.sz * 0.78})" style="display:none"><circle r="2.5"/><text></text></g>
    </g>`;
  }
  h += `<g class="sg" transform="translate(${CX} ${CY})"><circle class="halo" r="3.4"/><circle class="core" r="3.2"/><text y=".2" dominant-baseline="central">SG</text></g>`;
  svg.innerHTML = h;
  for (const code of Object.keys(ALL)) {
    const g = svg.querySelector(`.node[data-code="${code}"]`);
    nodes[code] = { g, arc: $('.arc', g), intent: $('.intent', g), badge: $('.badge', g), badgeText: $('.badge text', g), sz: ALL[code].sz };
  }
}

function updateMap() {
  for (const [code, el] of Object.entries(nodes)) {
    const o = S.nations[code] || S.powers[code];
    const len = 2 * Math.PI * (el.sz + 1.2);
    el.arc.setAttribute('stroke-dasharray', `${((len * o.rel) / 100).toFixed(2)} ${len.toFixed(2)}`);
    el.arc.setAttribute('class', 'arc ' + (o.rel >= 60 ? 'good' : o.rel >= 40 ? 'mid' : 'bad'));
    const isN = !!S.nations[code];
    $('.glow', el.g).style.opacity = isN ? String(Math.max(0, (o.heat - 30) / 140)) : '0';
    el.g.classList.toggle('hot', isN && o.heat >= 70);
    el.g.classList.toggle('sel', ui.target === code);
    if (isN) {
      if (o.scout > 0) { const it = INTENTS[o.intent]; el.intent.textContent = it.label.toUpperCase(); el.intent.setAttribute('class', 'intent ' + it.tone); }
      else { el.intent.textContent = '?'; el.intent.setAttribute('class', 'intent dim'); }
    }
    const cs = S.crises.filter((c) => c.nation === code);
    if (cs.length) {
      const m = cs.reduce((a, b) => (b.timer < a.timer ? b : a));
      el.badge.style.display = '';
      el.badge.setAttribute('class', 'badge ' + (CRISES[m.tpl].opp ? 'opp' : m.timer <= 1 ? 'urgent' : ''));
      el.badgeText.textContent = CRISES[m.tpl].opp ? '+' : String(m.timer);
    } else el.badge.style.display = 'none';
    const lane = $('#lane-' + code);
    lane.setAttribute('class', 'lane ' + (o.rel >= 60 ? '' : o.rel >= 40 ? 'mid' : 'bad'));
  }
}

// ---------- render ----------
function gaugeHTML(label, v) {
  const cls = v < 25 ? 'low' : v < 45 ? 'mid' : '';
  return `<div class="gauge ${cls}"><span>${label}</span><b>${Math.round(v)}</b><i style="--v:${v}%"></i></div>`;
}
function renderHud() {
  const g = S.g;
  $('#hud').innerHTML = `<div class="hud-top">
    <div class="brand"><i></i>RED DOT</div>
    <div class="date">${E.turnLabel(S)} · ${Math.min(S.turn, E.MAX_TURN)}/${E.MAX_TURN}${ui.mode === 'daily' ? ' · DAILY' : ''}</div>
    <div class="money">$${S.money}B <small>+${E.income(S)}</small></div>
    <button class="icon-btn" data-a="menu" aria-label="Menu">⋯</button></div>
    <div class="gauges">${gaugeHTML('STAB', g.stab)}${gaugeHTML('DETER', g.det)}${gaugeHTML('HUB', g.hub)}${gaugeHTML('RESIL', g.res)}</div>`;
}

const approx = (v, known) => (known ? String(Math.round(v)) : '~' + Math.round(v / 5) * 5);
function milRow(code) {
  const n = S.nations[code], k = n.scout > 0, me = powers(S);
  return `<div class="milrow"><span>MIL</span><span>LAND ${approx(n.mil.land, k)}</span><span>AIR ${approx(n.mil.air, k)}</span><span>SEA ${approx(n.mil.sea, k)}</span><em>YOU ${me.land}/${me.air}/${me.sea}</em></div>
    <div class="milrow qual"><span>QUALITY</span><span>YOU ×${edge(S).toFixed(2)}</span><span>THEM ×${foeFactor(code).toFixed(2)}</span><em>in a war, face value is scaled by this</em></div>`;
}

function leaderRow(code) {
  const L = LEADERS[code], st = STYLES[L.style];
  return `<div class="leader"><b>${L.name}</b><span class="tag">${st.label.toUpperCase()}</span><div class="t-sub" style="margin:2px 0 0">${L.quip} ${st.note}</div></div>`;
}

function targetHTML() {
  const t = ui.target;
  if (!t) return `<div class="t-sub" style="margin:0">Tap a country on the radar to target it. Rings show trust; red glow shows tension. Badges are crisis timers.</div>`;
  const isN = !!S.nations[t], o = isN ? S.nations[t] : S.powers[t];
  const it = isN ? INTENTS[o.intent] : null;
  const tag = isN ? (o.scout > 0 ? `<span class="tag ${it.tone}">${it.label.toUpperCase()}</span>` : `<span class="tag">INTENT ?</span>`) : `<span class="tag">GREAT POWER</span>`;
  const cs = S.crises.filter((c) => c.nation === t);
  return `<div class="t-head"><h3>${ALL[t].name}</h3>${tag}</div>
    <div class="t-sub">${isN ? NATIONS[t].lev : t === 'US' ? 'Security partner, rival of Beijing' : 'Biggest trading partner, rival of Washington'}${isN && o.scout > 0 ? ` · scouted ${o.scout}t` : ''}</div>
    <div class="bars"><div class="bar"><small><span>TRUST</span><span>${Math.round(o.rel)}</span></small><i style="--v:${o.rel}%"></i></div>
    ${isN ? `<div class="bar heat"><small><span>TENSION</span><span>${Math.round(o.heat)}</span></small><i style="--v:${o.heat}%"></i></div>` : ''}</div>
    ${isN ? leaderRow(t) : ''}
    ${isN ? milRow(t) : ''}
    ${cs.map((c) => `<button class="t-crisis" data-a="crisis" data-uid="${c.uid}">${CRISES[c.tpl].icon} ${CRISES[c.tpl].title(ALL[c.nation].name)} · ${c.timer} turn${c.timer > 1 ? 's' : ''} left ›</button>`).join('')}`;
}

function renderTabs() {
  const n = S.crises.filter((c) => !CRISES[c.tpl].opp).length;
  $('#tabs').innerHTML = `<button class="tab ${ui.tab === 'act' ? 'on' : ''}" data-a="tab" data-tab="act" role="tab">ACTIONS</button>
    <button class="tab ${ui.tab === 'cri' ? 'on' : ''}" data-a="tab" data-tab="cri" role="tab">CRISES${S.crises.length ? `<em>${S.crises.length}</em>` : ''}</button>
    <button class="tab ${ui.tab === 'frc' ? 'on' : ''}" data-a="tab" data-tab="frc" role="tab">FORCES${S.orders.length ? `<em class="blue">${S.orders.length}</em>` : ''}</button>`;
  return n;
}

function actionsHTML() {
  const cats = Object.entries(CATS).map(([k, v]) => `<button class="cat ${ui.cat === k ? 'on' : ''}" data-a="cat" data-cat="${k}">${v.toUpperCase()}</button>`).join('');
  const list = ACTIONS.filter((a) => a.cat === ui.cat).map((a) => {
    const st = E.actionState(S, a, ui.target);
    const needsTarget = a.tgt && st.reason.startsWith('Select');
    const label = a.tgt && ui.target && st.ok ? `${a.name} → ${ui.target}` : a.name;
    return `<button class="act" data-a="do" data-id="${a.id}" ${st.ok ? '' : 'disabled'}>
      <b>${label}</b><div class="chips"><em>${a.ap} AP</em>${a.cost ? `<em class="money">$${a.cost}B</em>` : ''}</div>
      <span>${st.ok || needsTarget ? a.desc : `<i class="why">${st.reason}</i> · ${a.desc}`}</span>
      ${needsTarget ? `<span class="why">${st.reason}</span>` : ''}</button>`;
  }).join('');
  return `<div class="cats">${cats}</div>${list}`;
}

function crisesHTML() {
  if (!S.crises.length) return `<div class="empty">All quiet for now.<br>Spend your actions wisely, then end the turn.</div>`;
  return [...S.crises].sort((a, b) => a.timer - b.timer).map((c) => {
    const t = CRISES[c.tpl];
    const cls = t.opp ? 'good' : c.timer <= 1 ? 'urgent' : '';
    return `<button class="card-c ${cls}" data-a="crisis" data-uid="${c.uid}">
      <b>${t.icon} ${t.title(ALL[c.nation].name)}</b><div class="chips"><em class="tm">${t.call ? 'CALL ' : t.opp ? 'OFFER ' : ''}${c.timer}T</em></div>
      <span>${c.nation} · ${t.opp ? 'Opportunity' : 'Resolve before the timer ends'}</span></button>`;
  }).join('');
}

function forcesHTML() {
  const cats = [['ov', 'OVERVIEW'], ['land', 'LAND'], ['air', 'AIR'], ['sea', 'SEA']]
    .map(([k, v]) => `<button class="cat ${ui.fcat === k ? 'on' : ''}" data-a="fcat" data-cat="${k}">${v}</button>`).join('');
  return `<div class="cats">${cats}</div>${ui.fcat === 'ov' ? overviewHTML() : shopHTML(ui.fcat)}`;
}

function overviewHTML() {
  const me = powers(S), net = upkeep(S) - S.baseUpkeep;
  const bar = (l, v) => `<div class="bar"><small><span>${l}</span><span>${v}</span></small><i style="--v:${Math.min(100, v)}%"></i></div>`;
  const rows = Object.entries(S.nations).sort((a, b) => (b[1].mil.land + b[1].mil.air + b[1].mil.sea) - (a[1].mil.land + a[1].mil.air + a[1].mil.sea)).map(([c, n]) => {
    const k = n.scout > 0, cell = (d) => `<td class="${n.mil[d] > me[d] ? 'over' : ''}">${approx(n.mil[d], k)}</td>`;
    return `<tr data-a="pick" data-code="${c}"><td><b>${c}</b> ${NATIONS[c].name}</td>${cell('land')}${cell('air')}${cell('sea')}</tr>`;
  }).join('');
  const inbound = S.orders.map((o) => `<li class="income">${unitById[o.unit].name} · ${o.turns} turn${o.turns > 1 ? 's' : ''}</li>`).join('');
  const owned = Object.entries(S.forces).filter(([, n]) => n > 0).sort((a, b) => unitById[a[0]].dom.localeCompare(unitById[b[0]].dom))
    .map(([id, n]) => `<li><b>${n}×</b> ${unitById[id].name} <small>${unitById[id].sup}</small></li>`).join('');
  return `<div class="bars3">${bar('LAND', me.land)}${bar('AIR', me.air)}${bar('SEA', me.sea)}</div>
    <p class="fine">Deterrence <b>${S.g.det}</b> = forces − arms race (${Math.round(S.arms)}) ${S.posture ? `${S.posture > 0 ? '+' : '−'} posture ${Math.abs(S.posture)}` : ''}<br>
    Upkeep <b>${net >= 0 ? '+' : '−'}$${Math.abs(net).toFixed(1)}B/turn</b> beyond your starting forces · Orders <b>${S.ordersThisTurn}/${E.ORDERS_PER_TURN}</b> this turn</p>
    ${inbound ? `<h4>In transit</h4><ul class="list">${inbound}</ul>` : ''}
    <h4>Regional balance</h4>
    <table class="mil"><tr><th></th><th>LAND</th><th>AIR</th><th>SEA</th></tr><tr class="me"><td><b>SG</b> You</td><td>${me.land}</td><td>${me.air}</td><td>${me.sea}</td></tr>${rows}</table>
    <p class="fine">Red = they out-muscle you <i>on paper</i>. In a war their numbers shrink (older kit, forces spread over big territories) while yours get a quality edge of <b>×${edge(S).toFixed(2)}</b>. Buying advanced (tier 2-3) kit widens it. Scout a nation for exact figures.</p>
    <h4>Your order of battle</h4><ul class="oob">${owned}</ul>`;
}

function shopHTML(dom) {
  const list = UNITS.filter((u) => u.dom === dom).sort((a, b) => a.tier - b.tier || a.cost - b.cost);
  return `<p class="fine">${DOMAINS[dom]} power ${powers(S)[dom]} · ${S.ordersThisTurn}/${E.ORDERS_PER_TURN} orders used · $${S.money}B</p>` + list.map((u) => {
    const st = E.unitState(S, u), own = S.forces[u.id] || 0, inb = S.orders.filter((o) => o.unit === u.id).length;
    return `<button class="act unit ${st.ok ? '' : 'locked'}" data-a="unit" data-id="${u.id}">
      <b>${u.name}</b><div class="chips"><em class="sup">${u.sup}</em><em class="money">$${u.cost}B</em></div>
      <span>+${u.pw} ${DOMAINS[dom]} · T${u.tier}${own ? ` · own ${own}` : ''}${inb ? ` · +${inb} inbound` : ''}${st.ok ? '' : ` · <i class="why">${st.reason}</i>`}</span></button>`;
  }).join('');
}

function orderSheet(id) {
  const u = unitById[id], st = E.unitState(S, u), own = S.forces[id] || 0;
  const ico = { land: '🪖', air: '✈️', sea: '⚓' }[u.dom];
  sheet(`<div class="s-head"><span class="ico">${ico}</span><div><h2>${u.name}</h2><div class="meta">${SUPPLIERS[u.sup].name.toUpperCase()} · TIER ${u.tier} · OWN ${own}</div></div></div>
    <div class="chiprow"><span class="chip g">+${u.pw} ${DOMAINS[u.dom]} power</span><span class="chip g">Deterrence ≈ +${detGain(u)}</span><span class="chip b">$${u.cost}B</span><span class="chip b">Upkeep $${u.up}B/turn</span><span class="chip">Delivery ${u.delay} turns</span></div>
    ${POLITICS_NOTE[u.sup] ? `<p class="s-text">Supplier politics: ${POLITICS_NOTE[u.sup]}.</p>` : ''}
    ${st.ok ? '' : `<p class="s-text why-box">${st.reason}</p>`}
    <div class="row2"><button class="btn alt" data-a="close">Cancel</button><button class="btn" data-a="order" data-id="${id}" ${st.ok ? '' : 'disabled'}>Order · $${u.cost}B</button></div>`);
}

function renderPanel() {
  renderTabs();
  $('#target').innerHTML = targetHTML();
  const body = $('#body'), top = body.scrollTop;
  body.innerHTML = ui.tab === 'act' ? actionsHTML() : ui.tab === 'cri' ? crisesHTML() : forcesHTML();
  body.scrollTop = top;
}

function renderDock() {
  const pips = Array.from({ length: E.AP_PER_TURN }, (_, i) => `<span class="pip ${i < S.ap ? 'on' : ''}"></span>`).join('');
  $('#dock').innerHTML = `<div class="ap"><small>AP</small>${pips}</div><button id="endturn" data-a="endturn" class="${S.ap === 0 ? 'pulse' : ''}">End Turn →</button>`;
  $('#hint').textContent = ui.target ? `TARGET · ${ALL[ui.target].name.toUpperCase()}` : 'TAP A NODE TO TARGET';
}

function moodNow() {
  if (!S || !ui.live) return 'calm';
  if (S.war) return 'war';
  const maxHeat = Math.max(...Object.values(S.nations).map((n) => n.heat));
  const urgent = S.crises.some((c) => !CRISES[c.tpl].opp && c.timer <= 1);
  if (urgent || maxHeat >= 70 || S.g.stab < 30 || S.g.res < 22 || S.g.det < 22) return 'tense';
  return 'calm';
}
function render() { renderHud(); updateMap(); renderPanel(); renderDock(); saveGame(); music.setMood(moodNow()); }

// ---------- autosave ----------
function saveGame() {
  if (!ui.live || !S) return;
  if (S.over) { store.set('save', ''); return; }
  try { store.set('save', E.serialize(S)); } catch { /* storage full or blocked */ }
}
function savedInfo() {
  const raw = store.get('save');
  if (!raw) return null;
  try { const s = E.restore(raw); return s.over ? null : s; } catch { return null; }
}

function sparkHTML(hist) {
  if (!hist || hist.length < 2) return '';
  const W = 300, H = 70, n = hist.length;
  const x = (i) => (i / (n - 1)) * (W - 4) + 2, y = (v) => H - 3 - (v / 100) * (H - 6);
  const line = (k, c) => `<polyline fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" points="${hist.map((h, i) => `${x(i).toFixed(1)},${y(h[k]).toFixed(1)}`).join(' ')}"/>`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gauges over your term">${line('stab', '#2ee6c9')}${line('det', '#ff4d5e')}${line('hub', '#5aa9ff')}${line('res', '#ffb547')}</svg>
    <div class="legend"><i style="background:#2ee6c9"></i>Stab <i style="background:#ff4d5e"></i>Deter <i style="background:#5aa9ff"></i>Hub <i style="background:#ffb547"></i>Resil</div>`;
}
function debriefHTML() {
  const d = E.debrief(S);
  if (!d.moments.length && d.hist.length < 2) return '';
  return `<div class="meta" style="margin:10px 0 4px">YOUR TERM IN MOMENTS</div>
    ${sparkHTML(d.hist)}
    <ul class="list moments">${d.moments.map((m) => `<li class="${m.tone === 'good' ? 'new' : 'erupt'}"><b>${m.when}</b> ${m.text}</li>`).join('')}</ul>`;
}

// ---------- feedback helpers ----------
function chipsHTML(list) {
  return list.map((c) => `<span class="chip ${c.good ? 'g' : 'b'}">${c.label} ${c.d > 0 ? '+' : ''}${c.d}</span>`).join('');
}
function toast(list) {
  const el = $('#toast');
  el.innerHTML = chipsHTML(list.slice(0, 7));
  el.style.display = 'none'; void el.offsetHeight; el.style.display = '';
}
function shake(kind) {
  const el = $('#app');
  el.classList.remove('shake', 'flash'); void el.offsetWidth;
  el.classList.add(kind === 'bad' ? 'shake' : 'flash');
  setTimeout(() => el.classList.remove('shake', 'flash'), 600);
}

// ---------- sheets ----------
function sheet(html, { dismiss = true } = {}) {
  const el = $('#sheet');
  el.className = 'open';
  el.innerHTML = `<div class="scrim" ${dismiss ? 'data-a="close"' : ''}></div><div class="card" role="dialog" aria-modal="true">${html}</div>`;
}
function closeSheet() { const el = $('#sheet'); el.className = ''; el.innerHTML = ''; }

function titleSheet() {
  const best = store.get('best');
  sheet(`<div class="title-card"><div class="logo">RED DOT</div>
    <p class="tag-line">Twenty quarters. Eight neighbours. Two giants.<br>Hold the line, keep the lights on, don't blink.</p>
    ${(() => { const sv = savedInfo(); return sv ? `<button class="btn" data-a="resume">Continue · ${E.turnLabel(sv)}</button>` : ''; })()}
    <button class="btn ${savedInfo() ? 'alt' : ''}" data-a="start">New Term</button>
    <div class="row2" style="margin-top:8px"><button class="btn alt" data-a="daily">Daily Seed</button><button class="btn alt" data-a="how">How to Play</button></div>
    ${best ? `<div class="best">BEST SCORE ${best}</div>` : ''}
    <div class="ver">v${VERSION} · ${BUILD_DATE}</div></div>`, { dismiss: false });
}

function howSheet(back) {
  sheet(`<div class="s-head"><span class="ico">🧭</span><div><h2>How to play</h2><div class="meta">ONE TERM ≈ 10 MINUTES</div></div></div>
    <ol class="how">
      <li><b>Survive 20 quarters.</b> Keep Stability, Deterrence, Hub and Resilience above zero, and do not let a hostile neighbour find you defenceless.</li>
      <li><b>4 action points a turn.</b> Tap a node on the radar to target it, then pick an action. Everything costs AP and usually money.</li>
      <li><b>Crises tick down.</b> The badge on the map is the timer. Ignore one and it erupts. Open the Crises tab to respond.</li>
      <li><b>Quality beats quantity.</b> Neighbours may look bigger on paper, but your tech edge and their spread-out forces count in a war, and make hawks think twice.</li>
      <li><b>Gambles need nerve.</b> Risky options show odds and must be held to commit. Scout a nation to reveal its hidden intent and exact odds.</li>
      <li><b>Build your forces.</b> The Forces tab lists real-world equipment from many suppliers. Buy from the same supplier to unlock better kit, and mind the politics. Deterrence comes from your forces and decays as the region arms.</li>
      <li><b>You can fight.</b> Cut water, failed ultimatums and open attacks lead to war. Win the air, hold the Strait, then press the land, or seek a ceasefire.</li>
      <li><b>Balance the giants.</b> Leaning too hard on Washington or Beijing wins you gifts and costs you stability.</li>
    </ol><button class="btn" data-a="${back === 'title' ? 'title' : back === 'brief' ? 'brief' : 'close'}">${back === 'title' ? 'Back' : back === 'brief' ? 'Got it — show briefing' : 'Got it'}</button>`);
}

function menuSheet() {
  sheet(`<div class="s-head"><span class="ico">⚙️</span><div><h2>Menu</h2></div></div>
    <button class="btn alt" data-a="how">How to play</button>
    <div class="row2" style="margin-top:8px"><button class="btn alt" data-a="mute">Sounds &amp; haptics: ${music.sfxOn ? 'ON' : 'OFF'}</button><button class="btn alt" data-a="musicbtn">Music: ${music.musicOn ? 'ON' : 'OFF'}</button></div>
    <button class="btn alt" data-a="restart" style="margin-top:8px">Abandon term &amp; restart</button>
    <button class="btn" data-a="close" style="margin-top:8px">Resume</button>
    <div class="ver">Red Dot v${VERSION} · ${BUILD_DATE}</div>
    <ul class="list changelog">${CHANGELOG.slice(0, 3).map(([v, n]) => `<li><b>v${v}</b> ${n}</li>`).join('')}</ul>`);
}

function reportSheet(title, events, created, chips, icon = '📋') {
  const lines = [
    ...events.map((e) => `<li class="${e.kind}">${e.kind === 'erupt' ? '💥 ' : ''}${e.text}</li>`),
    ...created.map((c) => `<li class="new">${CRISES[c.tpl].icon} <b>${CRISES[c.tpl].title(ALL[c.nation].name)}</b> · ${c.nation} · ${c.timer} turn${c.timer > 1 ? 's' : ''}</li>`),
  ].join('');
  sheet(`<div class="s-head"><span class="ico">${icon}</span><div><h2>${title}</h2><div class="meta">${S.crises.length} ACTIVE CRISES</div></div></div>
    <ul class="list">${lines}</ul><div class="chiprow">${chipsHTML(chips)}</div><button class="btn" data-a="after">Continue</button>`);
}

function crisisSheet(uid) {
  const c = S.crises.find((x) => x.uid === uid);
  if (!c) { closeSheet(); return; }
  const t = CRISES[c.tpl], nm = ALL[c.nation].name;
  const opts = E.crisisOptions(S, c);
  const html = opts.map((o) => {
    const b = o.brink;
    return `<button class="opt ${b ? 'brink' : ''}" data-a="opt" data-uid="${uid}" data-i="${o.i}" ${b ? 'data-brink="1"' : ''} ${o.ok ? '' : 'disabled'}>
      <b>${o.label}</b><div class="chips"><em>${o.ap ? o.ap + ' AP' : 'FREE'}</em>${o.cost ? `<em class="money">$${o.cost}B</em>` : ''}</div>
      <span>${o.sub}</span>
      ${b ? `<div class="risk"><i class="${b.known ? '' : 'fuzzy'}" style="--p:${b.p}%"></i><small><span>${b.known ? b.p + '% to succeed' : `≈${b.lo}–${b.hi}% · scout for exact`}</span><span>HOLD TO COMMIT</span></small></div><div class="hold"></div>` : ''}
      ${o.ok ? '' : `<span class="why">${o.reason}</span>`}</button>`;
  }).join('');
  sheet(`<div class="s-head"><span class="ico">${t.icon}</span><div><h2>${t.title(nm)}</h2><div class="meta">${c.nation} · ${t.call ? 'NIGHT CALL' : t.opp ? 'OFFER' : 'CRISIS'} · ${c.timer} TURN${c.timer > 1 ? 'S' : ''} LEFT · ${S.ap} AP</div></div></div>
    <p class="s-text">${t.text(nm, c)}</p>${html}<button class="btn alt" data-a="close">Decide later</button>`);
}

function commitOpt(uid, i) {
  lastCommit = performance.now();
  const before = E.snapshot(S);
  const r = E.resolveCrisis(S, uid, i);
  if (!r.ok) { sfx.bad(); return; }
  if (r.kind === 'win' || r.kind === 'lose') sfx.commit();
  const chips = E.diff(before, E.snapshot(S));
  const head = r.kind === 'win' ? 'SUCCESS' : r.kind === 'lose' ? 'BACKFIRE' : 'DONE';
  if (r.kind === 'lose') { sfx.bad(); haptic([40, 40, 40]); shake('bad'); } else { sfx.ok(); haptic(15); }
  render();
  if (S.over) { showOver(); return; }
  sheet(`<div class="res-head ${r.kind}">${head}</div><p class="s-text"><b>${r.label}.</b> ${r.text || ''}</p>
    <div class="chiprow">${chipsHTML(chips) || '<span class="chip">No change</span>'}</div>
    <button class="btn" data-a="after">Continue</button>`);
}

// ---------- turn flow ----------
function attemptEnd() {
  const risky = S.crises.filter((c) => c.timer <= 1 && !CRISES[c.tpl].opp);
  if (risky.length) {
    sheet(`<div class="s-head"><span class="ico">⚠️</span><div><h2>Crises about to erupt</h2><div class="meta">LAST CHANCE</div></div></div>
      <ul class="list">${risky.map((c) => `<li class="erupt">${CRISES[c.tpl].icon} ${CRISES[c.tpl].title(ALL[c.nation].name)}</li>`).join('')}</ul>
      <div class="row2"><button class="btn alt" data-a="close">Go back</button><button class="btn red" data-a="confirmEnd">End turn</button></div>`);
  } else if (S.ap > 0) {
    sheet(`<div class="s-head"><span class="ico">⏭️</span><div><h2>End turn?</h2><div class="meta">${S.ap} AP UNUSED</div></div></div>
      <div class="row2"><button class="btn alt" data-a="close">Keep playing</button><button class="btn" data-a="confirmEnd">End turn</button></div>`);
  } else doEnd();
}

function doEnd() {
  const before = E.snapshot(S);
  const r = E.endTurn(S);
  const chips = E.diff(before, E.snapshot(S));
  sfx.turn();
  const bad = r.events.some((e) => e.kind === 'erupt');
  if (bad) { sfx.bad(); haptic([30, 30, 30]); shake('bad'); }
  ui.tab = S.crises.length ? 'cri' : 'act';
  render();
  if (S.over) { showOver(); return; }
  if (r.created.length) setTimeout(() => { sfx.alert(); haptic(20); }, 250);
  reportSheet(E.turnLabel(S), r.events, r.created, chips);
}

function showOver() {
  const o = S.over, sc = o.score, win = o.result === 'win';
  const best = Number(store.get('best', 0));
  let newBest = false;
  if (win && sc.total > best) { store.set('best', String(sc.total)); newBest = true; }
  const rows = sc.parts.filter(([, v]) => v !== 0).map(([k, v]) => `<tr><td>${k}</td><td>${v > 0 ? '+' : ''}${v}</td></tr>`).join('');
  win ? sfx.ok() : sfx.bad();
  sheet(`<div class="res-head ${win ? 'win' : 'lose'}">${win ? 'TERM COMPLETE' : 'TERM ENDED'}</div>
    <h2 style="margin-bottom:4px">${o.title}</h2><p class="s-text">${o.text}</p>
    <div class="meta" style="margin-bottom:4px">RANK · ${sc.rank.toUpperCase()}${newBest ? ' · NEW BEST!' : ''}</div>
    ${debriefHTML()}
    <table class="score">${rows}<tr class="tot"><td>Total</td><td>${sc.total}</td></tr></table>
    <div class="row2"><button class="btn alt" data-a="share">Share</button><button class="btn" data-a="restart">Play again</button></div>`, { dismiss: false });
}

function shareResult() {
  const o = S.over, sc = o.score;
  const text = `RED DOT ${ui.mode === 'daily' ? '(Daily ' + new Date().toISOString().slice(0, 10) + ') ' : ''}— ${o.result === 'win' ? 'Survived 20 quarters' : 'Fell in ' + E.turnLabel(S)} · ${sc.total} pts · ${sc.rank}`;
  const url = location.href.split('#')[0];
  if (navigator.share) navigator.share({ title: 'Red Dot', text, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(`${text} ${url}`).then(() => toast([{ label: 'Copied to clipboard', d: 0, good: true }])).catch(() => {});
}

function start(mode) {
  ui.mode = mode;
  ui.seed = mode === 'daily' ? E.hashSeed(new Date().toISOString().slice(0, 10)) : undefined;
  S = E.newGame(ui.seed);
  ui.live = true;
  ui.target = null; ui.tab = 'cri'; ui.cat = 'dip';
  render();
  ui.brief = () => reportSheet(`${E.turnLabel(S)} · Briefing`, [{ kind: 'income', text: 'You are Singapore\'s Prime Minister. Survive five years.' }], S.created || [], [], '🔴');
  if (!store.get('seen')) { store.set('seen', '1'); howSheet('brief'); } else ui.brief();
}

// ---------- input ----------
const handlers = {
  close: () => closeSheet(),
  title: () => titleSheet(),
  brief: () => ui.brief && ui.brief(),
  resume: () => {
    const sv = savedInfo(); if (!sv) return;
    S = sv; ui.live = true; ui.target = null; ui.tab = S.crises.length ? 'cri' : 'act'; ui.cat = 'dip'; ui.warSnap = null;
    closeSheet(); render();
    if (!warCheck()) toast([{ label: 'Welcome back, Prime Minister', d: 0, good: true }]);
  },
  start: () => start('random'),
  daily: () => start('daily'),
  how: (el) => howSheet(S && !S.over && $('.title-card') ? 'title' : undefined),
  menu: () => menuSheet(),
  mute: () => { music.setSfx(!music.sfxOn); store.set('sfx', music.sfxOn ? '1' : '0'); sfx.tick(); menuSheet(); },
  musicbtn: () => { music.setMusic(!music.musicOn); store.set('music', music.musicOn ? '1' : '0'); menuSheet(); },
  restart: () => { closeSheet(); titleSheet(); },
  share: () => shareResult(),
  tab: (el) => { ui.tab = el.dataset.tab; renderPanel(); },
  fcat: (el) => { ui.fcat = el.dataset.cat; renderPanel(); },
  pick: (el) => { ui.target = el.dataset.code; render(); },
  unit: (el) => { orderSheet(el.dataset.id); },
  order: (el) => {
    const before = E.snapshot(S);
    const r = E.buyUnit(S, el.dataset.id);
    if (!r.ok) { sfx.bad(); return; }
    sfx.kaching(); haptic([12, 40, 18]); closeSheet();
    toast([{ label: 'Ordered ' + unitById[el.dataset.id].name, d: 0, good: true }, ...E.diff(before, E.snapshot(S))].slice(0, 6));
    render();
  },
  after: () => { closeSheet(); warCheck(); },
  wop: (el) => warOp(el.dataset.id),
  warcont: () => { closeSheet(); if (S.over) showOver(); else warCheck(); },
  warGo: (el) => { closeSheet(); handlers.do({ dataset: { id: 'war', force: '1' } }); },
  cat: (el) => { ui.cat = el.dataset.cat; renderPanel(); },
  do: (el) => {
    const id = el.dataset.id;
    if (id === 'war' && !el.dataset.force) { confirmWar(); return; }
    const before = E.snapshot(S);
    const r = E.doAction(S, id, ui.target);
    if (!r.ok) { sfx.bad(); return; }
    haptic(10);
    toast([...(r.note ? [{ label: r.note, d: 0, good: true }] : []), ...E.diff(before, E.snapshot(S))].slice(0, 6));
    render();
    if (S.over) showOver(); else warCheck();
  },
  crisis: (el) => { crisisSheet(Number(el.dataset.uid)); },
  opt: (el, e) => {
    if (el.dataset.brink && e.detail !== 0) return; // pointer users must hold; keyboard commits directly
    commitOpt(Number(el.dataset.uid), Number(el.dataset.i));
  },
  endturn: () => attemptEnd(),
  confirmEnd: () => doEnd(),
};

// browsers only allow audio after a gesture, so the first touch starts the score
// iOS only accepts touchend/click as a gesture, so keep trying until the audio engine is actually running
['touchend', 'pointerup', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (!music.running) music.unlock(); }, { capture: true }));
document.addEventListener('visibilitychange', () => { document.hidden ? music.pause() : music.resume(); });

document.addEventListener('click', (e) => {
  if (performance.now() - lastCommit < 450) return;
  const el = e.target.closest('[data-a]');
  if (el && !el.disabled && handlers[el.dataset.a]) { if (el.dataset.a !== 'mute') sfx.tick(); handlers[el.dataset.a](el, e); return; }
  const node = e.target.closest('.node');
  if (node && S) {
    const code = node.dataset.code;
    ui.target = ui.target === code ? null : code;
    ui.tab = 'act'; sfx.select(); haptic(6);
    render();
  }
});

let hold = null;
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.opt.brink');
  if (!b || b.disabled) return;
  b.classList.add('holding'); haptic(8);
  hold = { b, t: setTimeout(() => { const el = hold.b; hold = null; el.classList.remove('holding'); commitOpt(Number(el.dataset.uid), Number(el.dataset.i)); }, 650) };
});
const cancelHold = () => { if (hold) { clearTimeout(hold.t); hold.b.classList.remove('holding'); hold = null; } };
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => document.addEventListener(ev, cancelHold, true));
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- war ----------
const WAR_REASON = {
  supply: 'Your supply lines are cut. Restore them or fall.',
  attack: 'Tensions boiled over into open attack.',
  ultimatum: 'The ultimatum has run out. Force decides this now.',
  standoff: 'Shots have been fired at sea.',
  strike: 'You chose war.',
};

function warCheck() {
  if (S.over) return false;
  if (S.war) { if (!ui.warSnap) ui.warSnap = E.snapshot(S); render(); warSheet(); return true; }
  ui.warSnap = null;
  return false;
}

function confirmWar() {
  const t = ui.target;
  if (!t || !S.nations[t]) { sfx.bad(); return; }
  const n = S.nations[t], me = effMe(S), fe = effFoe(n, t), k = n.scout > 0;
  const row = (l, a, b) => `<tr><td>${l}</td><td>${Math.round(a)}</td><td class="${b > a ? 'over' : ''}">${approx(b, k)}</td></tr>`;
  sheet(`<div class="s-head"><span class="ico">⚔️</span><div><h2>War with ${NATIONS[t].name}?</h2><div class="meta">THIS CANNOT BE UNDONE</div></div></div>
    <table class="mil"><tr><th>EFFECTIVE</th><th>YOU</th><th>THEM</th></tr>${row('Land', me.land, fe.land)}${row('Air', me.air, fe.air)}${row('Sea', me.sea, fe.sea)}</table>
    <div class="meta" style="margin:-2px 0 8px">Your quality ×${edge(S).toFixed(2)} · their kit and spread-out territory ×${foeFactor(t).toFixed(2)}</div>
    <p class="s-text">Wars drain Stability and Hub every round and cost you equipment. Win and the neighbour is humbled, but the rest of the region will not forget who started it.${k ? '' : ' Scout them for exact figures.'}</p>
    <div class="row2"><button class="btn alt" data-a="close">Stand down</button><button class="btn red" data-a="warGo">Declare war</button></div>`);
}

function warSheet(extra) {
  const w = S.war, f = { mil: effFoe(S.nations[w.foe], w.foe) }, me = effMe(S), opts = E.warOptions(S);
  const vs = (l, a, b) => `<div class="vs"><span>${l}</span><div class="vsbars"><i class="me" style="--v:${Math.min(100, a)}%"></i><i class="foe" style="--v:${Math.min(100, b)}%"></i></div><b>${Math.round(a)}<small> v </small>${Math.round(b)}</b></div>`;
  const pos = (w.score + 100) / 2;
  sheet(`<div class="s-head"><span class="ico">⚔️</span><div><h2>War: ${NATIONS[w.foe].name}</h2><div class="meta">ROUND ${Math.min(w.round, E.MAX_WAR_ROUNDS)}/${E.MAX_WAR_ROUNDS} · $${S.money}B · STAB ${S.g.stab}</div></div></div>
    ${w.round === 1 ? `<p class="s-text">${WAR_REASON[w.reason] || ''}</p>` : ''}
    <div class="wmeter" aria-label="War score"><span class="lo">DEFEAT</span><div><u></u><i style="left:${pos}%"></i></div><span class="hi">VICTORY</span></div>
    <div class="vsbox">${vs('LAND', me.land, f.mil.land)}${vs('AIR', me.air, f.mil.air)}${vs('SEA', me.sea, f.mil.sea)}</div>
    <div class="chiprow"><span class="chip ${w.airSup ? 'g' : ''}">Air superiority L${w.airSup}</span><span class="chip ${w.seaCtl ? 'g' : ''}">Sea control L${w.seaCtl}</span></div>
    ${w.log.length ? `<ul class="list">${w.log.map((l) => `<li class="${/Lost|strikes your|run dry|goes badly|stalls|bogs|refuses|intercepted/.test(l) ? 'erupt' : 'income'}">${l}</li>`).join('')}</ul>` : ''}
    ${opts.map((o) => `<button class="opt ${o.id === 'ceasefire' ? 'peace' : ''}" data-a="wop" data-id="${o.id}" ${o.ok ? '' : 'disabled'}>
      <b>${o.name}</b><div class="chips"><em class="${o.p >= 65 ? 'g' : o.p < 45 ? 'r' : ''}">${o.label} · ${o.p}%</em>${o.cost ? `<em class="money">$${o.cost}B</em>` : ''}</div>
      <span>${o.desc}</span>${o.ok ? '' : `<span class="why">${o.reason}</span>`}</button>`).join('')}`, { dismiss: false });
}

function warOp(id) {
  const w = S.war, before = E.snapshot(S);
  const r = E.warOp(S, id);
  if (!r.ok) { sfx.bad(); return; }
  sfx.boom();
  const lostBad = r.lines.some((l) => /Lost|strikes your/.test(l));
  lostBad ? (sfx.bad(), haptic([30, 30]), shake('bad')) : (sfx.ok(), haptic(15));
  render();
  if (!r.ended) { warSheet(); return; }
  const snap = ui.warSnap || before; ui.warSnap = null;
  const chips = E.diff(snap, E.snapshot(S));
  const e = r.ended, good = e.kind === 'victory' || /Favourable/.test(e.title);
  const lost = w.lost.length ? `<h4>Losses</h4><ul class="list">${w.lost.map((n) => `<li class="erupt">${n}</li>`).join('')}</ul>` : '';
  sheet(`<div class="res-head ${good ? 'win' : e.kind === 'defeat' ? 'lose' : 'safe'}">${e.title.toUpperCase()}</div>
    <p class="s-text">${e.text}</p><ul class="list">${r.lines.map((l) => `<li>${l}</li>`).join('')}</ul>${lost}
    <div class="chiprow">${chipsHTML(chips)}</div><button class="btn" data-a="warcont">${S.over ? 'See result' : 'Back to government'}</button>`, { dismiss: false });
}

// ---------- boot ----------
buildMap();
S = E.newGame(12345);
ui.live = false;
ui.mode = 'random';
render();
titleSheet();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__reddot = { get state() { return S; }, ui }; // handy for debugging in dev tools
