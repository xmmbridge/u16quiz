import { SUITS, RANKS, RANK_VALUE } from './cards.js';

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function sampleDistinct(pool, count) {
  const arr = [...pool];
  const out = [];
  for (let i = 0; i < count; i++) {
    const idx = randInt(arr.length);
    out.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return out;
}

function suitHcp(cards) {
  return cards.reduce((sum, r) => sum + (RANK_VALUE[r] || 0), 0);
}

export const VULNERABILITIES = ['None', 'NS', 'EW', 'Both'];

export function dealVulnerability() {
  return VULNERABILITIES[randInt(VULNERABILITIES.length)];
}

/**
 * Deal one concrete 13-card hand satisfying the given HCP range and one of the
 * allowed shapes (shape strings are S-H-D-C length order, e.g. "4432").
 * Uses rejection sampling: cheap to compute, and shape/HCP windows in this
 * question bank are narrow but not vanishingly so.
 */
export function dealHand(minHcp, maxHcp, shapes, maxAttempts = 50000) {
  if (!shapes || shapes.length === 0) {
    // No constraints at all (shouldn't normally be called in this case) — deal a random 13-card hand.
    shapes = ['13000']; // placeholder, unused branch below guards against this
  }

  let best = null;
  let bestDist = Infinity;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shapeStr = shapes[randInt(shapes.length)];
    const lengths = shapeStr.split('').map(Number); // [S,H,D,C]
    const hand = {};
    SUITS.forEach((suit, i) => {
      hand[suit] = sampleDistinct(RANKS, lengths[i]);
    });
    const total = SUITS.reduce((sum, s) => sum + suitHcp(hand[s]), 0);

    if (total >= minHcp && total <= maxHcp) {
      return hand;
    }
    const dist = total < minHcp ? minHcp - total : total - maxHcp;
    if (dist < bestDist) {
      bestDist = dist;
      best = hand;
    }
  }

  // Fallback: couldn't hit the exact window in maxAttempts — return the closest we found.
  // eslint-disable-next-line no-console
  console.warn(`dealHand: could not hit HCP range [${minHcp},${maxHcp}] exactly after ${maxAttempts} attempts, using closest (off by ${bestDist}).`);
  return best;
}
