"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export const DEFAULT_AVATAR = "https://codeforces.org/s/0/images/user-alt.png";

const SIZES = {
  xs: "size-7",
  sm: "size-9",
  md: "size-11",
  lg: "size-14 sm:size-16",
  xl: "size-20 sm:size-24",
} as const;

export function Avatar({
  src,
  alt,
  size = "md",
  ring,
  className,
}: {
  src?: string | null;
  alt?: string;
  size?: keyof typeof SIZES;
  /** Draws a coloured ring — used to mark the winner / current user. */
  ring?: "none" | "brand" | "warning";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed || !src ? DEFAULT_AVATAR : src}
      alt={alt ?? "avatar"}
      onError={() => setFailed(true)}
      loading="lazy"
      className={cn(
        "shrink-0 rounded-full bg-elevated object-cover",
        SIZES[size],
        ring === "brand" && "ring-2 ring-brand ring-offset-2 ring-offset-canvas",
        ring === "warning" &&
          "ring-2 ring-warning ring-offset-2 ring-offset-canvas",
        className,
      )}
    />
  );
}
