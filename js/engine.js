// Pure game logic. No DOM. Mutates a state object `s`; the UI renders from it.
import { NATIONS, POWERS, ACTIONS, CRISES, H, clamp, leaderBonus } from './data.js';
import { UNITS, unitById, START_FORCES, START_PURCH, POLITICS, SUPPLIERS, powers, syncDet, upkeep } from './forces.js';

export const MAX_TURN = 20;
export const AP_PER_TURN = 4;
export const START_YEAR = 2027;
export const MAX_WAR_ROUNDS = 6;
export const ORDERS_PER_TURN = 2;

export function mulberry32(a) {
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.state = () => a; // lets a save file resume the exact random stream
  return f;
}

// ---------- save / load ----------
export function serialize(s) {
  const { rand, ...rest } = s;
  return JSON.stringify({ ...rest, rngState: rand.state() });
}
export function restore(json) {
  const { rngState, ...rest } = JSON.parse(json);
  return { ...rest, rand: mulberry32(rngState) };
}

// ---------- story log (for the end-of-term debrief) ----------
function logEv(s, text, w, tone = 'bad') {
  if (!s.log) s.log = [];
  s.log.push({ turn: s.turn, when: turnLabel(s), text, w, tone });
}
export function debrief(s) {
  const moments = [...(s.log || [])].sort((a, b) => b.w - a.w).slice(0, 5).sort((a, b) => a.turn - b.turn);
  return { moments, hist: s.hist || [] };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2147483647;
}

function weightedPick(rand, items, wf) {
  const ws = items.map(wf);
  const tot = ws.reduce((a, b) => a + b, 0);
  if (tot <= 0 || !items.length) return null;
  let r = rand() * tot;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function pickIntent(s, code) {
  const n = s.nations[code];
  const b = { ...NATIONS[code].bias };
  if (n.rel < 40) { b.hawkish *= 1.8; b.opportunist *= 1.4; }
  if (n.rel > 65) b.friendly *= 1.6;
  if (n.heat > 60) b.hawkish *= 1.6;
  const keys = Object.keys(b);
  return weightedPick(s.rand, keys, (k) => b[k]);
}

export function newGame(seed = Math.floor(Math.random() * 2147483646) + 1) {
  const rand = mulberry32(seed);
  const jit = () => Math.round((rand() - 0.5) * 10);
  const s = {
    seed, rand, turn: 1, ap: AP_PER_TURN, money: 60,
    g: { stab: 60, det: 40, hub: 50, res: 55 },
    powers: { US: { rel: 50 }, CN: { rel: 50 } },
    nations: {}, crises: [], cd: {}, shield: 0, uid: 1, lastDet: 40,
    stats: { resolved: 0, failed: 0, erupted: 0, warsWon: 0, warsLost: 0 }, over: null,
    forces: { ...START_FORCES }, purch: { ...START_PURCH }, orders: [], ordersThisTurn: 0,
    arms: 0, posture: 0, war: null, pendingWar: null, supplyHits: 0, log: [], hist: [],
  };
  for (const [c, n] of Object.entries(NATIONS)) {
    s.nations[c] = { rel: clamp(n.rel + jit()), heat: clamp(n.heat + jit()), intent: 'distracted', scout: 0, mil: { ...n.mil } };
  }
  s.baseUpkeep = upkeep(s);
  syncDet(s);
  s.lastDet = s.g.det;
  for (const c of Object.keys(NATIONS)) s.nations[c].intent = pickIntent(s, c);
  s.created = spawnCrises(s);
  return s;
}

export const nm = (code) => (NATIONS[code] || POWERS[code]).name;

export function income(s) {
  const rels = Object.values(s.nations).map((n) => n.rel);
  const avg = rels.reduce((a, b) => a + b, 0) / rels.length;
  return Math.round(2 + s.g.hub * 0.1 + (avg - 50) * 0.1 + (s.powers.CN.rel > 60 ? 2 : 0) - (upkeep(s) - s.baseUpkeep));
}

export function turnLabel(s) {
  const t = Math.min(s.turn, MAX_TURN) - 1;
  return `${START_YEAR + Math.floor(t / 4)} Q${(t % 4) + 1}`;
}

// ---------- actions ----------

export function actionState(s, a, target) {
  if (s.war) return { ok: false, reason: 'At war' };
  if (s.ap < a.ap) return { ok: false, reason: 'No action points' };
  if (a.cost > s.money) return { ok: false, reason: 'Not enough funds' };
  if (a.tgt === 'nation' && !(target && s.nations[target])) return { ok: false, reason: 'Select a nation on the radar' };
  if (a.tgt === 'power' && !(target && s.powers[target])) return { ok: false, reason: 'Select Washington or Beijing' };
  if (a.tgt === 'any' && !(target && (s.nations[target] || s.powers[target]))) return { ok: false, reason: 'Select a target on the radar' };
  if ((s.cd[a.id] || 0) > 0) return { ok: false, reason: `Ready in ${s.cd[a.id]} turn${s.cd[a.id] > 1 ? 's' : ''}` };
  if (a.req) { const r = a.req(s, target); if (r) return { ok: false, reason: r }; }
  return { ok: true, reason: '' };
}

export function doAction(s, id, target) {
  const a = ACTIONS.find((x) => x.id === id);
  const st = actionState(s, a, target);
  if (!st.ok) return st;
  s.ap -= a.ap; s.money -= a.cost;
  a.fx(s, target);
  const note = leaderBonus(s, id, target);
  if (a.cd) s.cd[id] = a.cd;
  flushWar(s);
  checkOver(s);
  return { ok: true, note };
}

// ---------- crises ----------

export function brinkChance(s, c, o) {
  if (o.pfn) return clamp(Math.round(o.pfn(s, c)), 10, 90);
  const n = s.nations[c.nation];
  if (!n) {
    const p = s.powers[c.nation];
    return clamp(Math.round(45 + (p.rel - 50) * 0.45 + (s.g.det - 50) * 0.1), 10, 90);
  }
  const im = { friendly: 10, opportunist: -4, hawkish: -14, distracted: 6 }[n.intent];
  return clamp(Math.round(50 + (s.g.det - 50) * 0.35 + (n.rel - 50) * 0.25 - (n.heat - 40) * 0.25 + im), 10, 90);
}

export function crisisOptions(s, c) {
  const t = CRISES[c.tpl];
  const known = !!s.powers[c.nation] || s.nations[c.nation].scout > 0;
  return t.options.map((o, i) => {
    let ok = true, reason = '';
    if (s.war) { ok = false; reason = 'At war'; }
    else if (o.ap > s.ap) { ok = false; reason = 'No action points'; }
    else if (o.cost > s.money) { ok = false; reason = 'Not enough funds'; }
    let brink = null;
    if (o.brink) {
      const p = brinkChance(s, c, o);
      brink = { p, known, lo: Math.max(5, Math.round((p - 15) / 5) * 5), hi: Math.min(95, Math.round((p + 15) / 5) * 5) };
    }
    return { i, label: o.label, sub: o.sub, ap: o.ap, cost: o.cost, free: !!o.free, ok, reason, brink };
  });
}

export function resolveCrisis(s, uid, i) {
  const c = s.crises.find((x) => x.uid === uid);
  if (!c) return { ok: false, reason: 'Crisis gone' };
  const t = CRISES[c.tpl];
  const o = t.options[i];
  const st = crisisOptions(s, c)[i];
  if (!st.ok) return { ok: false, reason: st.reason };
  s.ap -= o.ap; s.money -= o.cost;
  let kind = 'safe', text = '';
  if (o.brink) {
    const p = brinkChance(s, c, o);
    kind = s.rand() * 100 < p ? 'win' : 'lose';
    (kind === 'win' ? o.win : o.lose)(s, c);
    text = kind === 'win' ? (o.w || 'It worked.') : (o.l || 'It backfired.');
    logEv(s, `${kind === 'win' ? 'Gamble paid off' : 'Gamble failed'} (${p}%): ${o.label} — ${t.title(nm(c.nation))}. ${text}`, kind === 'win' ? 40 + (100 - p) / 4 : 55 + p / 4, kind === 'win' ? 'good' : 'bad');
  } else {
    o.fx(s, c);
  }
  s.crises = s.crises.filter((x) => x !== c);
  if (kind === 'lose') s.stats.failed++;
  else if (!o.free && !t.opp) s.stats.resolved++;
  flushWar(s);
  checkOver(s);
  return { ok: true, kind, text, label: o.label, title: t.title(nm(c.nation)) };
}

function addCrisis(s, tplId, nation) {
  const t = CRISES[tplId];
  const c = { uid: s.uid++, tpl: tplId, nation, timer: t.timer, max: t.timer };
  if (t.onSpawn) t.onSpawn(s, c);
  s.crises.push(c);
  return c;
}

function spawnCrises(s) {
  const out = [];
  const r = s.rand;
  for (const [code, n] of Object.entries(s.nations)) {
    if (n.heat >= 75 && !s.crises.some((c) => c.tpl === 'ultimatum' && c.nation === code)) {
      out.push(addCrisis(s, 'ultimatum', code));
    }
  }
  let count = 1 + (r() < 0.8 ? 1 : 0) + (s.turn > 4 && r() < 0.65 ? 1 : 0);
  if (s.turn === 1) count = Math.max(count, 2);
  for (let k = 0; k < count && s.crises.length < 6; k++) {
    const imb = Math.abs(s.powers.US.rel - s.powers.CN.rel);
    let subject;
    if (r() < (imb > 30 ? 0.35 : 0.12)) subject = weightedPick(r, ['US', 'CN'], (c) => s.powers[c].rel);
    else {
      subject = weightedPick(r, Object.keys(s.nations), (c) => {
        const n = s.nations[c];
        return n.heat + 15 + { hawkish: 15, opportunist: 8, distracted: 5, friendly: 0 }[n.intent];
      });
    }
    const wantOpp = r() < 0.2;
    let pick = null;
    for (const opp of [wantOpp, !wantOpp]) {
      const cands = Object.entries(CRISES).filter(([id, t]) =>
        id !== 'ultimatum' && !!t.opp === opp && t.nations.includes(subject)
        && !s.crises.some((c) => c.tpl === id && c.nation === subject)
        && !(id === 'cyber' && s.shield > 0));
      pick = weightedPick(r, cands, ([, t]) => t.w || 1);
      if (pick) break;
    }
    if (pick) out.push(addCrisis(s, pick[0], subject));
  }
  return out;
}

// ---------- turn loop ----------

export function checkOver(s) {
  if (s.over) return s.over;
  const g = s.g;
  let o = null;
  if (g.res <= 0 && !s.war) {
    s.supplyHits++;
    if (s.supplyHits >= 3) o = { result: 'lose', title: 'Supply Lines Cut', text: 'Water, food and power run dry for the last time. The island has no choice but to accept terms.' };
    else {
      const foe = ['MY', 'ID'].sort((a, b) => s.nations[b].heat - s.nations[a].heat)[0];
      g.res = 20;
      logEv(s, 'Water, food and power ran dry. A supply war began.', 90);
      startWar(s, foe, { aggressor: false, start: -10, reason: 'supply' });
    }
  }
  if (!o && g.stab <= 0) o = { result: 'lose', title: 'Government Falls', text: 'Public confidence collapses and a snap election ends your term in disgrace.' };
  if (o) { o.score = score(s, false); s.over = o; }
  return o;
}

export function endTurn(s) {
  if (s.war) return { events: [], created: [], over: null };
  const ev = [];
  const detRise = s.g.det - s.lastDet;

  // 1) crises tick down and erupt
  for (const c of [...s.crises]) {
    c.timer--;
    if (c.timer <= 0) {
      const t = CRISES[c.tpl];
      const txt = t.erupt(s, c);
      s.crises = s.crises.filter((x) => x !== c);
      if (!t.opp) { s.stats.erupted++; logEv(s, `${t.title(nm(c.nation))} was ignored: ${txt}`, 45); }
      ev.push({ kind: t.opp ? 'info' : 'erupt', text: `${t.title(nm(c.nation))}: ${txt}` });
    }
  }

  // 2) deliveries, arms race and drift
  for (const o of [...s.orders]) {
    o.turns--;
    if (o.turns <= 0) {
      s.forces[o.unit] = (s.forces[o.unit] || 0) + 1;
      s.orders = s.orders.filter((x) => x !== o);
      ev.push({ kind: 'income', text: `Delivered: ${unitById[o.unit].name}` });
    }
  }
  const US = s.powers.US.rel, CN = s.powers.CN.rel;
  s.arms += US > 65 ? 0.5 : 0.8;
  s.posture = Math.trunc(s.posture * 0.7);
  syncDet(s);
  H.g(s, 'res', -4);
  H.g(s, 'hub', CN > 65 ? -1 : -2);
  if (s.g.stab > 70) H.g(s, 'stab', -1);
  
  if (Math.abs(US - CN) > 35) { H.g(s, 'stab', -1); ev.push({ kind: 'info', text: 'Leaning too far toward one giant strains the home front (Stability −1).' }); }
  for (const p of Object.values(s.powers)) { if (p.rel > 60) p.rel -= 1; else if (p.rel < 40) p.rel += 1; }

  // 3) neighbours react
  for (const [code, n] of Object.entries(s.nations)) {
    const hos = n.intent === 'hawkish' || n.intent === 'opportunist';
    let dh = { friendly: 0, opportunist: 3, hawkish: 5, distracted: 1 }[n.intent] + Math.round((s.rand() - 0.5) * 4);
    if (n.rel > 65) dh -= 1;
    if (n.rel < 35) dh += 1;
    if (hos && s.g.det < 30) dh += 2;
    if (hos && detRise >= 8) dh += 3;
    if (s.g.hub > 70) dh -= 1;
    n.heat = clamp(n.heat + dh);
    const grow = { friendly: 0.2, opportunist: 0.6, hawkish: 1.0, distracted: 0.3 }[n.intent] * (0.7 + s.rand() * 0.6);
    for (const d of ['land', 'air', 'sea']) if (n.mil[d] > 0) n.mil[d] += grow;
    if (n.heat >= 96 && hos && !s.war && !s.pendingWar) H.war(s, code, { aggressor: false, start: -15, reason: 'attack' });
    n.rel = clamp(n.rel + (n.rel > 55 ? -1 : n.rel < 45 ? 1 : 0));
    if (n.scout > 0) n.scout--;
    if (s.rand() < 0.12) n.intent = pickIntent(s, code);
  }

  // 4) money
  const inc = income(s);
  s.money += inc;
  ev.push({ kind: 'income', text: `Income +$${inc}B` });
  if (s.money < 3) { H.g(s, 'stab', -2); ev.push({ kind: 'erupt', text: 'Austerity unrest: Stability −2 (funds nearly empty).' }); }

  (s.hist = s.hist || []).push({ t: s.turn, stab: s.g.stab, det: s.g.det, hub: s.g.hub, res: s.g.res, money: s.money });

  // 5) did we survive?
  const over = checkOver(s);
  if (over) return { events: ev, created: [], over };

  // 6) next turn
  s.turn++;
  if (s.turn > MAX_TURN) {
    s.over = { result: 'win', title: 'You Held the Line', text: 'Five years. The lights are on, the ports are busy, and the flag still flies.', score: score(s, true) };
    return { events: ev, created: [], over: s.over };
  }
  for (const k of Object.keys(s.cd)) s.cd[k] = Math.max(0, s.cd[k] - 1);
  s.shield = Math.max(0, s.shield - 1);
  s.ap = AP_PER_TURN;
  s.ordersThisTurn = 0;
  s.lastDet = s.g.det;
  const created = spawnCrises(s);
  flushWar(s);
  return { events: ev, created, over: null };
}

// ---------- score ----------

export function score(s, survived = true) {
  const g = s.g;
  const rels = Object.values(s.nations).map((n) => n.rel);
  const avg = rels.reduce((a, b) => a + b, 0) / rels.length;
  const bal = Math.abs(s.powers.US.rel - s.powers.CN.rel) <= 20 ? 15 : 0;
  const parts = [
    ['Stability', Math.round(g.stab)],
    ['Deterrence', Math.round(g.det)],
    ['Hub', Math.round(g.hub)],
    ['Resilience', Math.round(g.res)],
    ['Treasury', Math.round(s.money / 2)],
    ['Neighbour trust', Math.round(avg / 2)],
    ['Crises handled', s.stats.resolved * 4],
    ['Crises erupted', -s.stats.erupted * 6],
    ['Balanced between giants', bal],
    ['Wars won', s.stats.warsWon * 12],
    ['Wars lost', -s.stats.warsLost * 12],
  ];
  const total = parts.reduce((a, [, v]) => a + v, 0);
  let rank = 'Fallen';
  if (survived) rank = total >= 290 ? 'Architect of the Age' : total >= 230 ? 'Steady Hand' : total >= 170 ? 'Survivor' : 'Barely Standing';
  return { total, parts, rank };
}

// ---------- change reporting ----------

export function snapshot(s) {
  const rel = {}, heat = {};
  for (const [k, v] of Object.entries(s.nations)) { rel[k] = v.rel; heat[k] = v.heat; }
  for (const [k, v] of Object.entries(s.powers)) rel[k] = v.rel;
  return { money: s.money, g: { ...s.g }, rel, heat };
}

export function diff(a, b) {
  const out = [];
  if (b.money !== a.money) out.push({ label: 'Funds $', d: b.money - a.money, good: b.money > a.money });
  const lab = { stab: 'Stability', det: 'Deterrence', hub: 'Hub', res: 'Resilience' };
  for (const k of Object.keys(lab)) if (b.g[k] !== a.g[k]) out.push({ label: lab[k], d: b.g[k] - a.g[k], good: b.g[k] > a.g[k] });
  for (const k of Object.keys(b.rel)) if (b.rel[k] !== a.rel[k]) out.push({ label: `${k} trust`, d: b.rel[k] - a.rel[k], good: b.rel[k] > a.rel[k] });
  for (const k of Object.keys(b.heat)) if (b.heat[k] !== a.heat[k]) out.push({ label: `${k} tension`, d: b.heat[k] - a.heat[k], good: b.heat[k] < a.heat[k] });
  return out;
}

// ---------- procurement ----------

const NEED_HISTORY = { 1: 0, 2: 1, 3: 3 };

export function unitState(s, u) {
  if (s.war) return { ok: false, reason: 'At war' };
  if (s.ordersThisTurn >= ORDERS_PER_TURN) return { ok: false, reason: `${ORDERS_PER_TURN} orders per turn` };
  if (u.cost > s.money) return { ok: false, reason: 'Not enough funds' };
  const need = NEED_HISTORY[u.tier];
  if (u.sup !== 'SG' && (s.purch[u.sup] || 0) < need) {
    return { ok: false, reason: `Needs ${need} earlier ${SUPPLIERS[u.sup].short} purchase${need > 1 ? 's' : ''}` };
  }
  if ((u.sup === 'US' || u.sup === 'CN') && u.tier > 1) {
    const trust = u.tier === 2 ? 55 : 65;
    if (s.powers[u.sup].rel < trust) return { ok: false, reason: `Needs ${POWERS[u.sup].name} trust ${trust}+` };
  }
  return { ok: true, reason: '' };
}

export function buyUnit(s, id) {
  const u = unitById[id];
  const st = unitState(s, u);
  if (!st.ok) return st;
  s.money -= u.cost;
  s.ordersThisTurn++;
  s.orders.push({ uid: s.uid++, unit: id, turns: u.delay });
  s.purch[u.sup] = (s.purch[u.sup] || 0) + 1;
  for (const [code, d] of Object.entries(POLITICS[u.sup] || {})) H.rel(s, code, d);
  for (const n of Object.values(s.nations)) if (n.intent === 'hawkish' || n.intent === 'opportunist') n.heat = clamp(n.heat + 1);
  return { ok: true };
}

// ---------- war ----------

export const WAR_OPS = [
  { id: 'air',   name: 'Air Campaign',      dom: 'air',  cost: 4, desc: 'Fight for the skies. Air superiority boosts land and sea operations.' },
  { id: 'sea',   name: 'Sea Control',       dom: 'sea',  cost: 4, desc: 'Secure the Strait. Protects Resilience and Hub.' },
  { id: 'land',  name: 'Land Offensive',    dom: 'land', cost: 5, desc: 'Take the objective on the ground. Big swing either way.' },
  { id: 'strike', name: 'Precision Strikes', dom: 'mix', cost: 6, desc: 'Stand-off missiles wear down all enemy forces. Low risk, modest gains.' },
  { id: 'ceasefire', name: 'Seek Ceasefire', dom: 'none', cost: 0, desc: 'Negotiate an end. Far easier when you are ahead.' },
];

export function startWar(s, foe, o = {}) {
  if (s.war) return s.war;
  s.pendingWar = null;
  const start = o.start ?? 0;
  s.war = { foe, round: 1, score: start, start, airSup: 0, seaCtl: 0, reason: o.reason || 'war', aggressor: !!o.aggressor, log: [], lost: [], spent: 0 };
  s.war.log.push(o.aggressor ? `You open hostilities against ${nm(foe)}.` : `${nm(foe)} opens hostilities against you.`);
  return s.war;
}

export function flushWar(s) {
  if (s.pendingWar && !s.war) { const { foe, ...o } = s.pendingWar; startWar(s, foe, o); }
  s.pendingWar = null;
}

export function warOptions(s) {
  const w = s.war, my = powers(s), f = s.nations[w.foe].mil;
  return WAR_OPS.map((op) => {
    let p;
    if (op.id === 'ceasefire') {
      p = clamp(Math.round(40 + w.score * 0.5 + ((s.powers.US.rel + s.powers.CN.rel) / 2 - 50) * 0.4 + (w.round >= 4 ? 15 : 0)), 5, 95);
    } else if (op.id === 'strike') {
      p = clamp(Math.round(60 + ((my.air + my.sea) / 2 - (f.air + f.sea) / 2) * 0.8), 35, 90);
    } else {
      const sup = op.dom === 'land' ? 10 * w.airSup : op.dom === 'sea' ? 6 * w.airSup : 0;
      const surprise = w.round === 1 && w.start < 0 ? 6 : 0;
      p = clamp(Math.round(50 + (my[op.dom] - f[op.dom] + sup - surprise) * 1.4), 10, 90);
    }
    const ok = op.cost <= s.money;
    return { ...op, p, ok, reason: ok ? '' : 'Not enough funds', label: op.id === 'ceasefire' ? (p >= 60 ? 'Likely' : p >= 40 ? 'Possible' : 'Unlikely') : (p >= 65 ? 'Favoured' : p >= 45 ? 'Even' : 'Outmatched') };
  });
}

function hitFoe(f, dom, d) { f.mil[dom] = Math.max(0, f.mil[dom] - d); }

function loseUnit(s, dom, lines, chance) {
  if (s.rand() >= chance) return;
  const owned = Object.entries(s.forces).filter(([id, n]) => n > 0 && unitById[id].dom === dom);
  if (!owned.length) return;
  const total = owned.reduce((a, [, n]) => a + n, 0);
  let r = s.rand() * total, pick = owned[0][0];
  for (const [id, n] of owned) { r -= n; if (r <= 0) { pick = id; break; } }
  s.forces[pick]--;
  s.war.lost.push(unitById[pick].name);
  lines.push(`Lost: ${unitById[pick].name}.`);
  syncDet(s);
}

export function warOp(s, id) {
  const w = s.war;
  const opt = warOptions(s).find((o) => o.id === id);
  if (!w || !opt || !opt.ok) return { ok: false, reason: opt ? opt.reason : 'No such operation' };
  const lines = [];
  const f = s.nations[w.foe], fn = nm(w.foe);
  s.money -= opt.cost; w.spent += opt.cost;
  const win = s.rand() * 100 < opt.p;

  if (id === 'ceasefire') {
    if (win) return { ok: true, lines: [`${fn} agrees to talks.`], ended: finishWar(s, 'ceasefire') };
    lines.push(`${fn} refuses terms. The fighting goes on.`);
  } else if (id === 'air') {
    if (win) { w.airSup = Math.min(2, w.airSup + 1); w.score += 10; hitFoe(f, 'air', 5); lines.push(`Air campaign succeeds. Air superiority: level ${w.airSup}.`); loseUnit(s, 'air', lines, 0.2); }
    else { w.score -= 7; hitFoe(f, 'air', 1); lines.push('The air campaign stalls against stiff defences.'); loseUnit(s, 'air', lines, 0.6); }
  } else if (id === 'sea') {
    if (win) { w.seaCtl = Math.min(2, w.seaCtl + 1); w.score += 10; hitFoe(f, 'sea', 5); H.g(s, 'res', 3); H.g(s, 'hub', 2); lines.push(`The Strait is secured. Sea control: level ${w.seaCtl}.`); loseUnit(s, 'sea', lines, 0.25); }
    else { w.score -= 7; hitFoe(f, 'sea', 1); H.g(s, 'res', -4); lines.push('A naval clash goes badly. Shipping lanes are contested.'); loseUnit(s, 'sea', lines, 0.6); }
  } else if (id === 'land') {
    if (win) { w.score += 14; hitFoe(f, 'land', 6); if (w.reason === 'supply') H.g(s, 'res', 4); lines.push('Your ground forces take the objective.'); loseUnit(s, 'land', lines, 0.35); }
    else { w.score -= 10; hitFoe(f, 'land', 2); lines.push('The offensive bogs down with heavy losses.'); loseUnit(s, 'land', lines, 0.7); }
  } else if (id === 'strike') {
    if (win) { w.score += 8; for (const d of ['land', 'air', 'sea']) hitFoe(f, d, 3); lines.push('Precision strikes degrade their forces.'); }
    else { w.score -= 3; lines.push('Strikes are intercepted or miss.'); loseUnit(s, 'air', lines, 0.15); }
  }

  // enemy counter-attack
  const doms = ['land', 'air', 'sea'];
  let r = s.rand() * doms.reduce((a, d) => a + f.mil[d] + 1, 0), dom = 'land';
  for (const d of doms) { r -= f.mil[d] + 1; if (r <= 0) { dom = d; break; } }
  const mine = powers(s)[dom];
  const adv = f.mil[dom] - mine - (dom === 'land' ? 6 * w.airSup : dom === 'sea' ? 3 * w.airSup : 0);
  if (s.rand() * 100 < clamp(50 + adv * 1.2, 10, 85)) {
    w.score -= 6; lines.push(`${fn} strikes your ${dom} forces.`); loseUnit(s, dom, lines, 0.5);
  } else { w.score -= 1; hitFoe(f, dom, 2); lines.push(`Their ${dom} attack is repulsed.`); }

  // costs of war at home
  H.g(s, 'stab', -2); H.g(s, 'hub', -2);
  if (w.seaCtl <= 0) H.g(s, 'res', -2);
  if (s.g.res <= 0) { w.score -= 6; lines.push('Supplies run dry at home.'); }
  w.score = clamp(w.score, -100, 100);
  w.round++;
  w.log = lines;

  let ended = null;
  if (w.score >= 45) ended = finishWar(s, 'victory');
  else if (w.score <= -45) ended = finishWar(s, 'defeat');
  else if (w.round > MAX_WAR_ROUNDS) ended = finishWar(s, 'stalemate');
  else if (s.g.stab <= 0) ended = finishWar(s, 'defeat');
  return { ok: true, lines, ended };
}

function finishWar(s, kind) {
  const w = s.war, f = s.nations[w.foe], fn = nm(w.foe), sc = w.score;
  const others = Object.keys(s.nations).filter((c) => c !== w.foe);
  let title, text;
  if (kind === 'defeat') {
    s.stats.warsLost++;
    logEv(s, `War with ${fn}: defeated in the field.`, 100);
    title = 'Defeated in the Field'; text = `${fn}'s forces overwhelm your defences. The war is lost.`;
    s.over = { result: 'lose', title, text, score: score(s, false) };
    s.war = null;
    return { kind, title, text };
  }
  if (kind === 'victory') {
    s.stats.warsWon++;
    title = 'Victory'; text = `${fn} sues for peace. Your forces hold the field and the nation rallies behind you.`;
    H.g(s, 'stab', 12); f.heat = 15; f.rel = clamp(f.rel - 20); f.intent = 'distracted';
    for (const d of ['land', 'air', 'sea']) f.mil[d] = Math.round(f.mil[d] * 0.8);
    for (const c of others) H.rel(s, c, w.aggressor ? -5 : 3);
    if (w.reason === 'supply') s.g.res = Math.max(s.g.res, 60);
  } else {
    // ceasefire (agreed) or stalemate (great powers force one)
    const pre = kind === 'stalemate' ? 'Great powers force a halt to the fighting. ' : '';
    if (sc > 20) {
      s.stats.warsWon++; title = 'Favourable Ceasefire'; text = `${pre}You negotiate from strength.`;
      H.g(s, 'stab', 6); f.heat = 30; f.rel = clamp(f.rel - 10);
      if (w.reason === 'supply') s.g.res = Math.max(s.g.res, 45);
    } else if (sc >= -20) {
      title = 'Uneasy Ceasefire'; text = `${pre}Lines are frozen and nothing is settled.`;
      H.g(s, 'stab', -2); f.heat = 40; f.rel = clamp(f.rel - 10);
      if (w.reason === 'supply') s.g.res = Math.max(s.g.res, 30);
    } else {
      title = 'Humiliating Ceasefire'; text = `${pre}You accept harsh terms to stop the bleeding.`;
      H.g(s, 'stab', -8); H.g(s, 'hub', -6); f.heat = 50;
      if (w.reason === 'supply') s.g.res = Math.max(s.g.res, 20);
    }
    if (w.aggressor) for (const c of others) H.rel(s, c, -3);
  }
  logEv(s, `War with ${fn}: ${title}.`, 100, kind === 'victory' || title === 'Favourable Ceasefire' ? 'good' : 'bad');
  s.war = null;
  s.lastDet = s.g.det;
  checkOver(s);
  return { kind, title, text };
}
