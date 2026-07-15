import { formatBid } from '../lib/bidding.js';

const SUIT_ORDER = ['C', 'D', 'H', 'S', 'N'];

export default function BiddingBox({ legalOptions, selected, onSelect, disabled }) {
  const legalSet = new Set(legalOptions);
  const selectedSet = new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);

  return (
    <div className="bidding-box">
      <div className="bb-row special">
        {['P', 'X', 'XX'].map((token) => {
          const { text, color } = formatBid(token);
          const isLegal = legalSet.has(token);
          return (
            <button
              key={token}
              className={`bb-btn ${color} ${selectedSet.has(token) ? 'selected' : ''}`}
              disabled={disabled || !isLegal}
              onClick={(e) => { e.currentTarget.blur(); onSelect(token); }}
            >
              {text}
            </button>
          );
        })}
      </div>
      {[1, 2, 3, 4, 5, 6, 7].map((level) => (
        <div className="bb-row" key={level}>
          {SUIT_ORDER.map((suit) => {
            const token = suit === 'N' ? `${level}N` : `${level}${suit}`;
            const { text, color } = formatBid(token);
            const isLegal = legalSet.has(token);
            return (
              <button
                key={token}
                className={`bb-btn ${color} ${selectedSet.has(token) ? 'selected' : ''}`}
                disabled={disabled || !isLegal}
                onClick={(e) => { e.currentTarget.blur(); onSelect(token); }}
              >
                {text}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
