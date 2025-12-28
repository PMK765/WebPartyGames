export type RoomId = string;

export type RealtimeEvent<TPayload> = {
  type: string;
  payload: TPayload;
  at: number;
};

export type RealtimeRoomHandle<TState> = {
  updateState: (newState: TState) => void;
  leave: () => void;
};

export interface RealtimeProvider {
  joinRoom<TState>(
    roomId: RoomId,
    onStateChange: (state: TState) => void
  ): RealtimeRoomHandle<TState>;
}


