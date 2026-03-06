import type { RoundDeal, SevenCardHand } from './types';
import { makeDeck53, shuffleInPlace } from './cards';

export function dealRound(seedU32: number): RoundDeal {
  // Finite deck: 52 + Joker, dealt without replacement.
  // Deterministic per seed via Fisher–Yates shuffle.
  const deck = shuffleInPlace(makeDeck53(), seedU32);

  const player = deck.slice(0, 7) as SevenCardHand;
  const house = deck.slice(7, 14) as SevenCardHand;

  return { player, house };
}
