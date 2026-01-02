"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameDefinition } from "@/lib/games/types";
import { getSupabaseRealtimeProvider } from "@/lib/realtime/supabaseProvider";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import type { RealtimeRoomHandle } from "@/lib/realtime/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { Card, WarState } from "./types";
import {
  addOrUpdatePlayer,
  attemptResolve,
  canStart,
  createInitialState,
  markPlayerReady,
  restart,
  startGame
} from "./logic";

type Props = {
  roomId: string;
  gameDefinition: GameDefinition;
  onPhaseChange?: (phase: "lobby" | "playing" | "results") => void;
};

function guestLabel(userId: string) {
  const compact = userId.replaceAll("-", "");
  return `Guest-${compact.slice(-4).toUpperCase()}`;
}

function asShellPhase(phase: WarState["phase"]) {
  if (phase === "lobby") return "lobby";
  if (phase === "finished") return "results";
  return "playing";
}

function suitSymbol(suit: Card["suit"]) {
  if (suit === "spades") return "♠";
  if (suit === "hearts") return "♥";
  if (suit === "diamonds") return "♦";
  return "♣";
}

function rankLabel(rank: Card["rank"]) {
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  return String(rank);
}

function cardFile(card: Card) {
  const rank = card.rank === 14 ? "ace" : card.rank === 13 ? "king" : card.rank === 12 ? "queen" : card.rank === 11 ? "jack" : String(card.rank);
  return `${rank}_of_${card.suit}.svg`;
}

function CardBack() {
  return (
    <img
      src="/cards/card_back.svg"
      alt="Card back"
      className="block h-full w-full rounded-2xl object-contain shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
      draggable={false}
      loading="eager"
    />
  );
}

function FlipCard({
  card,
  flipped,
  highlight
}: {
  card: Card | null;
  flipped: boolean;
  highlight: boolean;
}) {
  const frontSrc = card ? `/cards/${cardFile(card)}` : "/cards/card_back.svg";
  return (
    <div
      className={[
        "relative h-32 w-24 shrink-0 md:h-40 md:w-28",
        highlight ? "wpg-winner-pop" : ""
      ].join(" ")}
    >
      <div className="absolute inset-0">
        <CardBack />
      </div>
      <img
        src={frontSrc}
        alt={card ? `${rankLabel(card.rank)} of ${card.suit}` : "Card"}
        className={[
          "absolute inset-0 block h-full w-full rounded-2xl object-contain shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition-opacity duration-300",
          flipped ? "opacity-100" : "opacity-0"
        ].join(" ")}
        draggable={false}
        loading="eager"
        onError={(e) => {
          e.currentTarget.src = "/cards/card_back.svg";
        }}
      />
    </div>
  );
}

export function WarGame({ roomId, gameDefinition, onPhaseChange }: Props) {
  const { user, loading: authLoading, error: authError } = useAuth();
  const { profile, credits, loading: profileLoading } = useProfile();

  const [state, setState] = useState<WarState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commandReady, setCommandReady] = useState(false);
  const [animTick, setAnimTick] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [flipStage, setFlipStage] = useState<"back" | "front">("back");
  const [revealLock, setRevealLock] = useState(false);

  const handleRef = useRef<RealtimeRoomHandle<WarState> | null>(null);
  const commandChannelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef<WarState | null>(null);
  const prevFaceUpRef = useRef<Record<string, Card | null>>({});
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastRevealNonceRef = useRef<number>(-1);
  const lastOutcomeNonceRef = useRef<number>(-1);

  const loading = authLoading || profileLoading;

  useEffect(() => {
    if (typeof window === "undefined") return;
    winAudioRef.current = new Audio("/sounds/wonhand.mp3");
    loseAudioRef.current = new Audio("/sounds/losthand.mp3");
    if (winAudioRef.current) winAudioRef.current.volume = 0.7;
    if (loseAudioRef.current) loseAudioRef.current.volume = 0.7;
  }, []);

  const myName = useMemo(() => {
    if (!user) return null;
    if (profile?.username?.trim()) return profile.username;
    return guestLabel(user.id);
  }, [profile?.username, user]);

  useEffect(() => {
    if (!user) return;
    const provider = getSupabaseRealtimeProvider();
    const roomKey = `war:${roomId}`;

    const handle = provider.joinRoom<WarState>(roomKey, (next) => {
      stateRef.current = next;
      setState(next);
      onPhaseChange?.(asShellPhase(next.phase));
    });
    handleRef.current = handle;

    const commandChannel = supabase.channel(`war-cmd:${roomId}`, {
      config: { broadcast: { self: true } }
    });

    commandChannel.on("broadcast", { event: "join" }, (message) => {
      const payload = (message as unknown as { payload?: { id: string; name: string; credits: number } }).payload;
      if (!payload) return;
      if (!handleRef.current) return;
      const current = stateRef.current;
      if (!current) return;
      if (current.hostId !== user.id) return;
      if (!current.players.some((p) => p.id === payload.id) && current.players.length >= 2) return;
      const next = addOrUpdatePlayer(current, payload);
      handleRef.current.updateState(next);
    });

    commandChannel.on("broadcast", { event: "flip-ready" }, (message) => {
      const payload = (message as unknown as { payload?: { id: string } }).payload;
      if (!payload) return;
      if (!handleRef.current) return;
      const current = stateRef.current;
      if (!current) return;
      if (current.phase !== "playing") return;
      if (current.hostId !== user.id) return;

      const staged = markPlayerReady(current, payload.id);
      const resolved = attemptResolve(staged);
      handleRef.current.updateState(resolved);
    });

    void commandChannel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      setCommandReady(true);
    });
    commandChannelRef.current = commandChannel;

    return () => {
      handle.leave();
      handleRef.current = null;
      if (commandChannelRef.current) {
        void supabase.removeChannel(commandChannelRef.current);
        commandChannelRef.current = null;
      }
      setCommandReady(false);
    };
  }, [onPhaseChange, roomId, user]);

  useEffect(() => {
    if (!user) return;
    if (!myName) return;
    if (!commandReady) return;
    const chan = commandChannelRef.current;
    if (!chan) return;
    void chan.send({ type: "broadcast", event: "join", payload: { id: user.id, name: myName, credits } });
  }, [commandReady, credits, myName, user]);

  useEffect(() => {
    if (!user) return;
    if (!handleRef.current) return;
    if (state) return;

    const isCreator =
      typeof window !== "undefined" &&
      window.localStorage.getItem(`wpg_creator:war:${roomId}`) === "1";

    const delay = isCreator ? 50 : (Math.abs(Array.from(`${roomId}:${user.id}`).reduce((a, c) => a + c.charCodeAt(0), 0)) % 500) + 250;

    const id = window.setTimeout(() => {
      if (stateRef.current) return;
      const initial = createInitialState(roomId, user.id);
      const seeded = addOrUpdatePlayer(initial, { id: user.id, name: myName ?? guestLabel(user.id), credits });
      handleRef.current?.updateState(seeded);
    }, delay);

    return () => window.clearTimeout(id);
  }, [credits, myName, roomId, state, user]);

  const update = (next: WarState) => {
    if (!handleRef.current) return;
    setState(next);
    onPhaseChange?.(asShellPhase(next.phase));
    handleRef.current.updateState(next);
  };

  useEffect(() => {
    if (!state) return;
    if (state.phase !== "playing") return;
    if (!state.revealAt) return;
    if (state.revealNonce === lastRevealNonceRef.current) return;
    lastRevealNonceRef.current = state.revealNonce;

    setAnimTick((t) => t + 1);
    setAnimating(true);
    setRevealLock(true);
    setFlipStage("back");
    const t1 = window.setTimeout(() => setFlipStage("front"), 80);
    const t2 = window.setTimeout(() => setAnimating(false), 900);
    const t3 = window.setTimeout(() => setRevealLock(false), 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [state]);

  useEffect(() => {
    if (!user) return;
    if (!state) return;
    if (state.phase !== "playing") return;
    if (state.revealNonce === lastOutcomeNonceRef.current) return;
    if (!state.battle.winnerId) return;
    lastOutcomeNonceRef.current = state.revealNonce;
    const isWin = state.battle.winnerId === user.id;
    const a = isWin ? winAudioRef.current : loseAudioRef.current;
    if (!a) return;
    a.currentTime = 0;
    void a.play();
  }, [state, user]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-300">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-300">
        {authError ? `Auth error: ${authError}` : "You’re not signed in."}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-300">
        Joining room…
      </div>
    );
  }

  const meHost = state.hostId === user.id;
  const players = state.players.slice(0, 2);
  const ready = canStart(state);
  const battle = state.battle;
  const winnerName = battle.winnerId ? state.players.find((p) => p.id === battle.winnerId)?.name ?? null : null;
  const pileCounts = Object.fromEntries(players.map((p) => [p.id, state.piles[p.id]?.length ?? 0]));
  const potCount = battle.pot.length;
  const totalCards = Object.values(state.piles).reduce((sum, pile) => sum + (pile?.length ?? 0), 0);
  const displayedTotal = players.reduce((sum, p) => sum + (state.piles[p.id]?.length ?? 0), 0);
  const myReady = user ? state.ready[user.id] === true : false;
  const otherId = players.find((p) => p.id !== user.id)?.id ?? null;
  const otherReady = otherId ? state.ready[otherId] === true : false;
  const bothReady = myReady && otherReady;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-900 bg-rose-950/20 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-100">{gameDefinition.name}</div>
            <div className="text-xs text-slate-400">
              {state.players.length} players · Cards {pileCounts[players[0]?.id ?? ""] ?? 0}–{pileCounts[players[1]?.id ?? ""] ?? 0} · Pot {potCount}
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Host:{" "}
            <span className="font-semibold text-slate-200">
              {state.players.find((p) => p.id === state.hostId)?.name ?? "—"}
            </span>
          </div>
        </div>

        {state.phase === "lobby" ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-300">Need exactly 2 players for War.</div>
            <button
              type="button"
              disabled={!meHost || !ready || state.players.length !== 2}
              onClick={() => {
                const base = createInitialState(roomId, user.id);
                base.players = state.players.slice(0, 2);
                update(startGame(base));
              }}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-base font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              Start game
            </button>
          </div>
        ) : null}

        {state.phase === "playing" ? (
          <div className="space-y-4">
            <div className="text-xs text-slate-400 text-center">
              Round {state.round} · You: {pileCounts[user.id] ?? 0} cards · Opponent: {pileCounts[otherId ?? ""] ?? 0} cards · Pot: {potCount}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {players.map((p) => {
                const card = battle.faceUp[p.id] ?? null;
                const isMe = p.id === user.id;
                const highlight = battle.winnerId === p.id && battle.step === "resolved";
                return (
                  <div key={p.id} className="space-y-2">
                    <div className="text-xs font-semibold text-slate-300 text-center">
                      {isMe ? "You" : "Opponent"}
                    </div>
                    <FlipCard card={card} flipped={!!card} highlight={highlight} />
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              disabled={state.players.length !== 2 || myReady}
              onClick={() => {
                const chan = commandChannelRef.current;
                if (!chan) return;
                void chan.send({ type: "broadcast", event: "flip-ready", payload: { id: user.id } });
              }}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-base font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              {myReady ? "Waiting for opponent…" : battle.step === "war" ? "Flip (WAR!)" : "Flip"}
            </button>

            {meHost && totalCards !== 52 ? (
              <button
                type="button"
                onClick={() => {
                  const base = createInitialState(roomId, user.id);
                  base.players = state.players.slice(0, 2);
                  update(startGame(base));
                }}
                className="w-full rounded-lg border border-rose-800 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-950/40 transition"
              >
                Reset deck (cards: {totalCards})
              </button>
            ) : null}
          </div>
        ) : null}

        {state.phase === "finished" ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-200">{battle.message ?? "Game over."}</div>
            <button
              type="button"
              disabled={!meHost}
              onClick={() => update(restart(state, user.id))}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-base font-semibold text-slate-100 hover:border-slate-700 hover:bg-slate-900 transition disabled:opacity-40"
            >
              Play again
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}


