import { seatForPosition, formatBid } from '../lib/bidding.js';

const SEATS = ['N', 'E', 'S', 'W'];

function isSeatVulnerable(seat, vulnerability) {
  if (vulnerability === 'Both') return true;
  if (vulnerability === 'NS') return seat === 'N' || seat === 'S';
  if (vulnerability === 'EW') return seat === 'E' || seat === 'W';
  return false;
}

export default function AuctionTable({ auctionSoFar, isConstructive, testedSeat, vulnerability }) {
  // Build rows of 4 (N,E,S,W), leaving blanks for seats that don't call
  // (either because it's before their first turn, or — in constructive-only
  // auctions — because they silently pass throughout).
  const rows = [];
  let row = { N: null, E: null, S: null, W: null };

  const rowEndsAt = (seat) => (seat === 'W' || (isConstructive && seat === 'S'));

  for (let pos = 1; pos <= auctionSoFar.length; pos++) {
    const seat = seatForPosition(pos, isConstructive);
    row[seat] = { token: auctionSoFar[pos - 1], pos };
    if (rowEndsAt(seat)) {
      rows.push(row);
      row = { N: null, E: null, S: null, W: null };
    }
  }

  const nextSeat = testedSeat;
  // Attach the "next to call" marker: either into the still-open trailing row, or a fresh one.
  const hasOpenRow = Object.values(row).some((c) => c !== null) || auctionSoFar.length === 0;
  if (hasOpenRow) {
    row[nextSeat] = { marker: true };
    rows.push(row);
  } else {
    rows.push({ N: null, E: null, S: null, W: null, [nextSeat]: { marker: true } });
  }

  return (
    <>
      <table className="auction-table">
        <thead>
          <tr>
            {SEATS.map((s) => (
              <th key={s} className={vulnerability ? (isSeatVulnerable(s, vulnerability) ? 'vul' : 'nonvul') : ''}>
                {s}
                {s === 'N' && <span className="dealer-tag">dealer</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {SEATS.map((s) => {
                const cell = r[s];
                if (cell?.marker) {
                  return <td key={s} className="tested">?</td>;
                }
                if (!cell) {
                  // constructive auctions: E/W never call, show a soft dash instead of blank
                  return <td key={s} className="empty">{isConstructive && (s === 'E' || s === 'W') ? '—' : ''}</td>;
                }
                const { text, color, level, symbol } = formatBid(cell.token);
                if (level) {
                  return (
                    <td key={s}>
                      {level}<span className={color}>{symbol}</span>
                    </td>
                  );
                }
                return <td key={s} className={color}>{text}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
