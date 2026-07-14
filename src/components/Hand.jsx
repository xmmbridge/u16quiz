import { SUITS, SUIT_SYMBOL, SUIT_COLOR, sortSuitCards } from '../lib/cards.js';

export default function Hand({ hand }) {
  return (
    <div className="hand-box">
      {SUITS.map((s) => {
        const cards = sortSuitCards(hand[s] || []);
        return (
          <div className="hand-suit-row" key={s}>
            <span className={`sym ${SUIT_COLOR[s]}`}>{SUIT_SYMBOL[s]}</span>
            {cards.length ? (
              <span className="cards">{cards.join(' ')}</span>
            ) : (
              <span className="cards empty">&mdash;</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
