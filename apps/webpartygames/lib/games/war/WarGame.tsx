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
import { addOrUpdatePlayer, advance, canStart, createInitialState, restart, startGame } from "./logic";

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

function CardView({ card }: { card: Card }) {
  const symbol = suitSymbol(card.suit);
  const label = rankLabel(card.rank);
  const color = cardColor(card.suit);
  return (
    <div className="relative h-36 w-24 rounded-2xl border border-slate-300 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className={["absolute left-2 top-2 flex flex-col items-start leading-none", color].join(" ")}>
        <div className="text-sm font-extrabold">{label}</div>
        <div className="text-sm">{symbol}</div>
      </div>
      <div className={["absolute inset-0 flex items-center justify-center text-5xl", color].join(" ")}>
        {symbol}
      </div>
      <div className={["absolute bottom-2 right-2 flex rotate-180 flex-col items-start leading-none", color].join(" ")}>
        <div className="text-sm font-extrabold">{label}</div>
        <div className="text-sm">{symbol}</div>
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

  const handleRef = useRef<RealtimeRoomHandle<WarState> | null>(null);
  const commandChannelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef<WarState | null>(null);

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
            <div className="text-xs text-slate-400">Round {state.round}</div>
            <button
              type="button"
              disabled={!meHost}
              onClick={() => update(advance(state, user.id))}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-base font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              {battle.step === "warBurn" ? "Burn 3 (war)" : battle.step === "warBattle" ? "Flip (war)" : "Flip cards"}
            </button>
            <div className="text-xs text-slate-500">
              {meHost ? "You control the deck to avoid conflicts." : "Waiting for host…"}
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
              return (
                <div key={p.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-200">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      Cards: <span className="tabular-nums text-slate-300">{state.piles[p.id]?.length ?? 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {top ? (
                      <CardView card={top} />
                    ) : (
                      <div className="h-36 w-24 rounded-2xl border border-slate-800 bg-slate-950/20" />
                    )}
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


