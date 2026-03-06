"use client";

import React from "react";
import PaiGowTemplateShell from "./PaiGowTemplateShell";

// Pai Gow runs inside the Ape Church template GameWindow so the submissions site
// can display results + lifecycle controls consistently.
export default function PaiGowGame() {
  return <PaiGowTemplateShell />;
}
