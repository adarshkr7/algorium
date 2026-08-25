"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type Room as LiveKitRoom,
  type LocalTrackPublication,
  type Participant as LKParticipant,
  type TrackPublication,
} from "livekit-client";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/utils/supabase/client";
import type { MediaSnapshot } from "@/lib/services/broadcast";

/**
 * The live camera/microphone side of a proctored duel.
 *
 * Three things are going on at once and they are deliberately kept separate:
 *
 *   1. **The call.** LiveKit carries the actual video. If it is not configured
 *      the hook still runs in local-only mode — you see yourself, your
 *      opponent sees themselves, and everything below still works. That
 *      matters because the requirement is enforced from the database, not from
 *      whether a media vendor happens to be set up.
 *
 *   2. **Reporting.** Whatever this browser is publishing gets POSTed to the
 *      server, which is what the enforcement sweep reads when LiveKit cannot
 *      be reached.
 *
 *   3. **The grace countdown.** Local, visible, and honest about being a
 *      courtesy — the server enforces the same rule independently, so closing
 *      the tab to kill this timer does not help.
 */

export interface MediaTile {
  userId: string;
  handle: string;
  isLocal: boolean;
  videoOn: boolean;
  audioOn: boolean;
  compliant: boolean;
  /** Attach the remote video track to a DOM element. Null in local-only mode. */
  attach: ((el: HTMLVideoElement | null) => void) | null;
}

export interface MediaViolationNotice {
  handle: string;
  missing: string[];
  action: "WARN" | "FORFEIT";
  isMe: boolean;
}

interface TokenResponse {
  configured: boolean;
  token: string | null;
  url: string | null;
}

export interface UseMediaResult {
  /** The host required nothing — the caller should render no media at all. */
  enabled: boolean;
  /** LiveKit is reachable and connected; false means local-only fallback. */
  connected: boolean;
  configured: boolean;
  tiles: MediaTile[];
  localVideoRef: (el: HTMLVideoElement | null) => void;
  myVideoOn: boolean;
  myAudioOn: boolean;
  /** I am a contestant and one of my required devices is off. */
  inViolation: boolean;
  /** Seconds left before the violation is escalated. Null when compliant. */
  graceRemaining: number | null;
  lastViolation: MediaViolationNotice | null;
  dismissViolation: () => void;
  error: string | null;
  retry: () => void;
}

const DISABLED: UseMediaResult = {
  enabled: false,
  connected: false,
  configured: false,
  tiles: [],
  localVideoRef: () => {},
  myVideoOn: false,
  myAudioOn: false,
  inViolation: false,
  graceRemaining: null,
  lastViolation: null,
  dismissViolation: () => {},
  error: null,
  retry: () => {},
};

export function useMedia(args: {
  code: string;
  contestId: string | null;
  requireVideo: boolean;
  requireAudio: boolean;
  graceSeconds: number;
  userId: string | null;
  isContestant: boolean;
  isFinished: boolean;
}): UseMediaResult {
  const {
    code,
    requireVideo,
    requireAudio,
    graceSeconds,
    userId,
    isContestant,
    isFinished,
  } = args;

  const enabled = requireVideo || requireAudio;

  const [supabase] = useState(() => createClient());
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [myVideoOn, setMyVideoOn] = useState(false);
  const [myAudioOn, setMyAudioOn] = useState(false);
  const [remotes, setRemotes] = useState<MediaTile[]>([]);
  const [roster, setRoster] = useState<Record<string, MediaSnapshot>>({});
  const [lastViolation, setLastViolation] =
    useState<MediaViolationNotice | null>(null);
  const [graceRemaining, setGraceRemaining] = useState<number | null>(null);

  const roomRef = useRef<LiveKitRoom | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoElRef = useRef<HTMLVideoElement | null>(null);
  const reportedRef = useRef<string | null>(null);
  const violationStartedRef = useRef<number | null>(null);
  const escalatedRef = useRef(false);

  const localVideoRef = useCallback((el: HTMLVideoElement | null) => {
    localVideoElRef.current = el;
    if (el && localStreamRef.current) {
      el.srcObject = localStreamRef.current;
      void el.play().catch(() => {});
    }
  }, []);

  // ── Publish my own state to the server ───────────────────────────────────
  useEffect(() => {
    if (!enabled || !userId || isFinished) return;

    const fingerprint = `${myVideoOn}:${myAudioOn}`;
    if (reportedRef.current === fingerprint) return;
    reportedRef.current = fingerprint;

    void apiFetch(`/api/rooms/${code}/media/state`, {
      method: "POST",
      body: { videoOn: myVideoOn, audioOn: myAudioOn },
    }).catch(() => {
      reportedRef.current = null;
    });
  }, [enabled, userId, code, myVideoOn, myAudioOn, isFinished]);

  // ── Connect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !userId || isFinished) return;

    let cancelled = false;
    let room: LiveKitRoom | null = null;

    const syncLocalStream = (stream: MediaStream) => {
      localStreamRef.current = stream;
      if (localVideoElRef.current) {
        localVideoElRef.current.srcObject = stream;
        void localVideoElRef.current.play().catch(() => {});
      }
      const isLive = (t: MediaStreamTrack) =>
        t.readyState === "live" && t.enabled && !t.muted;
      const update = () => {
        if (cancelled) return;
        setMyVideoOn(stream.getVideoTracks().some(isLive));
        setMyAudioOn(stream.getAudioTracks().some(isLive));
      };
      for (const t of stream.getTracks()) {
        t.addEventListener("mute", update);
        t.addEventListener("unmute", update);
        t.addEventListener("ended", update);
      }
      update();
    };

    /** No LiveKit: hold the devices locally so the rule is still enforceable. */
    const localOnly = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: requireVideo,
          audio: requireAudio,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        syncLocalStream(stream);
      } catch {
        if (!cancelled) {
          setError(
            "Your camera or microphone is unavailable. The host requires it for this duel.",
          );
        }
      }
    };

    const connect = async () => {
      let credentials: TokenResponse;
      try {
        credentials = await apiFetch<TokenResponse>(
          `/api/rooms/${code}/media/token`,
          { method: "POST", body: {} },
        );
      } catch {
        await localOnly();
        return;
      }
      if (cancelled) return;

      if (!credentials.configured || !credentials.token || !credentials.url) {
        setConfigured(false);
        await localOnly();
        return;
      }
      setConfigured(true);

      // Imported lazily: livekit-client pulls in a large WebRTC bundle, and a
      // duel without a camera requirement should never pay for it.
      const { Room } = await import("livekit-client");
      if (cancelled) return;

      room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      const refreshRemotes = () => {
        if (!room || cancelled) return;
        const tiles: MediaTile[] = [];
        room.remoteParticipants.forEach((p: RemoteParticipant) => {
          tiles.push({
            userId: p.identity,
            handle: p.name || p.identity,
            isLocal: false,
            videoOn: isPublishing(p, Track.Source.Camera),
            audioOn: isPublishing(p, Track.Source.Microphone),
            compliant: true,
            attach: (el) => {
              const pub = p.getTrackPublication(Track.Source.Camera);
              if (el && pub?.track) pub.track.attach(el);
            },
          });
        });
        setRemotes(tiles);
      };

      const refreshLocal = () => {
        if (!room || cancelled) return;
        setMyVideoOn(isPublishing(room.localParticipant, Track.Source.Camera));
        setMyAudioOn(
          isPublishing(room.localParticipant, Track.Source.Microphone),
        );
        const pub = room.localParticipant.getTrackPublication(
          Track.Source.Camera,
        ) as LocalTrackPublication | undefined;
        if (pub?.track && localVideoElRef.current) {
          pub.track.attach(localVideoElRef.current);
        }
      };

      room
        .on(RoomEvent.ParticipantConnected, refreshRemotes)
        .on(RoomEvent.ParticipantDisconnected, refreshRemotes)
        .on(RoomEvent.TrackSubscribed, refreshRemotes)
        .on(RoomEvent.TrackUnsubscribed, refreshRemotes)
        .on(RoomEvent.TrackMuted, () => {
          refreshRemotes();
          refreshLocal();
        })
        .on(RoomEvent.TrackUnmuted, () => {
          refreshRemotes();
          refreshLocal();
        })
        .on(RoomEvent.LocalTrackPublished, refreshLocal)
        .on(RoomEvent.LocalTrackUnpublished, refreshLocal)
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (cancelled) return;
          setConnected(state === ConnectionState.Connected);
        });

      try {
        await room.connect(credentials.url, credentials.token);
        if (cancelled) return;

        if (requireVideo) await room.localParticipant.setCameraEnabled(true);
        if (requireAudio) await room.localParticipant.setMicrophoneEnabled(true);

        refreshLocal();
        refreshRemotes();
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "Your browser is blocking the camera or microphone. This duel requires it."
            : "Couldn't join the video call. Your devices are still being checked locally.",
        );
        // Fall back so the requirement remains enforceable even with no call.
        await localOnly();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      void roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [enabled, userId, code, requireVideo, requireAudio, isFinished, attempt]);

  // ── Roster + violation announcements over the room channel ───────────────
  useEffect(() => {
    if (!enabled || !userId) return;

    const channel = supabase.channel(`room-${code}-media`);

    channel
      .on("broadcast", { event: "media-state" }, (message) => {
        const payload = message.payload as { participants?: MediaSnapshot[] };
        const next: Record<string, MediaSnapshot> = {};
        for (const p of payload.participants ?? []) next[p.userId] = p;
        setRoster(next);
      })
      .on("broadcast", { event: "media-violation" }, (message) => {
        const payload = message.payload as {
          userId: string;
          handle: string;
          missing: string[];
          action: "WARN" | "FORFEIT";
        };
        setLastViolation({
          handle: payload.handle,
          missing: payload.missing,
          action: payload.action,
          isMe: payload.userId === userId,
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, code, supabase]);

  // ── Grace countdown ──────────────────────────────────────────────────────
  const inViolation =
    enabled &&
    isContestant &&
    !isFinished &&
    ((requireVideo && !myVideoOn) || (requireAudio && !myAudioOn));

  useEffect(() => {
    if (!inViolation) {
      violationStartedRef.current = null;
      escalatedRef.current = false;
      // No setState here: `graceRemaining` is masked to null on the way out
      // instead, so leaving a violation costs one render rather than two.
      return;
    }

    violationStartedRef.current ??= Date.now();

    const tick = () => {
      const started = violationStartedRef.current;
      if (started === null) return;
      const elapsed = (Date.now() - started) / 1000;
      const left = Math.max(0, Math.ceil(graceSeconds - elapsed));
      setGraceRemaining(left);

      if (left === 0 && !escalatedRef.current) {
        escalatedRef.current = true;
        // Asks the server to re-check the room now rather than waiting for the
        // worker's next tick. The server decides what actually happens.
        void apiFetch(`/api/rooms/${code}/media/violation`, {
          method: "POST",
          body: {},
        }).catch(() => {});
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [inViolation, graceSeconds, code]);

  // ── Assemble the tiles ───────────────────────────────────────────────────
  const tiles = useMemo<MediaTile[]>(() => {
    if (!enabled || !userId) return [];

    const mine = roster[userId];
    const local: MediaTile = {
      userId,
      handle: mine?.handle ?? "You",
      isLocal: true,
      videoOn: myVideoOn,
      audioOn: myAudioOn,
      compliant: !inViolation,
      attach: null,
    };

    // The server's roster is authoritative for compliance; LiveKit is
    // authoritative for whether a track is actually flowing right now.
    const merged = remotes.map((tile) => {
      const snapshot = roster[tile.userId];
      return snapshot
        ? {
            ...tile,
            handle: snapshot.handle || tile.handle,
            compliant: snapshot.compliant,
          }
        : tile;
    });

    // In local-only mode there are no remote tracks, but the roster still
    // knows who else is in the contest and whether they are compliant.
    if (merged.length === 0) {
      for (const snapshot of Object.values(roster)) {
        if (snapshot.userId === userId) continue;
        if (snapshot.role === "SUPERVISOR") continue;
        merged.push({
          userId: snapshot.userId,
          handle: snapshot.handle,
          isLocal: false,
          videoOn: snapshot.videoOn,
          audioOn: snapshot.audioOn,
          compliant: snapshot.compliant,
          attach: null,
        });
      }
    }

    return isContestant ? [local, ...merged] : merged;
  }, [enabled, userId, roster, remotes, myVideoOn, myAudioOn, inViolation, isContestant]);

  const dismissViolation = useCallback(() => setLastViolation(null), []);
  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  if (!enabled) return DISABLED;

  return {
    enabled,
    connected,
    configured,
    tiles,
    localVideoRef,
    myVideoOn,
    myAudioOn,
    inViolation,
    graceRemaining: inViolation ? graceRemaining : null,
    lastViolation,
    dismissViolation,
    error,
    retry,
  };
}

function isPublishing(participant: LKParticipant, source: Track.Source): boolean {
  const pub: TrackPublication | undefined =
    participant.getTrackPublication(source);
  return Boolean(pub && pub.isSubscribed !== false && !pub.isMuted);
}
