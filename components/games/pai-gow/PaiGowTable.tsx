"use client";

// Ported (minimal changes) from gold master:
//   C:\Users\echom\Desktop\PaiGow\ape-gow\ui\src\App.tsx
// Goal: keep gameplay identical; only adjust imports/paths for Next.js template.

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Howl } from "howler";

import { paiGowCss } from "./paiGowStyles";

import { hashSeedToU32 } from "./sim/prng";
import type { Card as SimCard, SevenCardHand, PlayerSplit as SimPlayerSplit, FiveCardHand, TwoCardHand } from "./sim/types";
import { dealRound } from "./sim/deal";
import { validateSplit } from "./sim/split";
import { settleRound } from "./sim/settle";
import { houseWayV0 } from "./sim/houseWay";
import { eval5 } from "./sim/eval5";
import { eval2 } from "./sim/eval2";

import { CardFace } from "./CardFace";

// NOTE: We load assets from /public via absolute paths (Next.js safe).
const acLogo = "/submissions/pai-gow/assets/AC Logo/PNG/Logo_WithText/Logo_HorizontalText_White.png";

type Card = SimCard;

type PlayerSplit = { low: [Card, Card]; high: [Card, Card, Card, Card, Card] };

const rankValue: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  X: 15, // Joker
};

function handName5(category: number) {
  return (
    {
      0: "High Card",
      1: "One Pair",
      2: "Two Pair",
      3: "Three of a Kind",
      4: "Straight",
      5: "Flush",
      6: "Full House",
      7: "Four of a Kind",
      8: "Straight Flush",
    } as Record<number, string>
  )[category] ?? "—";
}

function handName2(category: number) {
  return category === 1 ? "Pair" : "High Card";
}

function sortCardsForDisplay(cards: Card[]) {
  // Vegas-ish: group duplicates together and generally show high→low.
  // Joker is shown last so it doesn't break the visual grouping.
  const counts = new Map<string, number>();
  for (const c of cards) {
    if (c.rank === "X") continue;
    counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  }

  return [...cards].sort((a, b) => {
    const aj = a.rank === "X";
    const bj = b.rank === "X";
    if (aj !== bj) return aj ? 1 : -1;

    const ca = counts.get(a.rank) ?? 1;
    const cb = counts.get(b.rank) ?? 1;
    if (ca !== cb) return cb - ca;

    const ra = rankValue[a.rank] ?? 0;
    const rb = rankValue[b.rank] ?? 0;
    return rb - ra;
  });
}

export type PaiGowTableStatus = {
  isLoading: boolean;
  isGameFinished: boolean;
  betAmount: number;
  payout: number;
  breakdown?: {
    totalWager: number;
    main: { wager: number; payout: number };
    bonus: { wager: number; payout: number; hit?: { name: string; multiplier: number } };
    push: { wager: number; payout: number; hit?: { name: string; multiplier: number } };
    outcome?: string;
    dealerAceHighPaiGow?: boolean;
  };
};

export type PaiGowTableHandle = {
  reset: () => void;
  playAgain: () => void;
  rewatch: () => void;
};

type PaiGowTableProps = {
  onStatusChange?: (s: PaiGowTableStatus) => void;
  /** When the table is rendered inside the template GameWindow, hide the extra top rail/header. */
  hideHeader?: boolean;
  /** On desktop, render the banner + betting UI into this element (template SetupCard). */
  desktopSidebarHostId?: string;

  /** Mute toggle from GameWindow (SFX button). */
  muteSfx?: boolean;

  /** Called on a user gesture so the shell can safely start background audio on mobile browsers. */
  onUserGesture?: () => void;
};

function CardSlot({ filled = false, visible = true }: { filled?: boolean; visible?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        width: "var(--cardW, 72px)",
        height: "var(--cardH, 100px)",
        borderRadius: 14,
        border: filled ? "1px solid rgba(0,0,0,0)" : "1px solid rgba(215,225,230,0.18)",
        background: filled ? "transparent" : "rgba(0,0,0,0.18)",
        boxShadow: filled ? "none" : "inset 0 1px 0 rgba(255,255,255,0.06)",
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
      }}
    />
  );
}


const PaiGowTable = forwardRef<PaiGowTableHandle, PaiGowTableProps>(function PaiGowTable(
  { onStatusChange, hideHeader = false, desktopSidebarHostId, muteSfx = false, onUserGesture },
  ref,
) {
  const [seed, setSeed] = useState("demo-seed-1"); // deterministic per hand

  // Audio (SFX)
  const flipSfxRef = useRef<Howl | null>(null);
  useEffect(() => {
    // NOTE: use absolute /public path (Next.js-safe)
    const s = new Howl({
      src: ["/submissions/pai-gow/audio/flipcard.mp3"],
      volume: 0.75,
      preload: true,
    });
    flipSfxRef.current = s;

    return () => {
      s.unload();
      flipSfxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const s = flipSfxRef.current;
    if (!s) return;
    s.mute(!!muteSfx);
  }, [muteSfx]);

  const playFlipSfx = useCallback(() => {
    const s = flipSfxRef.current;
    if (!s || muteSfx) return;
    // allow overlap for dealer 7-card flip sequence
    s.play();
  }, [muteSfx]);

  // ApeChurch lifecycle: 0 setup → 1 ongoing → 2 game over
  const [, setCurrentView] = useState<0 | 1 | 2>(0);
  const [isLoading, setIsLoading] = useState(false);

  const [main, setMain] = useState(0);
  const [side, setSide] = useState(0);
  const [push, setPush] = useState(0);

  // Track chips as the user places them (so stacking/undo is deterministic and non-glitchy)
  const [mainChips, setMainChips] = useState<number[]>([]);
  const [sideChips, setSideChips] = useState<number[]>([]);
  const [pushChips, setPushChips] = useState<number[]>([]);

  // chip UI (table-like). Units are 1/5/10/25/100.
  const [activeChip, setActiveChip] = useState(5);

  // Paytable popover: render via portal to <body> so it's always above chips/stacking contexts (iOS).
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [canPortal, setCanPortal] = useState(false);
  useEffect(() => setCanPortal(true), []);

  // Desktop layout: force 2-column layout based on viewport width.
  // This avoids mis-detecting desktop PCs that report a coarse pointer (touch monitors / Windows settings).
  const [desktopLayout, setDesktopLayout] = useState(false);
  useEffect(() => {
    const apply = () => setDesktopLayout(window.innerWidth >= 700);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // Desktop: optionally portal the sidebar (banner + betting UI) into the template SetupCard.
  // Keep this as a plain lookup (not memoized) so it works even if the host mounts slightly later.
  const desktopSidebarHost =
    desktopLayout && desktopSidebarHostId && typeof document !== "undefined"
      ? document.getElementById(desktopSidebarHostId)
      : null;

  useEffect(() => {
    if (!paytableOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPaytableOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paytableOpen]);

  // indices into the 7-card player hand
  const [lowIdx, setLowIdx] = useState<number[]>([]);
  const [highIdx, setHighIdx] = useState<number[]>([]);

  const [assignTarget, setAssignTarget] = useState<"low" | "high">("low");

  const [dealerRevealed, setDealerRevealed] = useState(false);
  const [dealerFlipped, setDealerFlipped] = useState<boolean[]>(() => Array(7).fill(false));
  const [dealerArranged, setDealerArranged] = useState(false);

  const [playerFlipped, setPlayerFlipped] = useState<boolean[]>(() => Array(7).fill(false));
  // Visual aid: sort your revealed pool to scan hands faster.
  const [playerSort, setPlayerSort] = useState<"none" | "asc" | "desc">("asc");

  const view = useMemo(() => {
    const seedU32 = hashSeedToU32(seed);
    const deal = dealRound(seedU32);

    const player7 = deal.player as unknown as Card[];
    const house7 = deal.house as unknown as Card[];

    const playerSplit: PlayerSplit | null =
      lowIdx.length === 2 && highIdx.length === 5
        ? {
            low: [player7[lowIdx[0]], player7[lowIdx[1]]],
            high: [
              player7[highIdx[0]],
              player7[highIdx[1]],
              player7[highIdx[2]],
              player7[highIdx[3]],
              player7[highIdx[4]],
            ],
          }
        : null;

    const houseSplitRaw = houseWayV0(house7 as unknown as SevenCardHand) as unknown as SimPlayerSplit;
    // Re-order for a "Vegas clean" presentation: group pairs/trips together, high→low.
    const houseSplit: PlayerSplit = {
      high: sortCardsForDisplay(houseSplitRaw.high) as unknown as PlayerSplit["high"],
      low: sortCardsForDisplay(houseSplitRaw.low) as unknown as PlayerSplit["low"],
    };

    // Map dealer's 7 cards -> target slot (High 0-4, Low 0-1) so we can animate into position.
    const used = new Set<number>();
    const dealerTargets: { row: "high" | "low"; slot: number }[] = Array(7)
      .fill(null)
      .map(() => ({ row: "high", slot: 0 }));

    function takeIndexFor(card: Card): number {
      for (let i = 0; i < house7.length; i++) {
        if (used.has(i)) continue;
        const c = house7[i];
        if (c.rank === card.rank && c.suit === card.suit) {
          used.add(i);
          return i;
        }
      }
      return -1;
    }

    for (let s = 0; s < 5; s++) {
      const idx = takeIndexFor(houseSplit.high[s]);
      if (idx >= 0) dealerTargets[idx] = { row: "high", slot: s };
    }
    for (let s = 0; s < 2; s++) {
      const idx = takeIndexFor(houseSplit.low[s]);
      if (idx >= 0) dealerTargets[idx] = { row: "low", slot: s };
    }

    const validation = playerSplit
      ? validateSplit(deal.player as unknown as SevenCardHand, playerSplit as unknown as SimPlayerSplit)
      : { ok: false, reason: "Pick 2 cards for Low and 5 for High." };

    const res =
      playerSplit && validation.ok
        ? settleRound({
            deal: deal as unknown as { player: SevenCardHand; house: SevenCardHand },
            playerSplit: playerSplit as unknown as SimPlayerSplit,
            mainWager: main,
            sideWager: side,
            pushAceHighWager: push,
            config: { faceUpAceHighPush: true },
          })
        : null;

    const dealerHighName = handName5(eval5(houseSplit.high as unknown as FiveCardHand).category);
    const dealerLowName = handName2(eval2(houseSplit.low as unknown as TwoCardHand).category);

    return {
      seedU32,
      deal,
      player7,
      house7,
      playerSplit,
      houseSplit,
      dealerTargets,
      validation,
      res,
      dealerHighName,
      dealerLowName,
    };
  }, [seed, main, side, push, lowIdx, highIdx]);

  const poolIdx = useMemo(() => {
    const taken = new Set([...lowIdx, ...highIdx]);
    return [0, 1, 2, 3, 4, 5, 6].filter((i) => !taken.has(i));
  }, [lowIdx, highIdx]);

  const displayPoolIdx = useMemo(() => {
    if (playerSort === "none") return poolIdx;

    const dir = playerSort === "asc" ? 1 : -1;
    return [...poolIdx].sort((ia, ib) => {
      // Keep unrevealed cards at the end once dealer arranged.
      const ra = dealerArranged && !playerFlipped[ia] ? 1 : 0;
      const rb = dealerArranged && !playerFlipped[ib] ? 1 : 0;
      if (ra !== rb) return ra - rb;

      const a = view.player7[ia];
      const b = view.player7[ib];
      const va = rankValue[a.rank] ?? 0;
      const vb = rankValue[b.rank] ?? 0;
      if (va !== vb) return (va - vb) * dir;
      return (a.suit > b.suit ? 1 : a.suit < b.suit ? -1 : 0) * dir;
    });
  }, [poolIdx, playerSort, dealerArranged, playerFlipped, view.player7]);

  const allPlayerRevealed = useMemo(() => playerFlipped.every(Boolean), [playerFlipped]);
  const canSplit = dealerArranged && allPlayerRevealed;

  const dealerSlotHigh = useMemo(() => {
    const slots: (Card | null)[] = Array(5).fill(null);
    for (let i = 0; i < view.dealerTargets.length; i++) {
      const t = view.dealerTargets[i];
      if (t.row === "high" && t.slot >= 0 && t.slot < 5) slots[t.slot] = view.house7[i];
    }
    return slots;
  }, [view.dealerTargets, view.house7]);

  const dealerSlotLow = useMemo(() => {
    const slots: (Card | null)[] = Array(2).fill(null);
    for (let i = 0; i < view.dealerTargets.length; i++) {
      const t = view.dealerTargets[i];
      if (t.row === "low" && t.slot >= 0 && t.slot < 2) slots[t.slot] = view.house7[i];
    }
    return slots;
  }, [view.dealerTargets, view.house7]);

  const dealerAllFlipped = useMemo(() => dealerFlipped.every(Boolean), [dealerFlipped]);
  const dealerSlotsFaceDown = !dealerAllFlipped;


  // Bets must be placed before any cards are flipped, then locked.
  const betsLocked = dealerRevealed;
  const hasMainBet = mainChips.length > 0 && main > 0;

  const isRoundComplete =
    dealerArranged &&
    allPlayerRevealed &&
    lowIdx.length === 2 &&
    highIdx.length === 5 &&
    view.validation.ok;

  // Game lifecycle (for template GameWindow integration)
  const [isGameFinished, setIsGameFinished] = useState(false);

  // Advance lifecycle to "game over" once a valid split is locked in.
  useEffect(() => {
    if (!isRoundComplete) return;
    setCurrentView(2);
    setIsGameFinished(true);
  }, [isRoundComplete]);

  function resetHands() {
    setLowIdx([]);
    setHighIdx([]);
    setAssignTarget("low");

    setDealerRevealed(false);
    setDealerFlipped(Array(7).fill(false));
    setDealerArranged(false);

    setPlayerFlipped(Array(7).fill(false));
  }

  function handleReset() {
    setIsGameFinished(false);
    // Full reset back to setup view
    resetHands();
    setIsLoading(false);
    setCurrentView(0);

    // reset bets + stacks
    setMain(0);
    setSide(0);
    setPush(0);
    setMainChips([]);
    setSideChips([]);
    setPushChips([]);
  }

// (Change bet removed — players can adjust bets directly before Play, and after results via modal)

  function handlePlayAgain() {
    setIsGameFinished(false);
    // Fresh hand (new deterministic seed), keep user in setup to place/adjust bets
    setSeed(`demo-${Date.now()}`);
    resetHands();
    setIsLoading(false);
    setCurrentView(0);
  }

  function handleRewatch() {
    setIsGameFinished(false);
    // Replay same seed/outcome without a new bet/tx (ApeChurch requirement)
    resetHands();
    setIsLoading(false);
    setCurrentView(1);
    // kick off the dealer flow again
    flipDealer();
  }

  async function playGame() {
    // Start a new game with current bet (simulated tx)
    onUserGesture?.();
    setIsGameFinished(false);
    if (dealerRevealed) return;

    // Face Up Pai Gow: MAIN wager required; side bets optional.
    if (!hasMainBet) return;

    setIsLoading(true);
    setCurrentView(1);

    // simulate chain confirmation delay
    window.setTimeout(() => {
      setIsLoading(false);
      flipDealer();
    }, 450);
  }

  function clickPool(i: number) {
    onUserGesture?.();

    // Before split-stage: clicks flip cards (player reveal flow)
    if (!dealerRevealed) return;

    if (!playerFlipped[i]) {
      playFlipSfx();
      const next = [...playerFlipped];
      next[i] = true;
      setPlayerFlipped(next);
      return;
    }

    // Split-stage: clicks assign cards to Low/High
    if (!canSplit) return;

    if (assignTarget === "low") {
      if (lowIdx.length >= 2) return;
      setLowIdx([...lowIdx, i]);
      if (lowIdx.length + 1 >= 2) setAssignTarget("high");
      return;
    }

    if (highIdx.length >= 5) return;
    setHighIdx([...highIdx, i]);
  }

  function removeFromLow(i: number) {
    setLowIdx(lowIdx.filter((x) => x !== i));
    setAssignTarget("low");
  }

  function removeFromHigh(i: number) {
    setHighIdx(highIdx.filter((x) => x !== i));
    setAssignTarget("high");
  }

  function setTargetLow() {
    if (!canSplit) return;
    setAssignTarget("low");
  }

  function setTargetHigh() {
    if (!canSplit) return;
    // If Low isn't filled yet, keep it honest.
    if (lowIdx.length < 2) {
      setAssignTarget("low");
      return;
    }
    setAssignTarget("high");
  }

  function flipDealer() {
    if (dealerRevealed) return;

    // Phase 1: flip 7 cards (one by one)
    setDealerRevealed(true);
    setDealerArranged(false);
    setDealerFlipped(Array(7).fill(false));

    for (let i = 0; i < 7; i++) {
      window.setTimeout(() => {
        playFlipSfx();
        setDealerFlipped((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, i * 120);
    }

    // Phase 2: arrange
    window.setTimeout(() => {
      setDealerArranged(true);
    }, 7 * 120 + 650);
  }

  const flipAllPlayer = useCallback(() => {
    onUserGesture?.();
    if (!dealerArranged) return;

    // One flip sound for the bulk reveal (avoid 7 rapid-fire overlaps)
    playFlipSfx();
    setPlayerFlipped(Array(7).fill(true));
  }, [dealerArranged, playFlipSfx, onUserGesture]);

  const autoSplitHouseWay = useCallback(() => {
    if (!canSplit) return;

    // Map split cards back to indices in the 7-card hand (handle duplicates safely)
    const cards = view.player7;
    const used = new Set<number>();

    function pickIndexFor(card: Card): number {
      for (let i = 0; i < cards.length; i++) {
        if (used.has(i)) continue;
        const c = cards[i];
        if (c.rank === card.rank && c.suit === card.suit) {
          used.add(i);
          return i;
        }
      }
      return -1;
    }

    const split = houseWayV0(cards as unknown as SevenCardHand) as unknown as SimPlayerSplit;
    const low = [pickIndexFor(split.low[0]), pickIndexFor(split.low[1])].filter((x) => x >= 0);
    const high = split.high.map(pickIndexFor).filter((x) => x >= 0);

    if (low.length === 2 && high.length === 5) {
      setLowIdx(low);
      setHighIdx(high);
      setAssignTarget("low");
    }
  }, [canSplit, view.player7]);

  // NOTE: We intentionally do NOT auto-reveal or auto-split.
  // Players can manually flip cards (or use Flip all) and manually split.
  // An Auto-split button is provided near the player cards for convenience.


  const chipValues = [1, 5, 10, 25, 100];

  function wobbleStyle(v: number, i: number) {
    // Stable wobble based on chip value + index (NOT total bet), so it doesn't "glitch" when the bet changes.
    const t = Math.sin((v * 1000 + i * 97.13) * 12.9898) * 43758.5453;
    const r = (t - Math.floor(t)) * 2 - 1;
    const t2 = Math.sin((v * 1000 + i * 41.77) * 78.233) * 12345.6789;
    const r2 = (t2 - Math.floor(t2)) * 2 - 1;

    const x = r * 2.6; // px
    const rot = r2 * 2.0; // deg
    return { x, rot };
  }

  const chipStyleFor = (v: number) => {
    // Poker-chip styling via CSS variables (used by rack chips).
    if (v === 1)
      return ({
        borderColor: "rgba(215,225,230,0.28)",
        ["--chipColor"]: "#2a2a2a",
        ["--chipStripe"]: "rgba(235,240,244,0.95)",
      } as React.CSSProperties & Record<string, string>);

    if (v === 5)
      return ({
        borderColor: "rgba(105,174,251,0.55)",
        ["--chipColor"]: "#1e4a86",
        ["--chipStripe"]: "rgba(235,240,244,0.95)",
      } as React.CSSProperties & Record<string, string>);

    if (v === 10)
      return ({
        borderColor: "rgba(239,185,11,0.60)",
        ["--chipColor"]: "#9a6a10",
        ["--chipStripe"]: "rgba(235,240,244,0.95)",
      } as React.CSSProperties & Record<string, string>);

    if (v === 25)
      return ({
        borderColor: "rgba(140,255,0,0.52)",
        ["--chipColor"]: "#2d7a21",
        ["--chipStripe"]: "rgba(235,240,244,0.95)",
      } as React.CSSProperties & Record<string, string>);

    return ({
      borderColor: "rgba(215,225,230,0.38)",
      ["--chipColor"]: "#3a3a3a",
      ["--chipStripe"]: "rgba(235,240,244,0.95)",
    } as React.CSSProperties & Record<string, string>);
  };

  function placeMainChip() {
    if (betsLocked) return;
    setMain((x) => Number((x + activeChip).toFixed(2)));
    setMainChips((prev) => [...prev, activeChip]);
  }

  function placeSideChip() {
    if (betsLocked) return;
    setSide((x) => Number((x + activeChip).toFixed(2)));
    setSideChips((prev) => [...prev, activeChip]);
  }

  function placePushChip() {
    if (betsLocked) return;
    setPush((x) => Number((x + activeChip).toFixed(2)));
    setPushChips((prev) => [...prev, activeChip]);
  }

  function undoMainChip() {
    if (betsLocked) return;
    setMainChips((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setMain((x) => Number(Math.max(0, x - last).toFixed(2)));
      return prev.slice(0, -1);
    });
  }

  function undoSideChip() {
    if (betsLocked) return;
    setSideChips((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setSide((x) => Number(Math.max(0, x - last).toFixed(2)));
      return prev.slice(0, -1);
    });
  }

  function undoPushChip() {
    if (betsLocked) return;
    setPushChips((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setPush((x) => Number(Math.max(0, x - last).toFixed(2)));
      return prev.slice(0, -1);
    });
  }

  function clearBets() {
    if (betsLocked) return;
    setMain(0);
    setSide(0);
    setPush(0);
    setMainChips([]);
    setSideChips([]);
    setPushChips([]);
  }

  const r = view.res;
  const mainPayout = r?.mainPayout ?? 0;
  const bonusPayout = r?.sidePayout ?? 0;
  const pushPayout = r?.pushAceHighPayout ?? 0;
  const netPayout = mainPayout + bonusPayout + pushPayout;

  const totalBet = main + side + push;

  // Expose lifecycle actions to the template shell (GameWindow modal buttons)
  useImperativeHandle(
    ref,
    () => ({
      reset: handleReset,
      playAgain: handlePlayAgain,
      rewatch: handleRewatch,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Report status upward for template integration
  useEffect(() => {
    onStatusChange?.({
      isLoading,
      isGameFinished,
      betAmount: totalBet,
      payout: netPayout,
      breakdown: r
        ? {
            totalWager: totalBet,
            main: { wager: main, payout: mainPayout },
            bonus: { wager: side, payout: bonusPayout, hit: r.sideHit },
            push: { wager: push, payout: pushPayout, hit: r.pushAceHighHit },
            outcome: r.outcome,
            dealerAceHighPaiGow: r.dealerAceHighPaiGow,
          }
        : undefined,
    });
  }, [onStatusChange, isLoading, isGameFinished, totalBet, netPayout, r, main, side, push, mainPayout, bonusPayout, pushPayout]);

  const sidebarContent = (
    <div
      className="pgSidebar"
      style={
        desktopLayout
          ? ({
              gridColumn: 2,
              display: "flex",
              flexDirection: "column",
              gap: 0,
            } as React.CSSProperties)
          : undefined
      }
    >
      {desktopLayout && !hideHeader ? (
        <div
          className="rail"
          style={
            desktopLayout
              ? ({
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                } as React.CSSProperties)
              : undefined
          }
        >
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={acLogo} alt="ApeChurch" style={{ height: 26, opacity: 0.95 }} />
            <div>
              <div className="title">Pai Gow</div>
              <div className="sub" aria-label="How to play">
                <span className="subStep">dealer flips →</span>
                <span className="subStep">arranges →</span>
                <span className="subStep">player flips →</span>
                <span className="subStep">split</span>
              </div>
            </div>
          </div>
          <div className="controls" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* Primary CTA: one-click hand. */}
            <button
              className="btn"
              onClick={isGameFinished ? handlePlayAgain : playGame}
              disabled={isLoading || (!isGameFinished && dealerRevealed) || (!isGameFinished && !hasMainBet)}
            >
              {isLoading
                ? "Confirming…"
                : isGameFinished
                  ? "Play again"
                  : dealerRevealed
                    ? dealerArranged
                      ? "In hand…"
                      : "Flipping…"
                    : "Place bet"}
            </button>

            <button
              className="btn"
              onClick={clearBets}
              disabled={betsLocked || (!mainChips.length && !sideChips.length && !pushChips.length)}
              title={betsLocked ? "Bets are locked" : "Remove all bets"}
            >
              Clear bets
            </button>
          </div>
        </div>
      ) : null}

      {/* Bets UI (ported): chips stack on the bet spots */}
      <div
        className="zone betZone"
        style={
          desktopLayout
            ? ({
                marginTop: 0,
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderTop: "0",
              } as React.CSSProperties)
            : undefined
        }
      >
        <div className="zoneHeader">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="zoneLabel">BETS</div>
            <div style={{ fontSize: 12, display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ opacity: 0.72 }}>Chips are units (1/5/10/25/100).</span>

              <span className="infoWrap" style={{ opacity: 1 }}>
                <button
                  type="button"
                  className="infoIcon"
                  aria-label="Paytable info"
                  aria-expanded={paytableOpen}
                  title="Paytable"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPaytableOpen((v) => !v);
                  }}
                >
                  i
                </button>

                {canPortal && paytableOpen
                  ? createPortal(
                      <div className="paytableOverlay" role="presentation" onClick={() => setPaytableOpen(false)}>
                        <div
                          className="infoPopover infoPopoverOpen"
                          role="dialog"
                          aria-label="Paytable"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ fontWeight: 950, letterSpacing: 1.6, opacity: 0.9 }}>Paytable</div>
                          <div style={{ marginTop: 8, display: "grid", gap: 6, fontSize: 12, opacity: 0.92 }}>
                            <div style={{ fontWeight: 900, opacity: 0.95 }}>BONUS (7-card)</div>
                            <div>7-card Straight Flush (no Joker): <strong>5000x</strong></div>
                            <div>Royal Flush + Royal Match: <strong>2000x</strong></div>
                            <div>7-card Straight Flush (with Joker): <strong>1000x</strong></div>
                            <div>Five Aces: <strong>400x</strong></div>
                            <div>Royal Flush: <strong>150x</strong></div>
                            <div>Straight Flush: <strong>50x</strong></div>
                            <div>Four of a Kind: <strong>25x</strong></div>
                            <div>Full House: <strong>5x</strong></div>
                            <div>Flush: <strong>4x</strong></div>
                            <div>Three of a Kind: <strong>3x</strong></div>
                            <div>Straight: <strong>2x</strong></div>

                            <div style={{ marginTop: 8, fontWeight: 900, opacity: 0.95 }}>PUSH (Ace High)</div>
                            <div>If dealer best 5-card hand is Ace-high, MAIN pushes.</div>
                            <div>
                              PUSH side bet pays: Dealer Ace High <strong>5x</strong>, w/ Joker <strong>15x</strong>, both Ace-high <strong>40x</strong>.
                            </div>
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )
                  : null}
              </span>
            </div>
            <div className="totalWagerPill" title="Total wager">
              Total: <strong>{totalBet}</strong>
            </div>
          </div>
        </div>

        <div className="betLane" style={{ position: "relative" }}>
          <div
            className="betSpot betSpotBonus"
            role="button"
            tabIndex={betsLocked ? -1 : 0}
            aria-disabled={betsLocked}
            title="Place Bonus bet"
            onClick={betsLocked ? undefined : placeSideChip}
            onKeyDown={(e) => {
              if (betsLocked) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                placeSideChip();
              }
            }}
            style={{ cursor: betsLocked ? "not-allowed" : "pointer" }}
          >
            <div className="chipStack" aria-hidden>
              {(() => {
                const maxShow = 9;
                const extra = sideChips.length - maxShow;
                const base = sideChips.slice(0, Math.min(sideChips.length, maxShow));
                const display = extra > 0 ? base.slice(0, maxShow - 1).concat([base[maxShow - 1]]) : base;

                return display.map((v, i) => {
                  const w = wobbleStyle(v, i);
                  const step = 3;
                  const capped = Math.min(i, maxShow - 1);
                  const label = extra > 0 && i === maxShow - 1 ? `+${extra}` : `${v}`;

                  return (
                    <div
                      key={`side-${i}`}
                      className={`stackChip chipV${v}`}
                      style={{
                        bottom: capped * step,
                        left: `${w.x}px`,
                        transform: `rotate(${w.rot}deg) translateZ(0)`,
                      }}
                    >
                      {label}
                    </div>
                  );
                });
              })()}
            </div>

            {sideChips.length ? (
              <button
                type="button"
                className="betBackBtn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  undoSideChip();
                }}
                disabled={betsLocked}
                title="Remove last chip"
                aria-label="Remove last chip"
              >
                ↩
              </button>
            ) : null}

            <div className="betContent">
              <div className="betName">BONUS</div>
              <div className="betValue" style={{ marginTop: 6, fontWeight: 900 }}>{side}</div>
            </div>
          </div>

          <div
            className="betSpot betSpotPush"
            role="button"
            tabIndex={betsLocked ? -1 : 0}
            aria-disabled={betsLocked}
            title="Place Push Ace High bet"
            onClick={betsLocked ? undefined : placePushChip}
            onKeyDown={(e) => {
              if (betsLocked) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                placePushChip();
              }
            }}
            style={{ cursor: betsLocked ? "not-allowed" : "pointer" }}
          >
            <div className="chipStack" aria-hidden>
              {(() => {
                const maxShow = 9;
                const extra = pushChips.length - maxShow;
                const base = pushChips.slice(0, Math.min(pushChips.length, maxShow));
                const display = extra > 0 ? base.slice(0, maxShow - 1).concat([base[maxShow - 1]]) : base;

                return display.map((v, i) => {
                  const w = wobbleStyle(v, i);
                  const step = 3;
                  const capped = Math.min(i, maxShow - 1);
                  const label = extra > 0 && i === maxShow - 1 ? `+${extra}` : `${v}`;

                  return (
                    <div
                      key={`push-${i}`}
                      className={`stackChip chipV${v}`}
                      style={{
                        bottom: capped * step,
                        left: `${w.x}px`,
                        transform: `rotate(${w.rot}deg) translateZ(0)`,
                      }}
                    >
                      {label}
                    </div>
                  );
                });
              })()}
            </div>

            {pushChips.length ? (
              <button
                type="button"
                className="betBackBtn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  undoPushChip();
                }}
                disabled={betsLocked}
                title="Remove last chip"
                aria-label="Remove last chip"
              >
                ↩
              </button>
            ) : null}

            <div className="betContent">
              <div className="betName">PUSH</div>
              <div className="betValue" style={{ marginTop: 6, fontWeight: 900 }}>{push}</div>
            </div>
          </div>

          <div
            className="betSpot betSpotMain"
            role="button"
            tabIndex={betsLocked ? -1 : 0}
            aria-disabled={betsLocked}
            title="Place Main bet"
            onClick={betsLocked ? undefined : placeMainChip}
            onKeyDown={(e) => {
              if (betsLocked) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                placeMainChip();
              }
            }}
            style={{ cursor: betsLocked ? "not-allowed" : "pointer" }}
          >
            <div className="chipStack" aria-hidden>
              {(() => {
                const maxShow = 9;
                const extra = mainChips.length - maxShow;
                const base = mainChips.slice(0, Math.min(mainChips.length, maxShow));
                const display = extra > 0 ? base.slice(0, maxShow - 1).concat([base[maxShow - 1]]) : base;

                return display.map((v, i) => {
                  const w = wobbleStyle(v, i);
                  const step = 3;
                  const capped = Math.min(i, maxShow - 1);
                  const label = extra > 0 && i === maxShow - 1 ? `+${extra}` : `${v}`;

                  return (
                    <div
                      key={`main-${i}`}
                      className={`stackChip chipV${v}`}
                      style={{
                        bottom: capped * step,
                        left: `${w.x}px`,
                        transform: `rotate(${w.rot}deg) translateZ(0)`,
                      }}
                    >
                      {label}
                    </div>
                  );
                });
              })()}
            </div>

            {mainChips.length ? (
              <button
                type="button"
                className="betBackBtn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  undoMainChip();
                }}
                disabled={betsLocked}
                title="Remove last chip"
                aria-label="Remove last chip"
              >
                ↩
              </button>
            ) : null}

            <div className="betContent">
              <div className="betName">MAIN</div>
              <div className="betValue" style={{ marginTop: 6, fontWeight: 900, fontSize: 18 }}>{main}</div>
            </div>
          </div>

          {/* Mobile: Clear bets button to the RIGHT of MAIN */}
          <button
            type="button"
            className="betClearBtn"
            onClick={clearBets}
            disabled={betsLocked || (!mainChips.length && !sideChips.length && !pushChips.length)}
            title={betsLocked ? "Bets are locked" : "Remove all bets"}
          >
            Clear bets
          </button>
        </div>

        <div className="betFooterRow" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
          <div className="chipRack">
            {chipValues.map((v) => (
              <button
                key={v}
                className={v === activeChip ? "chip chipActive" : "chip"}
                onClick={() => setActiveChip(v)}
                disabled={betsLocked}
                style={chipStyleFor(v)}
                title={`Select ${v} chip`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="tableWrap">
      {/* Inject Pai Gow CSS locally (cannot touch app/globals.css in submissions repo). */}
      <style>{paiGowCss}</style>

      <div className={hideHeader ? "table tableNoRail" : "table"}>
        <div
          className="pgLayout"
          style={
            desktopLayout
              ? {
                  display: "grid",
                  gridTemplateColumns: desktopSidebarHost ? "1fr" : "1fr 360px",
                  gap: 14,
                  alignItems: "start",
                }
              : undefined
          }
        >
          {!desktopLayout && !hideHeader ? (
            <div className="rail">
              <div className="brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={acLogo} alt="ApeChurch" style={{ height: 26, opacity: 0.95 }} />
                <div>
                  <div className="title">Pai Gow</div>
                  <div className="sub" aria-label="How to play">
                    <span className="subStep">dealer flips →</span>
                    <span className="subStep">arranges →</span>
                    <span className="subStep">player flips →</span>
                    <span className="subStep">split</span>
                  </div>
                </div>
              </div>
              <div className="controls" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  onClick={isGameFinished ? handlePlayAgain : playGame}
                  disabled={isLoading || (!isGameFinished && dealerRevealed) || (!isGameFinished && !hasMainBet)}
                >
                  {isLoading
                    ? "Confirming…"
                    : isGameFinished
                      ? "Play again"
                      : dealerRevealed
                        ? dealerArranged
                          ? "In hand…"
                          : "Flipping…"
                        : "Place bet"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="felt" style={desktopLayout ? ({ gridColumn: 1, marginTop: 0 } as React.CSSProperties) : undefined}>
          <div
            className="zone dealerZone"
            data-arranged={dealerArranged}
            style={
              desktopLayout
                ? ({ minHeight: 220, display: "flex", flexDirection: "column" } as React.CSSProperties)
                : undefined
            }
          >
            <div className="zoneHeader">
              <div className="zoneLabel">DEALER</div>
              <div
                className="dealerStatus"
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: 0.2,
                  opacity: 1,
                  color: "#FFFFFF",
                  textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,0.55)",
                }}
              >
                {!dealerRevealed
                  ? "Waiting"
                  : !dealerArranged
                    ? "Flipping & arranging…"
                    : `High: ${view.dealerHighName} • Low: ${view.dealerLowName}`}
              </div>
            </div>

            {/* Dealer: reserve the FULL arranged height from the very start so nothing "drops" when the split layout appears. */}
            <div style={{ display: "grid", gridTemplateRows: "auto auto", gap: 8, flex: 1, minHeight: 0 }}>
              {/* HIGH row */}
              <div>
                {/* Reserve label height even before arranged (prevents subtle drop). */}
                <div
                  style={
                    dealerArranged
                      ? {
                          fontWeight: 950,
                          opacity: 1,
                          letterSpacing: 0.8,
                          fontSize: 12,
                          marginBottom: 4,
                          color: "#FFFFFF",
                          textShadow: "0 1px 0 rgba(0,0,0,0.75)",
                        }
                      : ({
                          fontWeight: 950,
                          opacity: 1,
                          letterSpacing: 0.8,
                          fontSize: 12,
                          marginBottom: 4,
                          color: "#FFFFFF",
                          textShadow: "0 1px 0 rgba(0,0,0,0.75)",
                          visibility: "hidden",
                        } as React.CSSProperties)
                  }
                >
                  HIGH (5)
                </div>

                {/* Before arranged: show the 7-card rack in the HIGH row (clean start view). */}
                <div className="cardsRow cardsRowScroll">
                  {(dealerArranged ? view.houseSplit.high : view.house7).map((c, i) => (
                    <CardFace
                      key={dealerArranged ? `house-high-${i}` : `house-${i}`}
                      card={c}
                      faceDown={dealerArranged ? false : !dealerFlipped[i]}
                      tone={dealerArranged ? "high" : undefined}
                    />
                  ))}
                </div>
              </div>

              {/* LOW row (kept in layout even before arranged, but hidden) */}
              <div style={!dealerArranged ? ({ visibility: "hidden" } as React.CSSProperties) : undefined}>
                <div style={{ fontWeight: 900, opacity: 1, letterSpacing: 0.6, fontSize: 12, marginBottom: 4, color: "#FFFFFF" }}>LOW (2)</div>
                <div className="cardsRow cardsRowScroll">
                  {(dealerArranged ? view.houseSplit.low : [view.house7[0], view.house7[1]]).map((c, i) => (
                    <CardFace
                      key={dealerArranged ? `house-low-${i}` : `house-low-ph-${i}`}
                      card={c}
                      faceDown={dealerArranged ? false : true}
                      tone={dealerArranged ? "low" : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            className="zone playerZone"
            data-split={lowIdx.length === 2 && highIdx.length === 5}
            style={
              desktopLayout
                ? ({ minHeight: 360, display: "flex", flexDirection: "column" } as React.CSSProperties)
                : undefined
            }
          >
            <div className="zoneHeader">
              <div className="zoneLabel">PLAYER</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn" onClick={autoSplitHouseWay} disabled={!canSplit}>
                  Auto-split
                </button>
                <button className="btn" onClick={flipAllPlayer} disabled={!dealerArranged}>
                  Flip all
                </button>
                <button
                  className="btn"
                  onClick={() => setPlayerSort((s) => (s === "asc" ? "desc" : s === "desc" ? "none" : "asc"))}
                  disabled={!dealerArranged}
                >
                  Sort: {playerSort === "asc" ? "Low→High" : playerSort === "desc" ? "High→Low" : "Off"}
                </button>
              </div>
            </div>

            <div className="cardsRow cardsRowScroll" style={{ marginBottom: 6 }}>
              {displayPoolIdx.map((i) => (
                <CardFace
                  key={i}
                  card={view.player7[i]}
                  faceDown={!dealerArranged || !playerFlipped[i]}
                  onClick={dealerArranged ? () => clickPool(i) : undefined}
                />
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontWeight: 950, opacity: 1, letterSpacing: 0.8, fontSize: 13, color: "rgba(255,255,255,0.95)", textShadow: "0 1px 0 rgba(0,0,0,0.75)" }}>YOUR SPLIT</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 12, opacity: 1, color: "rgba(255,255,255,0.85)", textShadow: "0 1px 0 rgba(0,0,0,0.75)" }}>Assign to:</div>
                <button className="btn" onClick={setTargetLow} disabled={!canSplit}>Low (2)</button>
                <button className="btn" onClick={setTargetHigh} disabled={!canSplit}>High (5)</button>
              </div>
            </div>

            {/* Desktop: keep the square stable by laying SPLIT + RESULT side-by-side. */}
            {desktopLayout ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 10, marginTop: 6, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 950, opacity: 1, letterSpacing: 0.8, fontSize: 13, marginBottom: 4, color: "rgba(255,255,255,0.95)", textShadow: "0 1px 0 rgba(0,0,0,0.75)" }}>LOW (2)</div>
                    <div className="cardsRow">
                      {lowIdx.map((i) => (
                        <CardFace key={i} card={view.player7[i]} tone="low" onClick={() => removeFromLow(i)} />
                      ))}
                      {Array.from({ length: Math.max(0, 2 - lowIdx.length) }).map((_, k) => (
                        <CardSlot key={`low-slot-${k}`} visible={canSplit} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 950, opacity: 1, letterSpacing: 0.8, fontSize: 13, marginBottom: 4, color: "rgba(255,255,255,0.95)", textShadow: "0 1px 0 rgba(0,0,0,0.75)" }}>HIGH (5)</div>
                    <div className="cardsRow">
                      {highIdx.map((i) => (
                        <CardFace key={i} card={view.player7[i]} tone="high" onClick={() => removeFromHigh(i)} />
                      ))}
                      {Array.from({ length: Math.max(0, 5 - highIdx.length) }).map((_, k) => (
                        <CardSlot key={`high-slot-${k}`} visible={canSplit} />
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 10, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(20,20,20,0.82)" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>RESULT</div>
                  {view.res ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div>Outcome: <strong>{view.res.outcome}</strong></div>
                      <div>Main payout: <strong>{mainPayout}</strong></div>
                      <div>
                        Bonus payout: <strong>{bonusPayout}</strong>
                        {view.res.sideHit ? (
                          <span style={{ opacity: 0.92 }}> (x{view.res.sideHit.multiplier} • {view.res.sideHit.name})</span>
                        ) : null}
                      </div>
                      <div>
                        Push payout: <strong>{pushPayout}</strong>
                        {view.res.pushAceHighHit ? (
                          <span style={{ opacity: 0.92 }}> (x{view.res.pushAceHighHit.multiplier} • {view.res.pushAceHighHit.name})</span>
                        ) : null}
                      </div>
                      <div>Net payout: <strong>{netPayout}</strong></div>
                    </div>
                  ) : (
                    <div style={{ opacity: 0.8 }}>{view.validation.reason ?? "Make a valid split to see the outcome."}</div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  <div>
                    <div style={{ fontWeight: 950, opacity: 1, letterSpacing: 0.8, fontSize: 13, marginBottom: 4, color: "rgba(255,255,255,0.95)", textShadow: "0 1px 0 rgba(0,0,0,0.75)" }}>LOW (2)</div>
                    <div className="cardsRow">
                      {lowIdx.map((i) => (
                        <CardFace key={i} card={view.player7[i]} tone="low" onClick={() => removeFromLow(i)} />
                      ))}
                      {Array.from({ length: Math.max(0, 2 - lowIdx.length) }).map((_, k) => (
                        <CardSlot key={`m-low-slot-${k}`} visible={canSplit} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 950, opacity: 1, letterSpacing: 0.8, fontSize: 13, marginBottom: 4, color: "rgba(255,255,255,0.95)", textShadow: "0 1px 0 rgba(0,0,0,0.75)" }}>HIGH (5)</div>
                    <div className="cardsRow">
                      {highIdx.map((i) => (
                        <CardFace key={i} card={view.player7[i]} tone="high" onClick={() => removeFromHigh(i)} />
                      ))}
                      {Array.from({ length: Math.max(0, 5 - highIdx.length) }).map((_, k) => (
                        <CardSlot key={`m-high-slot-${k}`} visible={canSplit} />
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14, padding: 16, borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(20,20,20,0.82)" }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>RESULT</div>
                  {view.res ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div>Outcome: <strong>{view.res.outcome}</strong></div>
                      <div>Main payout: <strong>{mainPayout}</strong></div>
                      <div>
                        Bonus payout: <strong>{bonusPayout}</strong>
                        {view.res.sideHit ? (
                          <span style={{ opacity: 0.92 }}> (x{view.res.sideHit.multiplier} • {view.res.sideHit.name})</span>
                        ) : null}
                      </div>
                      <div>
                        Push payout: <strong>{pushPayout}</strong>
                        {view.res.pushAceHighHit ? (
                          <span style={{ opacity: 0.92 }}> (x{view.res.pushAceHighHit.multiplier} • {view.res.pushAceHighHit.name})</span>
                        ) : null}
                      </div>
                      <div>Net payout: <strong>{netPayout}</strong></div>
                    </div>
                  ) : (
                    <div style={{ opacity: 0.8 }}>{view.validation.reason ?? "Make a valid split to see the outcome."}</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

          {desktopLayout && desktopSidebarHost ? null : sidebarContent}
          {desktopLayout && desktopSidebarHost ? createPortal(sidebarContent, desktopSidebarHost) : null}
        </div>
      </div>
    </div>
  );
});

export default PaiGowTable;
