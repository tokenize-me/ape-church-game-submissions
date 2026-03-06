import type { Card, FiveCardHand, Rank, Suit } from './types';
import { isJoker, rankValueHigh } from './cards';

// 5-card poker eval (no Joker). Categories (low->high):
// 0 High Card
// 1 One Pair
// 2 Two Pair
// 3 Trips
// 4 Straight
// 5 Flush
// 6 Full House
// 7 Quads
// 8 Straight Flush

export type FiveRank = {
  category: number;
  ranks: number[]; // high-to-low comparison vector
};

function isFlush(cards: Card[]): boolean {
  return cards.every(c => c.suit === cards[0].suit);
}

function straightHigh(sortedUnique: number[]): number | null {
  // input: unique ranks high->low
  const s = [...sortedUnique].sort((a,b)=>b-a);
  // wheel A-5
  // Face Up Pai Gow often treats A2345 as the SECOND highest straight (below AKQJT).
  // Represent it as 13.5 so it ranks above K-high (13) and below A-high (14).
  const wheel = [14,5,4,3,2];
  if (wheel.every(v => s.includes(v))) return 13.5;
  for (let i = 0; i <= s.length - 5; i++) {
    const start = s[i];
    let ok = true;
    for (let d = 1; d < 5; d++) {
      if (!s.includes(start - d)) { ok = false; break; }
    }
    if (ok) return start;
  }
  return null;
}

function eval5NoJoker(hand: FiveCardHand): FiveRank {
  const cards = [...hand];
  const vals = cards.map(c => rankValueHigh(c.rank)).sort((a, b) => b - a);
  const flush = isFlush(cards);
  const uniq = Array.from(new Set(vals));
  const sh = straightHigh(uniq);

  // counts
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = Array.from(counts.entries())
    .map(([v, c]) => ({ v, c }))
    .sort((a, b) => (b.c - a.c) || (b.v - a.v));

  if (flush && sh != null) {
    return { category: 8, ranks: [sh] };
  }

  if (groups[0].c === 4) {
    const quad = groups[0].v;
    const kicker = groups.find(g => g.v !== quad)!.v;
    return { category: 7, ranks: [quad, kicker] };
  }

  if (groups[0].c === 3 && groups[1]?.c === 2) {
    return { category: 6, ranks: [groups[0].v, groups[1].v] };
  }

  if (flush) {
    return { category: 5, ranks: vals };
  }

  if (sh != null) {
    return { category: 4, ranks: [sh] };
  }

  if (groups[0].c === 3) {
    const trips = groups[0].v;
    const kickers = groups.filter(g => g.c === 1).map(g => g.v).sort((a, b) => b - a);
    return { category: 3, ranks: [trips, ...kickers] };
  }

  if (groups[0].c === 2 && groups[1]?.c === 2) {
    const pairHi = Math.max(groups[0].v, groups[1].v);
    const pairLo = Math.min(groups[0].v, groups[1].v);
    const kicker = groups.find(g => g.c === 1)!.v;
    return { category: 2, ranks: [pairHi, pairLo, kicker] };
  }

  if (groups[0].c === 2) {
    const pair = groups[0].v;
    const kickers = groups.filter(g => g.c === 1).map(g => g.v).sort((a, b) => b - a);
    return { category: 1, ranks: [pair, ...kickers] };
  }

  return { category: 0, ranks: vals };
}

function bestStraightHighWithJoker(nonJokerVals: number[]): number | null {
  // Determine if a straight can be formed using the 4 non-joker ranks + joker as the missing rank.
  const uniq = Array.from(new Set(nonJokerVals));
  // Consider all possible straight highs from A(14) down to 5 (wheel)
  for (let high = 14; high >= 5; high--) {
    const needed = high === 5 ? [14, 5, 4, 3, 2] : [high, high - 1, high - 2, high - 3, high - 4];
    let missing = 0;
    for (const v of needed) if (!uniq.includes(v)) missing++;
    if (missing === 1) return high === 5 ? 13.5 : high;
    if (missing === 0) return high === 5 ? 13.5 : high; // already a straight; joker unused
  }
  return null;
}

function bestFlushRanksWithJoker(nonJokerVals: number[]): number[] {
  // Choose joker rank to maximize flush kicker vector.
  const used = new Set(nonJokerVals);
  const all = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  let jokerVal = 14;
  for (const v of all) {
    if (!used.has(v)) { jokerVal = v; break; }
  }
  return [...nonJokerVals, jokerVal].sort((a, b) => b - a);
}

export function eval5(hand: FiveCardHand): FiveRank {
  const cards = [...hand];
  const jokerIdx = cards.findIndex(isJoker);
  if (jokerIdx === -1) return eval5NoJoker(hand);

  // Pai-Gow style Joker rule (requested):
  // - If Joker can complete a straight and/or flush, treat it as the needed card (choose best such outcome).
  // - Otherwise, Joker plays as an Ace.

  const nonJokers = cards.filter(c => !isJoker(c));
  const straightOrFlushCandidates: FiveRank[] = [];

  // Straight Flush / Flush candidates require 4 cards of same suit.
  for (const suit of ['C', 'D', 'H', 'S'] as Suit[]) {
    const suited = nonJokers.filter(c => c.suit === suit);
    if (suited.length !== 4) continue;

    const suitedVals = suited.map(c => rankValueHigh(c.rank));

    const sh = bestStraightHighWithJoker(suitedVals);
    if (sh != null) straightOrFlushCandidates.push({ category: 8, ranks: [sh] });

    // Always can complete a flush if we have 4 suited cards.
    straightOrFlushCandidates.push({ category: 5, ranks: bestFlushRanksWithJoker(suitedVals) });
  }

  // Straight (no suit requirement)
  {
    const vals = nonJokers.map(c => rankValueHigh(c.rank));
    const sh = bestStraightHighWithJoker(vals);
    if (sh != null) straightOrFlushCandidates.push({ category: 4, ranks: [sh] });
  }

  if (straightOrFlushCandidates.length > 0) {
    // Return the best among straight/flush/straight-flush outcomes.
    let best = straightOrFlushCandidates[0]!;
    for (let i = 1; i < straightOrFlushCandidates.length; i++) {
      const cand = straightOrFlushCandidates[i]!;
      if (compare5(cand, best) > 0) best = cand;
    }
    return best;
  }

  // Otherwise: Joker is an Ace.
  const asAce: FiveCardHand = cards.map((c) => isJoker(c) ? ({ rank: 'A' as Rank, suit: 'S' as Suit }) : c) as FiveCardHand;
  return eval5NoJoker(asAce);
}

export function compare5(x: FiveRank, y: FiveRank): number {
  if (x.category !== y.category) return x.category - y.category;
  const n = Math.max(x.ranks.length, y.ranks.length);
  for (let i = 0; i < n; i++) {
    const dx = (x.ranks[i] ?? 0) - (y.ranks[i] ?? 0);
    if (dx !== 0) return dx;
  }
  return 0;
}
