// Order of battle: named equipment from many suppliers, power per domain, upkeep and politics.
// Numbers are abstract game stats, not real-world specifications.
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export const DOMAINS = { land: 'Land', air: 'Air', sea: 'Sea' };

export const SUPPLIERS = {
  SG: { name: 'Domestic (ST Engineering)', short: 'SG' },
  US: { name: 'United States', short: 'US' },
  DE: { name: 'Germany', short: 'DE' },
  FR: { name: 'France', short: 'FR' },
  SE: { name: 'Sweden', short: 'SE' },
  IL: { name: 'Israel', short: 'IL' },
  KR: { name: 'South Korea', short: 'KR' },
  IT: { name: 'Italy', short: 'IT' },
  CN: { name: 'China', short: 'CN' },
  RU: { name: 'Russia', short: 'RU' },
};

// Trust changes applied when you buy from a supplier (keys: US/CN great powers, MY/ID neighbours).
export const POLITICS = {
  US: { US: 3, CN: -2 },
  CN: { CN: 4, US: -4 },
  RU: { US: -6, CN: 1 },
  IL: { MY: -2, ID: -2 },
};
export const POLITICS_NOTE = {
  US: 'Washington +3, Beijing −2',
  CN: 'Beijing +4, Washington −4',
  RU: 'Washington −6, Beijing +1',
  IL: 'Malaysia −2, Indonesia −2',
};

// pw = power added to its domain. up = upkeep $B per turn. tier 2/3 need purchase history
// with that supplier (and trust, for the US and China). delay = turns until delivery.
export const UNITS = [
  // ---- LAND ----
  { id: 'bionix',   name: 'Bionix IFV battalion',      dom: 'land', sup: 'SG', pw: 3, cost: 6,  up: 0.3, tier: 1, delay: 2 },
  { id: 'hunter',   name: 'Hunter AFV battalion',      dom: 'land', sup: 'SG', pw: 4, cost: 8,  up: 0.4, tier: 1, delay: 2 },
  { id: 'primus',   name: 'Primus SPH battery',        dom: 'land', sup: 'SG', pw: 3, cost: 6,  up: 0.3, tier: 1, delay: 2 },
  { id: 'leopard',  name: 'Leopard 2SG tank battalion', dom: 'land', sup: 'DE', pw: 5, cost: 12, up: 0.6, tier: 1, delay: 2 },
  { id: 'pzh',      name: 'PzH 2000 howitzer battery', dom: 'land', sup: 'DE', pw: 5, cost: 11, up: 0.5, tier: 2, delay: 2 },
  { id: 'k9',       name: 'K9 Thunder howitzer battery', dom: 'land', sup: 'KR', pw: 4, cost: 8, up: 0.4, tier: 1, delay: 2 },
  { id: 'himars',   name: 'HIMARS rocket battery',     dom: 'land', sup: 'US', pw: 6, cost: 14, up: 0.6, tier: 2, delay: 2 },
  { id: 'apache',   name: 'AH-64 Apache squadron',     dom: 'land', sup: 'US', pw: 6, cost: 13, up: 0.7, tier: 2, delay: 2 },
  { id: 'abrams',   name: 'M1A2 Abrams battalion',     dom: 'land', sup: 'US', pw: 8, cost: 18, up: 0.9, tier: 3, delay: 3 },
  { id: 'vt4',      name: 'VT-4 tank battalion',       dom: 'land', sup: 'CN', pw: 5, cost: 8,  up: 0.5, tier: 1, delay: 2 },
  { id: 't90',      name: 'T-90MS tank battalion',     dom: 'land', sup: 'RU', pw: 6, cost: 9,  up: 0.5, tier: 1, delay: 2 },
  // ---- AIR ----
  { id: 'fa50',     name: 'FA-50 light fighter squadron', dom: 'air', sup: 'KR', pw: 4, cost: 8,  up: 0.4, tier: 1, delay: 2 },
  { id: 'f16',      name: 'F-16C/D squadron',          dom: 'air', sup: 'US', pw: 5, cost: 12, up: 0.7, tier: 1, delay: 2 },
  { id: 'gripen',   name: 'Gripen E squadron',         dom: 'air', sup: 'SE', pw: 7, cost: 14, up: 0.7, tier: 1, delay: 2 },
  { id: 'typhoon',  name: 'Eurofighter Typhoon squadron', dom: 'air', sup: 'IT', pw: 8, cost: 19, up: 1.0, tier: 1, delay: 3 },
  { id: 'rafale',   name: 'Rafale F4 squadron',        dom: 'air', sup: 'FR', pw: 8, cost: 20, up: 1.0, tier: 2, delay: 3 },
  { id: 'f15',      name: 'F-15SG squadron',           dom: 'air', sup: 'US', pw: 8, cost: 20, up: 1.0, tier: 2, delay: 3 },
  { id: 'f35',      name: 'F-35 squadron',             dom: 'air', sup: 'US', pw: 12, cost: 30, up: 1.4, tier: 3, delay: 3 },
  { id: 'spyder',   name: 'Spyder SAM battery',        dom: 'air', sup: 'IL', pw: 4, cost: 7,  up: 0.3, tier: 1, delay: 2 },
  { id: 'g550',     name: 'G550 AEW aircraft',         dom: 'air', sup: 'IL', pw: 4, cost: 10, up: 0.5, tier: 2, delay: 2 },
  { id: 'j10',      name: 'J-10CE squadron',           dom: 'air', sup: 'CN', pw: 7, cost: 13, up: 0.8, tier: 1, delay: 2 },
  { id: 'su35',     name: 'Su-35 squadron',            dom: 'air', sup: 'RU', pw: 11, cost: 22, up: 1.2, tier: 2, delay: 3 },
  // ---- SEA ----
  { id: 'lmv',      name: 'Independence-class LMV',    dom: 'sea', sup: 'SG', pw: 3, cost: 6,  up: 0.3, tier: 1, delay: 2 },
  { id: 'archer',   name: 'Archer-class submarine',    dom: 'sea', sup: 'SE', pw: 5, cost: 10, up: 0.5, tier: 1, delay: 3 },
  { id: 'formidable', name: 'Formidable-class frigate', dom: 'sea', sup: 'FR', pw: 6, cost: 14, up: 0.8, tier: 1, delay: 3 },
  { id: 'type218',  name: 'Type 218SG submarine',      dom: 'sea', sup: 'DE', pw: 7, cost: 16, up: 0.9, tier: 2, delay: 3 },
  { id: 'type054',  name: 'Type 054A frigate',         dom: 'sea', sup: 'CN', pw: 7, cost: 12, up: 0.7, tier: 1, delay: 3 },
  { id: 'fremm',    name: 'FREMM frigate',             dom: 'sea', sup: 'IT', pw: 8, cost: 17, up: 0.9, tier: 2, delay: 3 },
  { id: 'arleigh',  name: 'Arleigh Burke destroyer',   dom: 'sea', sup: 'US', pw: 12, cost: 28, up: 1.4, tier: 3, delay: 3 },
];

export const unitById = Object.fromEntries(UNITS.map((u) => [u.id, u]));

export const START_FORCES = {
  leopard: 3, bionix: 4, hunter: 2, primus: 2,
  f15: 3, f16: 4, spyder: 2, g550: 1,
  formidable: 3, type218: 2, lmv: 4,
};
export const START_PURCH = { US: 3, DE: 2, FR: 1, IL: 1, SE: 1 };

export function domainPower(s, dom) {
  let t = 0;
  for (const [id, n] of Object.entries(s.forces)) { const u = unitById[id]; if (u && u.dom === dom) t += u.pw * n; }
  return t;
}
export function powers(s) { return { land: domainPower(s, 'land'), air: domainPower(s, 'air'), sea: domainPower(s, 'sea') }; }
export const weighted = (p) => 0.4 * p.air + 0.3 * p.sea + 0.3 * p.land;
export function upkeep(s) {
  let t = 0;
  for (const [id, n] of Object.entries(s.forces)) t += unitById[id].up * n;
  return t;
}

const BASE_W = weighted((() => {
  const p = { land: 0, air: 0, sea: 0 };
  for (const [id, n] of Object.entries(START_FORCES)) p[unitById[id].dom] += unitById[id].pw * n;
  return p;
})());

// Deterrence = how formidable your forces look, minus the regional arms race, plus short-term posture.
export function syncDet(s) {
  s.g.det = clamp(Math.round(40 + (weighted(powers(s)) - BASE_W) * 1.6 - (s.arms || 0) + (s.posture || 0)));
}

// Rough Deterrence gained by adding one unit (before the arms race eats into it).
export const detGain = (u) => Math.round(({ air: 0.4, sea: 0.3, land: 0.3 }[u.dom] * u.pw * 1.6) * 10) / 10;
