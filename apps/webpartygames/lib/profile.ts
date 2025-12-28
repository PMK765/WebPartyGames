import { supabase } from "@/lib/supabaseClient";

export type Profile = {
  id: string;
  username: string | null;
  credits: number;
  created_at: string;
  updated_at: string;
};

export async function getProfile(userId: string) {
  const result = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Profile>();

  if (result.error) {
    return { profile: null, error: result.error.message };
  }

  return { profile: result.data ?? null, error: null };
}

export async function createProfile(userId: string) {
  const insert = await supabase
    .from("profiles")
    .insert({ id: userId })
    .select("*")
    .single<Profile>();

  if (insert.error) {
    return { profile: null, error: insert.error.message };
  }

  return { profile: insert.data, error: null };
}

export async function fetchOrCreateProfile(userId: string) {
  const existing = await getProfile(userId);
  if (existing.profile) return existing;

  const created = await createProfile(userId);
  if (created.profile) return created;

  return {
    profile: null,
    error: existing.error ?? created.error ?? "Failed to fetch or create profile"
  };
}

export async function updateCredits(userId: string, credits: number) {
  const normalized = Math.max(0, Math.round(credits));

  const update = await supabase
    .from("profiles")
    .update({ credits: normalized })
    .eq("id", userId)
    .select("*")
    .single<Profile>();

  if (update.error) {
    return { profile: null, error: update.error.message };
  }

  return { profile: update.data, error: null };
}


