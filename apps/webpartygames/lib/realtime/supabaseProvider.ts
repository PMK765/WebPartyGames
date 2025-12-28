import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { RealtimeProvider, RealtimeRoomHandle, RoomId } from "./types";

type BroadcastPayload<TState> = { payload: TState };

class SupabaseRealtimeProvider implements RealtimeProvider {
  joinRoom<TState>(
    roomId: RoomId,
    onStateChange: (state: TState) => void
  ): RealtimeRoomHandle<TState> {
    let lastState: TState | undefined = undefined;

    const channel: RealtimeChannel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: true } }
    });

    channel.on("broadcast", { event: "state" }, (message) => {
      const state = (message as unknown as BroadcastPayload<TState>).payload;
      lastState = state;
      onStateChange(state);
    });

    channel.on("broadcast", { event: "sync-request" }, () => {
      if (typeof lastState === "undefined") return;
      void channel.send({ type: "broadcast", event: "state", payload: lastState });
    });

    void channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      void channel.send({ type: "broadcast", event: "sync-request", payload: {} });
    });

    const updateState = (state: TState) => {
      lastState = state;
      void channel.send({ type: "broadcast", event: "state", payload: state });
    };

    const leave = () => {
      void supabase.removeChannel(channel);
    };

    return { updateState, leave };
  }
}

let singleton: SupabaseRealtimeProvider | null = null;

export function getSupabaseRealtimeProvider() {
  if (singleton) return singleton;
  singleton = new SupabaseRealtimeProvider();
  return singleton;
}


