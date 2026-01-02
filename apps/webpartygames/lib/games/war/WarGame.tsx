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
  advance,
  canStart,
  clearReady,
  createInitialState,
  markReady,
  restart,
  setReveal,
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

function cardColor(suit: Card["suit"]) {
  return suit === "hearts" || suit === "diamonds" ? "text-rose-600" : "text-slate-950";
}

function cardPips(rank: Card["rank"]) {
  if (rank >= 11) return 0;
  if (rank === 14) return 1;
  return rank;
}

function pipPositions(pips: number) {
  const map: Record<number, Array<[number, number]>> = {
    1: [[50, 50]],
    2: [[50, 20], [50, 80]],
    3: [[50, 20], [50, 50], [50, 80]],
    4: [[28, 22], [72, 22], [28, 78], [72, 78]],
    5: [[28, 22], [72, 22], [50, 50], [28, 78], [72, 78]],
    6: [[28, 20], [72, 20], [28, 50], [72, 50], [28, 80], [72, 80]],
    7: [[28, 18], [72, 18], [28, 44], [72, 44], [50, 50], [28, 82], [72, 82]],
    8: [[28, 18], [72, 18], [28, 40], [72, 40], [28, 60], [72, 60], [28, 82], [72, 82]],
    9: [[28, 18], [72, 18], [28, 40], [72, 40], [50, 50], [28, 60], [72, 60], [28, 82], [72, 82]],
    10: [[28, 16], [72, 16], [28, 32], [72, 32], [28, 50], [72, 50], [28, 68], [72, 68], [28, 84], [72, 84]]
  };
  return map[pips] ?? map[1];
}

function CardFront({ card }: { card: Card }) {
  const symbol = suitSymbol(card.suit);
  const label = rankLabel(card.rank);
  const color = cardColor(card.suit);
  const pips = cardPips(card.rank);
  return (
    <div className="relative h-40 w-28 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-[0_12px_30px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
      <div className={["absolute left-2 top-2 flex flex-col items-start leading-none", color].join(" ")}>
        <div className="text-sm font-black tracking-tight">{label}</div>
        <div className="text-sm">{symbol}</div>
      </div>

      {card.rank >= 11 ? (
        <div className={["absolute inset-0 flex flex-col items-center justify-center gap-1", color].join(" ")}>
          <div className="text-5xl font-black tracking-tight">{label}</div>
          <div className="text-4xl">{symbol}</div>
        </div>
      ) : (
        <div className="absolute inset-0">
          {pipPositions(pips).map(([x, y], idx) => (
            <div
              key={idx}
              className={["absolute text-2xl", color].join(" ")}
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            >
              {symbol}
            </div>
          ))}
        </div>
      )}

      <div className={["absolute bottom-2 right-2 flex rotate-180 flex-col items-start leading-none", color].join(" ")}>
        <div className="text-sm font-black tracking-tight">{label}</div>
        <div className="text-sm">{symbol}</div>
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <div className="relative h-40 w-28 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-[0_12px_30px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
      <div className="absolute inset-2 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500" />
      <div className="absolute inset-2 rounded-xl opacity-25 bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%),radial-gradient(circle_at_80%_30%,white,transparent_40%),radial-gradient(circle_at_40%_80%,white,transparent_35%)]" />
      <div className="absolute inset-4 rounded-lg border border-white/60" />
    </div>
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
  return (
    <div className={["wpg-card3d h-40 w-28", flipped ? "wpg-card3d-flipped" : "", highlight ? "wpg-winner-pop" : ""].join(" ")}>
      <div className="wpg-card3d-inner">
        <div className="wpg-card3d-face wpg-card3d-front">
          <CardBack />
        </div>
        <div className="wpg-card3d-face wpg-card3d-back">
          {card ? <CardFront card={card} /> : <CardBack />}
        </div>
      </div>
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

  const loading = authLoading || profileLoading;

  const myName = useMemo(() => {
    if (!user) return null;
    if (profile?.username?.trim()) return profile.username;
    return guestLabel(user.id);
  }, [profile?.username, user]);

  useEffect(() => {
    if (!user) return;
    const provider = getSupabaseRealtimeProvider();

    const handle = provider.joinRoom<WarState>(roomId, (next) => {
      stateRef.current = next;
      setState(next);
      onPhaseChange?.(asShellPhase(next.phase));
    });
    handleRef.current = handle;

    const commandChannel = supabase.channel(`war:${roomId}`, {
      config: { broadcast: { self: true } }
    });

    commandChannel.on("broadcast", { event: "join" }, (message) => {
      const payload = (message as unknown as { payload?: { id: string; name: string; credits: number } }).payload;
      if (!payload) return;
      if (!handleRef.current) return;
      const current = stateRef.current;
      if (!current) return;
      if (current.hostId !== user.id) return;
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

      const marked = markReady(current, payload.id);
      const ids = marked.players.slice(0, 2).map((p) => p.id);
      const allReady = ids.length === 2 && ids.every((id) => marked.ready[id] === true);
      if (!allReady) {
        handleRef.current.updateState(marked);
        return;
      }

      const stepped = advance(marked, user.id);
      const cleared = clearReady(stepped);
      const revealed = setReveal(cleared, Date.now());
      handleRef.current.updateState(revealed);
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
              onClick={() => update(startGame(state))}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-base font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              Start game
            </button>
          </div>
        ) : null}

        {state.phase === "playing" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-400">Round {state.round}</div>
              <div className="text-xs text-slate-500">
                {battle.step === "war" ? `War ×${battle.warDepth}` : "Battle"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/20 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">
                  {myReady ? "Locked in" : "Ready to flip"}
                </div>
                <div className="text-xs text-slate-400">
                  {otherReady ? "Opponent locked in" : "Waiting on opponent"}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className={["rounded-xl border px-3 py-2", myReady ? "border-emerald-400 bg-emerald-500/10 text-emerald-100" : "border-slate-800 bg-slate-950/20 text-slate-300"].join(" ")}>
                  You
                </div>
                <div className={["rounded-xl border px-3 py-2", otherReady ? "border-emerald-400 bg-emerald-500/10 text-emerald-100" : "border-slate-800 bg-slate-950/20 text-slate-300"].join(" ")}>
                  Opponent
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={state.players.length !== 2 || myReady || revealLock}
              onClick={() => {
                const chan = commandChannelRef.current;
                if (!chan) return;
                void chan.send({ type: "broadcast", event: "flip-ready", payload: { id: user.id } });
              }}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-base font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              {battle.step === "war" ? "Flip (war)" : "Flip"}
            </button>

            <div className="text-xs text-slate-500">
              {revealLock ? "Revealing…" : myReady ? "Waiting for the other player…" : "Tap once per flip."}
            </div>
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

      <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-100">Players</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {players.map((p) => (
            <div
              key={p.id}
              className={[
                "rounded-2xl border px-4 py-3",
                p.id === state.hostId ? "border-emerald-400 bg-emerald-500/10" : "border-slate-800 bg-slate-950/20"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">{p.name}</div>
                <div className="text-xs text-slate-300">
                  <span className="font-semibold text-slate-100 tabular-nums">{state.piles[p.id]?.length ?? 0}</span>{" "}
                  cards
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {state.ready[p.id] ? "Ready" : "Not ready"}
              </div>
            </div>
          ))}
        </div>
        {state.players.length !== 2 ? (
          <div className="text-xs text-slate-500">This game is tuned for 2 players.</div>
        ) : null}
      </section>

      {state.phase !== "lobby" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-100">Battle</div>
            <div className="text-xs text-slate-500">
              Pot: <span className="font-semibold text-slate-200 tabular-nums">{potCount}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {players.map((p) => {
              const top = battle.faceUp[p.id] ?? null;
              const highlight = battle.winnerId === p.id;
              const flipped = revealLock ? flipStage === "front" : !!top;
              return (
                <div key={p.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-200">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      Cards: <span className="tabular-nums text-slate-300">{state.piles[p.id]?.length ?? 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div key={`${animTick}:${p.id}`} className={highlight ? "rounded-3xl ring-2 ring-emerald-400/60 ring-offset-0" : ""}>
                      <FlipCard card={top} flipped={flipped} highlight={highlight && !animating} />
                    </div>
                    <div className="text-xs text-slate-400">
                      {p.id === battle.winnerId ? (
                        <span className="font-semibold text-emerald-300">Winner</span>
                      ) : null}
                      {battle.winnerId && p.id !== battle.winnerId ? (
                        <span className="font-semibold text-slate-400">—</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-slate-400">
            {battle.message ?? (winnerName ? `${winnerName} wins the pot.` : "Flip cards to play.")}
          </div>
        </section>
      ) : null}
    </div>
  );
}


