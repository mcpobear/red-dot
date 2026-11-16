// Singapore's cabinet: five ministers whose skill and loyalty feed the gauges.
// Pure helpers; the engine applies the effects.

export const ROLES = {
  fin:  { label: 'Finance',          icon: '💰', gives: (es) => `+$${Math.round(es * 0.4)}B income a turn` },
  def:  { label: 'Defence',          icon: '🛡️', gives: (es) => `+${(es * 1.5).toFixed(1).replace('.0', '')} Deterrence, stronger edge in war` },
  for:  { label: 'Foreign Affairs',  icon: '🌐', gives: (es) => `Diplomacy lands +${Math.round(es * 0.5)} harder, gambles +${(es * 1.5).toFixed(1).replace('.0', '')}% odds` },
  home: { label: 'Home Affairs',     icon: '🏠', gives: (es) => `Heals Stability +${Math.round(es * 0.2)} a turn while it is under 60` },
  tni:  { label: 'Trade & Industry', icon: '🏭', gives: (es) => `+${Math.round(es * 0.2)} Hub a turn, Trade Pacts pay more` },
};
export const ROLE_KEYS = Object.keys(ROLES);

export const MTRAITS = {
  technocrat: { label: 'Technocrat', note: 'Counts as half a star better.' },
  loyalist:   { label: 'Loyalist',   note: 'Loyalty rarely drops.' },
  maverick:   { label: 'Maverick',   note: 'Volatile: scandal-prone, loyalty swings.' },
  showman:    { label: 'Showman',    note: '+1 Stability a turn while loyal, but gaffes happen.' },
};

const FIRST = ['Wei Ming', 'Siti', 'Arjun', 'Daniel', 'Mei Ling', 'Farhan', 'Priya', 'Kenneth', 'Nur Aisyah', 'Rajesh', 'Jia Hui', 'Marcus', 'Hui Min', 'Imran', 'Sharon', 'Vikram', 'Li Ting', 'Hakim', 'Grace', 'Benedict'];
const LAST = ['Tan', 'Lim', 'Rahman', 'Nair', 'Ong', 'Abdullah', 'Pillai', 'Teo', 'Gomez', 'Lee', 'Chua', 'Hassan', 'Menon', 'Koh', 'Pereira', 'Yusof', 'Goh', 'Rajan', 'Chan', 'Ismail'];

export function newMinister(rand, skill) {
  const sk = skill || 2 + Math.floor(rand() * 3); // 2-4
  const tr = ['technocrat', 'loyalist', 'maverick', 'showman'][Math.floor(rand() * 4)];
  return { name: `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`, skill: sk, trait: tr, loyalty: 55 + Math.floor(rand() * 25) };
}
export function newCabinet(rand) {
  const c = {};
  for (const r of ROLE_KEYS) c[r] = newMinister(rand);
  return c;
}
// A sullen minister works at 60%; a technocrat at +0.5.
export function eskill(s, role) {
  const m = s.cabinet && s.cabinet[role];
  if (!m) return 0;
  const base = m.skill + (m.trait === 'technocrat' ? 0.5 : 0);
  return m.loyalty < 30 ? base * 0.6 : base;
}
