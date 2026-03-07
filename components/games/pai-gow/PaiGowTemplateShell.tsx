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
            // We show our own Pai Gow breakdown modal (includes side bet hit + multiplier).
            isGameFinished={false}
            betAmount={betAmount}
            payout={payout}
            inReplayMode={false}
            isUserOriginalPlayer={true}
            showPNL={false}
            onReset={onReset}
            onPlayAgain={onPlayAgain}
            onRewatch={onRewatch}
            currentGameId={gameId}
            disableBuiltInSong={true}
          >
            {/* GameWindow renders a background image; mount Pai Gow UI as an overlay on top of it. */}
            <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
              <PaiGowTable
                ref={tableRef}
                onStatusChange={onStatusChange}
                desktopSidebarHostId="pgSidebarHost"
              />
            </div>

            {showResults ? (() => {
          const isWin = payout > 0;
          const toneBg = isWin
            ? "linear-gradient(135deg, rgba(51,183,123,0.95), rgba(16,185,129,0.92))"
            : "linear-gradient(135deg, rgba(240,62,82,0.95), rgba(244,63,94,0.92))";
          const toneBorder = isWin ? "rgba(71,184,138,0.60)" : "rgba(248,64,84,0.60)";

          return (
            <div
              role="dialog"
              aria-label="Pai Gow results"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 40,
                display: "grid",
                placeItems: "center",
                background: "rgba(18,24,28,0.75)",
                backdropFilter: "blur(6px)",
                padding: 16,
              }}
            >
              <div
                style={{
                  width: "min(520px, calc(100vw - 28px))",
                  borderRadius: 24,
                  border: `4px solid ${toneBorder}`,
                  background: toneBg,
                  boxShadow: `0 20px 80px ${isWin ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
                  padding: 18,
                  color: "rgba(255,255,255,0.96)",
                  transform: "rotate(-1deg)",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 950, fontSize: 34, letterSpacing: 1.2, textShadow: "0 4px 12px rgba(0,0,0,0.35)" }}>
                    {isWin ? "You Won!" : "Try Again!"}
                  </div>
                  {isWin ? (
                    <div style={{ marginTop: 8, fontWeight: 950, fontSize: 44, color: "rgba(255,255,255,0.98)" }}>
                      {format(payout)} APE
                    </div>
                  ) : null}
                </div>

                {/* Breakdown */}
                <div
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(0,0,0,0.20)",
                  }}
                >
                  <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900, opacity: 0.9 }}>Main</div>
                      <div>{format(breakdown?.main.wager)} → <strong>{format(breakdown?.main.payout)}</strong></div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900, opacity: 0.9 }}>Bonus</div>
                      <div>
                        {format(breakdown?.bonus.wager)} → <strong>{format(breakdown?.bonus.payout)}</strong>
                        {breakdown?.bonus.hit ? (
                          <span style={{ opacity: 0.85, marginLeft: 8 }}>
                            ({breakdown.bonus.hit.name} x{breakdown.bonus.hit.multiplier})
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900, opacity: 0.9 }}>Push</div>
                      <div>
                        {format(breakdown?.push.wager)} → <strong>{format(breakdown?.push.payout)}</strong>
                        {breakdown?.push.hit ? (
                          <span style={{ opacity: 0.85, marginLeft: 8 }}>
                            ({breakdown.push.hit.name} x{breakdown.push.hit.multiplier})
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {breakdown?.outcome ? (
                      <div style={{ marginTop: 2, fontSize: 12, opacity: 0.85 }}>
                        Outcome: <strong>{breakdown.outcome}</strong>
                        {breakdown.dealerAceHighPaiGow ? " • Dealer Ace High Pai Gow" : ""}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button
                      onClick={onReset}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: `1px solid ${toneBorder}`,
                        background: "rgba(255,255,255,0.14)",
                        color: "rgba(255,255,255,0.96)",
                        fontWeight: 900,
                      }}
                    >
                      Change bet
                    </button>
                    <button
                      onClick={onRewatch}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: `1px solid ${toneBorder}`,
                        background: "rgba(255,255,255,0.14)",
                        color: "rgba(255,255,255,0.96)",
                        fontWeight: 900,
                      }}
                    >
                      Rewatch
                    </button>
                  </div>
                  <button
                    onClick={onPlayAgain}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 14,
                      border: "1px solid rgba(39,53,61,0.85)",
                      background: "rgba(29,40,46,0.92)",
                      color: "rgba(255,255,255,0.96)",
                      fontWeight: 950,
                    }}
                  >
                    Play again
                  </button>
                </div>
              </div>
            </div>
          );
            })() : null}
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
