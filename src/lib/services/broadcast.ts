import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Standings } from "./standings";

export class BroadcastService {
  private supabase: SupabaseClient;
  private channelName: string;

  constructor(roomCode: string) {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
    this.channelName = `room-${roomCode}`;
  }

  async broadcastSubmission(submission: any) {
    const channel = this.supabase.channel(this.channelName);
    await channel.send({
      type: 'broadcast',
      event: 'new-recent-action',
      payload: {
        type: "SUBMISSION",
        action: { ...submission, cfSubmissionId: submission.cfSubmissionId.toString() },
      },
    });
  }

  async broadcastProblemLocked(mode: string, lockedProblemId: string, winnerHandle: string, winnerId: string, nextIndex: number) {
    const channel = this.supabase.channel(this.channelName);
    await channel.send({
      type: 'broadcast',
      event: mode === "BLITZ" ? 'strict-blitz-problem-locked' : 'blitz-problem-locked',
      payload: {
        lockedProblemId,
        winnerHandle,
        winnerId,
        nextIndex,
      },
    });
  }

  async broadcastScoreboardUpdate(standings: Standings) {
    const channel = this.supabase.channel(this.channelName);
    await channel.send({
      type: 'broadcast',
      event: 'scoreboard-update',
      payload: { standings },
    });
  }

  async broadcastProblemsUpdate(problems: any[]) {
    const channel = this.supabase.channel(this.channelName);
    await channel.send({
      type: 'broadcast',
      event: 'problems-update',
      payload: { problems },
    });
  }

  async broadcastContestFinished(winnerId: string | null, isDraw: boolean, winnerHandle: string | null, standings: Standings) {
    const channel = this.supabase.channel(this.channelName);
    await channel.send({
      type: 'broadcast',
      event: 'contest-finished',
      payload: {
        winnerId,
        isDraw,
        winnerHandle,
        standings,
      }
    });
  }
}
