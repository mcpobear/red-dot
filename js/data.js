// Static game data: nations, great powers, player actions and crisis templates.
// Pure data + small effect helpers. No DOM access here.

import { syncDet } from './forces.js';
import { newMinister, ROLES } from './cabinet.js';

export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const otherPower = (c) => (c === 'US' ? 'CN' : 'US');

export const H = {
  // Deterrence is derived from forces; events nudge a short-lived "posture" that fades each turn.
  g: (s, k, d) => {
    if (k === 'det') { s.posture = clamp((s.posture || 0) + d, -40, 40); syncDet(s); }
    else { if (k === 'stab' && d < 0) d = Math.min(-1, Math.round(d * 0.9)); s.g[k] = clamp(s.g[k] + d); }
  },
  war: (s, foe, opts) => { if (!s.war && !s.pendingWar) s.pendingWar = { foe, ...opts }; },
  rel: (s, c, d) => { const o = s.nations[c] || s.powers[c]; if (o) o.rel = clamp(o.rel + d); },
  heat: (s, c, d) => { const o = s.nations[c]; if (o) o.heat = clamp(o.heat + d); },
  money: (s, d) => { s.money = Math.max(0, s.money + d); },
};

export const INTENTS = {
  friendly:    { label: 'Cooperative', tone: 'good' },
  opportunist: { label: 'Opportunist', tone: 'warn' },
  hawkish:     { label: 'Hawkish',     tone: 'bad'  },
  distracted:  { label: 'Distracted',  tone: 'dim'  },
};

// a = bearing from Singapore (deg, clockwise from north), r = radar distance (map units)
export const NATIONS = {
  MY: { name: 'Malaysia',  a: 0,   r: 14, sz: 6.2, rel: 52, heat: 34, lev: 'Water, the Causeway, shared history',
        home: 52, unrest: 15,
        mil: { land: 55, air: 42, sea: 42 },
        bias: { friendly: .20, opportunist: .33, hawkish: .20, distracted: .27 } },
  ID: { name: 'Indonesia', a: 200, r: 16, sz: 6.6, rel: 52, heat: 32, lev: 'Haze, straits and airspace',
        home: 52, unrest: 15,
        mil: { land: 85, air: 60, sea: 70 },
        bias: { friendly: .20, opportunist: .33, hawkish: .20, distracted: .27 } },
  BN: { name: 'Brunei',    a: 80,  r: 32, sz: 4.8, rel: 68, heat: 8, lev: 'Quiet, wealthy, steady',
        home: 68, unrest: 5,
        mil: { land: 12, air: 10, sea: 10 },
        bias: { friendly: .68, opportunist: .12, hawkish: .02, distracted: .18 } },
  TH: { name: 'Thailand',  a: 325, r: 30, sz: 5.4, rel: 60, heat: 15, lev: 'Land-bridge dreams, shaky politics',
        home: 60, unrest: 35,
        mil: { land: 65, air: 55, sea: 45 },
        bias: { friendly: .40, opportunist: .18, hawkish: .05, distracted: .37 } },
  VN: { name: 'Vietnam',   a: 45,  r: 30, sz: 5.4, rel: 64, heat: 10, lev: 'Rising rival hub, South China Sea',
        home: 64, unrest: 10,
        mil: { land: 70, air: 50, sea: 50 },
        bias: { friendly: .58, opportunist: .17, hawkish: .04, distracted: .21 } },
  KH: { name: 'Cambodia',  a: 20,  r: 32, sz: 4.8, rel: 50, heat: 12, lev: 'Beijing-leaning, scam compounds',
        home: 50, unrest: 22,
        mil: { land: 35, air: 12, sea: 10 },
        bias: { friendly: .22, opportunist: .17, hawkish: .04, distracted: .57 } },
  LA: { name: 'Laos',      a: 350, r: 42, sz: 4.6, rel: 55, heat: 10, lev: 'Hydropower and the regional grid',
        home: 55, unrest: 15,
        mil: { land: 28, air: 6, sea: 0 },
        bias: { friendly: .50, opportunist: .12, hawkish: .03, distracted: .35 } },
  MM: { name: 'Myanmar',   a: 300, r: 42, sz: 5.2, rel: 45, heat: 12, lev: 'Instability, refugees, scam hubs',
        home: 46, unrest: 62,
        mil: { land: 60, air: 32, sea: 20 },
        bias: { friendly: .20, opportunist: .16, hawkish: .04, distracted: .60 } },
};

export const POWERS = {
  US: { name: 'Washington', a: 125, r: 44, sz: 5.2 },
  CN: { name: 'Beijing',    a: 25,  r: 52, sz: 5.2 },
};


// Who the great powers court and arm (used for meddling and for fallout from a partnership).
export const PATRON = { US: ['VN', 'TH', 'ID', 'MY', 'BN'], CN: ['KH', 'LA', 'MM', 'MY', 'TH'] };

// ---------- formal partnership with a great power ----------
export function signPact(s, P) {
  const R = otherPower(P);
  s.pact = P; s.pactStrain = 0;
  H.rel(s, P, 10); H.rel(s, R, -15);
  for (const k of PATRON[R]) H.rel(s, k, -2);
  syncDet(s);
}
export function breakPact(s, why = '') {
  const P = s.pact; if (!P) return '';
  const R = otherPower(P);
  s.pact = null; s.pactStrain = 0;
  H.rel(s, P, -15); H.rel(s, R, 5); H.g(s, 'det', -8);
  syncDet(s);
  return `The partnership with ${POWERS[P].name} ends${why ? ': ' + why : ''}.`;
}

// Fictional leaders. Each has a style that quietly changes how your actions land.
export const STYLES = {
  charmer:   { label: 'Charmer',   note: 'State Visits land harder (+4 trust).' },
  dealer:    { label: 'Dealmaker', note: 'Trade Pacts pay more (+4 Hub).' },
  hardliner: { label: 'Hardliner', note: 'Respects strength: Show of Force cows them more, but visits warm them less.' },
  great:     { label: 'Great Power', note: '' },
  proud:     { label: 'Proud',     note: 'Touchy about face: Show of Force costs you extra trust.' },
};
export const LEADERS = {
  MY: { name: 'PM Idris Karim',        style: 'dealer',    quip: 'Never met a deal he did not want a cut of.' },
  ID: { name: 'President Wiratama',    style: 'charmer',   quip: 'Loves a summit, a handshake and a photo.' },
  BN: { name: 'Sultan Omar',           style: 'dealer',    quip: 'Patient, wealthy, allergic to drama.' },
  TH: { name: 'PM Rattanakul',         style: 'charmer',   quip: 'Smiles first, decides later.' },
  VN: { name: 'Gen. Sec. Hoang',       style: 'hardliner', quip: 'Counts your ships before he counts your words.' },
  KH: { name: 'PM Sokha',              style: 'proud',     quip: 'Leans toward Beijing and hates being reminded.' },
  LA: { name: 'President Keomany',     style: 'dealer',    quip: 'Wants power lines, not problems.' },
  MM: { name: 'Gen. Min Thura',        style: 'hardliner', quip: 'Rules by the barrel and trusts nobody.' },
  US: { name: 'President Hale',        style: 'great',     quip: 'Wants allies who show up and pay their share.' },
  CN: { name: 'Premier Lin',           style: 'great',     quip: 'Patient, polite and very hard to say no to.' },
};
// A leader can change (regime change), so the live one is stored on the nation.
export const leaderOf = (s, c) => (s && s.nations && s.nations[c] && s.nations[c].leader) || LEADERS[c];
export const leaderName = (c, s) => { const L = leaderOf(s, c); return L ? L.name : ''; };

// Who might replace a regime that falls: a reformer who warms to Singapore, or a hardliner who does not.
export const REGIMES = {
  MY: { reformer: { name: 'PM Aisha Rahman', style: 'charmer', quip: 'A reformer who wants investors and quiet borders.' },
        strongman: { name: 'PM Zulkifli Hadi', style: 'hardliner', quip: 'Rose on grievance politics. Water is a lever to him.' } },
  ID: { reformer: { name: 'President Dewi Santoso', style: 'dealer', quip: 'A technocrat who wants the straits calm and trade flowing.' },
        strongman: { name: 'President Jati', style: 'hardliner', quip: 'A nationalist who counts every ship in the strait.' } },
  BN: { reformer: { name: 'Sultan Hafiz', style: 'charmer', quip: 'Younger, outward-looking, fond of Singapore.' },
        strongman: { name: 'Regent Pengiran Ali', style: 'proud', quip: 'Guards the palace and its pride.' } },
  TH: { reformer: { name: 'PM Napat Srisai', style: 'charmer', quip: 'An elected reformer, popular and cautious.' },
        strongman: { name: 'Gen. Chatchai', style: 'hardliner', quip: 'Seized power "temporarily". Trusts the barracks.' } },
  VN: { reformer: { name: 'Gen. Sec. Lan Anh', style: 'dealer', quip: 'Wants the southern factories humming and the Strait calm.' },
        strongman: { name: 'Gen. Sec. Truong', style: 'hardliner', quip: 'Sees every neighbour as a rival hub.' } },
  KH: { reformer: { name: 'PM Vanna', style: 'dealer', quip: 'Wants clean investment and a seat at the table.' },
        strongman: { name: 'PM Sok Heng', style: 'proud', quip: 'Leans on Beijing and bristles at lectures.' } },
  LA: { reformer: { name: 'President Souk', style: 'dealer', quip: 'Sells power and wants more buyers.' },
        strongman: { name: 'President Khamla', style: 'hardliner', quip: 'Closes ranks, closes borders.' } },
  MM: { reformer: { name: 'President Thida', style: 'charmer', quip: 'A civilian caretaker. Fragile, but she wants friends.' },
        strongman: { name: 'Gen. Aung Kyaw', style: 'hardliner', quip: 'A harder general who trusts nobody.' } },
};

// Disputes between the neighbours themselves. 'base' is the resting tension.
export const FEUDS = {
  'MM-TH': { a: 'MM', b: 'TH', base: 45, why: 'border fighting and refugees' },
  'KH-TH': { a: 'KH', b: 'TH', base: 50, why: 'a disputed border' },
  'MY-ID': { a: 'MY', b: 'ID', base: 35, why: 'maritime borders' },
  'MY-TH': { a: 'MY', b: 'TH', base: 25, why: 'the southern border' },
  'MY-BN': { a: 'MY', b: 'BN', base: 18, why: 'offshore claims' },
  'VN-KH': { a: 'VN', b: 'KH', base: 28, why: 'old suspicions' },
  'LA-TH': { a: 'LA', b: 'TH', base: 18, why: 'river and trade disputes' },
  'ID-VN': { a: 'ID', b: 'VN', base: 20, why: 'fishing waters in the South China Sea' },
};
export const feudKey = (a, b) => (FEUDS[`${a}-${b}`] ? `${a}-${b}` : FEUDS[`${b}-${a}`] ? `${b}-${a}` : null);

// Covert support for opposition factions. Success raises unrest; enough unrest topples the regime,
// which can bring in a reformer or a hardliner. Exposure wrecks trust.

// ---------- nuclear programme ----------
function nukeInvest(s) {
  const k = s.nuke, before = k.prog;
  k.prog = Math.min(k.halted ? 60 : 100, k.prog + 12 + (s.g.hub >= 60 ? 3 : 0));
  for (const c of Object.keys(s.nations)) H.heat(s, c, c === 'MY' || c === 'ID' ? 4 : 2);
  let note = `Programme ${Math.round(k.prog)}%`, log = null;
  if (!k.power && before < 35 && k.prog >= 35) {
    k.power = true; H.g(s, 'res', 12);
    note = 'Nuclear power plant online: Resilience +12, cheaper power from now on.';
    log = { text: 'Singapore\'s first nuclear power plant came online.', w: 60, tone: 'good' };
  }
  if (!k.device && k.prog >= 100) {
    k.device = true; k.prog = 100;
    for (const c of Object.keys(s.nations)) { H.rel(s, c, -15); H.heat(s, c, 12); }
    for (const p of ['US', 'CN']) H.rel(s, p, -10);
    H.g(s, 'hub', -8); H.g(s, 'stab', 5);
    note = 'Singapore has a nuclear deterrent. Deterrence jumps, but every capital is alarmed and sanctions bite (Hub −8).';
    log = { text: 'Singapore completed a nuclear deterrent.', w: 100, tone: 'good' };
  }
  return log ? { note, log } : note;
}

export function regimeChange(s, t) {
  const n = s.nations[t], R = REGIMES[t], old = leaderName(t, s);
  const reformer = s.rand() < (n.rel >= 50 ? 0.55 : 0.45);
  n.leader = { ...(reformer ? R.reformer : R.strongman) };
  n.unrest = 30;
  if (reformer) { H.rel(s, t, 15); n.heat = clamp(n.heat - 20); n.intent = 'friendly'; }
  else { H.rel(s, t, -15); n.heat = clamp(n.heat + 12); n.intent = 'hawkish'; }
  for (const k of Object.keys(s.nations)) if (k !== t) H.rel(s, k, -2);
  const txt = reformer
    ? `${old} falls. ${n.leader.name} takes over and wants better ties with Singapore.`
    : `${old} falls. ${n.leader.name} takes over and is colder to Singapore.`;
  return { note: txt, log: { text: `Regime change in ${NATIONS[t].name}: ${txt}`, w: 95, tone: reformer ? 'good' : 'bad' } };
}
function covertOp(s, t) {
  const n = s.nations[t], L = leaderOf(s, t), nm = NATIONS[t].name;
  const prior = n.covert || 0;
  const p = clamp(55 + (n.scout > 0 ? 10 : 0) - (L.style === 'hardliner' ? 12 : 0) - prior * 6, 25, 85);
  n.covert = prior + 1;
  if (s.rand() * 100 < p) {
    const gain = 14 + Math.floor(s.rand() * 10);
    n.unrest = clamp((n.unrest || 0) + gain);
    H.heat(s, t, -8);
    if (n.unrest >= 75) return regimeChange(s, t);
    return `Your network takes root in ${nm}: unrest +${gain}, and their attention turns inward.`;
  }
  H.rel(s, t, -20); H.heat(s, t, 15); H.g(s, 'stab', -2);
  for (const k of Object.keys(s.nations)) if (k !== t) H.rel(s, k, -2);
  return { note: `Exposed! ${nm} accuses Singapore of meddling. Trust collapses.`, log: { text: `Your covert network in ${nm} was exposed.`, w: 70, tone: 'bad' } };
}


// Called after an action resolves. Returns a short note if the leader's style mattered.
export function leaderBonus(s, id, t) {
  const L = leaderOf(s, t); if (!L || !s.nations[t]) return '';
  const st = L.style;
  if (id === 'visit' && st === 'charmer') { H.rel(s, t, 4); return `${L.name} loves the pageantry: +4 trust`; }
  if (id === 'visit' && st === 'hardliner') { H.rel(s, t, -3); return `${L.name} is unmoved by ceremony: −3 trust`; }
  if (id === 'trade' && st === 'dealer') { H.g(s, 'hub', 4); return `${L.name} sweetens the deal: +4 Hub`; }
  if (id === 'signal' && st === 'hardliner') { s.nations[t].heat = clamp(s.nations[t].heat - 6); return `${L.name} respects strength: −6 tension`; }
  if (id === 'signal' && st === 'proud') { H.rel(s, t, -6); return `${L.name} takes it personally: −6 trust`; }
  return '';
}

const hostile = (n) => n.intent === 'hawkish' || n.intent === 'opportunist';

// cat: dip | eco | int | def.  tgt: nation | power | any | null
export const ACTIONS = [
  { id: 'visit', cat: 'dip', tgt: 'any', ap: 1, cost: 3, name: 'State Visit',
    desc: '+10 trust, −6 tension. Courting one great power cools the other by 3.',
    fx: (s, t) => { H.rel(s, t, 10); if (s.nations[t]) H.heat(s, t, -6); else H.rel(s, otherPower(t), -3); } },
  { id: 'trade', cat: 'dip', tgt: 'nation', ap: 1, cost: 6, name: 'Trade Pact',
    desc: '+6 trust, +6 Hub. Needs trust 45+.',
    req: (s, t) => (s.nations[t].rel < 45 ? 'Needs trust 45+' : ''),
    fx: (s, t) => { H.rel(s, t, 6); H.g(s, 'hub', 6); } },
  { id: 'pact', cat: 'dip', tgt: 'power', ap: 1, cost: 6, name: 'Sign a Partnership',
    desc: 'Washington: +12 Deterrence, 15% off its arms, advanced kit unlocked. Beijing: +$4B income and +1 Hub a turn. The rival freezes you out, neighbours in its camp cool, and your partner will ask favours. Needs trust 65+.',
    req: (s, t) => (s.pact ? 'Already in a partnership' : s.powers[t] && s.powers[t].rel < 65 ? `Needs ${POWERS[t].name} trust 65+` : ''),
    fx: (s, t) => { signPact(s, t); return { note: `Partnership signed with ${POWERS[t].name}. ${POWERS[otherPower(t)].name} is not pleased.`, log: { text: `Signed a partnership with ${POWERS[t].name}.`, w: 70, tone: 'good' } }; } },
  { id: 'unpact', cat: 'dip', tgt: null, ap: 1, cost: 0, name: 'End the Partnership',
    desc: 'Walk away from your great-power partner. They take it badly (−15 trust, −8 Deterrence); the rival warms a little.',
    req: (s) => (s.pact ? '' : 'No partnership to end'),
    fx: (s) => breakPact(s, 'at your request') },
  { id: 'summit', cat: 'dip', tgt: null, ap: 1, cost: 2, cd: 2, name: 'ASEAN Summit Push',
    desc: 'Tension −4 and trust +2 across the region.',
    fx: (s) => { for (const c of Object.keys(s.nations)) { H.heat(s, c, -4); H.rel(s, c, 2); } } },
  { id: 'hedge', cat: 'dip', tgt: null, ap: 1, cost: 5, name: 'Balance the Giants',
    desc: '+4 trust with both Washington and Beijing.',
    fx: (s) => { H.rel(s, 'US', 4); H.rel(s, 'CN', 4); } },

  { id: 'hub', cat: 'eco', tgt: null, ap: 1, cost: 10, name: 'Invest in the Hub',
    desc: '+8 Hub. Ports, airport, finance, talent.',
    fx: (s) => { H.g(s, 'hub', 8); } },
  { id: 'resil', cat: 'eco', tgt: null, ap: 1, cost: 10, name: 'Resilience Programme',
    desc: '+8 Resilience. Water, food, power.',
    fx: (s) => { H.g(s, 'res', 8); } },
  { id: 'stim', cat: 'eco', tgt: null, ap: 1, cost: 8, name: 'Public Package',
    desc: '+8 Stability. Vouchers and rebates.',
    fx: (s) => { H.g(s, 'stab', 8); } },

  { id: 'scout', cat: 'int', tgt: 'nation', ap: 1, cost: 1, name: 'Scout Intentions',
    desc: 'Reveals hidden intent and exact odds against this nation for 6 turns.',
    fx: (s, t) => { s.nations[t].scout = 6; } },
  { id: 'covert', cat: 'int', tgt: 'nation', ap: 1, cost: 8, name: 'Back Opposition Factions',
    desc: 'Covertly back the regime\'s rivals. Unrest rises and they look inward. Push far enough and the government falls, bringing a reformer or a hardliner. Odds fall each time you try; get caught and trust collapses.',
    fx: (s, t) => covertOp(s, t) },
  { id: 'counter', cat: 'int', tgt: null, ap: 1, cost: 4, name: 'Counter-Espionage',
    desc: 'Blocks cyber incidents for 4 turns.',
    fx: (s) => { s.shield = 4; } },

  { id: 'nuke', cat: 'def', tgt: null, ap: 1, cost: 12, name: 'Nuclear Programme',
    desc: 'Slow, costly and hard to hide. Around 35% brings a civil nuclear plant (+Resilience, cheaper power). At 100% Singapore has a strategic deterrent, but the region will not take it calmly.',
    dyn: (s) => (s.nuke ? `Progress ${Math.round(s.nuke.prog)}%${s.nuke.power ? ' · plant online' : ''}${s.nuke.exposed ? ' · exposed' : ''}` : ''),
    req: (s) => (s.nuke && s.nuke.device ? 'Programme complete' : s.nuke && s.nuke.halted && s.nuke.prog >= 60 ? 'Capped by agreement' : ''),
    fx: (s) => nukeInvest(s) },
  { id: 'drill', cat: 'def', tgt: 'power', ap: 1, cost: 5, name: 'Joint Exercise',
    desc: '+8 posture (fades), +5 trust with that power (the other cools by 3).',
    fx: (s, t) => { H.g(s, 'det', 8); H.rel(s, t, 5); H.rel(s, otherPower(t), -3); } },
  { id: 'signal', cat: 'def', tgt: 'nation', ap: 1, cost: 4, name: 'Show of Force',
    desc: '+3 Deterrence. Cows hawks (−10 tension) but riles the rest (+8, −8 trust).',
    fx: (s, t) => {
      const n = s.nations[t]; H.g(s, 'det', 3);
      if (hostile(n)) n.heat = clamp(n.heat - 10);
      else { n.heat = clamp(n.heat + 8); H.rel(s, t, -8); }
    } },
  { id: 'war', cat: 'def', tgt: 'nation', ap: 1, cost: 0, name: 'Go to War',
    desc: 'Open hostilities. You will see a force comparison first. Neighbours will not forget it.',
    fx: (s, t) => { H.war(s, t, { aggressor: true, start: 5, reason: 'strike' }); } },
];

export const CATS = { dip: 'Diplomacy', eco: 'Economy', int: 'Intel', def: 'Defence' };

// Crisis templates. Options: ap/cost, fx (safe) or brink:true with win/lose (risky).
// `free` options cost no AP but hurt (ride it out). erupt() runs if the timer hits zero.
export const CRISES = {
  haze: {
    icon: '🌫️', nations: ['ID'], w: 3, timer: 3,
    title: () => 'Haze Season',
    text: () => 'Peatland fires in Sumatra blanket the island in smoke. Schools close and voters grumble.',
    erupt: (s) => { H.g(s, 'stab', -10); H.rel(s, 'ID', -4); return 'Smoke settles in. Stability −10.'; },
    options: [
      { label: 'Fund fire-fighting aid', sub: 'Costly, earns goodwill', ap: 1, cost: 6,
        fx: (s, c) => { H.rel(s, c.nation, 8); H.g(s, 'stab', 3); H.heat(s, c.nation, -5); } },
      { label: 'Press Jakarta publicly', sub: 'Could land, could sour ties', ap: 1, cost: 0, brink: true,
        w: 'Jakarta commits to action.', l: 'Jakarta bristles at the lecture.',
        win: (s, c) => { H.rel(s, c.nation, 3); H.heat(s, c.nation, -5); H.g(s, 'stab', 4); },
        lose: (s, c) => { H.rel(s, c.nation, -12); H.heat(s, c.nation, 10); } },
      { label: 'Ride it out', sub: 'Free, but the public suffers', ap: 0, cost: 0, free: true,
        fx: (s) => { H.g(s, 'stab', -7); } },
    ],
  },
  water: {
    icon: '💧', nations: ['MY'], w: 3, timer: 3,
    title: () => 'Water Price Talks',
    text: () => 'Johor wants a steep rise for raw water. The agreement clock is ticking.',
    erupt: (s) => { H.g(s, 'res', -10); H.heat(s, 'MY', 8); return 'Johor tightens the tap. Resilience −10.'; },
    options: [
      { label: 'Pay the premium', sub: 'Buys calm and a little supply', ap: 1, cost: 8,
        fx: (s, c) => { H.rel(s, c.nation, 6); H.heat(s, c.nation, -8); H.g(s, 'res', 2); } },
      { label: 'Stand firm', sub: 'Call their bluff', ap: 1, cost: 0, brink: true,
        w: 'They blink first.', l: 'They cut the flow to prove a point.',
        win: (s, c) => { H.rel(s, c.nation, 2); H.heat(s, c.nation, -6); H.g(s, 'hub', 3); },
        lose: (s, c) => { H.g(s, 'res', -12); H.rel(s, c.nation, -10); H.heat(s, c.nation, 12); } },
      { label: 'Secure the pumping stations', sub: 'Opens a war with Malaysia', ap: 1, cost: 0,
        fx: (s, c) => { H.war(s, c.nation, { aggressor: true, start: 5, reason: 'supply' }); } },
      { label: 'Accelerate NEWater', sub: 'Long-term answer, +10 Resilience', ap: 1, cost: 9,
        fx: (s, c) => { H.g(s, 'res', 10); H.rel(s, c.nation, -2); H.heat(s, c.nation, -3); } },
      { label: 'Ride it out', sub: 'Free, but supplies suffer', ap: 0, cost: 0, free: true,
        fx: (s, c) => { H.g(s, 'res', -8); H.rel(s, c.nation, -3); } },
    ],
  },
  standoff: {
    icon: '🚢', nations: ['MY', 'ID'], w: 3, timer: 2,
    title: () => 'Patrol Boat Standoff',
    text: (n) => `Coast guard vessels shadow each other near the maritime boundary with ${n}. Cameras are rolling.`,
    erupt: (s, c) => { H.g(s, 'stab', -6); H.g(s, 'det', -4); H.heat(s, c.nation, 6); return 'The standoff drags on. Stability −6, Deterrence −4.'; },
    options: [
      { label: 'Hold position', sub: 'Show resolve', ap: 1, cost: 0, brink: true,
        w: 'They turn away.', l: 'A collision. Both sides blame you.',
        win: (s, c) => { H.heat(s, c.nation, -10); H.g(s, 'det', 3); H.g(s, 'stab', 3); },
        lose: (s, c) => { H.g(s, 'det', -6); H.g(s, 'stab', -6); H.rel(s, c.nation, -8); H.heat(s, c.nation, 10); } },
      { label: 'Open fire', sub: 'Opens a war', ap: 1, cost: 0,
        fx: (s, c) => { H.war(s, c.nation, { aggressor: true, start: 5, reason: 'standoff' }); } },
      { label: 'Quiet backchannel', sub: 'Slower if they are hawkish', ap: 1, cost: 2,
        fx: (s, c) => { H.rel(s, c.nation, 4); H.heat(s, c.nation, s.nations[c.nation].intent === 'hawkish' ? -2 : -6); } },
      { label: 'Pull back', sub: 'Free, but it looks weak', ap: 0, cost: 0, free: true,
        fx: (s, c) => { H.g(s, 'det', -5); H.g(s, 'stab', -4); H.heat(s, c.nation, -8); } },
    ],
  },
  piracy: {
    icon: '🏴‍☠️', nations: ['ID', 'MY'], w: 2, timer: 3,
    title: () => 'Strait Piracy Surge',
    text: () => 'Armed boardings in the Strait. Insurers raise premiums on every ship calling at Singapore.',
    erupt: (s) => { H.g(s, 'hub', -8); return 'Insurers flee. Hub −8.'; },
    options: [
      { label: 'Joint patrols', sub: 'Shared burden, shared credit', ap: 1, cost: 5,
        fx: (s, c) => { H.rel(s, c.nation, 5); H.g(s, 'hub', 3); H.g(s, 'det', 2); } },
      { label: 'Go it alone', sub: 'Faster, but bruises egos', ap: 1, cost: 5,
        fx: (s, c) => { H.g(s, 'det', 4); H.g(s, 'hub', 4); H.rel(s, c.nation, -5); } },
      { label: 'Ignore it', sub: 'Free, but trade takes the hit', ap: 0, cost: 0, free: true,
        fx: (s) => { H.g(s, 'hub', -8); } },
    ],
  },
  refugees: {
    icon: '🧳', nations: ['MM', 'TH'], w: 2, timer: 3,
    title: () => 'Refugee Surge',
    text: () => 'Conflict in Myanmar sends thousands across borders. ASEAN looks to its richest member.',
    erupt: (s, c) => { H.g(s, 'stab', -6); H.rel(s, c.nation, -3); return 'Pressure builds at home. Stability −6.'; },
    options: [
      { label: 'Fund ASEAN relief', sub: 'Humanitarian, earns trust', ap: 1, cost: 6,
        fx: (s, c) => { H.rel(s, c.nation, 5); H.g(s, 'stab', -1); H.g(s, 'hub', 2); } },
      { label: 'Tighten borders', sub: 'Calms voters, chills ties', ap: 1, cost: 2,
        fx: (s, c) => { H.g(s, 'stab', 2); H.rel(s, c.nation, -6); } },
      { label: 'Ignore it', sub: 'Free, but voters notice', ap: 0, cost: 0, free: true,
        fx: (s) => { H.g(s, 'stab', -6); } },
    ],
  },
  scam: {
    icon: '📵', nations: ['KH', 'MM', 'LA'], w: 3, timer: 3,
    title: () => 'Scam Compound Crackdown',
    text: (n) => `Fraud rings across the border in ${n} are draining Singaporean savings. Victims are going public.`,
    erupt: (s) => { H.g(s, 'stab', -7); return 'Losses mount. Stability −7.'; },
    options: [
      { label: 'Lean on the capital', sub: 'Demand a crackdown', ap: 1, cost: 0, brink: true,
        w: 'Raids begin within days.', l: 'They stonewall and resent the pressure.',
        win: (s, c) => { H.g(s, 'stab', 6); H.rel(s, c.nation, 3); H.g(s, 'hub', 2); },
        lose: (s, c) => { H.rel(s, c.nation, -10); H.heat(s, c.nation, 8); } },
      { label: 'Fund a joint taskforce', sub: 'Slow, steady, cooperative', ap: 1, cost: 5,
        fx: (s, c) => { H.g(s, 'stab', 5); H.rel(s, c.nation, 5); } },
      { label: 'Ignore it', sub: 'Free, but trust erodes', ap: 0, cost: 0, free: true,
        fx: (s) => { H.g(s, 'stab', -7); } },
    ],
  },
  portrival: {
    icon: '⚓', nations: ['MY', 'VN', 'TH', 'ID'], w: 3, timer: 3,
    title: () => 'Rival Mega-Port Opens',
    text: (n) => `${n} opens a giant deep-water port. Shipping lines are tempted by lower fees.`,
    erupt: (s) => { H.g(s, 'hub', -10); return 'Cargo drifts away. Hub −10.'; },
    options: [
      { label: 'Automate our own port', sub: 'Out-compete them', ap: 1, cost: 9,
        fx: (s) => { H.g(s, 'hub', 8); } },
      { label: 'Partner with them', sub: 'Turn a rival into a feeder', ap: 1, cost: 3,
        fx: (s, c) => { H.rel(s, c.nation, 8); H.g(s, 'hub', 2); H.heat(s, c.nation, -4); } },
      { label: 'Ignore it', sub: 'Free, but the Hub bleeds', ap: 0, cost: 0, free: true,
        fx: (s) => { H.g(s, 'hub', -10); } },
    ],
  },
  landbridge: {
    icon: '🛤️', nations: ['TH'], w: 2, timer: 3,
    title: () => 'Land-Bridge Plan',
    text: () => 'Bangkok revives a canal and rail bridge to bypass the Strait, with Beijing quietly interested.',
    erupt: (s) => { H.g(s, 'hub', -8); return 'The plan gains momentum. Hub −8.'; },
    options: [
      { label: 'Offer a joint logistics deal', sub: 'Stay in the loop', ap: 1, cost: 6,
        fx: (s, c) => { H.rel(s, c.nation, 8); H.rel(s, 'CN', 4); H.g(s, 'hub', 3); } },
      { label: 'Lobby Washington', sub: 'Raise concerns, lean west', ap: 1, cost: 2,
        fx: (s) => { H.rel(s, 'US', 6); H.rel(s, 'CN', -4); H.g(s, 'hub', 2); } },
      { label: 'Ignore it', sub: 'Free, but the Hub bleeds', ap: 0, cost: 0, free: true,
        fx: (s) => { H.g(s, 'hub', -8); } },
    ],
  },
  grid: {
    icon: '⚡', nations: ['LA', 'MY'], w: 2, timer: 3,
    title: () => 'Regional Grid Shock',
    text: () => 'Hydropower exports stall and spot electricity prices spike across the region.',
    erupt: (s) => { H.g(s, 'stab', -5); H.g(s, 'res', -6); return 'Blackouts hit. Stability −5, Resilience −6.'; },
    options: [
      { label: 'Diversify our energy', sub: 'Long-term fix, +10 Resilience', ap: 1, cost: 8,
        fx: (s) => { H.g(s, 'res', 10); } },
      { label: 'Buy at spot prices', sub: 'Expensive stopgap', ap: 1, cost: 11,
        fx: (s) => { H.g(s, 'res', 4); H.g(s, 'stab', 2); } },
      { label: 'Ride it out', sub: 'Free, but lights flicker', ap: 0, cost: 0, free: true,
        fx: (s) => { H.g(s, 'stab', -5); H.g(s, 'res', -6); } },
    ],
  },
  scs: {
    icon: '🌊', nations: ['VN'], w: 2, timer: 2,
    title: () => 'South China Sea Flare-up',
    text: () => 'Ships collide near disputed reefs. Washington and Beijing both ask where you stand.',
    erupt: (s) => { H.rel(s, 'US', -3); H.rel(s, 'CN', -3); return 'Silence satisfies no one. Both powers cool by 3.'; },
    options: [
      { label: 'Call for ASEAN restraint', sub: 'Neutral and modest', ap: 1, cost: 0,
        fx: (s, c) => { H.rel(s, 'US', 2); H.rel(s, 'CN', 2); H.rel(s, c.nation, 3); } },
      { label: "Back Washington's line", sub: 'Deterrence up, Beijing cools', ap: 1, cost: 0,
        fx: (s, c) => { H.rel(s, 'US', 10); H.rel(s, 'CN', -10); H.rel(s, c.nation, 4); H.g(s, 'det', 3); } },
      { label: "Back Beijing's line", sub: 'Trade up, Washington cools', ap: 1, cost: 0,
        fx: (s, c) => { H.rel(s, 'CN', 10); H.rel(s, 'US', -10); H.rel(s, c.nation, -6); H.g(s, 'hub', 3); } },
      { label: 'Say nothing', sub: 'Free, but both notice', ap: 0, cost: 0, free: true,
        fx: (s) => { H.rel(s, 'US', -3); H.rel(s, 'CN', -3); } },
    ],
  },
  coup: {
    icon: '🪖', nations: ['TH', 'MM'], w: 1, timer: 2,
    title: (n) => `${n}: Military Takes Power`,
    text: (n) => `Troops seize key buildings in ${n}. Capital flows and investors both look for the exit.`,
    onSpawn: (s, c) => { const n = s.nations[c.nation]; n.heat = clamp(n.heat + 10); n.intent = 'distracted'; },
    erupt: (s) => { H.g(s, 'hub', -5); return 'Investors wobble. Hub −5.'; },
    options: [
      { label: 'Engage the new government', sub: 'Pragmatic, keeps channels open', ap: 1, cost: 2,
        fx: (s, c) => { H.rel(s, c.nation, 4); H.g(s, 'hub', 1); } },
      { label: 'Condemn the takeover', sub: 'Principled, but chills ties', ap: 1, cost: 0,
        fx: (s, c) => { H.rel(s, c.nation, -12); H.g(s, 'stab', 3); H.heat(s, c.nation, 5); } },
      { label: 'Wait and see', sub: 'Free, but markets wobble', ap: 0, cost: 0, free: true,
        fx: (s) => { H.g(s, 'hub', -5); } },
    ],
  },
  cyber: {
    icon: '🛰️', nations: ['MY', 'ID', 'VN', 'MM', 'KH', 'CN'], w: 2, timer: 2,
    title: () => 'Cyber Intrusion',
    text: (n) => `Government networks are probed, with traces leading toward ${n}. Data may already be out.`,
    erupt: (s) => { H.g(s, 'stab', -6); H.g(s, 'hub', -4); return 'Data leaks. Stability −6, Hub −4.'; },
    options: [
      { label: 'Hunt the intruders', sub: 'Quiet, competent response', ap: 1, cost: 5,
        fx: (s) => { H.g(s, 'det', 4); H.g(s, 'stab', 2); } },
      { label: 'Name and shame', sub: 'Strong signal, big risk', ap: 1, cost: 0, brink: true,
        w: 'The attribution sticks.', l: 'They deny it and hit back diplomatically.',
        win: (s, c) => { H.g(s, 'det', 5); H.g(s, 'stab', 4); H.heat(s, c.nation, -6); },
        lose: (s, c) => { H.rel(s, c.nation, -10); H.g(s, 'hub', -4); } },
      { label: 'Ignore it', sub: 'Free, but trust in government dips', ap: 0, cost: 0, free: true,
        fx: (s) => { H.g(s, 'stab', -6); H.g(s, 'hub', -4); } },
    ],
  },
  demand: {
    icon: '🏛️', nations: ['US', 'CN'], w: 2, timer: 2,
    title: (n) => `${n} Requests Access`,
    text: (n) => `${n} asks for expanded port and airfield access. Saying yes pleases one giant and unsettles the other.`,
    erupt: (s, c) => { H.rel(s, c.nation, -8); return 'Ignoring the request stings. Trust −8.'; },
    options: [
      { label: 'Grant access', sub: 'Closer to them, cooler to the other', ap: 1, cost: 0,
        fx: (s, c) => { H.rel(s, c.nation, 12); H.rel(s, otherPower(c.nation), -10); if (c.nation === 'US') H.g(s, 'det', 4); else H.g(s, 'hub', 4); } },
      { label: 'Stall politely', sub: 'Bluff for time', ap: 1, cost: 0, brink: true,
        w: 'They accept the delay.', l: 'They read it as a snub.',
        win: (s, c) => { H.rel(s, c.nation, 2); H.rel(s, otherPower(c.nation), 2); },
        lose: (s, c) => { H.rel(s, c.nation, -12); } },
      { label: 'Decline', sub: 'Free, but they cool', ap: 0, cost: 0, free: true,
        fx: (s, c) => { H.rel(s, c.nation, -5); H.rel(s, otherPower(c.nation), 2); } },
    ],
  },
  ultimatum: {
    icon: '🔥', nations: [], w: 0, timer: 2,
    title: (n) => `Ultimatum: ${n}`,
    text: (n) => `${n} demands concessions and moves forces. This is the moment everything hinges on.`,
    erupt: (s, c) => {
      H.g(s, 'stab', -10); H.g(s, 'hub', -6); H.heat(s, c.nation, -10);
      H.war(s, c.nation, { aggressor: false, start: -20, reason: 'ultimatum' });
      return 'Forces move while you hesitate. They strike first. War!';
    },
    options: [
      { label: 'Stand firm', sub: 'Deterrence decides this', ap: 1, cost: 0, brink: true,
        pfn: (s, c) => { const n = s.nations[c.nation]; return 38 + (s.g.det - 50) * 0.6 + (n.rel - 50) * 0.15 - (n.intent === 'hawkish' ? 8 : 0); },
        w: 'They back down.', l: 'They call the bluff. War!',
        win: (s, c) => { H.heat(s, c.nation, -35); H.g(s, 'det', 5); H.g(s, 'stab', 8); },
        lose: (s, c) => { H.g(s, 'stab', -10); H.g(s, 'hub', -6); H.heat(s, c.nation, -10); H.war(s, c.nation, { aggressor: false, start: -15, reason: 'ultimatum' }); } },
      { label: 'Mobilise and fight', sub: 'Meet force with force. Opens a war', ap: 1, cost: 0,
        fx: (s, c) => { H.war(s, c.nation, { aggressor: false, start: 0, reason: 'ultimatum' }); } },
      { label: 'Rally a great power', sub: 'Phone Washington or Beijing', ap: 1, cost: 4, brink: true,
        pfn: (s) => 40 + (Math.max(s.powers.US.rel, s.powers.CN.rel) - 50) * 0.6,
        w: 'A powerful call cools tempers.', l: 'Nobody picks up in time.',
        win: (s, c) => { H.heat(s, c.nation, -25); H.g(s, 'det', 3); },
        lose: (s, c) => { H.heat(s, c.nation, -5); H.g(s, 'stab', -10); } },
      { label: 'Concede quietly', sub: 'Painful, but it is over', ap: 1, cost: 0,
        fx: (s, c) => { H.g(s, 'stab', -14); H.g(s, 'hub', -8); H.heat(s, c.nation, -25); H.rel(s, c.nation, 5); } },
    ],
  },

  call_favor: {
    icon: '📞', opp: true, call: true, nations: ['MY', 'ID', 'BN', 'TH', 'VN', 'KH', 'LA', 'MM'], w: 2, timer: 1,
    title: (n) => `Late Call from ${n}`,
    text: (n, c, s) => `Your phone buzzes past midnight. It is ${leaderName(c.nation, s)}, friendly but wanting something: public backing in a regional spat.`,
    erupt: () => 'The call goes to voicemail. They do not call back.',
    options: [
      { label: 'Back them publicly', sub: '+8 trust, but others notice (+3 tension elsewhere)', ap: 1, cost: 0,
        fx: (s, c) => { H.rel(s, c.nation, 8); for (const k of Object.keys(s.nations)) if (k !== c.nation) H.heat(s, k, 3); } },
      { label: 'Decline politely', sub: '−2 trust', ap: 0, cost: 0, free: true, fx: (s, c) => { H.rel(s, c.nation, -2); } },
    ],
  },
  call_tip: {
    icon: '🕵️', opp: true, call: true, nations: ['MY', 'ID', 'TH', 'VN', 'KH', 'MM'], w: 2, timer: 1,
    title: (n) => `Quiet Word from ${n}`,
    text: (n, c, s) => `${leaderName(c.nation, s)} lets something slip over a secure line: a hint of what they really intend. You could press for more.`,
    erupt: () => 'The line goes dead.',
    options: [
      { label: 'Press for the details', sub: 'Free scout for 4 turns, +2 trust', ap: 1, cost: 0,
        fx: (s, c) => { s.nations[c.nation].scout = Math.max(s.nations[c.nation].scout, 4); H.rel(s, c.nation, 2); } },
      { label: 'Let it lie', sub: 'Nothing happens', ap: 0, cost: 0, free: true, fx: () => {} },
    ],
  },
  call_warning: {
    icon: '☎️', call: true, nations: ['MY', 'ID', 'VN', 'MM', 'KH'], w: 2, timer: 1,
    title: (n) => `Warning Call from ${n}`,
    text: (n, c, s) => `${leaderName(c.nation, s)} is on the line and not smiling. Patience is "running thin". Say the right thing, or the temperature rises.`,
    erupt: (s, c) => { H.heat(s, c.nation, 6); H.g(s, 'stab', -2); return 'Silence reads as weakness. Tension +6, Stability −2.'; },
    options: [
      { label: 'Reassure them', sub: 'A gamble. Win: tension −15. Lose: +5', ap: 1, cost: 0, brink: true,
        w: 'The tone softens.', l: 'They hear weakness.',
        win: (s, c) => { H.heat(s, c.nation, -15); }, lose: (s, c) => { H.heat(s, c.nation, 5); } },
      { label: 'Hold the line', sub: '+3 Deterrence posture, +4 tension', ap: 1, cost: 0,
        fx: (s, c) => { H.g(s, 'det', 3); H.heat(s, c.nation, 4); } },
    ],
  },
  gp_buildup: {
    icon: '🛰️', nations: [], w: 0, timer: 3,
    title: (n, c) => `${n} Arms ${c && c.other ? NATIONS[c.other].name : 'a Neighbour'}`,
    text: (n, c) => `${n} is moving advanced weapons into ${NATIONS[c.other].name}. Planners in Singapore are counting what that does to the balance on the Strait.`,
    erupt: (s, c) => { H.g(s, 'det', -4); H.heat(s, c.other, 3); return `The balance tilts. Deterrence −4, ${NATIONS[c.other].name} tension +3.`; },
    options: [
      { label: 'Protest quietly', sub: 'A gamble. Win: they ease off. Lose: they resent it', ap: 1, cost: 0, brink: true,
        pfn: (s, c) => 45 + (s.powers[c.nation].rel - 50) * 0.3,
        w: 'The message lands.', l: 'They shrug and stiffen.',
        win: (s, c) => { H.rel(s, c.nation, 4); H.heat(s, c.other, -8); }, lose: (s, c) => { H.rel(s, c.nation, -6); } },
      { label: 'Match it', sub: 'Posture +8 Deterrence, a little tension next door', ap: 1, cost: 3, fx: (s, c) => { H.g(s, 'det', 8); H.heat(s, c.other, 3); } },
      { label: 'Balance with the other power', sub: 'Lean on the rival giant', ap: 1, cost: 2,
        fx: (s, c) => { const o = otherPower(c.nation); H.rel(s, o, 8); H.rel(s, c.nation, -5); } },
      { label: 'Ride it out', sub: 'Free, but the balance tilts', ap: 0, cost: 0, free: true, fx: (s, c) => { H.g(s, 'det', -3); } },
    ],
  },
  gp_influence: {
    icon: '📡', nations: ['US', 'CN'], w: 2, timer: 3,
    title: (n) => `${n}'s Influence Campaign`,
    text: (n) => `Coordinated media and online operations tied to ${n} are pushing narratives into Singapore's public debate. Opinion is starting to split.`,
    erupt: (s) => { H.g(s, 'stab', -4); return 'Public opinion splits. Stability −4.'; },
    options: [
      { label: 'Run a counter-narrative', sub: '+2 Stability, mild irritation abroad', ap: 1, cost: 3, fx: (s, c) => { H.g(s, 'stab', 2); H.rel(s, c.nation, -2); } },
      { label: 'Name and shame', sub: 'A gamble. Win: Stability up. Lose: it backfires', ap: 1, cost: 0, brink: true,
        pfn: (s, c) => 50 + (s.g.stab - 50) * 0.3,
        w: 'The public rallies.', l: 'It looks like a deflection.',
        win: (s, c) => { H.g(s, 'stab', 3); H.rel(s, c.nation, -4); }, lose: (s, c) => { H.g(s, 'stab', -3); H.rel(s, c.nation, -6); } },
      { label: 'Tighten the rules', sub: '+3 Stability, −2 Hub (looks heavy-handed)', ap: 1, cost: 2, fx: (s) => { H.g(s, 'stab', 3); H.g(s, 'hub', -2); } },
      { label: 'Ignore it', sub: 'Free, but opinion drifts', ap: 0, cost: 0, free: true, fx: (s) => { H.g(s, 'stab', -2); } },
    ],
  },
  nuke_probe: {
    icon: '☢️', nations: [], w: 0, timer: 2,
    title: (n) => `${n} Asks About Your Programme`,
    text: (n) => `Word has leaked that Singapore's "civil energy" programme has a military track. ${n} demands answers, and both giants are asking what you are building.`,
    erupt: (s) => { for (const c of Object.keys(s.nations)) H.heat(s, c, 6); s.nuke.exposed = true; return 'Silence reads as guilt. Tension rises everywhere.'; },
    options: [
      { label: 'Insist it is civil energy', sub: 'A gamble. Win: the cover holds. Lose: trust and Hub suffer', ap: 1, cost: 0, brink: true,
        pfn: (s) => 40 + (s.g.stab - 50) * 0.2 + (s.powers.US.rel + s.powers.CN.rel - 100) * 0.2,
        w: 'The denial holds, for now.', l: 'Nobody believes it.',
        win: (s) => { s.nuke.exposed = false; for (const c of Object.keys(s.nations)) H.heat(s, c, -8); },
        lose: (s) => { for (const c of Object.keys(s.nations)) { H.rel(s, c, -8); H.heat(s, c, 10); } H.g(s, 'hub', -4); } },
      { label: 'Accept limits and inspections', sub: 'Keep the plant, drop the deterrent. Trust returns', ap: 1, cost: 3,
        fx: (s) => { s.nuke.halted = true; s.nuke.exposed = false; s.nuke.prog = Math.min(s.nuke.prog, 60); for (const c of Object.keys(s.nations)) { H.rel(s, c, 6); H.heat(s, c, -12); } for (const p of ['US', 'CN']) H.rel(s, p, 6); } },
      { label: 'Defy them', sub: 'Free. Tension and distrust, but you keep going', ap: 0, cost: 0, free: true,
        fx: (s) => { s.nuke.exposed = true; for (const c of Object.keys(s.nations)) { H.rel(s, c, -6); H.heat(s, c, 10); } H.g(s, 'det', 8); } },
    ],
  },
  gp_ally_call: {
    icon: '🤝', nations: [], w: 0, timer: 2,
    title: (n) => `${n} Calls In a Favour`,
    text: (n, c, s) => `${leaderName(c.nation, s)} asks Singapore to publicly back its line and join a show of unity in the region against ${POWERS[otherPower(c.nation)].name}. Partners are expected to show up.`,
    erupt: (s, c) => { H.rel(s, c.nation, -6); s.pactStrain = (s.pactStrain || 0) + 1; const m = (s.pactStrain >= 3) ? breakPact(s, 'too many favours refused') : ''; return `Your silence is noted. Trust −6.${m ? ' ' + m : ''}`; },
    options: [
      { label: 'Back them publicly', sub: 'Trust up with them, down with the rival', ap: 1, cost: 0,
        fx: (s, c) => { const R = otherPower(c.nation); H.rel(s, c.nation, 5); H.rel(s, R, -8); s.pactStrain = Math.max(0, (s.pactStrain || 0) - 1); for (const k of PATRON[R]) H.rel(s, k, -2); } },
      { label: 'Offer quiet support', sub: 'Less noise, less credit', ap: 1, cost: 2,
        fx: (s, c) => { H.rel(s, c.nation, 2); H.rel(s, otherPower(c.nation), -2); } },
      { label: 'Decline', sub: 'Free, but they will remember', ap: 0, cost: 0, free: true,
        fx: (s, c) => { H.rel(s, c.nation, -6); s.pactStrain = (s.pactStrain || 0) + 1; if (s.pactStrain >= 3) breakPact(s, 'too many favours refused'); } },
    ],
  },
  gp_coerce: {
    icon: '⛓️', nations: [], w: 0, timer: 3,
    title: (n) => `${n} Squeezes Singapore`,
    text: (n, c, s) => `${n} is punishing your alignment with ${POWERS[otherPower(c.nation)].name}: customs delays, slow visas and loud warnings in its press.`,
    erupt: (s) => { H.g(s, 'hub', -5); H.g(s, 'stab', -2); return 'Trade stumbles. Hub −5, Stability −2.'; },
    options: [
      { label: 'Diversify supply lines', sub: '+3 Resilience, softens the blow', ap: 1, cost: 5, fx: (s) => { H.g(s, 'res', 3); H.g(s, 'hub', 1); } },
      { label: 'Appeal to ASEAN', sub: 'A gamble. Win: pressure eases. Lose: it stings', ap: 1, cost: 0, brink: true,
        pfn: (s) => 45 + Object.values(s.nations).reduce((a, n) => a + n.rel, 0) / 8 * 0.3,
        w: 'The region closes ranks behind Singapore.', l: 'Nobody wants to pick a fight with a giant.',
        win: (s, c) => { H.rel(s, c.nation, 4); }, lose: (s, c) => { H.g(s, 'hub', -4); H.rel(s, c.nation, -4); } },
      { label: 'Cool the partnership', sub: 'Eases pressure, and the partner is unhappy', ap: 1, cost: 0,
        fx: (s, c) => { H.rel(s, c.nation, 6); if (s.pact) { H.rel(s, s.pact, -6); s.pactStrain = (s.pactStrain || 0) + 1; if (s.pactStrain >= 3) breakPact(s, 'strained by a cooling'); } } },
      { label: 'Absorb it', sub: 'Free, but trade takes a hit', ap: 0, cost: 0, free: true, fx: (s) => { H.g(s, 'hub', -3); } },
    ],
  },
  gp_carrot: {
    icon: '🎁', opp: true, nations: [], w: 0, timer: 2,
    title: (n) => `${n} Dangles a Deal`,
    text: (n, c, s) => `${n} offers a big trade and investment package if Singapore quietly scales back its ties with ${POWERS[otherPower(c.nation)].name}. It is tempting and it has strings.`,
    erupt: () => 'The offer lapses.',
    options: [
      { label: 'Take the deal', sub: '+$15B now, trust shifts, and your partner is cross', ap: 1, cost: 0,
        fx: (s, c) => { H.money(s, 15); H.rel(s, c.nation, 8); H.rel(s, otherPower(c.nation), -8); s.pactStrain = (s.pactStrain || 0) + 1; if (s.pactStrain >= 3) breakPact(s, 'Singapore keeps flirting with its rival'); } },
      { label: 'Politely refuse', sub: 'Free. Your partner approves', ap: 0, cost: 0, free: true, fx: (s, c) => { if (s.pact) { H.rel(s, s.pact, 2); s.pactStrain = Math.max(0, (s.pactStrain || 0) - 1); } } },
    ],
  },
  minister_scandal: {
    icon: '📰', nations: [], w: 0, timer: 2,
    title: (n, c) => `Scandal at ${c && c.role ? ROLES[c.role].label : 'the Cabinet'}`,
    text: (n, c, s) => { const m = s.cabinet[c.role]; return `${m ? m.name : 'A minister'}, your ${ROLES[c.role].label} minister, is in the headlines for the wrong reasons. The opposition is circling.`; },
    erupt: (s, c) => { H.g(s, 'stab', -5); if (s.cabinet[c.role]) s.cabinet[c.role].loyalty = Math.max(0, s.cabinet[c.role].loyalty - 15); return 'The story runs for a week. Stability −5.'; },
    options: [
      { label: 'Stand by them', sub: 'Loyalty +20, Stability −3', ap: 1, cost: 0, fx: (s, c) => { H.g(s, 'stab', -3); const m = s.cabinet[c.role]; if (m) m.loyalty = Math.min(100, m.loyalty + 20); } },
      { label: 'Sack and replace', sub: 'A fresh face, Stability −1', ap: 1, cost: 2, fx: (s, c) => { H.g(s, 'stab', -1); s.cabinet[c.role] = newMinister(s.rand, 2 + Math.floor(s.rand() * 3)); } },
      { label: 'A quiet word', sub: 'A gamble. Win: it blows over. Lose: it gets worse', ap: 1, cost: 0, brink: true,
        pfn: (s, c) => 45 + (s.cabinet[c.role] ? s.cabinet[c.role].loyalty * 0.2 : 0),
        w: 'The story dies quietly.', l: 'Someone leaks the quiet word.',
        win: (s, c) => { const m = s.cabinet[c.role]; if (m) m.loyalty = Math.min(100, m.loyalty + 5); },
        lose: (s, c) => { H.g(s, 'stab', -5); const m = s.cabinet[c.role]; if (m) m.loyalty = Math.max(0, m.loyalty - 10); } },
    ],
  },
  mediate: {
    icon: '🕊️', opp: true, reg: true, nations: [], w: 0, timer: 2,
    title: (n, c) => `${n} vs ${c && c.other ? NATIONS[c.other].name : 'a neighbour'}`,
    text: (n, c, s) => {
      const o = NATIONS[c.other].name, f = s.feuds && s.feuds[c.key], why = FEUDS[c.key].why;
      return f && f.war > 0
        ? `${n} and ${o} are at war over ${why}. The fighting is rattling shipping lanes and supply chains, and both look to Singapore.`
        : `Tension between ${n} and ${o} over ${why} has spilled into a clash. Both capitals are watching what Singapore does next.`;
    },
    erupt: () => 'Singapore stays out. The dispute runs its course.',
    options: [
      { label: 'Offer to mediate', sub: 'A gamble: calms the dispute and earns trust with both', ap: 1, cost: 2, brink: true,
        pfn: (s, c) => 40 + (s.nations[c.nation].rel + s.nations[c.other].rel) / 4 - (s.feuds[c.key].t - 50) * 0.2,
        w: 'Both sides accept Singapore\'s good offices.', l: 'The talks collapse and both blame the go-between.',
        win: (s, c) => { const f = s.feuds[c.key]; f.t = clamp(f.t - 35); f.war = 0; H.rel(s, c.nation, 6); H.rel(s, c.other, 6); H.g(s, 'hub', 2); },
        lose: (s, c) => { H.rel(s, c.nation, -3); H.rel(s, c.other, -3); } },
      { label: (s, c) => `Back ${NATIONS[c.nation].name}`, sub: 'Favour with one side, resentment from the other', ap: 1, cost: 0,
        fx: (s, c) => { H.rel(s, c.nation, 8); H.rel(s, c.other, -6); s.feuds[c.key].t = clamp(s.feuds[c.key].t + 6); } },
      { label: 'Stay out', sub: 'Free. The dispute runs its course', ap: 0, cost: 0, free: true, fx: () => {} },
    ],
  },
  opp_trade: {
    icon: '📈', opp: true, nations: ['VN', 'ID', 'BN', 'MY', 'TH', 'KH', 'LA'], w: 3, timer: 2,
    title: () => 'Trade Opening',
    text: (n) => `${n} offers a window of preferential market access. It will not stay open long.`,
    erupt: () => 'The window closes.',
    options: [
      { label: 'Seize the opening', sub: '+8 Hub, +5 trust', ap: 1, cost: 4,
        fx: (s, c) => { H.g(s, 'hub', 8); H.rel(s, c.nation, 5); } },
      { label: 'Let it pass', sub: 'Nothing happens', ap: 0, cost: 0, free: true, fx: () => {} },
    ],
  },
  opp_energy: {
    icon: '🌱', opp: true, nations: ['BN'], w: 3, timer: 2,
    title: () => 'Green Energy Deal',
    text: () => 'Brunei proposes a gas-and-solar supply partnership that would harden your energy security.',
    erupt: () => 'The offer lapses.',
    options: [
      { label: 'Sign it', sub: '+8 Resilience, +6 trust', ap: 1, cost: 0,
        fx: (s, c) => { H.g(s, 'res', 8); H.rel(s, c.nation, 6); } },
      { label: 'Let it pass', sub: 'Nothing happens', ap: 0, cost: 0, free: true, fx: () => {} },
    ],
  },
};
