// Shared bidding logic used by both the app and the generation scripts.
// Plain JS, no framework dependencies, so it can be imported from Node scripts too.

export const SEAT_ORDER = ['N', 'E', 'S', 'W'];
export const ROLE_FOR_SEAT = { N: 'Opener', E: 'Overcaller', S: 'Responder', W: 'Advancer' };

export function seatForPosition(position, isConstructive) {
  // position is 1-based index into the bids array
  if (isConstructive) return position % 2 === 1 ? 'N' : 'S';
  return SEAT_ORDER[(position - 1) % 4];
}

const SUIT_RANK = { C: 0, D: 1, H: 2, S: 3, N: 4 }; // bidding rank order, clubs lowest, NT highest

function parseBid(token) {
  if (token === 'P' || token === 'X' || token === 'XX') return { kind: token };
  const m = token.match(/^([1-7])(C|D|H|S|N)$/);
  if (!m) return null;
  return { kind: 'contract', level: Number(m[1]), suit: m[2] };
}

function contractValue(bid) {
  // sortable value: higher level first, then suit rank within level
  return bid.level * 5 + SUIT_RANK[bid.suit];
}

function partnership(seat) {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

/**
 * Given the auction so far (array of bid tokens, oldest first) and whether this
 * auction is constructive (N/S only) or full rotation, return the list of legal
 * calls for whoever bids next.
 */
export function legalBids(auctionSoFar, isConstructive) {
  const nextPos = auctionSoFar.length + 1;
  const nextSeat = seatForPosition(nextPos, isConstructive);

  // Highest contract bid so far, for computing which bids are still available.
  let lastContract = null;
  auctionSoFar.forEach((token) => {
    const b = parseBid(token);
    if (b?.kind === 'contract') lastContract = b;
  });

  const options = ['P'];
  const minValue = lastContract ? contractValue(lastContract) : -1;
  for (let level = 1; level <= 7; level++) {
    for (const suit of ['C', 'D', 'H', 'S', 'N']) {
      const v = level * 5 + SUIT_RANK[suit];
      if (v > minValue) options.push(suit === 'N' ? `${level}N` : `${level}${suit}`);
    }
  }

  // Find the last call that isn't a pass, to decide whether double/redouble is legal.
  let lastNonPassIdx = -1;
  for (let i = auctionSoFar.length - 1; i >= 0; i--) {
    if (auctionSoFar[i] !== 'P') { lastNonPassIdx = i; break; }
  }

  if (lastNonPassIdx !== -1) {
    const lastToken = auctionSoFar[lastNonPassIdx];
    const lastSeat = seatForPosition(lastNonPassIdx + 1, isConstructive);
    const isOpponent = partnership(lastSeat) !== partnership(nextSeat);
    const parsed = parseBid(lastToken);
    if (isOpponent && parsed?.kind === 'contract') options.push('X');
    if (isOpponent && lastToken === 'X') options.push('XX');
  }

  return options;
}

const SUIT_SYMBOL = { C: '♣', D: '♦', H: '♥', S: '♠' };
const SUIT_COLOR = { C: 'black', D: 'red', H: 'red', S: 'black' };

export function formatBid(token) {
  if (token === 'P') return { text: 'Pass', color: 'muted', level: null, symbol: null };
  if (token === 'X') return { text: 'Dbl', color: 'red', level: null, symbol: null };
  if (token === 'XX') return { text: 'Rdbl', color: 'red', level: null, symbol: null };
  const m = token.match(/^([1-7])(C|D|H|S|N)$/);
  if (!m) return { text: token, color: 'black', level: null, symbol: null };
  const [, level, suit] = m;
  if (suit === 'N') return { text: `${level}NT`, color: 'gold', level, symbol: 'NT' };
  return { text: `${level}${SUIT_SYMBOL[suit]}`, color: SUIT_COLOR[suit], level, symbol: SUIT_SYMBOL[suit] };
}
