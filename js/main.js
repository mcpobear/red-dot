// UI layer: renders the radar map, HUD, action panel and crisis sheets from engine state.
import { NATIONS, POWERS, ACTIONS, CRISES, INTENTS, CATS } from './data.js';
import * as E from './engine.js';

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
const ui = { target: null, tab: 'act', cat: 'dip', muted: store.get('muted') === '1', seed: null, mode: 'random' };
let lastCommit = 0;

// ---------- audio + haptics (best effort) ----------
let AC = null;
function tone(f, d = 0.08, type = 'sine', v = 0.05, when = 0) {
  if (ui.muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
  } catch { /* no audio */ }
}
const sfx = {
  tap: () => tone(660, 0.05, 'triangle'),
  ok: () => { tone(520, 0.1, 'triangle'); tone(780, 0.16, 'triangle', 0.05, 0.09); },
  bad: () => { tone(150, 0.3, 'sawtooth', 0.05); tone(110, 0.3, 'sawtooth', 0.04, 0.12); },
  alert: () => { tone(880, 0.07, 'square', 0.025); tone(880, 0.07, 'square', 0.025, 0.14); },
  turn: () => tone(330, 0.14, 'sine'),
};
let hapticLabel = null;
function haptic(ms = 10) {
  if (ui.muted) return;
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
    ${cs.map((c) => `<button class="t-crisis" data-a="crisis" data-uid="${c.uid}">${CRISES[c.tpl].icon} ${CRISES[c.tpl].title(ALL[c.nation].name)} · ${c.timer} turn${c.timer > 1 ? 's' : ''} left ›</button>`).join('')}`;
}

function renderTabs() {
  const n = S.crises.filter((c) => !CRISES[c.tpl].opp).length;
  $('#tabs').innerHTML = `<button class="tab ${ui.tab === 'act' ? 'on' : ''}" data-a="tab" data-tab="act" role="tab">ACTIONS</button>
    <button class="tab ${ui.tab === 'cri' ? 'on' : ''}" data-a="tab" data-tab="cri" role="tab">CRISES${S.crises.length ? `<em>${S.crises.length}</em>` : ''}</button>`;
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
      <b>${t.icon} ${t.title(ALL[c.nation].name)}</b><div class="chips"><em class="tm">${t.opp ? 'OFFER ' : ''}${c.timer}T</em></div>
      <span>${c.nation} · ${t.opp ? 'Opportunity' : 'Resolve before the timer ends'}</span></button>`;
  }).join('');
}

function renderPanel() {
  renderTabs();
  $('#target').innerHTML = targetHTML();
  const body = $('#body'), top = body.scrollTop;
  body.innerHTML = ui.tab === 'act' ? actionsHTML() : crisesHTML();
  body.scrollTop = top;
}

function renderDock() {
  const pips = Array.from({ length: E.AP_PER_TURN }, (_, i) => `<span class="pip ${i < S.ap ? 'on' : ''}"></span>`).join('');
  $('#dock').innerHTML = `<div class="ap"><small>AP</small>${pips}</div><button id="endturn" data-a="endturn" class="${S.ap === 0 ? 'pulse' : ''}">End Turn →</button>`;
  $('#hint').textContent = ui.target ? `TARGET · ${ALL[ui.target].name.toUpperCase()}` : 'TAP A NODE TO TARGET';
}

function render() { renderHud(); updateMap(); renderPanel(); renderDock(); }

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
    <button class="btn" data-a="start">Start Term</button>
    <div class="row2" style="margin-top:8px"><button class="btn alt" data-a="daily">Daily Seed</button><button class="btn alt" data-a="how">How to Play</button></div>
    ${best ? `<div class="best">BEST SCORE ${best}</div>` : ''}</div>`, { dismiss: false });
}

function howSheet(back) {
  sheet(`<div class="s-head"><span class="ico">🧭</span><div><h2>How to play</h2><div class="meta">ONE TERM ≈ 10 MINUTES</div></div></div>
    <ol class="how">
      <li><b>Survive 20 quarters.</b> Keep Stability, Deterrence, Hub and Resilience above zero, and do not let a hostile neighbour find you defenceless.</li>
      <li><b>3 action points a turn.</b> Tap a node on the radar to target it, then pick an action. Everything costs AP and usually money.</li>
      <li><b>Crises tick down.</b> The badge on the map is the timer. Ignore one and it erupts. Open the Crises tab to respond.</li>
      <li><b>Gambles need nerve.</b> Risky options show odds and must be held to commit. Scout a nation to reveal its hidden intent and exact odds.</li>
      <li><b>Balance the giants.</b> Leaning too hard on Washington or Beijing wins you gifts and costs you stability.</li>
    </ol><button class="btn" data-a="${back === 'title' ? 'title' : back === 'brief' ? 'brief' : 'close'}">${back === 'title' ? 'Back' : back === 'brief' ? 'Got it — show briefing' : 'Got it'}</button>`);
}

function menuSheet() {
  sheet(`<div class="s-head"><span class="ico">⚙️</span><div><h2>Menu</h2></div></div>
    <button class="btn alt" data-a="how">How to play</button>
    <button class="btn alt" data-a="mute" style="margin-top:8px">Sound &amp; haptics: ${ui.muted ? 'OFF' : 'ON'}</button>
    <button class="btn alt" data-a="restart" style="margin-top:8px">Abandon term &amp; restart</button>
    <button class="btn" data-a="close" style="margin-top:8px">Resume</button>`);
}

function reportSheet(title, events, created, chips, icon = '📋') {
  const lines = [
    ...events.map((e) => `<li class="${e.kind}">${e.kind === 'erupt' ? '💥 ' : ''}${e.text}</li>`),
    ...created.map((c) => `<li class="new">${CRISES[c.tpl].icon} <b>${CRISES[c.tpl].title(ALL[c.nation].name)}</b> · ${c.nation} · ${c.timer} turn${c.timer > 1 ? 's' : ''}</li>`),
  ].join('');
  sheet(`<div class="s-head"><span class="ico">${icon}</span><div><h2>${title}</h2><div class="meta">${S.crises.length} ACTIVE CRISES</div></div></div>
    <ul class="list">${lines}</ul><div class="chiprow">${chipsHTML(chips)}</div><button class="btn" data-a="close">Continue</button>`);
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
  sheet(`<div class="s-head"><span class="ico">${t.icon}</span><div><h2>${t.title(nm)}</h2><div class="meta">${c.nation} · ${t.opp ? 'OFFER' : 'CRISIS'} · ${c.timer} TURN${c.timer > 1 ? 'S' : ''} LEFT · ${S.ap} AP</div></div></div>
    <p class="s-text">${t.text(nm, c)}</p>${html}<button class="btn alt" data-a="close">Decide later</button>`);
}

function commitOpt(uid, i) {
  lastCommit = performance.now();
  const before = E.snapshot(S);
  const r = E.resolveCrisis(S, uid, i);
  if (!r.ok) { sfx.bad(); return; }
  const chips = E.diff(before, E.snapshot(S));
  const head = r.kind === 'win' ? 'SUCCESS' : r.kind === 'lose' ? 'BACKFIRE' : 'DONE';
  if (r.kind === 'lose') { sfx.bad(); haptic([40, 40, 40]); shake('bad'); } else { sfx.ok(); haptic(15); }
  render();
  if (S.over) { showOver(); return; }
  sheet(`<div class="res-head ${r.kind}">${head}</div><p class="s-text"><b>${r.label}.</b> ${r.text || ''}</p>
    <div class="chiprow">${chipsHTML(chips) || '<span class="chip">No change</span>'}</div>
    <button class="btn" data-a="close">Continue</button>`);
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
  start: () => start('random'),
  daily: () => start('daily'),
  how: (el) => howSheet(S && !S.over && $('.title-card') ? 'title' : undefined),
  menu: () => menuSheet(),
  mute: () => { ui.muted = !ui.muted; store.set('muted', ui.muted ? '1' : '0'); menuSheet(); },
  restart: () => { closeSheet(); titleSheet(); },
  share: () => shareResult(),
  tab: (el) => { ui.tab = el.dataset.tab; renderPanel(); },
  cat: (el) => { ui.cat = el.dataset.cat; renderPanel(); },
  do: (el) => {
    const id = el.dataset.id;
    const before = E.snapshot(S);
    const r = E.doAction(S, id, ui.target);
    if (!r.ok) { sfx.bad(); return; }
    sfx.tap(); haptic(10);
    toast(E.diff(before, E.snapshot(S)));
    render();
    if (S.over) showOver();
  },
  crisis: (el) => { sfx.tap(); crisisSheet(Number(el.dataset.uid)); },
  opt: (el, e) => {
    if (el.dataset.brink && e.detail !== 0) return; // pointer users must hold; keyboard commits directly
    commitOpt(Number(el.dataset.uid), Number(el.dataset.i));
  },
  endturn: () => attemptEnd(),
  confirmEnd: () => doEnd(),
};

document.addEventListener('click', (e) => {
  if (performance.now() - lastCommit < 450) return;
  const el = e.target.closest('[data-a]');
  if (el && !el.disabled && handlers[el.dataset.a]) { handlers[el.dataset.a](el, e); return; }
  const node = e.target.closest('.node');
  if (node && S) {
    const code = node.dataset.code;
    ui.target = ui.target === code ? null : code;
    ui.tab = 'act'; sfx.tap(); haptic(6);
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

// ---------- boot ----------
buildMap();
S = E.newGame(12345);
ui.mode = 'random';
render();
titleSheet();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__reddot = { get state() { return S; }, ui }; // handy for debugging in dev tools
