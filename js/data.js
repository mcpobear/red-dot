// Static game data: nations, great powers, player actions and crisis templates.
// Pure data + small effect helpers. No DOM access here.

export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const otherPower = (c) => (c === 'US' ? 'CN' : 'US');

export const H = {
  g: (s, k, d) => { s.g[k] = clamp(s.g[k] + d); },
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
  MY: { name: 'Malaysia',  a: 0,   r: 14, sz: 6.2, rel: 55, heat: 30, lev: 'Water, the Causeway, shared history',
        bias: { friendly: .30, opportunist: .30, hawkish: .10, distracted: .30 } },
  ID: { name: 'Indonesia', a: 200, r: 16, sz: 6.6, rel: 55, heat: 30, lev: 'Haze, straits and airspace',
        bias: { friendly: .30, opportunist: .30, hawkish: .15, distracted: .25 } },
  BN: { name: 'Brunei',    a: 80,  r: 32, sz: 4.8, rel: 65, heat: 10, lev: 'Quiet, wealthy, steady',
        bias: { friendly: .60, opportunist: .20, hawkish: .05, distracted: .15 } },
  TH: { name: 'Thailand',  a: 325, r: 30, sz: 5.4, rel: 60, heat: 20, lev: 'Land-bridge dreams, shaky politics',
        bias: { friendly: .30, opportunist: .25, hawkish: .10, distracted: .35 } },
  VN: { name: 'Vietnam',   a: 45,  r: 30, sz: 5.4, rel: 55, heat: 25, lev: 'Rising rival hub, South China Sea',
        bias: { friendly: .25, opportunist: .35, hawkish: .20, distracted: .20 } },
  KH: { name: 'Cambodia',  a: 20,  r: 32, sz: 4.8, rel: 50, heat: 25, lev: 'Beijing-leaning, scam compounds',
        bias: { friendly: .25, opportunist: .35, hawkish: .15, distracted: .25 } },
  LA: { name: 'Laos',      a: 350, r: 42, sz: 4.6, rel: 50, heat: 15, lev: 'Hydropower and the regional grid',
        bias: { friendly: .35, opportunist: .25, hawkish: .10, distracted: .30 } },
  MM: { name: 'Myanmar',   a: 300, r: 42, sz: 5.2, rel: 40, heat: 35, lev: 'Instability, refugees, scam hubs',
        bias: { friendly: .15, opportunist: .30, hawkish: .25, distracted: .30 } },
};

export const POWERS = {
  US: { name: 'Washington', a: 125, r: 44, sz: 5.2 },
  CN: { name: 'Beijing',    a: 25,  r: 52, sz: 5.2 },
};

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

  { id: 'scout', cat: 'int', tgt: 'nation', ap: 1, cost: 3, name: 'Scout Intentions',
    desc: 'Reveals hidden intent and exact odds against this nation for 4 turns.',
    fx: (s, t) => { s.nations[t].scout = 4; } },
  { id: 'counter', cat: 'int', tgt: null, ap: 1, cost: 4, name: 'Counter-Espionage',
    desc: 'Blocks cyber incidents for 4 turns.',
    fx: (s) => { s.shield = 4; } },

  { id: 'modern', cat: 'def', tgt: null, ap: 1, cost: 12, name: 'Modernise Forces',
    desc: '+9 Deterrence. Hawks and opportunists notice (+2 tension).',
    fx: (s) => { H.g(s, 'det', 9); for (const n of Object.values(s.nations)) if (hostile(n)) n.heat = clamp(n.heat + 2); } },
  { id: 'drill', cat: 'def', tgt: 'power', ap: 1, cost: 5, name: 'Joint Exercise',
    desc: '+6 Deterrence, +5 trust with that power (the other cools by 3).',
    fx: (s, t) => { H.g(s, 'det', 6); H.rel(s, t, 5); H.rel(s, otherPower(t), -3); } },
  { id: 'signal', cat: 'def', tgt: 'nation', ap: 1, cost: 4, name: 'Show of Force',
    desc: '+3 Deterrence. Cows hawks (−10 tension) but riles the rest (+8, −8 trust).',
    fx: (s, t) => {
      const n = s.nations[t]; H.g(s, 'det', 3);
      if (hostile(n)) n.heat = clamp(n.heat - 10);
      else { n.heat = clamp(n.heat + 8); H.rel(s, t, -8); }
    } },
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
      { label: 'Fund fire-fighting aid', sub: 'Costly, earns goodwill', ap: 1, cost: 8,
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
      { label: 'Pay the premium', sub: 'Buys calm and a little supply', ap: 1, cost: 10,
        fx: (s, c) => { H.rel(s, c.nation, 6); H.heat(s, c.nation, -8); H.g(s, 'res', 2); } },
      { label: 'Stand firm', sub: 'Call their bluff', ap: 1, cost: 0, brink: true,
        w: 'They blink first.', l: 'They cut the flow to prove a point.',
        win: (s, c) => { H.rel(s, c.nation, 2); H.heat(s, c.nation, -6); H.g(s, 'hub', 3); },
        lose: (s, c) => { H.g(s, 'res', -12); H.rel(s, c.nation, -10); H.heat(s, c.nation, 12); } },
      { label: 'Accelerate NEWater', sub: 'Long-term answer, +10 Resilience', ap: 1, cost: 12,
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
      { label: 'Joint patrols', sub: 'Shared burden, shared credit', ap: 1, cost: 6,
        fx: (s, c) => { H.rel(s, c.nation, 5); H.g(s, 'hub', 3); H.g(s, 'det', 2); } },
      { label: 'Go it alone', sub: 'Faster, but bruises egos', ap: 1, cost: 6,
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
      { label: 'Fund ASEAN relief', sub: 'Humanitarian, earns trust', ap: 1, cost: 8,
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
      { label: 'Fund a joint taskforce', sub: 'Slow, steady, cooperative', ap: 1, cost: 6,
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
      { label: 'Automate our own port', sub: 'Out-compete them', ap: 1, cost: 12,
        fx: (s) => { H.g(s, 'hub', 8); } },
      { label: 'Partner with them', sub: 'Turn a rival into a feeder', ap: 1, cost: 4,
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
      { label: 'Offer a joint logistics deal', sub: 'Stay in the loop', ap: 1, cost: 8,
        fx: (s, c) => { H.rel(s, c.nation, 8); H.rel(s, 'CN', 4); H.g(s, 'hub', 3); } },
      { label: 'Lobby Washington', sub: 'Raise concerns, lean west', ap: 1, cost: 3,
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
      { label: 'Diversify our energy', sub: 'Long-term fix, +10 Resilience', ap: 1, cost: 10,
        fx: (s) => { H.g(s, 'res', 10); } },
      { label: 'Buy at spot prices', sub: 'Expensive stopgap', ap: 1, cost: 15,
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
      { label: 'Hunt the intruders', sub: 'Quiet, competent response', ap: 1, cost: 6,
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
      H.g(s, 'stab', -25); H.g(s, 'res', -18); H.g(s, 'det', -15); H.g(s, 'hub', -10); H.heat(s, c.nation, -20);
      return 'Forces move while you hesitate. Stability −25, Resilience −18, Deterrence −15, Hub −10.';
    },
    options: [
      { label: 'Stand firm', sub: 'Deterrence decides this', ap: 1, cost: 0, brink: true,
        pfn: (s, c) => { const n = s.nations[c.nation]; return 38 + (s.g.det - 50) * 0.6 + (n.rel - 50) * 0.15 - (n.intent === 'hawkish' ? 8 : 0); },
        w: 'They back down.', l: 'They call the bluff.',
        win: (s, c) => { H.heat(s, c.nation, -35); H.g(s, 'det', 5); H.g(s, 'stab', 8); },
        lose: (s, c) => { H.g(s, 'stab', -25); H.g(s, 'res', -18); H.g(s, 'det', -15); H.g(s, 'hub', -10); H.heat(s, c.nation, -15); } },
      { label: 'Rally a great power', sub: 'Phone Washington or Beijing', ap: 1, cost: 5, brink: true,
        pfn: (s) => 40 + (Math.max(s.powers.US.rel, s.powers.CN.rel) - 50) * 0.6,
        w: 'A powerful call cools tempers.', l: 'Nobody picks up in time.',
        win: (s, c) => { H.heat(s, c.nation, -25); H.g(s, 'det', 3); },
        lose: (s, c) => { H.heat(s, c.nation, -5); H.g(s, 'stab', -10); } },
      { label: 'Concede quietly', sub: 'Painful, but it is over', ap: 1, cost: 0,
        fx: (s, c) => { H.g(s, 'stab', -14); H.g(s, 'hub', -8); H.heat(s, c.nation, -25); H.rel(s, c.nation, 5); } },
    ],
  },
  opp_trade: {
    icon: '📈', opp: true, nations: ['VN', 'ID', 'BN', 'MY', 'TH', 'KH', 'LA'], w: 3, timer: 2,
    title: () => 'Trade Opening',
    text: (n) => `${n} offers a window of preferential market access. It will not stay open long.`,
    erupt: () => 'The window closes.',
    options: [
      { label: 'Seize the opening', sub: '+8 Hub, +5 trust', ap: 1, cost: 5,
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
