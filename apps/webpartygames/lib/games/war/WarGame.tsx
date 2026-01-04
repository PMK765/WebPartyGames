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
  canStart,
  createInitialState,
  handleFlip,
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

export function WarGame({ roomId, gameDefinition, onPhaseChange }: Props) {
  const { user, loading: authLoading, error: authError } = useAuth();
  const { profile, credits, loading: profileLoading } = useProfile();

  const [state, setState] = useState<WarState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commandReady, setCommandReady] = useState(false);
  const [winMessage, setWinMessage] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [nicknameConfirmed, setNicknameConfirmed] = useState(false);

  const handleRef = useRef<RealtimeRoomHandle<WarState> | null>(null);
  const commandChannelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef<WarState | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);
  const flipAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastRevealNonceRef = useRef<number>(-1);
  const hasInitializedRef = useRef(false);
  const isCreatorRef = useRef(false);
  const clearCardsTimeoutRef = useRef<number | null>(null);

  const loading = authLoading || profileLoading;

  useEffect(() => {
    if (typeof window === "undefined") return;
    winAudioRef.current = new Audio("/sounds/wonhand.mp3");
    loseAudioRef.current = new Audio("/sounds/losthand.mp3");
    flipAudioRef.current = new Audio("/sounds/flipcard.mp3");
    if (winAudioRef.current) winAudioRef.current.volume = 0.7;
    if (loseAudioRef.current) loseAudioRef.current.volume = 0.7;
    if (flipAudioRef.current) flipAudioRef.current.volume = 0.5;

    const creatorFlag = window.localStorage.getItem(`wpg_creator:war:${roomId}`);
    isCreatorRef.current = creatorFlag === "1";
    console.log("Is room creator:", isCreatorRef.current);

    const savedNickname = window.localStorage.getItem(`wpg_nickname:war`);
    if (savedNickname) {
      setNickname(savedNickname);
      setNicknameConfirmed(true);
    }
  }, [roomId]);

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
      if (!current) {
        if (isCreatorRef.current) {
          console.log("Creator initializing room with host:", payload.id);
          const initialState = createInitialState(roomId, payload.id);
          const withPlayer = addOrUpdatePlayer(initialState, payload);
          handleRef.current.updateState(withPlayer);
        } else {
          console.log("Non-creator waiting for room state");
        }
        return;
      }

      if (current.hostId !== user.id) {
        console.log("Not host, ignoring join");
        return;
      }
      if (!current.players.some((p) => p.id === payload.id) && current.players.length >= 2) {
        console.log("Room full, ignoring join");
        return;
      }
      console.log("Host adding player:", payload.id);
      const next = addOrUpdatePlayer(current, payload);
      handleRef.current.updateState(next);
    });

    commandChannel.on("broadcast", { event: "flip" }, (message) => {
      const payload = (message as unknown as { payload?: { id: string } }).payload;
      if (!payload) {
        console.error("Flip event: no payload");
        return;
      }
      
      if (!handleRef.current) return;
      const current = stateRef.current;
      if (!current) {
        console.error("Flip event: no current state");
        return;
      }
      if (current.phase !== "playing") {
        console.warn("Flip event: phase is", current.phase);
        return;
      }
      
      if (current.hostId === user.id) {
        console.log("Host processing flip for:", payload.id, "step:", current.battle.step, "ready:", current.ready[payload.id]);
        const next = handleFlip(current, payload.id);
        if (next !== current) {
          console.log("State changed, ready flags:", next.ready, "step:", next.battle.step);
          handleRef.current.updateState(next);
        } else {
          console.log("State unchanged - ready:", current.ready[payload.id], "step:", current.battle.step);
        }
      }
    });

    void commandChannel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      setCommandReady(true);
    });
    commandChannelRef.current = commandChannel;

    return () => {
      handle.leave();
      void commandChannel.unsubscribe();
    };
  }, [onPhaseChange, roomId, user]);

  useEffect(() => {
    if (!user || !myName || !commandReady || hasInitializedRef.current || !nicknameConfirmed) return;
    hasInitializedRef.current = true;
    
    const chan = commandChannelRef.current;
    if (!chan) return;

    void chan.send({
      type: "broadcast",
      event: "join",
      payload: { id: user.id, name: nickname, credits }
    });
  }, [commandReady, credits, myName, nickname, nicknameConfirmed, user]);

  useEffect(() => {
    if (!user || !state || state.phase !== "playing") return;
    if (state.revealNonce === lastRevealNonceRef.current) return;
    lastRevealNonceRef.current = state.revealNonce;

    if (clearCardsTimeoutRef.current) {
      window.clearTimeout(clearCardsTimeoutRef.current);
      clearCardsTimeoutRef.current = null;
    }

    if (state.battle.step === "resolved" && state.battle.winnerId) {
      const isWin = state.battle.winnerId === user.id;
      const winnerCard = state.battle.faceUp[state.battle.winnerId];
      const loserCard = state.battle.faceUp[isWin ? (players.find(p => p.id !== user.id)?.id ?? "") : user.id];
      
      if (winnerCard && loserCard) {
        const msg = isWin 
          ? `Won ${rankLabel(loserCard.rank)}${suitSymbol(loserCard.suit)} with ${rankLabel(winnerCard.rank)}${suitSymbol(winnerCard.suit)}`
          : `Lost ${rankLabel(winnerCard.rank)}${suitSymbol(winnerCard.suit)} to ${rankLabel(loserCard.rank)}${suitSymbol(loserCard.suit)}`;
        setWinMessage(msg);
        setTimeout(() => setWinMessage(null), 2000);
      }

      const audio = isWin ? winAudioRef.current : loseAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }

      const flipAudio = flipAudioRef.current;
      if (flipAudio) {
        flipAudio.currentTime = 0;
        void flipAudio.play();
      }

      clearCardsTimeoutRef.current = window.setTimeout(() => {
        if (!handleRef.current || !stateRef.current) return;
        const current = stateRef.current;
        if (current.phase !== "playing" || current.battle.step !== "resolved") return;
        if (current.hostId !== user.id) return;

        const [a, b] = current.players;
        if (!a || !b) return;

        handleRef.current.updateState({
          ...current,
          ready: { [a.id]: false, [b.id]: false },
          battle: {
            ...current.battle,
            faceUp: {},
            step: "idle"
          }
        });
      }, 2000);
    }
  }, [state, user]);

  useEffect(() => {
    return () => {
      if (clearCardsTimeoutRef.current) {
        window.clearTimeout(clearCardsTimeoutRef.current);
      }
    };
  }, []);

  const update = (next: WarState) => {
    handleRef.current?.updateState(next);
  };

  if (loading) {
    return <div className="text-sm text-slate-400">Loading...</div>;
  }

  if (authError || !user) {
    return (
      <div className="rounded-2xl border border-rose-900 bg-rose-950/20 p-4 text-sm text-rose-200">
        {authError ?? "Not authenticated"}
      </div>
    );
  }

  if (!state) {
    return <div className="text-sm text-slate-400">Connecting...</div>;
  }

  if (!nicknameConfirmed) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-100">Enter your nickname</div>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nickname.trim()) {
                  setNicknameConfirmed(true);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(`wpg_nickname:war`, nickname.trim());
                  }
                }
              }}
              placeholder="Your name"
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              disabled={!nickname.trim()}
              onClick={() => {
                setNicknameConfirmed(true);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(`wpg_nickname:war`, nickname.trim());
                }
              }}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-base font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </section>
      </div>
    );
  }

  const meHost = state.hostId === user.id;
  const players = state.players.slice(0, 2);
  const ready = canStart(state);
  const battle = state.battle;
  const myPile = state.piles[user.id] ?? [];
  const otherPlayer = players.find((p) => p.id !== user.id);
  const otherPile = otherPlayer ? state.piles[otherPlayer.id] ?? [] : [];
  const myCard = battle.faceUp[user.id] ?? null;
  const otherCard = otherPlayer ? battle.faceUp[otherPlayer.id] ?? null : null;
  const myReady = state.ready[user.id] === true;
  const totalCards = Object.values(state.piles).reduce((sum, pile) => sum + pile.length, 0);

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
              {state.players.length} players · Total cards: {totalCards}
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Host: <span className="font-semibold text-slate-200">{state.players.find((p) => p.id === state.hostId)?.name ?? "—"}</span>
          </div>
        </div>

        {state.phase === "lobby" ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-300">Need exactly 2 players for War.</div>
            <button
              type="button"
              disabled={!meHost || !ready}
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
              Round {state.round} · You: {myPile.length} · Opponent: {otherPile.length} · Pot: {battle.pot.length}
            </div>

            {winMessage ? (
              <div className="rounded-xl border border-emerald-400 bg-emerald-500/20 px-4 py-3 text-center animate-pulse">
                <div className="text-sm font-semibold text-emerald-200">{winMessage}</div>
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-2">
                <div className="text-xs font-semibold text-slate-300">You</div>
                <div className="relative h-28 w-20">
                  {myCard ? (
                    <img
                      src={`/cards/${cardFile(myCard)}`}
                      alt={`${rankLabel(myCard.rank)} of ${myCard.suit}`}
                      className={`block h-full w-full rounded-lg object-contain shadow-lg ${battle.winnerId === user.id ? "ring-2 ring-emerald-400" : ""}`}
                      draggable={false}
                      loading="eager"
                    />
                  ) : (
                    <img
                      src="/cards/card_back.svg"
                      alt="Card back"
                      className="block h-full w-full rounded-lg object-contain shadow-lg"
                      draggable={false}
                      loading="eager"
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="text-xs font-semibold text-slate-300">Opponent</div>
                <div className="relative h-28 w-20">
                  {otherCard ? (
                    <img
                      src={`/cards/${cardFile(otherCard)}`}
                      alt={`${rankLabel(otherCard.rank)} of ${otherCard.suit}`}
                      className={`block h-full w-full rounded-lg object-contain shadow-lg ${battle.winnerId === otherPlayer?.id ? "ring-2 ring-emerald-400" : ""}`}
                      draggable={false}
                      loading="eager"
                    />
                  ) : (
                    <img
                      src="/cards/card_back.svg"
                      alt="Card back"
                      className="block h-full w-full rounded-lg object-contain shadow-lg"
                      draggable={false}
                      loading="eager"
                    />
                  )}
                </div>
              </div>
            </div>

            {battle.message ? (
              <div className="text-center text-sm font-semibold text-emerald-300">{battle.message}</div>
            ) : null}

            <button
              type="button"
              disabled={myReady || !commandReady}
              onClick={() => {
                const chan = commandChannelRef.current;
                if (!chan) {
                  console.error("No command channel");
                  return;
                }
                console.log("Flip clicked - myReady:", myReady, "commandReady:", commandReady, "step:", battle.step);
                void chan.send({ type: "broadcast", event: "flip", payload: { id: user.id } });
              }}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-base font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              {myReady ? "Waiting for opponent..." : battle.step === "war" ? "Flip (WAR!)" : "Flip"}
            </button>
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
