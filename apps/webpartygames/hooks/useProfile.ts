"use client";

import { useContext } from "react";
import { AuthContext } from "@/components/AuthProvider";

export function useProfile() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useProfile must be used within AuthProvider");
  }

  const credits = ctx.profile?.credits ?? 0;

  return {
    profile: ctx.profile,
    setProfile: ctx.setProfile,
    credits,
    loading: ctx.loading
  };
}


