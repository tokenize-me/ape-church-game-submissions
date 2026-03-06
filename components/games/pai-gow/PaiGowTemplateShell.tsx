"use client";

import React, { useCallback, useRef, useState } from "react";

import GameWindow from "@/components/shared/GameWindow";
import { paiGow } from "./paiGowConfig";
import PaiGowTable, { type PaiGowTableHandle, type PaiGowTableStatus } from "./PaiGowTable";

// Pai Gow runs inside the platform GameWindow so results + lifecycle controls
// behave consistently on the submissions preview site.
export default function PaiGowTemplateShell() {
  const tableRef = useRef<PaiGowTableHandle | null>(null);
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

  return (
    <div className="pgShell">
      <GameWindow
        game={paiGow}
        isLoading={!!status?.isLoading}
        isGameFinished={!!status?.isGameFinished}
        betAmount={betAmount}
        payout={payout}
        inReplayMode={false}
        isUserOriginalPlayer={true}
        showPNL={false}
        onReset={onReset}
        onPlayAgain={onPlayAgain}
        onRewatch={onRewatch}
        currentGameId={gameId}
        // Make the result modal feel like an end-of-hand animation beat.
        resultModalDelayMs={350}
        // Pai Gow has its own UI soundscape; keep template music off.
        disableBuiltInSong={true}
      >
        <PaiGowTable ref={tableRef} onStatusChange={onStatusChange} />
      </GameWindow>
    </div>
  );
}
