import type { Card, SevenCardHand } from './types';
import { isJoker, rankValueHigh } from './cards';
import { compare5, eval5 } from './eval5';

export type SideBetResult = {
  name: string;
  multiplier: number; // gross payout multiplier
};

// Side bets resolve on the player's 7-card hand.
// Rule: if multiple conditions match, award the highest multiplier.

function valuesWithWheel(vals: number[]): number[] {
  // represent Ace as both 14 and 1 for straight detection convenience
  const out: number[] = [];
  for (const v of vals) {
    out.push(v);
    if (v === 14) out.push(1);
  }
  return out;
}

function isStraightRun(vals: number[], runLen: number): boolean {
  // vals can include 1 for Ace-low; expects unique set
  const u = Array.from(new Set(vals)).sort((a, b) => a - b);
  for (let i = 0; i < u.length; i++) {
    let ok = true;
    for (let d = 1; d < runLen; d++) {
      if (!u.includes(u[i] + d)) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function sevenCardStraightFlushNoJoker(cards: SevenCardHand): boolean {
  if (cards.some(isJoker)) return false;
  const suit = cards[0].suit;
  if (!cards.every((c) => c.suit === suit)) return false;
  const vals = cards.map((c) => rankValueHigh(c.rank));
  return isStraightRun(valuesWithWheel(vals), 7);
}

function sevenCardStraightFlushWithJoker(cards: SevenCardHand): boolean {
  const jokers = cards.filter(isJoker);
  if (jokers.length !== 1) return false;
  const non = cards.filter((c) => !isJoker(c));
  // require 6 cards same suit
  const suit = non[0].suit;
  if (!non.every((c) => c.suit === suit)) return false;

  const base = non.map((c) => rankValueHigh(c.rank));
  const used = new Set(valuesWithWheel(base));

  // Try joker as each missing rank value 2..14 (and also allow Ace-low via 1 implicitly)
  for (let v = 2; v <= 14; v++) {
    if (used.has(v) || (v === 14 && used.has(14))) continue;
    const vals = [...base, v];
    if (isStraightRun(valuesWithWheel(vals), 7)) return true;
  }
  // Also allow joker as Ace (14) even if 14 already present (would create duplicate rank but could still form a run?);
  // for 7-card straight flush we require 7 distinct ranks, so skip duplicates.
  return false;
}

function fiveAces(cards: SevenCardHand): boolean {
  // 4 Aces + Joker (semi-wild) counts as 5 aces
  const hasJ = cards.some(isJoker);
  if (!hasJ) return false;
  const aces = cards.filter((c) => c.rank === 'A').length;
  return aces === 4;
}

const toFiveCardHand = (cards: Card[]) => {
  if (cards.length !== 5) throw new Error('Expected 5 cards');
  return cards as unknown as [Card, Card, Card, Card, Card];
};

function bestFiveFromSeven(cards: SevenCardHand): { category: number; ranks: number[]; used: Card[] } {
  const arr = [...cards];
  let best: { category: number; ranks: number[] } | null = null;
  let bestUsed: Card[] = [];
  // 7 choose 5 = 21 (choose 2 cards to omit)
  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 7; b++) {
      // omit a,b => take the other 5
      const used = arr.filter((_, i) => i !== a && i !== b);
      const r = eval5(toFiveCardHand(used));
      if (!best || compare5(r, best) > 0) {
        best = r;
        bestUsed = used;
      }
    }
  }
  return { category: best!.category, ranks: best!.ranks, used: bestUsed };
}

function isRoyalFlush(used5: Card[]): boolean {
  // Must be a straight flush with high card Ace (14) and contain T,J,Q,K,A (joker may stand in)
  const r = eval5(toFiveCardHand(used5));
  if (r.category !== 8) return false;
  if ((r.ranks[0] ?? 0) !== 14) return false;

  // Verify the needed ranks exist among the 5 cards, allowing joker to fill one missing.
  const needed = new Set([14, 13, 12, 11, 10]);
  let joker = 0;
  const vals = used5.map((c) => (isJoker(c) ? null : rankValueHigh(c.rank)));
  for (const v of vals) {
    if (v == null) {
      joker++;
      continue;
    }
    needed.delete(v);
  }
  return needed.size <= joker;
}

function isRoyalMatch2(cards2: Card[]): boolean {
  if (cards2.length !== 2) return false;
  if (cards2.some(isJoker)) return false; // joker cannot be used for the royal match
  const [a, b] = cards2;
  const ranks = [a.rank, b.rank].sort().join('');
  if (!(ranks === 'KQ')) return false;
  return a.suit === b.suit;
}

function royalFlushPlusRoyalMatch(cards: SevenCardHand): boolean {
  // In the same 7-card hand:
  // - Any 5-card Royal Flush (joker may be used per our eval5 joker rule)
  // - Remaining 2 cards are a suited K+Q (joker NOT allowed for match)
  const arr = [...cards];
  // choose which 2 cards are the "remaining" cards for the Royal Match; the other 5 must be a Royal Flush
  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 7; b++) {
      const five = arr.filter((_, i) => i !== a && i !== b);
      if (!isRoyalFlush(five)) continue;
      const two = [arr[a], arr[b]];
      if (isRoyalMatch2(two)) return true;
    }
  }
  return false;
}

export function evalSideBets7(cards: SevenCardHand): SideBetResult | null {
  let best: SideBetResult | null = null;
  const consider = (r: SideBetResult) => {
    if (!best || r.multiplier > best.multiplier) best = r;
  };

  // Top tiers
  if (sevenCardStraightFlushNoJoker(cards)) consider({ name: '7-card Straight Flush (no Joker)', multiplier: 5000 });
  if (royalFlushPlusRoyalMatch(cards)) consider({ name: 'Royal Flush + Royal Match', multiplier: 2000 });
  if (sevenCardStraightFlushWithJoker(cards)) consider({ name: '7-card Straight Flush (with Joker)', multiplier: 1000 });
  if (fiveAces(cards)) consider({ name: 'Five Aces', multiplier: 400 });

  const best5 = bestFiveFromSeven(cards);
  const used5 = best5.used;

  // Royal Flush
  if (isRoyalFlush(used5)) consider({ name: 'Royal Flush', multiplier: 150 });

  // Other ranks based on best 5-card hand
  if (best5.category === 8) consider({ name: 'Straight Flush', multiplier: 50 });
  if (best5.category === 7) consider({ name: 'Four of a Kind', multiplier: 25 });
  if (best5.category === 6) consider({ name: 'Full House', multiplier: 5 });
  if (best5.category === 5) consider({ name: 'Flush', multiplier: 4 });
  if (best5.category === 3) consider({ name: 'Three of a Kind', multiplier: 3 });
  if (best5.category === 4) consider({ name: 'Straight', multiplier: 2 });

  return best;
}
