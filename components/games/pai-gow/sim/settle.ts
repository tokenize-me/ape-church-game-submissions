import type { Outcome, PlayerSplit, RoundDeal, FiveCardHand, Card } from './types';
import { eval2, compare2 } from './eval2';
import { eval5, compare5 } from './eval5';
import { houseWayV0 } from './houseWay';
import { evalSideBets7 } from './sidebets';

export type SettleConfig = {
  tiesGoToHouse: boolean; // recommended true
  mainPayoutMultiplierWin: number; // e.g. 1 (1:1)

  // Face Up Pai Gow: if dealer's BEST 5-card hand is Ace-high, main wager auto-push.
  faceUpAceHighPush?: boolean;

  // side wager pays multiplier x wager if it hits. (gross)
  payoutCapMultiplier?: number; // optional cap relative to mainWager+sideWager
};

export type RoundResult = {
  outcome: Outcome;
  player: PlayerSplit;
  house: PlayerSplit;
  mainPayout: number;

  // BONUS side bet (your current table)
  sidePayout: number;
  sideHit?: { name: string; multiplier: number };

  // Face Up Pai Gow side bet
  pushAceHighPayout?: number;
  pushAceHighHit?: { name: string; multiplier: number };
  dealerAceHighPaiGow?: boolean;
};

export function compareHands(player: PlayerSplit, house: PlayerSplit, tiesGoToHouse: boolean): Outcome {
  const ph = eval5(player.high);
  const hh = eval5(house.high);
  const pl = eval2(player.low);
  const hl = eval2(house.low);

  const highCmp = compare5(ph, hh);
  const lowCmp = compare2(pl, hl);

  const highWin = tiesGoToHouse ? (highCmp > 0) : (highCmp >= 0);
  const highLose = tiesGoToHouse ? (highCmp <= 0) : (highCmp < 0);

  const lowWin = tiesGoToHouse ? (lowCmp > 0) : (lowCmp >= 0);
  const lowLose = tiesGoToHouse ? (lowCmp <= 0) : (lowCmp < 0);

  if (highWin && lowWin) return 'WIN';
  if (highLose && lowLose) return 'LOSE';
  return 'PUSH';
}

export function settleRound(args: {
  deal: RoundDeal;
  playerSplit: PlayerSplit;
  mainWager: number;
  sideWager?: number;
  // Face Up: optional Push Ace High wager
  pushAceHighWager?: number;
  config?: Partial<SettleConfig>;
}): RoundResult {
  const cfg: SettleConfig = {
    tiesGoToHouse: true,
    mainPayoutMultiplierWin: 1,
    faceUpAceHighPush: false,
    ...args.config
  };

  const houseSplit = houseWayV0(args.deal.house);

  const toFiveCardHand = (cards: Card[]): FiveCardHand => {
    if (cards.length !== 5) throw new Error('Expected 5 cards');
    return cards as unknown as FiveCardHand;
  };

  // Determine if dealer has an Ace-high pai gow (BEST 5-card hand is Ace-high).
  // That means: best 5-card category is High Card AND its top rank is Ace.
  const best5 = (seven: RoundDeal["player"] | RoundDeal["house"]) => {
    const cards = [...seven];
    let best: ReturnType<typeof eval5> | null = null;
    for (let omit1 = 0; omit1 < 7; omit1++) {
      for (let omit2 = omit1 + 1; omit2 < 7; omit2++) {
        const five = cards.filter((_, i) => i !== omit1 && i !== omit2);
        const r = eval5(toFiveCardHand(five));
        if (!best || compare5(r, best) > 0) best = r;
      }
    }
    return best;
  };

  const dealerBest5 = best5(args.deal.house);
  const dealerAceHighPaiGow =
    !!cfg.faceUpAceHighPush &&
    dealerBest5 != null &&
    dealerBest5.category === 0 &&
    (dealerBest5.ranks?.[0] ?? 0) === 14;

  const outcome = dealerAceHighPaiGow ? 'PUSH' : compareHands(args.playerSplit, houseSplit, cfg.tiesGoToHouse);

  let mainPayout = 0;
  if (outcome === 'WIN') mainPayout = args.mainWager * cfg.mainPayoutMultiplierWin;
  if (outcome === 'LOSE') mainPayout = -args.mainWager;

  // Side bet
  let sidePayout = 0;
  let sideHit: { name: string; multiplier: number } | undefined = undefined;
  const sideWager = args.sideWager ?? 0;
  if (sideWager > 0) {
    const hit = evalSideBets7(args.deal.player);
    if (hit) {
      sideHit = hit;
      sidePayout = sideWager * hit.multiplier;
    } else {
      sidePayout = -sideWager;
    }
  }

  // Optional payout cap relative to wagers (placeholder; house pool cap is separate)
  if (cfg.payoutCapMultiplier != null) {
    const cap = (args.mainWager + sideWager) * cfg.payoutCapMultiplier;
    mainPayout = Math.max(-cap, Math.min(cap, mainPayout));
    sidePayout = Math.max(-cap, Math.min(cap, sidePayout));
  }

  // Push Ace High side bet (Face Up Pai Gow)
  let pushAceHighPayout: number | undefined = undefined;
  let pushAceHighHit: { name: string; multiplier: number } | undefined = undefined;
  const pushWager = args.pushAceHighWager ?? 0;
  if (pushWager > 0) {
    if (dealerAceHighPaiGow) {
      const dealerHasJoker = args.deal.house.some((c) => c.rank === 'X');
      const playerBest5 = best5(args.deal.player);
      const playerAceHigh = playerBest5 != null && playerBest5.category === 0 && (playerBest5.ranks?.[0] ?? 0) === 14;

      if (playerAceHigh) {
        pushAceHighHit = { name: 'Player + Dealer Ace High', multiplier: 40 };
      } else if (dealerHasJoker) {
        pushAceHighHit = { name: 'Dealer Ace High (with Joker)', multiplier: 15 };
      } else {
        pushAceHighHit = { name: 'Dealer Ace High', multiplier: 5 };
      }
      pushAceHighPayout = pushWager * pushAceHighHit.multiplier;
    } else {
      pushAceHighPayout = -pushWager;
    }
  }

  return {
    outcome,
    player: args.playerSplit,
    house: houseSplit,
    mainPayout,
    sidePayout,
    sideHit,
    pushAceHighPayout,
    pushAceHighHit,
    dealerAceHighPaiGow,
  };
}
