// Pure game logic. No DOM. Mutates a state object `s`; the UI renders from it.
import { NATIONS, POWERS, ACTIONS, CRISES, H, clamp } from './data.js';

export const MAX_TURN = 20;
export const AP_PER_TURN = 3;
export const START_YEAR = 2027;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    seed, rand, turn: 1, ap: AP_PER_TURN, money: 45,
    g: { stab: 60, det: 40, hub: 50, res: 55 },
    powers: { US: { rel: 50 }, CN: { rel: 50 } },
    nations: {}, crises: [], cd: {}, shield: 0, uid: 1, lastDet: 40,
    stats: { resolved: 0, failed: 0, erupted: 0 }, over: null,
  };
  for (const [c, n] of Object.entries(NATIONS)) {
    s.nations[c] = { rel: clamp(n.rel + jit()), heat: clamp(n.heat + jit()), intent: 'distracted', scout: 0 };
  }
  for (const c of Object.keys(NATIONS)) s.nations[c].intent = pickIntent(s, c);
  s.created = spawnCrises(s);
  return s;
}

export const nm = (code) => (NATIONS[code] || POWERS[code]).name;

export function income(s) {
  const rels = Object.values(s.nations).map((n) => n.rel);
  const avg = rels.reduce((a, b) => a + b, 0) / rels.length;
  return Math.round(1 + s.g.hub * 0.1 + (avg - 50) * 0.1 + (s.powers.CN.rel > 60 ? 2 : 0));
}

export function turnLabel(s) {
  const t = Math.min(s.turn, MAX_TURN) - 1;
  return `${START_YEAR + Math.floor(t / 4)} Q${(t % 4) + 1}`;
}

// ---------- actions ----------

export function actionState(s, a, target) {
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
  if (a.cd) s.cd[id] = a.cd;
  checkOver(s);
  return { ok: true };
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
    if (o.ap > s.ap) { ok = false; reason = 'No action points'; }
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
  } else {
    o.fx(s, c);
  }
  s.crises = s.crises.filter((x) => x !== c);
  if (kind === 'lose') s.stats.failed++;
  else if (!o.free && !t.opp) s.stats.resolved++;
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
  let count = 1 + (r() < 0.55 ? 1 : 0) + (s.turn > 6 && r() < 0.4 ? 1 : 0);
  if (s.turn === 1) count = Math.max(count, 2);
  for (let k = 0; k < count && s.crises.length < 5; k++) {
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
  if (g.stab <= 0) o = { result: 'lose', title: 'Government Falls', text: 'Public confidence collapses and a snap election ends your term in disgrace.' };
  else if (g.res <= 0) o = { result: 'lose', title: 'Supply Lines Cut', text: 'Water, food and power run dry. The island has no choice but to accept terms.' };
  else {
    const e = Object.entries(s.nations).find(([, n]) => n.heat >= 95 && g.det < 25);
    if (e) o = { result: 'lose', title: 'Forced to the Table', text: `${nm(e[0])} presses its advantage while your defences sit hollow. Sovereignty is compromised.` };
  }
  if (o) { o.score = score(s, false); s.over = o; }
  return o;
}

export function endTurn(s) {
  const ev = [];
  const detRise = s.g.det - s.lastDet;

  // 1) crises tick down and erupt
  for (const c of [...s.crises]) {
    c.timer--;
    if (c.timer <= 0) {
      const t = CRISES[c.tpl];
      const txt = t.erupt(s, c);
      s.crises = s.crises.filter((x) => x !== c);
      if (!t.opp) s.stats.erupted++;
      ev.push({ kind: t.opp ? 'info' : 'erupt', text: `${t.title(nm(c.nation))}: ${txt}` });
    }
  }

  // 2) upkeep and drift
  const US = s.powers.US.rel, CN = s.powers.CN.rel;
  H.g(s, 'det', US > 65 ? -2 : -3);
  H.g(s, 'res', -3);
  H.g(s, 'hub', CN > 65 ? -1 : -2);
  if (s.g.stab > 50) H.g(s, 'stab', -1);
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
    n.rel = clamp(n.rel + (n.rel > 55 ? -1 : n.rel < 45 ? 1 : 0));
    if (n.scout > 0) n.scout--;
    if (s.rand() < 0.12) n.intent = pickIntent(s, code);
  }

  // 4) money
  const inc = income(s);
  s.money += inc;
  ev.push({ kind: 'income', text: `Income +$${inc}B` });
  if (s.money < 5) { H.g(s, 'stab', -3); ev.push({ kind: 'erupt', text: 'Austerity unrest: Stability −3 (funds nearly empty).' }); }

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
  s.lastDet = s.g.det;
  const created = spawnCrises(s);
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
  ];
  const total = parts.reduce((a, [, v]) => a + v, 0);
  let rank = 'Fallen';
  if (survived) rank = total >= 330 ? 'Architect of the Age' : total >= 270 ? 'Steady Hand' : total >= 210 ? 'Survivor' : 'Barely Standing';
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
