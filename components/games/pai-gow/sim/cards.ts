// Vendored from: C:\Users\echom\clawd\apechurch\ape-gow\sim\src\cards.ts

import type { Card, Rank, Suit } from './types';
import { xorshift32 } from './prng';

// Standard 52-card components (Joker handled separately)
export const SUITS_STD: Suit[] = ['C', 'D', 'H', 'S'];
export const RANKS_STD: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export function isJoker(c: Card): boolean {
  return c.rank === 'X' && c.suit === 'J';
}

export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function parseCard(id: string): Card {
  if (id.length !== 2) throw new Error(`Bad card id: ${id}`);
  const rank = id[0] as Rank;
  const suit = id[1] as Suit;
  // Joker: XJ
  if (rank === 'X' && suit === 'J') return { rank, suit };
  if (!RANKS_STD.includes(rank) || !SUITS_STD.includes(suit)) throw new Error(`Bad card id: ${id}`);
  return { rank, suit };
}

export function rankValueHigh(rank: Rank): number {
  // Pai Gow Joker is "semi-wild"; when not used to complete straight/flush,
  // it plays as an Ace. For most logic, treat 'X' as Ace-high (14).
  switch (rank) {
    case 'X': return 14;
    case 'A': return 14;
    case 'K': return 13;
    case 'Q': return 12;
    case 'J': return 11;
    case 'T': return 10;
    default: return Number(rank);
  }
}

export function makeDeck53(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS_STD) for (const r of RANKS_STD) deck.push({ rank: r, suit: s });
  deck.push({ rank: 'X', suit: 'J' });
  return deck;
}

export function shuffleInPlace<T>(arr: T[], seedU32: number): T[] {
  const rand = xorshift32(seedU32 >>> 0);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Legacy helper (kept for older scripts; now unused by dealRound)
export function drawWithReplacement(seedU32: number, index: number): Card {
  const rand = xorshift32((seedU32 ^ (index * 0x9e3779b9)) >>> 0);
  const r = rand();
  const suit = SUITS_STD[Math.floor(r * 4) % 4];
  const r2 = rand();
  const rank = RANKS_STD[Math.floor(r2 * RANKS_STD.length) % RANKS_STD.length];
  return { rank, suit };
}
