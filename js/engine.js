// Pure game logic. No DOM. Mutates a state object `s`; the UI renders from it.
import { NATIONS, POWERS, ACTIONS, CRISES, H, clamp, leaderBonus, LEADERS, FEUDS, regimeChange, PATRON, breakPact } from './data.js';
import { newCabinet, newMinister, eskill, ROLE_KEYS, ROLES } from './cabinet.js';
import { reactFor } from './voices.js';
import { UNITS, unitById, START_FORCES, START_PURCH, POLITICS, SUPPLIERS, powers, syncDet, upkeep, effMe, effFoe, foeFactor } from './forces.js';

export const MAX_TURN = 20; // quarters in one term
export const MAX_TERMS = 3;
export const maxT = (s) => s.maxTurn || MAX_TURN;
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
  const s = { ...rest, rand: mulberry32(rngState) };
  // saves from older versions
  if (!s.feuds) { s.feuds = {}; for (const [k, f] of Object.entries(FEUDS)) s.feuds[k] = { t: f.base, war: 0 }; }
  if (!s.pendingMediate) s.pendingMediate = [];
  if (!s.pendingMeddle) s.pendingMeddle = [];
  if (!s.cabinet) { s.cabinet = {}; for (const r of ROLE_KEYS) s.cabinet[r] = { name: 'Minister', skill: 3, trait: 'loyalist', loyalty: 65 }; }
  if (s.pact === undefined) { s.pact = null; s.pactStrain = 0; }
  if (!s.maxTurn) s.maxTurn = MAX_TURN;
  if (!s.term) s.term = 1;
  if (!s.nuke) s.nuke = { prog: 0, power: false, device: false, exposed: false, halted: false };
  for (const [c, n] of Object.entries(s.nations)) { if (n.unrest == null) n.unrest = NATIONS[c].unrest; if (n.covert == null) n.covert = 0; }
  return s;
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
    seed, rand, turn: 1, ap: AP_PER_TURN, money: 70,
    g: { stab: 60, det: 40, hub: 50, res: 55 },
    powers: { US: { rel: 50 }, CN: { rel: 50 } },
    nations: {}, crises: [], cd: {}, shield: 0, uid: 1, lastDet: 40,
    stats: { resolved: 0, failed: 0, erupted: 0, warsWon: 0, warsLost: 0 }, over: null,
    forces: { ...START_FORCES }, purch: { ...START_PURCH }, orders: [], ordersThisTurn: 0,
    term: 1, maxTurn: MAX_TURN, nuke: { prog: 0, power: false, device: false, exposed: false, halted: false },
    arms: 0, posture: 0, war: null, pendingWar: null, supplyHits: 0, log: [], hist: [],
  };
  for (const [c, n] of Object.entries(NATIONS)) {
    s.nations[c] = { rel: clamp(n.rel + jit()), heat: clamp(n.heat + jit()), intent: 'distracted', scout: 0, mil: { ...n.mil }, leader: { ...LEADERS[c] }, unrest: n.unrest, covert: 0 };
  }
  s.feuds = {}; s.pendingMediate = []; s.pendingMeddle = [];
  s.cabinet = newCabinet(rand); s.pact = null; s.pactStrain = 0;
  for (const [k, f] of Object.entries(FEUDS)) s.feuds[k] = { t: clamp(f.base + jit()), war: 0 };
  s.baseUpkeep = upkeep(s);
  syncDet(s);
  s.lastDet = s.g.det;
  for (const c of Object.keys(NATIONS)) s.nations[c].intent = pickIntent(s, c);
  s.created = spawnCrises(s);
  return s;
}

export const nm = (code) => (code === 'SG' ? 'Singapore' : (NATIONS[code] || POWERS[code]).name);

export function income(s) {
  const rels = Object.values(s.nations).map((n) => n.rel);
  const avg = rels.reduce((a, b) => a + b, 0) / rels.length;
  return Math.round(5 + s.g.hub * 0.12 + (avg - 50) * 0.12 + (s.powers.CN.rel > 60 ? 2 : 0) + (s.nuke && s.nuke.power ? 1 : 0) + Math.round(eskill(s, 'fin') * 0.4) + (s.pact === 'CN' ? 4 : 0) - (upkeep(s) - s.baseUpkeep));
}

export function turnLabel(s) {
  const t = Math.min(s.turn, maxT(s)) - 1;
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

const leaderOf2 = (s, c) => (s.nations[c] && s.nations[c].leader) || LEADERS[c];

export function doAction(s, id, target) {
  const a = ACTIONS.find((x) => x.id === id);
  const st = actionState(s, a, target);
  if (!st.ok) return st;
  s.ap -= a.ap; s.money -= a.cost;
  const r = a.fx(s, target);
  let note = '';
  if (typeof r === 'string') note = r;
  else if (r && r.note) { note = r.note; if (r.log) logEv(s, r.log.text, r.log.w, r.log.tone); }
  else note = leaderBonus(s, id, target);
  const fe = Math.round(eskill(s, 'for') * 0.5);
  if (fe && (id === 'visit' || id === 'trade') && target) H.rel(s, target, fe);
  if (id === 'trade' && eskill(s, 'tni')) H.g(s, 'hub', Math.round(eskill(s, 'tni') * 0.5));
  let quote = '';
  const L = target ? leaderOf2(s, target) : null;
  if (L) {
    const kind = id === 'signal' ? 'signal' : (id === 'visit' || id === 'trade') ? id : /Exposed/.test(note) ? 'covert' : '';
    if (kind) quote = reactFor(s, target, L, kind);
  }
  if (a.cd) s.cd[id] = a.cd;
  flushWar(s);
  checkOver(s);
  return { ok: true, note, quote, speaker: L ? L.name : '' };
}

// ---------- crises ----------

export function brinkChance(s, c, o) {
  const fb = eskill(s, 'for') * 1.5; // a good foreign minister improves every gamble
  if (o.pfn) return clamp(Math.round(o.pfn(s, c) + fb), 10, 90);
  const n = s.nations[c.nation];
  if (!n) {
    const p = s.powers[c.nation] || { rel: 50 };
    return clamp(Math.round(45 + (p.rel - 50) * 0.45 + (s.g.det - 50) * 0.1 + fb), 10, 90);
  }
  const im = { friendly: 10, opportunist: -4, hawkish: -14, distracted: 6 }[n.intent];
  return clamp(Math.round(50 + (s.g.det - 50) * 0.35 + (n.rel - 50) * 0.25 - (n.heat - 40) * 0.25 + im + fb), 10, 90);
}

export function crisisOptions(s, c) {
  const t = CRISES[c.tpl];
  const known = !!s.powers[c.nation] || !s.nations[c.nation] || s.nations[c.nation].scout > 0;
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
    return { i, label: typeof o.label === 'function' ? o.label(s, c) : o.label, sub: o.sub, ap: o.ap, cost: o.cost, free: !!o.free, ok, reason, brink };
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
    logEv(s, `${kind === 'win' ? 'Gamble paid off' : 'Gamble failed'} (${p}%): ${typeof o.label === 'function' ? o.label(s, c) : o.label} — ${t.title(nm(c.nation), c)}. ${text}`, kind === 'win' ? 40 + (100 - p) / 4 : 55 + p / 4, kind === 'win' ? 'good' : 'bad');
  } else {
    o.fx(s, c);
  }
  s.crises = s.crises.filter((x) => x !== c);
  if (kind === 'lose') s.stats.failed++;
  else if (!o.free && !t.opp) s.stats.resolved++;
  flushWar(s);
  checkOver(s);
  return { ok: true, kind, text, label: typeof o.label === 'function' ? o.label(s, c) : o.label, title: t.title(nm(c.nation), c) };
}

function addCrisis(s, tplId, nation, extra = {}) {
  const t = CRISES[tplId];
  const c = { uid: s.uid++, tpl: tplId, nation, timer: t.timer, max: t.timer, ...extra };
  if (t.onSpawn) t.onSpawn(s, c);
  s.crises.push(c);
  return c;
}

function spawnCrises(s) {
  const out = [];
  const r = s.rand;
  for (const m of (s.pendingMediate || [])) {
    if (s.crises.length < 6 && !s.crises.some((c) => c.tpl === 'mediate' && c.key === m.key)) out.push(addCrisis(s, 'mediate', m.a, { other: m.b, key: m.key }));
  }
  s.pendingMediate = [];
  for (const m of (s.pendingMeddle || [])) {
    const { tpl, nation, ...extra } = m;
    if (s.crises.length < 7 && !s.crises.some((c) => c.tpl === tpl && c.nation === nation && c.other === extra.other && c.role === extra.role)) out.push(addCrisis(s, tpl, nation, extra));
  }
  s.pendingMeddle = [];
  for (const [code, n] of Object.entries(s.nations)) {
    if (n.heat >= 75 && !s.crises.some((c) => c.tpl === 'ultimatum' && c.nation === code)) {
      out.push(addCrisis(s, 'ultimatum', code));
    }
  }
  let count = 1 + (r() < 0.55 + (s.term - 1) * 0.1 ? 1 : 0) + (s.turn > 5 && r() < 0.4 + (s.term - 1) * 0.1 ? 1 : 0);
  if (s.turn === 1) count = Math.max(count, 2);
  for (let k = 0; k < count && s.crises.length < 5; k++) {
    const imb = Math.abs(s.powers.US.rel - s.powers.CN.rel);
    let subject;
    if (r() < (imb > 30 ? 0.35 : 0.12)) subject = weightedPick(r, ['US', 'CN'], (c) => s.powers[c].rel);
    else {
      subject = weightedPick(r, Object.keys(s.nations), (c) => {
        const n = s.nations[c];
        // Malaysia and Indonesia are the natural rivals; the others have bigger worries of their own
        const geo = { MY: 1.5, ID: 1.5, BN: 0.5, TH: 0.8, VN: 0.6, KH: 0.5, LA: 0.6, MM: 0.5 }[c] || 1;
        return (n.heat + 15 + { hawkish: 15, opportunist: 8, distracted: 5, friendly: 0 }[n.intent]) * geo;
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

// Quality tells: a neighbour that would face a technologically superior defender hesitates.
function attackWill(s, code) {
  const e = effFoe(s.nations[code], code), m = effMe(s);
  const sum = (o) => o.land + o.air + o.sea;
  return clamp(0.9 * sum(e) / Math.max(1, sum(m)), 0.3, 1) * (s.nuke.device ? 0.3 : 1);
}

// ---------- the neighbours' own quarrels ----------
function stepFeuds(s, ev) {
  const atWar = () => Object.values(s.feuds).filter((f) => f.war > 0).length;
  for (const [key, f] of Object.entries(s.feuds)) {
    const def = FEUDS[key], A = def.a, B = def.b, na = s.nations[A], nb = s.nations[B];
    const both = `${nm(A)} and ${nm(B)}`;
    if (f.war > 0) {
      f.war--;
      for (const c of [A, B]) {
        const n = s.nations[c], doms = ['land', 'air', 'sea'].filter((d) => n.mil[d] > 0);
        if (doms.length) { const d = doms[Math.floor(s.rand() * doms.length)]; n.mil[d] = Math.max(0, n.mil[d] - (3 + s.rand() * 3)); }
        H.heat(s, c, -4); n.intent = 'distracted';
      }
      H.g(s, 'hub', -1);
      if (f.war <= 0) { f.t = clamp(def.base + 15); ev.push({ kind: 'news', text: `Ceasefire between ${both}. Both armies are depleted.` }); }
      else ev.push({ kind: 'news', text: `${both} are still fighting. Regional trade is disrupted (Hub −1).` });
      continue;
    }
    let step = Math.round(s.rand() * 12 - 5) + Math.round((def.base - f.t) * 0.08);
    if (s.rand() < 0.07) step += 14; // an incident: a shooting, a seizure, a speech
    if (na.intent === 'hawkish' || nb.intent === 'hawkish') step += 2;
    if (na.unrest > 55 || nb.unrest > 55) step += 2; // regimes under pressure pick fights abroad
    f.t = clamp(f.t + step);
    const mediate = (p) => { if (s.rand() < p && !s.crises.some((c) => c.tpl === 'mediate' && c.key === key) && !s.pendingMediate.some((m) => m.key === key)) s.pendingMediate.push({ key, a: A, b: B }); };
    if (f.t >= 85 && atWar() < 2 && s.rand() < 0.5) {
      f.war = 3 + Math.floor(s.rand() * 3);
      ev.push({ kind: 'news', text: `WAR: ${both} are fighting over ${def.why}.` });
      logEv(s, `${both} went to war over ${def.why}.`, 35, 'dim');
      mediate(0.85);
    } else if (f.t >= 66 && s.rand() < 0.5) {
      f.t = clamp(f.t + 6);
      for (const n of [na, nb]) for (const d of ['land', 'air', 'sea']) n.mil[d] = Math.max(0, n.mil[d] - 1.5);
      ev.push({ kind: 'news', text: `Clash on the ${nm(A)}–${nm(B)} frontier over ${def.why}.` });
      mediate(0.5);
    } else if (f.t >= 55 && s.rand() < 0.3) {
      ev.push({ kind: 'news', text: `${both} trade sharp words over ${def.why}.` });
    }
  }
}

// ---------- Washington and Beijing play the region ----------
function meddle(s, ev) {
  if (s.rand() > 0.55 + (s.term - 1) * 0.05) return;
  const P = s.pact && s.rand() < 0.65 ? (s.pact === 'US' ? 'CN' : 'US') : (s.rand() < 0.5 ? 'US' : 'CN'), pn = POWERS[P].name;
  const picks = PATRON[P], X = picks[Math.floor(s.rand() * picks.length)], xn = nm(X), n = s.nations[X];
  const r = s.rand();
  if (r < 0.4) {
    for (const d of ['land', 'air', 'sea']) if (n.mil[d] > 0) n.mil[d] += 5;
    if (X === 'MY' || X === 'ID') H.heat(s, X, 3);
    ev.push({ kind: 'news', text: `${pn} ships arms to ${xn}. Its forces grow.` });
    if (['MY', 'ID', 'VN', 'TH'].includes(X) && s.rand() < 0.7 && !s.crises.some((c) => c.tpl === 'gp_buildup' && c.nation === P && c.other === X)) {
      s.pendingMeddle.push({ tpl: 'gp_buildup', nation: P, other: X });
    }
  } else if (r < 0.7) {
    H.rel(s, X, -3);
    if (P === 'CN' && ['MY', 'VN', 'TH', 'ID'].includes(X)) H.g(s, 'hub', -1);
    ev.push({ kind: 'news', text: `${pn} signs a big infrastructure and loans package with ${xn}. It drifts from Singapore.${P === 'CN' && ['MY', 'VN', 'TH', 'ID'].includes(X) ? ' (Hub −1)' : ''}` });
  } else {
    n.unrest = clamp((n.unrest || 0) + 12); H.heat(s, X, -3);
    ev.push({ kind: 'news', text: `Whispers of foreign money behind protests in ${xn}. ${pn} denies it.` });
  }
  // and sometimes they work on Singapore directly
  const imb = Math.abs(s.powers.US.rel - s.powers.CN.rel);
  const target = imb > 25 ? (s.powers.US.rel > s.powers.CN.rel ? 'CN' : 'US') : P; // the neglected giant pushes back
  if (s.rand() < (imb > 25 ? 0.4 : 0.15) && !s.crises.some((c) => c.tpl === 'gp_influence')) s.pendingMeddle.push({ tpl: 'gp_influence', nation: target });
}

// ---------- the nuclear programme: noticed, then reacted to ----------
function nukeStep(s, ev) {
  const k = s.nuke;
  if (k.prog <= 0 || k.device) return;
  if (!k.exposed && k.prog >= 20 && s.rand() < 0.04 + k.prog / 600) {
    k.exposed = true;
    const hot = Object.entries(s.nations).filter(([c]) => ['MY', 'ID', 'VN', 'TH'].includes(c)).sort((a, b) => b[1].heat - a[1].heat)[0][0];
    if (!s.crises.some((c) => c.tpl === 'nuke_probe')) s.pendingMeddle.push({ tpl: 'nuke_probe', nation: hot });
    ev.push({ kind: 'news', text: 'LEAK: foreign intelligence suspects a military track inside Singapore\'s nuclear programme.' });
  }
  if (k.exposed && !k.halted) {
    for (const [c, n] of Object.entries(s.nations)) H.heat(s, c, n.intent === 'hawkish' || n.intent === 'opportunist' ? 2 : 1);
    H.g(s, 'hub', -1);
  }
}

// ---------- extra terms ----------
export function extendTerm(s) {
  if (!s.over || !s.over.extend) return [];
  s.over = null;
  s.term++;
  s.maxTurn = maxT(s) + MAX_TURN;
  s.money += 20; // a fresh mandate and a budget to match
  H.g(s, 'stab', 8);
  s.war = null;
  s.ap = AP_PER_TURN; s.ordersThisTurn = 0; s.lastDet = s.g.det;
  logEv(s, `Re-elected for term ${s.term}.`, 30, 'good');
  const created = spawnCrises(s);
  return created;
}

// ---------- partners, rivals, ministers ----------
function pactStep(s) {
  if (!s.pact) return;
  const P = s.pact, R = P === 'US' ? 'CN' : 'US';
  const has = (tpl) => s.crises.some((c) => c.tpl === tpl) || s.pendingMeddle.some((m) => m.tpl === tpl);
  if (s.rand() < 0.3 && !has('gp_ally_call')) s.pendingMeddle.push({ tpl: 'gp_ally_call', nation: P });
  if (s.rand() < 0.22 && !has('gp_coerce')) s.pendingMeddle.push({ tpl: 'gp_coerce', nation: R });
  if (s.rand() < 0.1 && !has('gp_carrot')) s.pendingMeddle.push({ tpl: 'gp_carrot', nation: R });
  if ((s.turn % 4) === 0 && s.pactStrain > 0) s.pactStrain--;
}
function cabinetStep(s, ev) {
  for (const r of ROLE_KEYS) {
    const m = s.cabinet[r];
    let d = Math.round(s.rand() * 4 - 2); // restless
    if (s.g.stab >= 60) d += 1; else if (s.g.stab < 40) d -= 3;
    if (m.trait === 'loyalist') d = Math.max(d, 0); // loyalists only drift up
    if (m.trait === 'maverick') d += Math.round(s.rand() * 8 - 4);
    m.loyalty = clamp(m.loyalty + d);
    const scandalP = m.trait === 'maverick' ? 0.06 : m.trait === 'showman' ? 0.035 : 0.01;
    if (s.rand() < scandalP && !s.crises.some((c) => c.tpl === 'minister_scandal') && !s.pendingMeddle.some((x) => x.tpl === 'minister_scandal')) s.pendingMeddle.push({ tpl: 'minister_scandal', nation: 'SG', role: r });
    if (m.loyalty <= 12 && s.rand() < 0.3) {
      ev.push({ kind: 'erupt', text: `${m.name} resigns as ${ROLES[r].label} Minister. An acting minister takes over. Stability −2.` });
      logEv(s, `${ROLES[r].label} Minister ${m.name} resigned.`, 40);
      H.g(s, 'stab', -2);
      s.cabinet[r] = { name: 'Acting Minister', skill: 1, trait: 'loyalist', loyalty: 50 };
    }
  }
}
export function ministerPraise(s, role) {
  if (s.war) return { ok: false, reason: 'At war' };
  if (s.ap < 1) return { ok: false, reason: 'No action points' };
  s.ap--; const m = s.cabinet[role]; m.loyalty = clamp(m.loyalty + 15);
  return { ok: true, note: `${m.name} is back on side: loyalty ${Math.round(m.loyalty)}` };
}
export function ministerReplace(s, role) {
  if (s.war) return { ok: false, reason: 'At war' };
  if (s.ap < 1) return { ok: false, reason: 'No action points' };
  if (s.money < 3) return { ok: false, reason: 'Not enough funds' };
  if ((s.cd['m_' + role] || 0) > 0) return { ok: false, reason: `Ready in ${s.cd['m_' + role]} turns` };
  s.ap--; s.money -= 3; s.cd['m_' + role] = 3;
  const old = s.cabinet[role].name;
  s.cabinet[role] = newMinister(s.rand, 1 + Math.floor(s.rand() * 5)); // anywhere from raw to brilliant
  return { ok: true, note: `${old} out, ${s.cabinet[role].name} in (${s.cabinet[role].skill}★)` };
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
      if (!t.opp) { s.stats.erupted++; logEv(s, `${t.title(nm(c.nation), c)} was ignored: ${txt}`, 45); }
      ev.push({ kind: t.opp ? 'info' : 'erupt', text: `${t.title(nm(c.nation), c)}: ${txt}` });
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
  s.arms += US > 65 ? 0.7 : 1.1;
  s.posture = Math.trunc(s.posture * 0.7);
  syncDet(s);
  H.g(s, 'res', (s.g.res > 40 ? -3 : -2) + (s.nuke.power ? 1 : 0)); // a nuclear plant slows the slide
  H.g(s, 'hub', CN > 65 ? -1 : -2);
  if (s.g.stab > 70) H.g(s, 'stab', -1);
  // the cabinet at work
  { const th = Math.round(eskill(s, 'tni') * 0.2); if (th) H.g(s, 'hub', th);
    const hh = Math.round(eskill(s, 'home') * 0.2); if (hh && s.g.stab < 60) H.g(s, 'stab', hh);
    for (const r of ROLE_KEYS) { const m = s.cabinet[r]; if (m.trait === 'showman' && m.loyalty >= 50 && s.g.stab < 80) H.g(s, 'stab', 1); } }
  if (s.pact === 'CN') H.g(s, 'hub', 1);
  if (s.pact) { const R = s.pact === 'US' ? 'CN' : 'US'; s.powers[R].rel = Math.max(15, s.powers[R].rel - 1); }
  
  if (!s.pact && Math.abs(US - CN) > 35) { H.g(s, 'stab', -1); ev.push({ kind: 'info', text: 'Leaning too far toward one giant strains the home front (Stability −1).' }); }
  for (const [pc, p] of Object.entries(s.powers)) { if (p.rel > 60 && pc !== s.pact) p.rel -= 1; else if (p.rel < 40) p.rel += 1; }

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
    const grow = { friendly: 0.2, opportunist: 0.6, hawkish: 1.0, distracted: 0.3 }[n.intent] * 1.6 * (1 + (s.term - 1) * 0.25) * (0.7 + s.rand() * 0.6);
    for (const d of ['land', 'air', 'sea']) if (n.mil[d] > 0) n.mil[d] += grow;
    if (n.heat >= 96 && hos && !s.war && !s.pendingWar && s.rand() < attackWill(s, code)) H.war(s, code, { aggressor: false, start: -15, reason: 'attack' });
    const home = NATIONS[code].home;
    n.rel = clamp(n.rel + (n.rel > home + 5 ? -1 : n.rel < home - 5 ? 1 : 0));
    // domestic unrest settles back; a regime under pressure looks inward
    const ub = NATIONS[code].unrest, ud = ub - (n.unrest || 0);
    if (Math.abs(ud) >= 3) n.unrest = clamp((n.unrest || 0) + Math.sign(ud) * Math.ceil(Math.abs(ud) * 0.1));
    if (n.unrest > 55) H.heat(s, code, -2);
    if (n.unrest >= 78 && s.rand() < 0.35) {
      const r = regimeChange(s, code);
      ev.push({ kind: 'news', text: `COUP in ${nm(code)}: ${r.note}` }); logEv(s, r.log.text, 60, r.log.tone);
    }
    if (n.covert > 0 && s.rand() < 0.04 * n.covert) {
      H.rel(s, code, -12); H.heat(s, code, 10); n.covert = Math.max(0, n.covert - 1);
      ev.push({ kind: 'erupt', text: `${nm(code)} uncovers Singapore's hand behind its opposition. Trust −12.` });
      logEv(s, `${nm(code)} uncovered Singapore's covert backing of its opposition.`, 65);
    }
    if (n.scout > 0) n.scout--;
    if (s.rand() < 0.12) n.intent = pickIntent(s, code);
  }

  stepFeuds(s, ev);
  meddle(s, ev);
  pactStep(s);
  cabinetStep(s, ev);
  nukeStep(s, ev);

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
  if (s.turn > maxT(s)) {
    const rels = Object.values(s.nations).map((n) => n.rel), avg = rels.reduce((a, b) => a + b, 0) / rels.length;
    const share = Math.round(clamp(36 + s.g.stab * 0.42 + (s.g.hub - 50) * 0.12 + (avg - 50) * 0.08 + s.g.res * 0.04, 20, 85));
    if (share >= 50) {
      const more = s.term < MAX_TERMS;
      s.over = { result: 'win', extend: more, share, title: s.term > 1 ? `Term ${s.term} Complete` : 'You Held the Line',
        text: `Five years. The lights are on, the ports are busy, and the flag still flies. The voters give you ${share}% and ask you to stay.${more ? '' : ' That is three terms, and the end of an era.'}`, score: score(s, true) };
    } else {
      s.over = { result: 'lose', share, title: 'Voted Out', text: `You held the line, but the voters did not renew you (${share}%). Someone else inherits the strait.`, score: score(s, true) };
    }
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
    ['Extra terms', (s.term - 1) * 60],
    ['Strategic deterrent', s.nuke && s.nuke.device ? 20 : 0],
  ];
  const total = parts.reduce((a, [, v]) => a + v, 0);
  let rank = 'Fallen';
  if (survived) rank = total >= 380 ? 'Architect of the Age' : total >= 300 ? 'Steady Hand' : total >= 220 ? 'Survivor' : 'Barely Standing';
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

export const unitCost = (s, u) => Math.round(u.cost * (s.pact && u.sup === s.pact && s.pact === 'US' ? 0.85 : 1));

export function unitState(s, u) {
  if (s.war) return { ok: false, reason: 'At war' };
  if (s.ordersThisTurn >= ORDERS_PER_TURN) return { ok: false, reason: `${ORDERS_PER_TURN} orders per turn` };
  if (unitCost(s, u) > s.money) return { ok: false, reason: 'Not enough funds' };
  const need = NEED_HISTORY[u.tier];
  const ally = s.pact && u.sup === s.pact; // a partner opens its shelves
  if (!ally && u.sup !== 'SG' && (s.purch[u.sup] || 0) < need) {
    return { ok: false, reason: `Needs ${need} earlier ${SUPPLIERS[u.sup].short} purchase${need > 1 ? 's' : ''}` };
  }
  if (!ally && (u.sup === 'US' || u.sup === 'CN') && u.tier > 1) {
    const trust = u.tier === 2 ? 55 : 65;
    if (s.powers[u.sup].rel < trust) return { ok: false, reason: `Needs ${POWERS[u.sup].name} trust ${trust}+` };
  }
  return { ok: true, reason: '' };
}

export function buyUnit(s, id) {
  const u = unitById[id];
  const st = unitState(s, u);
  if (!st.ok) return st;
  s.money -= unitCost(s, u);
  s.ordersThisTurn++;
  s.orders.push({ uid: s.uid++, unit: id, turns: u.delay });
  s.purch[u.sup] = (s.purch[u.sup] || 0) + 1;
  for (const [code, d] of Object.entries(POLITICS[u.sup] || {})) H.rel(s, code, d);
  for (const n of Object.values(s.nations)) if (n.intent === 'hawkish' || n.intent === 'opportunist') n.heat = clamp(n.heat + 1);
  return { ok: true };
}

// ---------- war ----------

export const WAR_OPS = [
  { id: 'air',   name: 'Air Campaign',      dom: 'air',  cost: 0, desc: 'Fight for the skies. Air superiority boosts land and sea operations.' },
  { id: 'sea',   name: 'Sea Control',       dom: 'sea',  cost: 0, desc: 'Secure the Strait. Protects Resilience and Hub.' },
  { id: 'land',  name: 'Land Offensive',    dom: 'land', cost: 0, desc: 'Take the objective on the ground. Big swing either way.' },
  { id: 'strike', name: 'Precision Strikes', dom: 'mix', cost: 0, desc: 'Stand-off missiles wear down all enemy forces. Low risk, modest gains.' },
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
  const w = s.war, my = effMe(s), f = effFoe(s.nations[w.foe], w.foe);
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

// damage is dealt in effective strength, so convert back to the face-value stock
function hitFoe(f, dom, d, code) { f.mil[dom] = Math.max(0, f.mil[dom] - d / foeFactor(code)); }

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
    if (win) { w.airSup = Math.min(2, w.airSup + 1); w.score += 10; hitFoe(f, 'air', 5, w.foe); lines.push(`Air campaign succeeds. Air superiority: level ${w.airSup}.`); loseUnit(s, 'air', lines, 0.2); }
    else { w.score -= 7; hitFoe(f, 'air', 1, w.foe); lines.push('The air campaign stalls against stiff defences.'); loseUnit(s, 'air', lines, 0.6); }
  } else if (id === 'sea') {
    if (win) { w.seaCtl = Math.min(2, w.seaCtl + 1); w.score += 10; hitFoe(f, 'sea', 5, w.foe); H.g(s, 'res', 3); H.g(s, 'hub', 2); lines.push(`The Strait is secured. Sea control: level ${w.seaCtl}.`); loseUnit(s, 'sea', lines, 0.25); }
    else { w.score -= 7; hitFoe(f, 'sea', 1, w.foe); H.g(s, 'res', -4); lines.push('A naval clash goes badly. Shipping lanes are contested.'); loseUnit(s, 'sea', lines, 0.6); }
  } else if (id === 'land') {
    if (win) { w.score += 14; hitFoe(f, 'land', 6, w.foe); if (w.reason === 'supply') H.g(s, 'res', 4); lines.push('Your ground forces take the objective.'); loseUnit(s, 'land', lines, 0.35); }
    else { w.score -= 10; hitFoe(f, 'land', 2, w.foe); lines.push('The offensive bogs down with heavy losses.'); loseUnit(s, 'land', lines, 0.7); }
  } else if (id === 'strike') {
    if (win) { w.score += 8; for (const d of ['land', 'air', 'sea']) hitFoe(f, d, 3, w.foe); lines.push('Precision strikes degrade their forces.'); }
    else { w.score -= 3; lines.push('Strikes are intercepted or miss.'); loseUnit(s, 'air', lines, 0.15); }
  }

  // enemy counter-attack
  const doms = ['land', 'air', 'sea'];
  const fe = effFoe(f, w.foe);
  let r = s.rand() * doms.reduce((a, d) => a + fe[d] + 1, 0), dom = 'land';
  for (const d of doms) { r -= fe[d] + 1; if (r <= 0) { dom = d; break; } }
  const mine = effMe(s)[dom];
  const adv = fe[dom] - mine - (dom === 'land' ? 6 * w.airSup : dom === 'sea' ? 3 * w.airSup : 0);
  if (s.rand() * 100 < clamp(50 + adv * 1.2, 10, 85)) {
    w.score -= 6; lines.push(`${fn} strikes your ${dom} forces.`); loseUnit(s, dom, lines, 0.5);
  } else { w.score -= 1; hitFoe(f, dom, 2, w.foe); lines.push(`Their ${dom} attack is repulsed.`); }

  // costs of war at home
  H.g(s, 'stab', -3); H.g(s, 'hub', -3);
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
