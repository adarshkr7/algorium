"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { Alert, Button, SectionTitle } from "@/components/ui";

export interface MediaCheckState {
  videoOn: boolean;
  audioOn: boolean;
  /** Every device the host asked for is live. */
  ready: boolean;
}

type Status = "idle" | "requesting" | "live" | "denied" | "missing" | "error";

/**
 * The pre-contest device check for a room whose host requires a camera or a
 * microphone.
 *
 * Permission is asked for behind an explicit button rather than on mount:
 * Safari only honours `getUserMedia` inside a user gesture, so auto-requesting
 * there fails in a way that is indistinguishable from the user saying no.
 *
 * It fails closed and loudly. A room that requires a camera and cannot get one
 * must say so plainly — the previous shape of this problem is a lobby that
 * spins forever while both players wonder whose turn it is to click start.
 */
export function MediaCheck({
  requireVideo,
  requireAudio,
  onChange,
  disabled,
}: {
  requireVideo: boolean;
  requireAudio: boolean;
  onChange: (state: MediaCheckState) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [videoOn, setVideoOn] = useState(false);
  const [audioOn, setAudioOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Read inside track listeners without re-binding them on every change.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const ready =
    (!requireVideo || videoOn) && (!requireAudio || audioOn) && status === "live";

  useEffect(() => {
    onChangeRef.current({ videoOn, audioOn, ready });
  }, [videoOn, audioOn, ready]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setVideoOn(false);
    setAudioOn(false);
  }, []);

  // Releasing the camera on unmount matters — otherwise the indicator light
  // stays on after the player navigates into the arena.
  useEffect(() => stop, [stop]);

  const request = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setStatus("error");
      return;
    }

    setStatus("requesting");
    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: requireVideo,
        audio: requireAudio,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Autoplay is only permitted while muted; this is a self-preview so
        // there is nothing to listen to anyway, and unmuting would echo.
        void videoRef.current.play().catch(() => {});
      }

      const sync = () => {
        const v = stream.getVideoTracks();
        const a = stream.getAudioTracks();
        const isLive = (t: MediaStreamTrack) =>
          t.readyState === "live" && t.enabled && !t.muted;
        setVideoOn(v.length > 0 && v.some(isLive));
        setAudioOn(a.length > 0 && a.some(isLive));
      };

      // A lid closing, a hardware mute switch or the OS revoking access all
      // surface here rather than through any React event.
      for (const track of stream.getTracks()) {
        track.addEventListener("mute", sync);
        track.addEventListener("unmute", sync);
        track.addEventListener("ended", sync);
      }

      sync();
      setStatus("live");
    } catch (err) {
      stop();
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus("missing");
      } else {
        setStatus("error");
      }
    }
  }, [requireVideo, requireAudio, stop]);

  const needed = [requireVideo && "camera", requireAudio && "microphone"]
    .filter(Boolean)
    .join(" and ");

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle icon={<Video className="size-3.5" />}>
        Device check
      </SectionTitle>

      <p className="text-xs leading-relaxed text-ink-faint">
        The host requires your {needed} for this duel. It stays visible to your
        opponent until the contest ends. Nothing is recorded.
      </p>

      {requireVideo && (
        <div className="relative aspect-video w-full overflow-hidden rounded-md border border-white/8 bg-black/40">
          <video
            ref={videoRef}
            muted
            playsInline
            className={cn(
              "size-full object-cover",
              // Mirrored, because an un-mirrored self-view reads as broken.
              "-scale-x-100",
              !videoOn && "opacity-0",
            )}
          />
          {!videoOn && (
            <div className="absolute inset-0 flex items-center justify-center">
              <VideoOff className="size-7 text-ink-faint" />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {requireVideo && (
          <DeviceChip on={videoOn} onIcon={Video} offIcon={VideoOff} label="Camera" />
        )}
        {requireAudio && (
          <DeviceChip on={audioOn} onIcon={Mic} offIcon={MicOff} label="Mic" />
        )}
      </div>

      {status === "denied" && (
        <Alert tone="danger">
          Your browser is blocking access. Allow the {needed} for this site in
          the address-bar permissions, then try again — the host can&apos;t
          start until it&apos;s on.
        </Alert>
      )}
      {status === "missing" && (
        <Alert tone="danger">
          No {needed} was found. Plug one in or pick another device, then try
          again.
        </Alert>
      )}
      {status === "error" && (
        <Alert tone="danger">
          Couldn&apos;t reach your {needed}. This needs a secure connection
          (https) and a browser that supports media capture.
        </Alert>
      )}

      <Button
        type="button"
        variant={ready ? "ghost" : "primary"}
        onClick={request}
        disabled={disabled}
        loading={status === "requesting"}
        loadingText="Asking…"
        icon={<Video className="size-4" />}
      >
        {ready ? "Restart devices" : status === "idle" ? `Enable ${needed}` : "Try again"}
      </Button>
    </div>
  );
}

function DeviceChip({
  on,
  onIcon: OnIcon,
  offIcon: OffIcon,
  label,
}: {
  on: boolean;
  onIcon: React.ElementType;
  offIcon: React.ElementType;
  label: string;
}) {
  const Icon = on ? OnIcon : OffIcon;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] font-bold tracking-wide uppercase",
        on
          ? "border-success/30 bg-success/8 text-success"
          : "border-danger/30 bg-danger/8 text-danger",
      )}
    >
      <Icon className="size-3.5" />
      {label} {on ? "on" : "off"}
    </span>
  );
}
