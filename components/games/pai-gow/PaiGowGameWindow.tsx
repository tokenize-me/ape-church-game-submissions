"use client";

import React from "react";
import { Game } from "@/lib/games";
import PaiGowTable from "./PaiGowTable";

interface PaiGowGameWindowProps {
  game: Game;
  isSpinning: boolean;
  currentSpinIndex: number;
  gameCompleted: boolean;
  spinResults: number[][];
  betAmount: number;
  payoutAmount: number;
}

// For Pai Gow, the entire experience lives in the table UI.
// We keep the template prop signature for compatibility.
export default function PaiGowGameWindow(_props: PaiGowGameWindowProps) {
  void _props;
  return <PaiGowTable />;
}
