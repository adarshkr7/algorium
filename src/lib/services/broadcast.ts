import {
  createClient,
  SupabaseClient,
  RealtimeChannel,
} from "@supabase/supabase-js";
import type { Standings } from "./standings";

/** Channel suffix for camera/microphone traffic. */
export const MEDIA_CHANNEL_SUFFIX = "media";

/** Every realtime event name the app sends, in one place. */
export const ROOM_EVENTS = {
  submission: "new-recent-action",
  problemsUpdate: "problems-update",
  scoreboardUpdate: "scoreboard-update",
  problemLocked: "blitz-problem-locked",
  strictProblemLocked: "strict-blitz-problem-locked",
  contestFinished: "contest-finished",
  contestStarted: "contest-started",
  roomCancelled: "room-cancelled",
  playerJoined: "player-joined",
  rematchReady: "rematch-ready",
  mediaState: "media-state",
  mediaViolation: "media-violation",
} as const;

export type ContestFinishReason =
  | "time_expired"
  | "all_solved"
  | "resignation"
  | "media_violation"
  | "manual";

/** One contestant's camera/microphone state, as everyone else sees it. */
export interface MediaSnapshot {
  userId: string;
  handle: string;
  role: string;
  videoOn: boolean;
  audioOn: boolean;
  compliant: boolean;
  /** ISO timestamp the current violation started, or null when compliant. */
  violationSince: string | null;
}

export interface MediaViolationPayload {
  userId: string;
  handle: string;
  /** "camera", "microphone", or both. */
  missing: string[];
  action: "WARN" | "FORFEIT";
  /** True when the grace period expired and the contest was ended. */
  enforced: boolean;
}

export interface SeriesSnapshot {
  id: string;
  bestOf: number;
  player1Id: string;
  /** Null until the opponent joins the first game of the series. */
  player2Id: string | null;
  player1Wins: number;
  player2Wins: number;
  status: string;
  winnerId: string | null;
}

export interface ContestFinishedPayload {
  winnerId: string | null;
  winnerHandle: string | null;
  isDraw: boolean;
  reason: ContestFinishReason;
  resignedUserId?: string | null;
  standings: Standings;
  /** userId -> elo delta applied by this match. */
  eloChanges?: Record<string, number>;
  series?: SeriesSnapshot | null;
}

/**
 * One Supabase client for the whole process.
 *
 * Every broadcast used to build its own: the room routes, the evaluator (once
 * per live contest per 5s tick) and the finaliser each called `createClient`,
 * and six of the eight call sites never disposed the result. Nothing here
 * subscribes — these are fire-and-forget sends — so a single client is all the
 * server ever needs, and the worker stops accumulating them for the life of
 * the process.
 */
const globalForBroadcast = globalThis as unknown as {
  broadcastClient?: SupabaseClient;
};

function sharedClient(): SupabaseClient {
  if (globalForBroadcast.broadcastClient) return globalForBroadcast.broadcastClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required for realtime.",
    );
  }

  // Nothing on the server signs in or listens, so the auth machinery is dead
  // weight — and its refresh timer would keep a worker process from idling.
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  globalForBroadcast.broadcastClient = client;
  return client;
}

/**
 * `httpSend` needs Realtime server v2.97.0 or newer and answers 404 below
 * that. Probe once, then remember, rather than paying a failed round trip per
 * message on an older project.
 */
let httpSendUsable = true;

/**
 * Channels, reused per topic.
 *
 * `client.channel(name)` mints a new object every call and registers it on the
 * client, so constructing a service per broadcast — which is what every call
 * site does — grew that registry forever inside the worker. Nothing here
 * subscribes, so one channel per topic is enough and can be shared.
 *
 * Capped because room codes are unbounded over a process's lifetime. Evicting
 * the oldest is safe: the next broadcast to that room simply mints a fresh one.
 */
const MAX_CACHED_CHANNELS = 200;
const channelCache = new Map<string, RealtimeChannel>();

function channelFor(client: SupabaseClient, name: string): RealtimeChannel {
  const cached = channelCache.get(name);
  if (cached) {
    // Refresh insertion order so busy rooms survive eviction.
    channelCache.delete(name);
    channelCache.set(name, cached);
    return cached;
  }

  if (channelCache.size >= MAX_CACHED_CHANNELS) {
    const oldest = channelCache.keys().next();
    if (!oldest.done) {
      const stale = channelCache.get(oldest.value);
      channelCache.delete(oldest.value);
      if (stale) void client.removeChannel(stale).catch(() => {});
    }
  }

  const channel = client.channel(name);
  channelCache.set(name, channel);
  return channel;
}

/**
 * Thin wrapper over a Supabase realtime channel scoped to one room.
 */
export class BroadcastService {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel;
  readonly channelName: string;

  /**
   * `suffix` puts a stream on its own channel. Media state is chatty and the
   * lobby already uses `room-CODE` for presence, so the two are kept apart
   * rather than made to share one topic.
   */
  constructor(roomCode: string, suffix?: string) {
    this.supabase = sharedClient();
    const base = `room-${roomCode.toUpperCase()}`;
    this.channelName = suffix ? `${base}-${suffix}` : base;
    this.channel = channelFor(this.supabase, this.channelName);
  }

  /**
   * Never let a realtime hiccup break the request or the worker loop.
   *
   * Uses `httpSend` rather than `send`. The server never subscribes its
   * channels, so `send` silently fell back to the REST endpoint anyway — and
   * warned, on every single message, that the fallback is being removed.
   */
  private async emit(event: string, payload: unknown): Promise<void> {
    try {
      if (httpSendUsable) {
        try {
          await this.channel.httpSend(event, payload);
          return;
        } catch (error) {
          // Only a version mismatch should disable the fast path permanently;
          // a transient failure falls through to `send` for this message.
          if (error instanceof Error && error.message.includes("v2.97.0")) {
            httpSendUsable = false;
            console.warn(
              "[broadcast] Realtime server predates httpSend; using the " +
                "deprecated send() fallback for the rest of this process.",
            );
          }
        }
      }

      await this.channel.send({ type: "broadcast", event, payload });
    } catch (error) {
      console.error(
        `[broadcast] failed to emit "${event}" on ${this.channelName}`,
        error,
      );
    }
  }

  async broadcastSubmission(submission: {
    cfSubmissionId: bigint | string;
    [key: string]: unknown;
  }): Promise<void> {
    await this.emit(ROOM_EVENTS.submission, {
      type: "SUBMISSION",
      action: {
        ...submission,
        cfSubmissionId: submission.cfSubmissionId.toString(),
      },
    });
  }

  async broadcastProblemLocked(
    mode: string,
    lockedProblemId: string,
    winnerHandle: string,
    winnerId: string,
    nextIndex: number,
  ): Promise<void> {
    const event =
      mode === "BLITZ"
        ? ROOM_EVENTS.strictProblemLocked
        : ROOM_EVENTS.problemLocked;

    await this.emit(event, {
      lockedProblemId,
      winnerHandle,
      winnerId,
      nextIndex,
    });
  }

  async broadcastScoreboardUpdate(standings: Standings): Promise<void> {
    await this.emit(ROOM_EVENTS.scoreboardUpdate, { standings });
  }

  async broadcastProblemsUpdate(problems: unknown[]): Promise<void> {
    await this.emit(ROOM_EVENTS.problemsUpdate, { problems });
  }

  /**
   * Takes a single payload object. The worker previously called this with an
   * object while the signature expected four positional arguments, so
   * `winnerId` arrived as `undefined` and clients showed "Winner: —".
   */
  async broadcastContestFinished(
    payload: ContestFinishedPayload,
  ): Promise<void> {
    await this.emit(ROOM_EVENTS.contestFinished, payload);
  }

  async broadcastContestStarted(startedAt: string): Promise<void> {
    await this.emit(ROOM_EVENTS.contestStarted, { startedAt });
  }

  async broadcastRoomCancelled(by: string): Promise<void> {
    await this.emit(ROOM_EVENTS.roomCancelled, { by });
  }

  async broadcastPlayerJoined(handle: string): Promise<void> {
    await this.emit(ROOM_EVENTS.playerJoined, { handle });
  }

  /** Pushes the whole media roster so every tile updates in one message. */
  async broadcastMediaState(participants: MediaSnapshot[]): Promise<void> {
    await this.emit(ROOM_EVENTS.mediaState, { participants });
  }

  async broadcastMediaViolation(
    payload: MediaViolationPayload,
  ): Promise<void> {
    await this.emit(ROOM_EVENTS.mediaViolation, payload);
  }

  /** Tells the other player a rematch room exists and where to go. */
  async broadcastRematchReady(
    code: string,
    createdByHandle: string,
    gameNumber: number,
  ): Promise<void> {
    await this.emit(ROOM_EVENTS.rematchReady, {
      code,
      createdByHandle,
      gameNumber,
    });
  }

  /**
   * Drops this room's channel.
   *
   * Optional now — channels are pooled and capped, so letting an instance go
   * out of scope no longer leaks. Call it when a room is finished with and you
   * want the slot back sooner.
   */
  async dispose(): Promise<void> {
    channelCache.delete(this.channelName);
    try {
      await this.supabase.removeChannel(this.channel);
    } catch {
      /* ignore */
    }
  }
}
