// Balance harness: plays many seeded games with simple bots and reports win rates.
// Usage: node tests/sim.mjs [games=400]
import { ACTIONS, CRISES } from '../js/data.js';
import * as E from '../js/engine.js';

const N = Number(process.argv[2] || 400);
const act = (id) => ACTIONS.find((a) => a.id === id);

function tryAction(s, id, target) {
  const a = act(id);
  if (!E.actionState(s, a, target).ok) return false;
  E.doAction(s, id, target);
  return true;
}

function resolveBest(s, c) {
  const opts = E.crisisOptions(s, c);
  // prefer a safe, affordable, non-free option; then a good-odds gamble; then free
  const safe = opts.filter((o) => o.ok && !o.free && !o.brink).sort((a, b) => a.cost - b.cost);
  const gamble = opts.filter((o) => o.ok && o.brink && o.brink.p >= 55).sort((a, b) => b.brink.p - a.brink.p);
  const free = opts.filter((o) => o.ok && o.free);
  const pick = (c.tpl === 'ultimatum' ? (gamble[0] || safe[0]) : (safe[0] || gamble[0])) || free[0];
  if (!pick) return false;
  E.resolveCrisis(s, c.uid, pick.i);
  return true;
}

const bots = {
  idle: (s) => {},
  random: (s) => {
    let guard = 12;
    while (s.ap > 0 && guard-- > 0 && !s.over) {
      if (s.crises.length && s.rand() < 0.5) { const c = s.crises[Math.floor(s.rand() * s.crises.length)]; const o = E.crisisOptions(s, c).filter((x) => x.ok); if (o.length) { E.resolveCrisis(s, c.uid, o[Math.floor(s.rand() * o.length)].i); continue; } }
      const ok = ACTIONS.filter((a) => { const t = a.tgt === 'power' ? 'US' : a.tgt ? 'MY' : null; return E.actionState(s, a, t).ok; });
      if (!ok.length) break;
      const a = ok[Math.floor(s.rand() * ok.length)];
      E.doAction(s, a.id, a.tgt === 'power' ? (s.rand() < 0.5 ? 'US' : 'CN') : a.tgt ? Object.keys(s.nations)[Math.floor(s.rand() * 8)] : null);
    }
  },
  smart: (s) => {
    let guard = 12;
    while (s.ap > 0 && guard-- > 0 && !s.over) {
      // 1) urgent crises first (ultimatums, then timer 1 non-opportunities)
      const urgent = [...s.crises].filter((c) => !CRISES[c.tpl].opp).sort((a, b) => (b.tpl === 'ultimatum') - (a.tpl === 'ultimatum') || a.timer - b.timer);
      const c0 = urgent.find((c) => c.tpl === 'ultimatum' || c.timer <= 1);
      if (c0 && resolveBest(s, c0)) continue;
      // 2) keep core gauges healthy
      const g = s.g;
      const hot = Object.entries(s.nations).sort((a, b) => b[1].heat - a[1].heat)[0];
      if (g.stab < 40 && tryAction(s, 'stim')) continue;
      if (g.res < 40 && tryAction(s, 'resil')) continue;
      if (g.det < 35 && tryAction(s, 'modern')) continue;
      if (hot[1].heat > 60 && tryAction(s, 'summit')) continue;
      if (hot[1].heat > 60 && tryAction(s, 'visit', hot[0])) continue;
      // 3) other crises
      const c1 = urgent[0];
      if (c1 && resolveBest(s, c1)) continue;
      // 4) invest
      if (g.hub < 60 && tryAction(s, 'hub')) continue;
      if (s.powers.US.rel < 45 && tryAction(s, 'visit', 'US')) continue;
      if (s.powers.CN.rel < 45 && tryAction(s, 'visit', 'CN')) continue;
      if (g.det < 55 && tryAction(s, 'drill', s.powers.US.rel < s.powers.CN.rel ? 'US' : 'CN')) continue;
      if (g.res < 60 && tryAction(s, 'resil')) continue;
      if (tryAction(s, 'summit')) continue;
      break;
    }
  },
};

function play(botName, seed) {
  const s = E.newGame(seed);
  s.min = { stab: 100, det: 100, hub: 100, res: 100 }; s.ults = 0; s.maxHeat = 0;
  let guard = 60;
  while (!s.over && guard-- > 0) {
    bots[botName](s);
    if (s.over) break;
    const r = E.endTurn(s);
    s.ults += r.created.filter((c) => c.tpl === 'ultimatum').length;
    for (const k of Object.keys(s.min)) s.min[k] = Math.min(s.min[k], s.g[k]);
    s.maxHeat = Math.max(s.maxHeat, ...Object.values(s.nations).map((n) => n.heat));
  }
  return s;
}

for (const name of Object.keys(bots)) {
  let wins = 0, turns = 0, sumScore = 0, winScore = 0, ult = 0;
  const mins = { stab: 0, det: 0, hub: 0, res: 0 }; let mh = 0;
  const causes = {};
  for (let i = 1; i <= N; i++) {
    const s = play(name, i * 7919);
    turns += Math.min(s.turn, E.MAX_TURN); ult += s.ults; mh += s.maxHeat;
    for (const k of Object.keys(mins)) mins[k] += s.min[k];
    sumScore += s.over.score.total;
    if (s.over.result === 'win') { wins++; winScore += s.over.score.total; } else causes[s.over.title] = (causes[s.over.title] || 0) + 1;
  }
  console.log(`${name.padEnd(7)} win ${(100 * wins / N).toFixed(0).padStart(3)}%  avg turns ${(turns / N).toFixed(1)}  avg win-score ${wins ? (winScore / wins).toFixed(0) : '-'}  ults/game ${(ult / N).toFixed(1)} maxHeat ${(mh / N).toFixed(0)} avgMin ${Object.entries(mins).map(([k, v]) => k + ':' + (v / N).toFixed(0)).join(' ')}  losses ${JSON.stringify(causes)}`);
}
