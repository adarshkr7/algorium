import "server-only";
import { AccessToken, WebhookReceiver } from "livekit-server-sdk";

/**
 * LiveKit configuration and token minting.
 *
 * Everything here degrades rather than throws when the credentials are absent:
 * a deployment without LiveKit still runs proctored contests, it just falls
 * back to each player seeing their own preview instead of each other's. The
 * lobby gate and the enforcement sweep both work off self-reported state, so
 * the feature is usable — weaker, but usable — before anyone signs up for a
 * media provider.
 */

/** Tokens outlive the longest contest (300 min) plus lobby time. */
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function getLiveKitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export function isLiveKitConfigured(): boolean {
  return getLiveKitConfig() !== null;
}

/** One LiveKit room per Algorium room, named to match the realtime channel. */
export function mediaRoomName(code: string): string {
  return `room-${code.toUpperCase()}`;
}

/**
 * Mints a join token.
 *
 * `canPublish` is set from the caller's role rather than left to the client:
 * a supervisor watches without a camera, and a spectator gets neither.
 */
export async function mintJoinToken(args: {
  config: LiveKitConfig;
  roomCode: string;
  userId: string;
  handle: string;
  role: string;
  canPublish: boolean;
}): Promise<string> {
  const token = new AccessToken(args.config.apiKey, args.config.apiSecret, {
    // Identity is the user id so webhook events map straight onto Participant
    // rows; the handle rides along as the display name.
    identity: args.userId,
    name: args.handle,
    metadata: JSON.stringify({ handle: args.handle, role: args.role }),
    ttl: TOKEN_TTL_SECONDS,
  });

  token.addGrant({
    room: mediaRoomName(args.roomCode),
    roomJoin: true,
    canPublish: args.canPublish,
    canSubscribe: true,
    // Nothing in the app sends data messages over LiveKit — Supabase carries
    // those — so there is no reason to hand out the permission.
    canPublishData: false,
  });

  return token.toJwt();
}

export function getWebhookReceiver(): WebhookReceiver | null {
  const config = getLiveKitConfig();
  if (!config) return null;
  return new WebhookReceiver(config.apiKey, config.apiSecret);
}
