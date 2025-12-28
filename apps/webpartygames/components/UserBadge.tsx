"use client";

import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

function guestLabel(userId: string) {
  const compact = userId.replaceAll("-", "");
  return `Guest-${compact.slice(-4).toUpperCase()}`;
}

export function UserBadge() {
  const { user, loading: authLoading } = useAuth();
  const { profile, credits, loading: profileLoading } = useProfile();

  const loading = authLoading || profileLoading;

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
        Offline
      </div>
    );
  }

  const name = profile?.username?.trim() ? profile.username : guestLabel(user.id);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="text-xs font-semibold text-slate-100">{name}</div>
      <div className="h-4 w-px bg-slate-800" />
      <div className="text-xs text-slate-300">
        <span className="font-semibold text-slate-100 tabular-nums">
          {credits}
        </span>{" "}
        credits
      </div>
    </div>
  );
}


