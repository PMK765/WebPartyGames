"use client";

import { createContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/lib/profile";
import { fetchOrCreateProfile } from "@/lib/profile";

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;
  authError: string | null;
  profileError: string | null;
  loading: boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function AuthProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const syncProfile = async (nextUser: User | null) => {
      if (!nextUser) {
        setProfile(null);
        setProfileError(null);
        return;
      }

      const result = await fetchOrCreateProfile(nextUser.id);
      if (cancelled) return;
      if (result.profile) {
        setProfile(result.profile);
        setProfileError(null);
        return;
      }

      setProfile(null);
      setProfileError(result.error ?? "Failed to load profile");
    };

    const init = async () => {
      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.error) {
        if (!cancelled) {
          setAuthError(sessionResult.error.message);
          setLoading(false);
        }
        return;
      }
      const session = sessionResult.data.session;

      if (!session) {
        const signIn = await supabase.auth.signInAnonymously();
        if (signIn.error) {
          if (!cancelled) {
            setAuthError(signIn.error.message);
            setUser(null);
            setProfile(null);
            setProfileError(null);
            setLoading(false);
          }
          return;
        }
        const signedInUser = signIn.data.user ?? null;
        if (!cancelled) {
          setAuthError(null);
          setUser(signedInUser);
          await syncProfile(signedInUser);
          setLoading(false);
        }
        return;
      }

      const existingUser = session.user ?? null;
      if (!cancelled) {
        setAuthError(null);
        setUser(existingUser);
        await syncProfile(existingUser);
        setLoading(false);
      }
    };

    void init();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setAuthError(null);
      void syncProfile(nextUser);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, setProfile, authError, profileError, loading }),
    [authError, loading, profile, profileError, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


