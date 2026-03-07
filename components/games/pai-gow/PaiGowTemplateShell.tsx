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
            isGameFinished={showResults}
            betAmount={betAmount}
            payout={payout}
            inReplayMode={false}
            isUserOriginalPlayer={true}
            showPNL={false}
            resultsExtraContent={
              breakdown ? (
                <div
                  style={{
                    marginTop: 6,
                    padding: 12,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(0,0,0,0.20)",
                    width: "100%",
                  }}
                >
                  <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900, opacity: 0.95 }}>Main</div>
                      <div>{format(breakdown.main.wager)} → <strong>{format(breakdown.main.payout)}</strong></div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900, opacity: 0.95 }}>Bonus</div>
                      <div>
                        {format(breakdown.bonus.wager)} → <strong>{format(breakdown.bonus.payout)}</strong>
                        {breakdown.bonus.hit ? (
                          <span style={{ opacity: 0.9, marginLeft: 8 }}>
                            ({breakdown.bonus.hit.name} x{breakdown.bonus.hit.multiplier})
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900, opacity: 0.95 }}>Push</div>
                      <div>
                        {format(breakdown.push.wager)} → <strong>{format(breakdown.push.payout)}</strong>
                        {breakdown.push.hit ? (
                          <span style={{ opacity: 0.9, marginLeft: 8 }}>
                            ({breakdown.push.hit.name} x{breakdown.push.hit.multiplier})
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {breakdown.outcome ? (
                      <div style={{ marginTop: 2, fontSize: 12, opacity: 0.85 }}>
                        Outcome: <strong>{breakdown.outcome}</strong>
                        {breakdown.dealerAceHighPaiGow ? " • Dealer Ace High Pai Gow" : ""}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null
            }
            onReset={onReset}
            onPlayAgain={onPlayAgain}
            onRewatch={onRewatch}
            currentGameId={gameId}
            disableBuiltInSong={true}
            /* Let the in-table RESULT be visible briefly before the modal covers it. */
            resultModalDelayMs={900}
          >
            {/* GameWindow renders a background image; mount Pai Gow UI as an overlay on top of it. */}
            <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
              <PaiGowTable
                ref={tableRef}
                onStatusChange={onStatusChange}
                desktopSidebarHostId="pgSidebarHost"
              />
            </div>

          

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
