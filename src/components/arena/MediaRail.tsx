"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { Alert, Button, SectionTitle } from "@/components/ui";
import type { MediaTile, UseMediaResult } from "./useMedia";

/**
 * The video strip in a proctored duel.
 *
 * Tiles are hand-rolled rather than pulled from a component library so they
 * sit inside the arena grid on the app's own tokens — the rail lives beside
 * the scoreboard, not in a call window bolted onto the page.
 */
export function MediaRail({
  media,
  requireVideo,
  requireAudio,
}: {
  media: UseMediaResult;
  requireVideo: boolean;
  requireAudio: boolean;
}) {
  if (!media.enabled) return null;

  return (
    <section className="panel flex flex-col gap-4 rounded-lg p-5 sm:p-6">
      <SectionTitle
        icon={<Video className="size-3.5" />}
        action={
          media.configured && !media.connected ? (
            <span className="flex items-center gap-1.5 text-[0.68rem] font-bold tracking-wide text-warning uppercase">
              <WifiOff className="size-3" />
              Reconnecting
            </span>
          ) : null
        }
      >
        {requireVideo && requireAudio
          ? "Camera & mic"
          : requireVideo
            ? "Camera"
            : "Microphone"}
      </SectionTitle>

      {media.error && (
        <Alert tone="danger">
          <span className="flex flex-col gap-2">
            <span>{media.error}</span>
            <Button size="sm" variant="outline" onClick={media.retry}>
              Try again
            </Button>
          </span>
        </Alert>
      )}

      {!media.configured && !media.error && (
        <p className="text-xs leading-relaxed text-ink-faint">
          Live video isn&apos;t set up on this server, so you can only see
          yourself. Your devices are still checked and the requirement still
          applies.
        </p>
      )}

      <div
        className={cn(
          "grid gap-3",
          media.tiles.length > 1 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {media.tiles.map((tile) => (
          <Tile
            key={tile.userId}
            tile={tile}
            localVideoRef={tile.isLocal ? media.localVideoRef : undefined}
            requireVideo={requireVideo}
            requireAudio={requireAudio}
          />
        ))}
      </div>

      {media.tiles.length === 0 && (
        <p className="text-xs text-ink-faint">Waiting for devices…</p>
      )}
    </section>
  );
}

function Tile({
  tile,
  localVideoRef,
  requireVideo,
  requireAudio,
}: {
  tile: MediaTile;
  localVideoRef?: (el: HTMLVideoElement | null) => void;
  requireVideo: boolean;
  requireAudio: boolean;
}) {
  const remoteRef = useRef<HTMLVideoElement | null>(null);

  // Remote tracks are attached imperatively by livekit-client rather than via
  // a src attribute, so the element has to be handed over after it mounts.
  useEffect(() => {
    if (tile.isLocal || !tile.attach) return;
    tile.attach(remoteRef.current);
    return () => tile.attach?.(null);
  }, [tile]);

  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden rounded-md border bg-black/40",
        tile.compliant ? "border-white/8" : "border-danger/60",
      )}
    >
      {requireVideo ? (
        <video
          ref={tile.isLocal ? localVideoRef : remoteRef}
          muted={tile.isLocal}
          playsInline
          autoPlay
          className={cn(
            "size-full object-cover",
            // Only your own view is mirrored; mirroring the opponent would
            // flip anything they hold up to the lens.
            tile.isLocal && "-scale-x-100",
            !tile.videoOn && "opacity-0",
          )}
        />
      ) : null}

      {(!tile.videoOn || !requireVideo) && (
        <div className="absolute inset-0 flex items-center justify-center">
          {requireVideo ? (
            <VideoOff className="size-6 text-ink-faint" />
          ) : (
            <Mic
              className={cn(
                "size-6",
                tile.audioOn ? "text-success" : "text-ink-faint",
              )}
            />
          )}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-2">
        <span className="truncate text-[0.72rem] font-bold text-white">
          {tile.isLocal ? "You" : tile.handle}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {requireVideo && (
            <StatusDot on={tile.videoOn} on_={Video} off={VideoOff} />
          )}
          {requireAudio && <StatusDot on={tile.audioOn} on_={Mic} off={MicOff} />}
        </span>
      </div>
    </div>
  );
}

function StatusDot({
  on,
  on_: OnIcon,
  off: OffIcon,
}: {
  on: boolean;
  on_: React.ElementType;
  off: React.ElementType;
}) {
  const Icon = on ? OnIcon : OffIcon;
  return (
    <Icon className={cn("size-3.5", on ? "text-white/80" : "text-danger")} />
  );
}
