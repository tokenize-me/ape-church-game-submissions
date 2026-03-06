import type { PlayerSplit, SevenCardHand, TwoCardHand, FiveCardHand, Card } from './types';
import { eval2, compare2 } from './eval2';
import { eval5, compare5 } from './eval5';

// House Way v0 (simple deterministic):
// - Try all 21 possible 5/2 splits.
// - Keep only valid splits (high >= low).
// - Choose the split that maximizes: (highRank, then lowRank)
// This is not a casino-accurate Pai Gow House Way, but it's deterministic,
// on-chain friendly, and gives the House a coherent strategy.

function combos5of7<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  const n = arr.length;
  for (let a = 0; a < n-4; a++)
  for (let b = a+1; b < n-3; b++)
  for (let c = b+1; c < n-2; c++)
  for (let d = c+1; d < n-1; d++)
  for (let e = d+1; e < n; e++) {
    out.push([arr[a], arr[b], arr[c], arr[d], arr[e]]);
  }
  return out;
}

export function houseWayV0(seven: SevenCardHand): PlayerSplit {
  const cards = [...seven];
  const c5s = combos5of7(cards);

  let best: PlayerSplit | null = null;
  let bestHigh: ReturnType<typeof eval5> | null = null;
  let bestLow: ReturnType<typeof eval2> | null = null;

  for (const high of c5s) {
    // remaining 2
    const remaining: Card[] = [];
    const counts = new Map<string, number>();
    for (const c of cards) {
      const id = c.rank + c.suit;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const c of high) {
      const id = c.rank + c.suit;
      counts.set(id, (counts.get(id) ?? 0) - 1);
    }
    for (const c of cards) {
      const id = c.rank + c.suit;
      const n = counts.get(id) ?? 0;
      if (n > 0) {
        remaining.push(c);
        counts.set(id, n - 1);
      }
    }
    if (remaining.length !== 2) continue;

    const split: PlayerSplit = {
      high: high as FiveCardHand,
      low: remaining as TwoCardHand
    };

    // validity: high >= low (conservative)
    const lowR = eval2(split.low);
    const highR = eval5(split.high);
    const valid = (lowR.category === 0) || (highR.category > 0) || ((highR.ranks[0] ?? 0) >= (lowR.ranks[0] ?? 0));
    if (!valid) continue;

    if (!best) {
      best = split; bestHigh = highR; bestLow = lowR; continue;
    }

    const ch = compare5(highR, bestHigh!);
    if (ch > 0) { best = split; bestHigh = highR; bestLow = lowR; continue; }
    if (ch < 0) continue;

    const cl = compare2(lowR, bestLow!);
    if (cl > 0) { best = split; bestHigh = highR; bestLow = lowR; }
  }

  if (!best) {
    // fallback: first 5/2 split
    return { high: cards.slice(0,5) as FiveCardHand, low: cards.slice(5,7) as TwoCardHand };
  }
  return best;
}
