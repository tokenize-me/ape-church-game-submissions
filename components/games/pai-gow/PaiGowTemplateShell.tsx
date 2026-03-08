"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import GameWindow from "@/components/shared/GameWindow";
import { paiGow } from "./paiGowConfig";
import PaiGowTable, { type PaiGowTableHandle, type PaiGowTableStatus } from "./PaiGowTable";

// Pai Gow runs inside the platform GameWindow so results + lifecycle controls
// behave consistently on the submissions preview site.
export default function PaiGowTemplateShell() {
  const tableRef = useRef<PaiGowTableHandle | null>(null);
  const gameWrapRef = useRef<HTMLDivElement | null>(null);
  const sidebarHostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<PaiGowTableStatus | null>(null);
  const [gameId, setGameId] = useState<bigint>(() => BigInt(Date.now()));

  const onStatusChange = useCallback((s: PaiGowTableStatus) => {
    setStatus(s);
  }, []);

  const onReset = useCallback(() => {
    tableRef.current?.reset();
    setGameId(BigInt(Date.now()));
  }, []);

  const onPlayAgain = useCallback(() => {
    tableRef.current?.playAgain();
    setGameId(BigInt(Date.now()));
  }, []);

  const onRewatch = useCallback(() => {
    tableRef.current?.rewatch();
    setGameId(BigInt(Date.now()));
  }, []);

  const betAmount = status?.betAmount ?? 0;
  const payout = status?.payout ?? 0;

  const showResults = !!status?.isGameFinished;
  const breakdown = status?.breakdown;

  // Mobile: dynamically size the GameWindow so it fits the content (avoid big empty space / double scroll).
  const [mobileGwHeight, setMobileGwHeight] = useState<string>("1700px");
  useEffect(() => {
    const gameEl = gameWrapRef.current;
    if (!gameEl) return;

    const apply = () => {
      if (typeof window === "undefined") return;
      if (window.innerWidth > 640) return; // mobile-only

      const tableWrap = gameEl.querySelector<HTMLElement>(".tableWrap");
      if (!tableWrap) return;

      // Prefer the visual bottom of the BETS/chips area (what you care about),
      // not the full scrollHeight (which can include extra empty fill space).
      const anchor =
        gameEl.querySelector<HTMLElement>(".betFooterRow") ??
        gameEl.querySelector<HTMLElement>(".chipRack") ??
        gameEl.querySelector<HTMLElement>(".betLane");

      const wrapTop = tableWrap.getBoundingClientRect().top;
      const anchorBottom = anchor ? Math.ceil(anchor.getBoundingClientRect().bottom - wrapTop) : 0;
      const scrollH = Math.ceil(tableWrap.scrollHeight);

      // Add a little breathing room for the audio buttons and rounded border.
      // Also ensure we never undershoot the actual scrollHeight (prevents the inner scrollbar).
      const target = Math.min(1750, Math.max(1100, Math.max(anchorBottom + 70, scrollH + 24)));
      setMobileGwHeight(`${target}px`);
    };

    apply();
    const ro = new ResizeObserver(() => apply());
    // Observe the whole game area; content changes will bubble into layout changes here.
    ro.observe(gameEl);
    window.addEventListener("resize", apply);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [status?.isGameFinished, status?.betAmount, status?.payout]);

  const format = (n: number | undefined) => (Number.isFinite(n as number) ? String(n) : "0");

  // Desktop: match the right sidebar panel height to the left GameWindow height.
  // (Flex/grid stretching uses the tallest child; our sidebar content can be taller than GameWindow,
  // so we pin the sidebar host height to the GameWindow and let the bets panel scroll internally.)
  useEffect(() => {
    const gameEl = gameWrapRef.current;
    const sideEl = sidebarHostRef.current;
    if (!gameEl || !sideEl) return;

    const apply = () => {
      // Only do this on desktop layouts.
      if (window.innerWidth < 1024) {
        sideEl.style.height = "";
        return;
      }
      const h = gameEl.getBoundingClientRect().height;
      if (h > 0) sideEl.style.height = `${Math.round(h)}px`;
    };

    apply();

    const ro = new ResizeObserver(() => apply());
    ro.observe(gameEl);
    window.addEventListener("resize", apply);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  return (
    <div className="pgShell">
      {/* Match the platform template: GameWindow on the left, setup/bets panel on the right (desktop). */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-4 sm:gap-8 lg:gap-10">
        <div ref={gameWrapRef} className="flex-1 min-w-0">
          <GameWindow
            game={paiGow}
            isLoading={!!status?.isLoading}
            isGameFinished={showResults}
            customHeightMobile={mobileGwHeight}
            betAmount={betAmount}
            payout={payout}
            inReplayMode={false}
            isUserOriginalPlayer={true}
            showPNL={false}
            resultsExtraContent={
              breakdown ? (
                <div
                  style={{
                    marginTop: 14,
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(0,0,0,0.18)",
                    width: "100%",
                  }}
                >
                  <div style={{ fontWeight: 950, letterSpacing: 2.2, opacity: 0.85, fontSize: 14 }}>
                    BREAKDOWN
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: "grid",
                      gap: 0,
                      borderRadius: 18,
                      background: "rgba(0,0,0,0.16)",
                      overflow: "hidden",
                    }}
                  >
                    {(
                      [
                        {
                          k: "Total wager",
                          w: breakdown.totalWager,
                          p: undefined,
                        },
                        { k: "Main bet", w: breakdown.main.wager, p: breakdown.main.payout },
                        { k: "Bonus bet", w: breakdown.bonus.wager, p: breakdown.bonus.payout },
                        { k: "Push bet", w: breakdown.push.wager, p: breakdown.push.payout },
                        { k: "Net payout", w: breakdown.totalWager, p: payout },
                      ] as Array<{ k: string; w: number; p?: number }>
                    ).map((row, idx) => {
                      const isNet = row.k === "Net payout";
                      const pay = typeof row.p === "number" ? row.p : undefined;
                      const payColor = pay === undefined ? "rgba(255,255,255,0.75)" : pay >= row.w ? "rgba(140,255,0,0.95)" : "rgba(255,90,90,0.92)";

                      return (
                        <div
                          key={row.k}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto auto",
                            gap: 14,
                            alignItems: "center",
                            padding: "14px 14px",
                            borderTop: idx === 0 ? "0" : "1px solid rgba(255,255,255,0.08)",
                            fontSize: 14,
                          }}
                        >
                          <div style={{ fontWeight: 900, opacity: 0.92 }}>{row.k}</div>
                          <div style={{ fontWeight: 950, opacity: 0.90, minWidth: 64, textAlign: "right" }}>
                            {format(row.w)}
                          </div>
                          <div
                            style={{
                              fontWeight: 950,
                              minWidth: 64,
                              textAlign: "right",
                              color: isNet ? "rgba(140,255,0,0.98)" : payColor,
                            }}
                          >
                            {pay === undefined ? "—" : format(pay)}
                          </div>
                        </div>
                      );
                    })}

                    <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 13, opacity: 0.85 }}>
                      Outcome: <strong style={{ opacity: 0.98 }}>{breakdown.outcome ?? "—"}</strong>
                      {breakdown.dealerAceHighPaiGow ? " • Dealer Ace High Pai Gow" : ""}
                      {breakdown.bonus.hit ? (
                        <span style={{ marginLeft: 8 }}>
                          • Bonus: <strong>{breakdown.bonus.hit.name}</strong> x{breakdown.bonus.hit.multiplier}
                        </span>
                      ) : null}
                      {breakdown.push.hit ? (
                        <span style={{ marginLeft: 8 }}>
                          • Push: <strong>{breakdown.push.hit.name}</strong> x{breakdown.push.hit.multiplier}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null
            }
            onReset={onReset}
            onPlayAgain={onPlayAgain}
            onRewatch={onRewatch}
            currentGameId={gameId}
            disableBuiltInSong={true}
            resultModalDelayMs={900}
          >
            {/* GameWindow renders a background image; mount Pai Gow UI as an overlay on top of it. */}
            <div className="pgMobileScroller" style={{ position: "absolute", inset: 0, zIndex: 10, overflow: "hidden", paddingBottom: 64 }}>
              <PaiGowTable
                ref={tableRef}
                onStatusChange={onStatusChange}
                desktopSidebarHostId="pgSidebarHost"
              />
            </div>

            {/* Results modal is handled by GameWindow (template animation). */}
          </GameWindow>
        </div>

        {/* Setup/Bets panel (right). Desktop gets portal content; mobile ignores this and uses the in-table layout. */}
        <div
          ref={sidebarHostRef}
          id="pgSidebarHost"
          className="w-full lg:w-[380px] rounded-[12px] border-[2.25px] sm:border-[3.75px] lg:border-[4.68px] border-[#2A3640] overflow-hidden"
        />
      </div>
    </div>
  );
}
