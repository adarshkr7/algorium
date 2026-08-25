"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Eye,
  LogOut,
  Mic,
  MicOff,
  Play,
  Share2,
  Swords,
  UserRound,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { createClient } from "@/utils/supabase/client";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataPoint,
  ErrorScreen,
  LoadingScreen,
  useToast,
} from "@/components/ui";
import { MediaCheck, type MediaCheckState } from "@/components/room/MediaCheck";

interface RoomPlayer {
  id: string;
  handle: string;
  avatar: string;
  rating: number;
  elo: number;
}

interface RoomState {
  id: string;
  code: string;
  status: string;
  hostId: string;
  hostingType: string;
  isPublic: boolean;
  gameNumber: number;
  host: RoomPlayer;
  guest: RoomPlayer | null;
  player1: RoomPlayer | null;
  player2: RoomPlayer | null;
  series: {
    id: string;
    bestOf: number;
    player1Id: string;
    player2Id: string | null;
    player1Wins: number;
    player2Wins: number;
  } | null;
  contest: {
    id: string;
    name: string;
    mode: string;
    pointingSystem: string;
    problemCount: number;
    durationMinutes: number;
    minRating: number;
    maxRating: number;
    isSolo: boolean;
    requireVideo: boolean;
    requireAudio: boolean;
    mediaGraceSeconds: number;
    mediaViolationAction: string;
  } | null;
}

/** What each participant's presence entry carries. */
interface RoomPresence {
  userId: string;
  handle: string;
  videoOn: boolean;
  audioOn: boolean;
  mediaReady: boolean;
}

const POLL_MS = 5_000;

export default function RoomLobbyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();

  const { user, loading: sessionLoading } = useUser();
  const router = useRouter();
  const toast = useToast();
  const [supabase] = useState(() => createClient());

  const [room, setRoom] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [presence, setPresence] = useState<Record<string, RoomPresence>>({});
  const [myMedia, setMyMedia] = useState<MediaCheckState>({
    videoOn: false,
    audioOn: false,
    ready: false,
  });

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const joinAttempted = useRef(false);
  /** Last state pushed to the server, so device flapping isn't chatty. */
  const reportedMedia = useRef<string | null>(null);
  const myMediaRef = useRef(myMedia);
  useEffect(() => {
    myMediaRef.current = myMedia;
  }, [myMedia]);

  // ── Load + auto-join ─────────────────────────────────────────────────────
  const loadRoom = useCallback(async () => {
    try {
      const data = await apiFetch<{ room: RoomState }>(`/api/rooms/${code}`, {
        cache: "no-store",
      });
      let current = data.room;

      if (current.status === "IN_PROGRESS" || current.status === "FINISHED") {
        router.replace(`/arena/${code}`);
        return;
      }
      if (current.status === "CANCELLED") {
        setError("This room was cancelled by the host.");
        setLoading(false);
        return;
      }

      // Auto-join anyone who isn't already seated.
      const seated =
        !user ||
        current.hostId === user.id ||
        current.guest?.id === user.id ||
        current.player1?.id === user.id ||
        current.player2?.id === user.id;

      if (user && !seated && !joinAttempted.current && !current.contest?.isSolo) {
        joinAttempted.current = true;
        try {
          const joined = await apiFetch<{ room: RoomState }>(
            `/api/rooms/${code}/join`,
            { method: "POST", body: {} },
          );
          current = joined.room;
        } catch (err) {
          setError(errorMessage(err, "Couldn't join this room."));
          setLoading(false);
          return;
        }
      }

      setRoom(current);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load this room."));
    } finally {
      setLoading(false);
    }
  }, [code, router, user]);

  useEffect(() => {
    if (sessionLoading) return;
    void loadRoom();
    const id = setInterval(() => void loadRoom(), POLL_MS);
    return () => clearInterval(id);
  }, [loadRoom, sessionLoading]);

  // ── Realtime: presence + lifecycle events ────────────────────────────────
  useEffect(() => {
    if (sessionLoading) return;

    const channel = supabase.channel(`room-${code}`, {
      config: {
        presence: { key: user?.id ?? `guest-${Math.random().toString(36).slice(2)}` },
      },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Partial<RoomPresence>>();
        const next: Record<string, RoomPresence> = {};
        for (const entry of Object.values(state).flat()) {
          if (!entry.userId) continue;
          next[entry.userId] = {
            userId: entry.userId,
            handle: entry.handle ?? "",
            videoOn: entry.videoOn ?? false,
            audioOn: entry.audioOn ?? false,
            mediaReady: entry.mediaReady ?? false,
          };
        }
        setPresence(next);
      })
      .on("broadcast", { event: "contest-started" }, () => {
        router.replace(`/arena/${code}`);
      })
      .on("broadcast", { event: "player-joined" }, () => {
        void loadRoom();
      })
      .on("broadcast", { event: "room-cancelled" }, (payload) => {
        const by = (payload.payload as { by?: string })?.by ?? "The host";
        toast.push(`${by} closed this room.`, "warning");
        setTimeout(() => router.replace("/"), 1500);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && user) {
          await channel.track({
            userId: user.id,
            handle: user.handle,
            ...myMediaRef.current,
            mediaReady: myMediaRef.current.ready,
          });
        }
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [code, supabase, user, router, loadRoom, sessionLoading, toast]);

  // ── Publish device state ─────────────────────────────────────────────────
  // Presence is what the other player's lobby renders; the POST is what the
  // server's start guard reads. Both are needed — presence is instant but
  // client-only, the database row is authoritative but polled.
  const mediaEnforced = Boolean(
    room?.contest?.requireVideo || room?.contest?.requireAudio,
  );

  useEffect(() => {
    if (!user || !mediaEnforced) return;

    void channelRef.current?.track({
      userId: user.id,
      handle: user.handle,
      videoOn: myMedia.videoOn,
      audioOn: myMedia.audioOn,
      mediaReady: myMedia.ready,
    });

    const fingerprint = `${myMedia.videoOn}:${myMedia.audioOn}`;
    if (reportedMedia.current === fingerprint) return;
    reportedMedia.current = fingerprint;

    void apiFetch(`/api/rooms/${code}/media/state`, {
      method: "POST",
      body: { videoOn: myMedia.videoOn, audioOn: myMedia.audioOn },
    })
      .then(() => void loadRoom())
      .catch(() => {
        // Let the next change retry rather than wedging on a transient failure.
        reportedMedia.current = null;
      });
  }, [myMedia, user, code, mediaEnforced, loadRoom]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const copy = async (kind: "code" | "link") => {
    const value =
      kind === "code" ? code : `${window.location.origin}/room/${code}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.push("Couldn't copy — you may need to do it manually.", "warning");
    }
  };

  const startContest = async () => {
    if (!room || starting) return;
    setStarting(true);
    try {
      await apiFetch(`/api/rooms/${code}/start`, { method: "POST", body: {} });
      router.replace(`/arena/${code}`);
    } catch (err) {
      toast.push(errorMessage(err, "Couldn't start the contest."), "danger");
      setStarting(false);
    }
  };

  const leaveRoom = async () => {
    setLeaving(true);
    try {
      await apiFetch(`/api/rooms/${code}/leave`, { method: "POST", body: {} });
    } catch {
      /* leaving should never block navigation */
    } finally {
      router.replace("/");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (sessionLoading || loading) {
    return (
      <LoadingScreen
        icon={<Swords className="size-6" />}
        message={`Connecting to room ${code}…`}
      />
    );
  }

  if (error || !room?.contest) {
    return (
      <ErrorScreen
        title={error ?? "Room not found"}
        message="Double-check the 6-character code, or head back and host your own duel."
      />
    );
  }

  const { contest } = room;
  const isSupervised = room.hostingType === "SUPERVISED";
  const isSolo = contest.isSolo;
  const isHost = user?.id === room.hostId;

  const player1 = isSupervised ? room.player1 : room.host;
  const player2 = isSupervised ? room.player2 : room.guest;

  const series = room.series;

  // ── Camera / microphone gate ─────────────────────────────────────────────
  const requireVideo = contest.requireVideo;
  const requireAudio = contest.requireAudio;
  const needed = [requireVideo && "camera", requireAudio && "microphone"]
    .filter(Boolean)
    .join(" and ");

  // Contestants only. A supervisor watches, so their own devices are theirs.
  const isContestant = Boolean(
    user && (user.id === player1?.id || user.id === player2?.id),
  );

  const mediaOkFor = (p: RoomPlayer | null) => {
    if (!mediaEnforced || !p) return true;
    const state = presence[p.id];
    if (!state) return false;
    return (!requireVideo || state.videoOn) && (!requireAudio || state.audioOn);
  };

  const bothSeated = isSolo || Boolean(player1 && player2);
  const mediaGateOpen =
    !mediaEnforced || (mediaOkFor(player1) && mediaOkFor(player2));

  const canStart = isHost && bothSeated && mediaGateOpen;

  const waitingOn = !bothSeated
    ? isSupervised
      ? "Waiting for two players…"
      : "Waiting for an opponent…"
    : `Waiting for ${needed} to come on…`;

  const startLabel = starting
    ? "Starting…"
    : canStart
      ? isSolo
        ? "Start practice"
        : "Start contest"
      : waitingOn;

  return (
    <div className="flex flex-col gap-7">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-5 border-b border-white/6 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-eyebrow mb-2.5 text-ink-faint">
            {isSolo
              ? "Solo practice"
              : isSupervised
                ? "Supervised match"
                : "1v1 duel"}{" "}
            · {contest.name}
          </p>
          <h1 className="text-display leading-none text-ink">
            Room
            <br />
            <span className="text-brand">{code}</span>
          </h1>
          {series && series.bestOf > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone="warning">Best of {series.bestOf}</Badge>
              <Badge tone="neutral">Game {room.gameNumber}</Badge>
              <Badge tone="neutral">
                Series {series.player1Wins}–{series.player2Wins}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => copy("code")}
            icon={
              copied === "code" ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )
            }
          >
            {copied === "code" ? "Copied" : "Copy code"}
          </Button>
          <Button
            variant="outline"
            onClick={() => copy("link")}
            icon={
              copied === "link" ? (
                <Check className="size-4" />
              ) : (
                <Share2 className="size-4" />
              )
            }
          >
            {copied === "link" ? "Copied" : "Share link"}
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirmLeave(true)}
            icon={<LogOut className="size-4" />}
          >
            Leave
          </Button>
        </div>
      </header>

      {/* ── Configuration ─────────────────────────────────────────────────── */}
      <Card padding="sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          <DataPoint label="Mode" value={contest.mode} />
          <DataPoint label="Scoring" value={contest.pointingSystem} />
          <DataPoint label="Problems" value={contest.problemCount} />
          <DataPoint label="Duration" value={`${contest.durationMinutes} min`} />
          <DataPoint
            label="Rating"
            value={`${contest.minRating}–${contest.maxRating}`}
          />
          {mediaEnforced && (
            <DataPoint
              label="Required"
              value={
                requireVideo && requireAudio
                  ? "Cam + mic"
                  : requireVideo
                    ? "Camera"
                    : "Mic"
              }
            />
          )}
        </div>
      </Card>

      {room.isPublic && (
        <Alert tone="info">
          This room is listed in open duels — anyone can join it from the home
          page.
        </Alert>
      )}

      {mediaEnforced && (
        <Card>
          {isContestant ? (
            <MediaCheck
              requireVideo={requireVideo}
              requireAudio={requireAudio}
              onChange={setMyMedia}
            />
          ) : (
            <Alert tone="info">
              <span className="flex items-center gap-2">
                <Video className="size-4 shrink-0" />
                {isSupervised && isHost
                  ? `Both contestants must share their ${needed} before you can start. Yours stays off.`
                  : `Contestants in this room share their ${needed}.`}
              </span>
            </Alert>
          )}
        </Card>
      )}

      {/* ── Players ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col">
        {isSupervised && (
          <div className="mb-4 flex items-center gap-2.5 rounded-md border border-white/22 bg-white/6 px-4 py-3 text-[0.82rem] font-semibold text-ink">
            <Eye className="size-4 shrink-0" />
            <span>
              {room.host.handle} is supervising this match.
            </span>
          </div>
        )}

        <PlayerSlot
          player={player1}
          role={isSupervised ? "Player 1" : "Host"}
          online={player1 ? Boolean(presence[player1.id]) : false}
          isYou={player1?.id === user?.id}
          media={player1 ? presence[player1.id] : undefined}
          requireVideo={mediaEnforced && requireVideo}
          requireAudio={mediaEnforced && requireAudio}
        />
        {!isSolo && (
          <PlayerSlot
            player={player2}
            role={isSupervised ? "Player 2" : "Challenger"}
            online={player2 ? Boolean(presence[player2.id]) : false}
            isYou={player2?.id === user?.id}
            media={player2 ? presence[player2.id] : undefined}
            requireVideo={mediaEnforced && requireVideo}
            requireAudio={mediaEnforced && requireAudio}
          />
        )}
      </section>

      {/* ── Start ─────────────────────────────────────────────────────────── */}
      <div className="pb-safe sticky bottom-0 -mx-4 border-t border-white/8 bg-canvas/95 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        {isHost ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canStart}
            loading={starting}
            loadingText="Starting…"
            onClick={startContest}
            icon={canStart ? <Play className="size-4" /> : undefined}
          >
            {startLabel}
          </Button>
        ) : (
          <div className="panel flex items-center justify-center gap-2.5 rounded-full px-5 py-4 text-sm font-semibold text-ink-dim">
            <span className="size-2 animate-pulse rounded-full bg-warning" />
            Waiting for {room.host.handle} to start…
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave this room?"
        message={
          isHost
            ? "The room will be cancelled for everyone in it."
            : "You'll be removed from the room and the host will be notified."
        }
        confirmLabel="Leave room"
        loading={leaving}
        onConfirm={leaveRoom}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}

/* ── Player row ───────────────────────────────────────────────────────────── */

function PlayerSlot({
  player,
  role,
  online,
  isYou,
  media,
  requireVideo,
  requireAudio,
}: {
  player: RoomPlayer | null;
  role: string;
  online: boolean;
  isYou: boolean;
  media?: RoomPresence;
  requireVideo?: boolean;
  requireAudio?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-white/6 py-5 sm:gap-6 sm:py-6">
      {player ? (
        <>
          <Avatar src={player.avatar} alt={player.handle} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h3 className="truncate text-xl font-extrabold text-ink sm:text-2xl">
                {player.handle}
              </h3>
              <span
                title={online ? "Connected" : "Not in the room right now"}
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  online
                    ? "bg-success shadow-[0_0_10px_var(--color-success)]"
                    : "bg-ink-faint",
                )}
              />
              {isYou && <Badge tone="solid">You</Badge>}
              {requireVideo && (
                <MediaPip on={Boolean(media?.videoOn)} kind="video" />
              )}
              {requireAudio && (
                <MediaPip on={Boolean(media?.audioOn)} kind="audio" />
              )}
            </div>
            <p className="text-eyebrow mt-1.5 flex flex-wrap gap-x-3 text-ink-faint">
              <span>{role}</span>
              <span>·</span>
              <span>{player.elo} Elo</span>
              <span>·</span>
              <span>CF {player.rating || "unrated"}</span>
            </p>
          </div>
        </>
      ) : (
        <>
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/4 sm:size-16">
            <Users className="size-6 text-ink-faint" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-extrabold text-ink-faint sm:text-2xl">
              Waiting…
            </h3>
            <p className="text-eyebrow mt-1.5 flex flex-wrap gap-x-3 text-ink-faint">
              <span>{role}</span>
              <span>·</span>
              <span className="text-warning">Slot open</span>
            </p>
          </div>
          <UserRound className="size-5 shrink-0 animate-pulse text-ink-faint" />
        </>
      )}
    </div>
  );
}

/** A camera/mic status dot next to a player's handle in the lobby. */
function MediaPip({ on, kind }: { on: boolean; kind: "video" | "audio" }) {
  const Icon =
    kind === "video" ? (on ? Video : VideoOff) : on ? Mic : MicOff;
  const label = kind === "video" ? "Camera" : "Microphone";
  return (
    <span
      title={`${label} ${on ? "on" : "off"}`}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border",
        on
          ? "border-success/30 bg-success/10 text-success"
          : "border-danger/30 bg-danger/10 text-danger",
      )}
    >
      <Icon className="size-3.5" />
      <span className="sr-only">{`${label} ${on ? "on" : "off"}`}</span>
    </span>
  );
}
