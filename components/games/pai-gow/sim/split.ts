import type { PlayerSplit, SevenCardHand, TwoCardHand, FiveCardHand } from './types';
import { eval2 } from './eval2';
import { eval5 } from './eval5';

export function validateSplit(seven: SevenCardHand, split: PlayerSplit): { ok: boolean; reason?: string } {
  // Basic membership check (allows duplicates in seven; enforce multiset count)
  const counts = new Map<string, number>();
  for (const c of seven) {
    const id = c.rank + c.suit;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const take = (c: { rank: string; suit: string }) => {
    const id = c.rank + c.suit;
    const n = counts.get(id) ?? 0;
    if (n <= 0) return false;
    counts.set(id, n - 1);
    return true;
  };
  for (const c of split.low) if (!take(c)) return { ok: false, reason: 'Split uses card not in 7-card hand (or too many copies).' };
  for (const c of split.high) if (!take(c)) return { ok: false, reason: 'Split uses card not in 7-card hand (or too many copies).' };

  // Ranking constraint: high >= low.
  const lowR = eval2(split.low);
  const highR = eval5(split.high);

  // Compare categories by mapping 2-card category into 5-card scale is non-trivial.
  // Pai Gow uses poker ordering; for constraint we only need: high hand should not be weaker than low.
  // We'll implement a conservative check:
  // - Any 5-card hand of category >= 1 (pair+) always >= any 2-card high card.
  // - For 2-card pair, require 5-card be at least a pair of equal/higher rank OR better category.

  if (lowR.category === 0) {
    return { ok: true };
  }

  // low is a pair
  if (highR.category > 0) return { ok: true };
  // high is high-card only; compare its top rank vs low pair rank (must be >= to be valid)
  const highTop = highR.ranks[0] ?? 0;
  const lowPair = lowR.ranks[0] ?? 0;
  if (highTop >= lowPair) return { ok: true };

  return { ok: false, reason: 'Invalid split: 5-card high hand must rank >= 2-card low hand.' };
}

// Helper: naive auto-split for testing (not strategic)
export function naivePlayerSplit(seven: SevenCardHand): PlayerSplit {
  const sorted = [...seven].sort((a,b)=>{
    // naive: sort high-to-low by rank (Joker treated as Ace here)
    const order = 'AKQJT98765432';
    const ra = a.rank === 'X' ? 0 : order.indexOf(a.rank);
    const rb = b.rank === 'X' ? 0 : order.indexOf(b.rank);
    return ra - rb;
  });
  const high = sorted.slice(0,5) as FiveCardHand;
  const low = sorted.slice(5,7) as TwoCardHand;
  return { high, low };
}
