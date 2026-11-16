// Leaders talk back. Lines depend on the leader's style and how things stand between you.
// Picked deterministically (no random numbers), so they never disturb the game's seed.

const hash = (str) => { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); };

export function moodOf(s, code) {
  const n = s.nations[code] || s.powers[code];
  const heat = n.heat || 0;
  if (heat >= 70) return 'hot';
  if (n.rel >= 65) return 'warm';
  if (n.rel < 40) return 'cold';
  return 'neutral';
}

const LINES = {
  charmer: {
    warm:    ['"Singapore is family. Come, we will eat."', '"My friend! Whatever you need, just ask."', '"Our two peoples were made for each other."', '"A toast to the best neighbour in the region."'],
    neutral: ['"Relations are warm. Let us keep them that way."', '"We should meet more often. Bring the good coffee."', '"Smiles cost nothing. Let us see what else we can do."', '"I always enjoy our conversations."'],
    cold:    ['"I am disappointed, truly. I thought we were friends."', '"A smile can only carry so much weight."', '"You do not visit. You do not call."', '"Friendship needs tending."'],
    hot:     ['"Even I run out of patience."', '"Do not mistake my manners for weakness."', '"The smile is gone. Take note."', '"We were friends. Do not make me say were."'],
  },
  dealer: {
    warm:    ['"There is a deal here for both of us."', '"Business has never been better. Let us not spoil it."', '"I like a partner who pays on time."', '"Put it in writing and I am yours."'],
    neutral: ['"Everything has a price. Name yours."', '"I am open to offers."', '"Show me the numbers and we will talk."', '"Interesting. What is in it for us?"'],
    cold:    ['"You have not made me an offer I like."', '"Trade is quiet because you have been quiet."', '"I find other buyers."', '"Value for value. I am not seeing any."'],
    hot:     ['"The price just went up."', '"Do not threaten a man who holds your water."', '"We can do this the expensive way."', '"Every deal has a breaking point."'],
  },
  hardliner: {
    warm:    ['"You are strong. I respect strong."', '"We understand each other, you and I."', '"Keep your word and we will keep the peace."', '"A well-armed neighbour is a safe one."'],
    neutral: ['"I am watching. I am always watching."', '"Words are cheap. Show me ships."', '"Do not mistake calm for trust."', '"We will see what you do next."'],
    cold:    ['"You test me. That is unwise."', '"My generals ask why we are polite."', '"I do not forgive slights."', '"Weakness invites correction."'],
    hot:     ['"Withdraw, or I will make you."', '"Another step and there will be consequences."', '"My patience ends at the border."', '"The next call you get will not be from me."'],
  },
  proud: {
    warm:    ['"You have shown us respect. We remember."', '"Not many treat us as equals. You do."', '"Our people notice who honours them."', '"You are welcome here."'],
    neutral: ['"We make our own decisions."', '"We are a sovereign country, remember."', '"We would prefer not to be lectured."', '"Say what you came to say."'],
    cold:    ['"Do not speak to us as if we were children."', '"We will not be bullied by a city."', '"Respect is not a one-way road."', '"Our patience is not infinite."'],
    hot:     ['"This is an insult to the nation."', '"Our people will not forget this."', '"You have wounded our dignity."', '"Take it back, or take what comes."'],
  },
  great: {
    warm:    ['"Our friendship is a pillar of the region."', '"We value Singapore as a true partner."', '"Your view carries weight with us."', '"A good friend, a steady one."'],
    neutral: ['"We expect our friends to choose wisely."', '"The region is changing. Plan accordingly."', '"We are watching how you balance."', '"Let us keep talking."'],
    cold:    ['"Not everyone is as friendly as they pretend."', '"You are making choices that we will remember."', '"We hoped for better from Singapore."', '"The door is open, but not forever."'],
    hot:     ['"This is the moment to pick a side."', '"Our patience has limits."', '"You are testing a very large friend."', '"Consequences, Prime Minister."'],
  },
};

const NATION_LINES = {
  MY: ['"The Causeway has two lanes for a reason."', '"We were one country once, you know."'],
  ID: ['"Our archipelago is bigger than your whole map."', '"We call you the little red dot, with affection. Mostly."'],
  BN: ['"We keep things quiet here. It works."', '"Oil is patient. So are we."'],
  TH: ['"Mai pen rai. Nothing is as urgent as it looks."', '"Come for the food. Stay for the politics."'],
  VN: ['"We have outlasted bigger powers than yours."', '"Your port is nice. Ours will be bigger."'],
  KH: ['"Angkor taught us to think in centuries."', '"Do not read our friends as your enemies."'],
  LA: ['"Our rivers light your cities, remember that."', '"We are landlocked, not powerless."'],
  MM: ['"We have our own storms to weather."', '"Do not ask about our affairs."'],
  US: ['"Freedom of navigation is not negotiable."', '"We expect partners to show up."'],
  CN: ['"History is long. We are patient."', '"Prosperity is shared, or it is nothing."'],
};

const REACT = {
  charmer:   { visit: ['"A splendid visit! The photos will be everywhere."', '"You honour us. Truly."'], trade: ['"Wonderful. Let us celebrate with a feast."', '"A handshake and a smile. What else is there?"'], signal: ['"Is this really necessary, my friend?"', '"I will pretend I did not see that."'], covert: ['"How could you? After all those dinners."', '"I trusted you."'] },
  dealer:    { visit: ['"Nice of you to drop by. Let us talk figures."', '"A visit is nice. A contract is better."'], trade: ['"Pleasure doing business."', '"Fair terms. Do not make me regret it."'], signal: ['"Bad for business, this."', '"You are making the insurance expensive."'], covert: ['"I do not forgive breach of contract."', '"This will cost you."'] },
  hardliner: { visit: ['"Ceremony. Fine. Do not expect more."', '"Pomp changes nothing."'], trade: ['"Business is business. Do not read more into it."', '"We will take the money."'], signal: ['"A show of strength. I note the message."', '"Noted. We will remember who flexed first."'], covert: ['"You will pay for this."', '"My intelligence service is not asleep."'] },
  proud:     { visit: ['"You came yourself. That is appreciated."', '"The people saw you, and they approve."'], trade: ['"A fair arrangement between equals."', '"We accept, on our terms."'], signal: ['"Do not wave your fleet at us."', '"This will not be forgotten."'], covert: ['"A betrayal."', '"The nation will hear of this."'] },
  great:     { visit: ['"We appreciate the call."', '"Always good to see a friend."'], trade: ['"We will take that into account."', '"Noted. Thank you."'], signal: ['"We see what you are doing."', '"Interesting choice, Prime Minister."'], covert: ['"Careful."', '"We are watching."'] },
};

export function quoteFor(s, code, L) {
  const st = L.style || 'great';
  const mood = moodOf(s, code);
  let pool = (LINES[st] || LINES.great)[mood];
  if (mood === 'neutral' && NATION_LINES[code]) pool = pool.concat(NATION_LINES[code]);
  return pool[hash(code + mood + s.turn) % pool.length];
}
export function reactFor(s, code, L, kind) {
  const st = L.style || 'great';
  const pool = (REACT[st] || REACT.great)[kind];
  if (!pool) return '';
  return pool[hash(code + kind + s.turn + (s.ap || 0)) % pool.length];
}
