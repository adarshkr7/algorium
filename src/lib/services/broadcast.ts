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
 * Thin wrapper over a Supabase realtime channel scoped to one room.
 *
 * The client and channel are created once per instance rather than once per
 * message — the previous implementation allocated a new channel on every send,
 * which leaked channel objects during a busy contest.
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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
      throw new Error(
        "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and " +
          "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required for realtime.",
      );
    }

    this.supabase = createClient(url, key);
    const base = `room-${roomCode.toUpperCase()}`;
    this.channelName = suffix ? `${base}-${suffix}` : base;
    this.channel = this.supabase.channel(this.channelName);
  }

  /** Never let a realtime hiccup break the request or the worker loop. */
  private async emit(event: string, payload: unknown): Promise<void> {
    try {
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

  /** Releases the underlying realtime socket. */
  async dispose(): Promise<void> {
    try {
      await this.supabase.removeChannel(this.channel);
    } catch {
      /* ignore */
    }
  }
}
