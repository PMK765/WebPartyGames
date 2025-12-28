"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameSlug } from "@/lib/games/types";

type Props = {
  slug: GameSlug;
};

function createRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes =
    typeof window !== "undefined" && typeof window.crypto !== "undefined"
      ? window.crypto.getRandomValues(new Uint8Array(8))
      : undefined;

  let out = "";
  for (let i = 0; i < 8; i += 1) {
    const n = bytes ? bytes[i] : Math.floor(Math.random() * 256);
    out += alphabet[n % alphabet.length];
  }
  return out;
}

export function PartyCTA({ slug }: Props) {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    if (!roomId) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/game/${slug}/play/${roomId}`;
  }, [roomId, slug]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 md:p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Start a party</h2>
        <p className="text-sm text-slate-300">
          Generate a room code and play instantly on the same device.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <button
          type="button"
          onClick={() => {
            const nextRoomId = createRoomId();
            setRoomId(nextRoomId);
            setCopied(false);
            router.push(`/game/${slug}/play/${nextRoomId}`);
          }}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
        >
          Start Party
        </button>

        <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-2 text-sm text-slate-200">
          {roomId ? (
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono tracking-widest">{roomId}</div>
              <div className="text-xs text-slate-400">Room code</div>
            </div>
          ) : (
            <div className="text-slate-400">Room code appears here</div>
          )}
        </div>

        <button
          type="button"
          disabled={!link}
          onClick={() => {
            if (!link) return;
            if (!navigator.clipboard) return;
            void navigator.clipboard.writeText(link);
            setCopied(true);
          }}
          className="inline-flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-emerald-400 hover:bg-slate-900 transition disabled:opacity-40 disabled:hover:border-slate-800 disabled:hover:bg-slate-900/60"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="text-xs text-slate-400">
        Share the link later when online multiplayer lands. For now, the party runs
        on this device only.
      </div>
    </section>
  );
}


