import type { TwoCardHand } from './types';
import { rankValueHigh } from './cards';

// 2-card hand ranking for low hand.
// Categories: High Card < Pair
// Tie-break: pair rank, then kicker; or for high card, sorted ranks.

export type TwoRank = {
  category: 0 | 1; // 0=high card, 1=pair
  ranks: number[]; // high-to-low comparison vector
};

export function eval2(hand: TwoCardHand): TwoRank {
  const [a, b] = hand;
  const ra = rankValueHigh(a.rank);
  const rb = rankValueHigh(b.rank);
  if (a.rank === b.rank) {
    return { category: 1, ranks: [ra] };
  }
  const hi = Math.max(ra, rb);
  const lo = Math.min(ra, rb);
  return { category: 0, ranks: [hi, lo] };
}

export function compare2(x: TwoRank, y: TwoRank): number {
  if (x.category !== y.category) return x.category - y.category;
  const n = Math.max(x.ranks.length, y.ranks.length);
  for (let i = 0; i < n; i++) {
    const dx = (x.ranks[i] ?? 0) - (y.ranks[i] ?? 0);
    if (dx !== 0) return dx;
  }
  return 0;
}
