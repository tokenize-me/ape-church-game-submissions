// Vendored from: C:\Users\echom\clawd\apechurch\ape-gow\sim\src\types.ts
// Purpose: reuse our existing Pai Gow sim logic inside the Ape Church Next.js template.

// NOTE: This sim uses a Pai-Gow-style 53-card deck: 52 standard cards + 1 Joker.
// We represent Joker as the 2-char id "XJ" (rank 'X', suit 'J').
export type Suit = 'C' | 'D' | 'H' | 'S' | 'J';
export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2' | 'X';

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type TwoCardHand = [Card, Card];
export type FiveCardHand = [Card, Card, Card, Card, Card];
export type SevenCardHand = [Card, Card, Card, Card, Card, Card, Card];

export type PlayerSplit = {
  high: FiveCardHand;
  low: TwoCardHand;
};

export type RoundDeal = {
  player: SevenCardHand;
  house: SevenCardHand;
};

export type Outcome = 'WIN' | 'LOSE' | 'PUSH';
