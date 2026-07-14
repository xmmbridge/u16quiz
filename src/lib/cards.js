export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_COLOR = { S: 'black', H: 'red', D: 'red', C: 'black' };
export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const RANK_VALUE = { A: 4, K: 3, Q: 2, J: 1 };

export function sortSuitCards(cards) {
  return [...cards].sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b));
}

export function handHcp(hand) {
  let total = 0;
  SUITS.forEach((s) => {
    (hand[s] || []).forEach((r) => { total += RANK_VALUE[r] || 0; });
  });
  return total;
}
