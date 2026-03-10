"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Howl, Howler } from "howler";

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

  // Track recent scroll activity so we don't change layout mid-scroll (iOS/TG can show "catch up" artifacts).
  const lastScrollAtRef = useRef<number>(0);

  // Audio: Pai Gow custom music + win/lose stingers.
  const [muteMusic, setMuteMusic] = useState(false);
  const [muteSfx, setMuteSfx] = useState(false);
  const [audioArmed, setAudioArmed] = useState(false); // set true on first user gesture

  const bgMusicRef = useRef<Howl | null>(null);
  const winSfxRef = useRef<Howl | null>(null);
  const loseSfxRef = useRef<Howl | null>(null);

  const armAudio = useCallback(() => {
    // Mobile browsers require a user gesture to unlock audio.
    setAudioArmed(true);

    try {
      // Howler may not have ctx in some environments; guard it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = (Howler as any).ctx as AudioContext | undefined;
      ctx?.resume?.();
    } catch {
      // ignore
    }

    const bg = bgMusicRef.current;
    if (bg && !muteMusic) {
      // Start immediately on gesture (unlocks playback reliably on iOS/in-app browsers)
      if (!bg.playing()) bg.play();
    }
  }, [muteMusic]);

  const onStatusChange = useCallback((s: PaiGowTableStatus) => {
    setStatus(s);
  }, []);

  const audioPaths = useMemo(
    () => ({
      bg: "/submissions/pai-gow/audio/pai-gow-instrumental.mp3",
      win: "/submissions/pai-gow/audio/win.mp3",
      lose: "/submissions/pai-gow/audio/loose.mp3",
    }),
    [],
  );

  // Init audio objects once.
  useEffect(() => {
    const bg = new Howl({ src: [audioPaths.bg], loop: true, volume: 0.45, preload: true });
    const win = new Howl({ src: [audioPaths.win], volume: 0.85, preload: true });
    const lose = new Howl({ src: [audioPaths.lose], volume: 0.85, preload: true });

    bgMusicRef.current = bg;
    winSfxRef.current = win;
    loseSfxRef.current = lose;

    return () => {
      bg.unload();
      win.unload();
      lose.unload();
      bgMusicRef.current = null;
      winSfxRef.current = null;
      loseSfxRef.current = null;
    };
  }, [audioPaths.bg, audioPaths.win, audioPaths.lose]);

  // Apply mute states.
  useEffect(() => {
    bgMusicRef.current?.mute(muteMusic);
  }, [muteMusic]);

  // Start/stop background music based on user gesture + mute.
  useEffect(() => {
    const bg = bgMusicRef.current;
    if (!bg) return;

    if (!audioArmed || muteMusic) {
      // Don't force-stop if unarmed; but pausing keeps it clean.
      if (bg.playing()) bg.pause();
      return;
    }

    if (!bg.playing()) bg.play();
  }, [audioArmed, muteMusic]);

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

  // Play win/lose stinger once when results appear.
  const prevShowResultsRef = useRef(false);
  useEffect(() => {
    const prev = prevShowResultsRef.current;
    prevShowResultsRef.current = showResults;

    if (!showResults || prev) return;
    if (!audioArmed || muteSfx) return;

    // Determine outcome by net vs wager.
    if (payout > betAmount) {
      winSfxRef.current?.play();
    } else if (payout < betAmount) {
      loseSfxRef.current?.play();
    }
    // Push/tie -> no stinger.
  }, [showResults, payout, betAmount, audioArmed, muteSfx]);

  // Mobile: dynamically size the GameWindow so it fits the content (avoid big empty space / double scroll).
  const [mobileGwHeight, setMobileGwHeight] = useState<string>("1700px");
  useEffect(() => {
    const gameEl = gameWrapRef.current;
    if (!gameEl) return;

    const apply = () => {
      if (typeof window === "undefined") return;
      if (window.innerWidth > 640) return; // mobile-only

      // Don't mutate height while the user is actively scrolling.
      if (Date.now() - lastScrollAtRef.current < 250) return;

      const tableWrap = gameEl.querySelector<HTMLElement>(".tableWrap");
      if (!tableWrap) return;

      // Prefer the visual bottom of the BETS/chips area (what you care about),
      // not the full scrollHeight (which can include extra empty fill space).
      const anchor =
        gameEl.querySelector<HTMLElement>(".betFooterRow") ??
        gameEl.querySelector<HTMLElement>(".chipRack") ??
        gameEl.querySelector<HTMLElement>(".betLane");

      // Use offset-based math (more stable than getBoundingClientRect in iOS in-app browsers).
      // Compute anchorBottom relative to tableWrap (offsetTop alone is relative to offsetParent).
      let anchorBottom = 0;
      if (anchor) {
        let y = 0;
        let el: HTMLElement | null = anchor;
        while (el && el !== tableWrap) {
          y += el.offsetTop;
          el = el.offsetParent as HTMLElement | null;
        }
        // If the offsetParent chain didn't reach tableWrap, fall back to plain offsetTop.
        if (el !== tableWrap) y = anchor.offsetTop;
        anchorBottom = Math.ceil(y + anchor.offsetHeight);
      }

      const scrollH = Math.ceil(tableWrap.scrollHeight);

      const scrollerPad = 44; // matches pgMobileScroller paddingBottom

      // IMPORTANT: to avoid nested scrolling on mobile in in-app browsers,
      // make the GameWindow tall enough for the full content.
      const target = Math.min(2400, Math.max(1200, scrollH + scrollerPad + 2));
      setMobileGwHeight(`${target}px`);
    };

    apply();

    const onScroll = () => {
      lastScrollAtRef.current = Date.now();
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => apply());
    // Observe the whole game area; content changes will bubble into layout changes here.
    ro.observe(gameEl);
    window.addEventListener("resize", apply);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", onScroll);
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
        <div
          ref={gameWrapRef}
          className="flex-1 min-w-0 pgGameWrap"
          style={{ "--pgMobileMinH": mobileGwHeight } as React.CSSProperties}
          // Arm audio on first touch anywhere (scrolling counts as a gesture on mobile).
          onPointerDownCapture={() => {
            if (!audioArmed) armAudio();
          }}
        >
          <style>{`@media(max-width:640px){.pgGameWrap>div{min-height:var(--pgMobileMinH)}}`}</style>
          <GameWindow
            game={paiGow}
            isLoading={!!status?.isLoading}
            isGameFinished={showResults}
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
            onMusicMutedChange={setMuteMusic}
            onSfxMutedChange={setMuteSfx}
            resultModalDelayMs={900}
          >
            {/* GameWindow renders a background image; mount Pai Gow UI as an overlay on top of it. */}
            <div className="pgMobileScroller" style={{ position: "absolute", inset: 0, zIndex: 10, overflow: "hidden", paddingBottom: 44 }}>
              <PaiGowTable
                ref={tableRef}
                onStatusChange={onStatusChange}
                desktopSidebarHostId="pgSidebarHost"
                muteSfx={muteSfx}
                onUserGesture={armAudio}
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
