import type { RealtimeProvider, RealtimeRoomHandle, RoomId } from "./types";

type RoomRecord = {
  state: unknown | undefined;
  subscribers: Set<(state: unknown) => void>;
};

class LocalRealtimeProvider implements RealtimeProvider {
  private rooms = new Map<RoomId, RoomRecord>();

  joinRoom<TState>(
    roomId: RoomId,
    onStateChange: (state: TState) => void
  ): RealtimeRoomHandle<TState> {
    const existing = this.rooms.get(roomId);
    const room: RoomRecord =
      existing ?? { state: undefined, subscribers: new Set() };

    if (!existing) this.rooms.set(roomId, room);

    const subscriber = (state: unknown) => {
      onStateChange(state as TState);
    };

    room.subscribers.add(subscriber);

    if (typeof room.state !== "undefined") {
      onStateChange(room.state as TState);
    }

    const updateState = (newState: TState) => {
      room.state = newState;
      for (const fn of room.subscribers) {
        fn(newState);
      }
    };

    const leave = () => {
      room.subscribers.delete(subscriber);
      if (room.subscribers.size === 0) {
        this.rooms.delete(roomId);
      }
    };

    return { updateState, leave };
  }
}

let singleton: LocalRealtimeProvider | null = null;

export function getLocalRealtimeProvider() {
  if (singleton) return singleton;
  singleton = new LocalRealtimeProvider();
  return singleton;
}


