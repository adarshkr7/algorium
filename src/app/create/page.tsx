"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dices, Globe, Sparkles, Swords } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  Alert,
  Button,
  Card,
  Chip,
  Field,
  Input,
  LoadingScreen,
  PageHeader,
  SegmentedControl,
  Switch,
  type SegmentOption,
} from "@/components/ui";

const POPULAR_TAGS = [
  "implementation", "math", "greedy", "dp", "data structures", "brute force",
  "constructive algorithms", "graphs", "sortings", "binary search",
  "dfs and similar", "trees", "strings", "number theory", "two pointers",
  "bitmasks", "combinatorics", "geometry",
];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];
const MIN_DURATION = 5;
const MAX_DURATION = 300;
const MAX_PROBLEMS = 8;

type Format = "PLAYER" | "SUPERVISED" | "SOLO";
type Mode = "LOCKOUT" | "BLITZ" | "CLASSIC";
type Scoring = "ICPC" | "POINTS";
type RatingMode = "RANGE" | "EXACT";
type TagMode = "ANY" | "ALL";

const FORMAT_OPTIONS: SegmentOption<Format>[] = [
  {
    value: "PLAYER",
    label: "Play",
    hint: "You compete directly against whoever joins your room.",
  },
  {
    value: "SUPERVISED",
    label: "Supervise",
    hint: "You host and watch; the first two people to join are the contestants.",
  },
  {
    value: "SOLO",
    label: "Practice",
    hint: "A solo timed run. No opponent, no rating change, no match history.",
  },
];

const MODE_OPTIONS: SegmentOption<Mode>[] = [
  { value: "LOCKOUT", label: "Lockout", hint: "Every problem is open. First accepted solution claims it." },
  { value: "BLITZ", label: "Blitz", hint: "Linear race — solving the current problem unlocks the next." },
  { value: "CLASSIC", label: "Classic", hint: "ICPC scoring: most solved wins, penalty time breaks ties." },
];

const SCORING_OPTIONS: SegmentOption<Scoring>[] = [
  { value: "ICPC", label: "ICPC", hint: "Count of solves, with +20 minutes penalty per wrong submission." },
  { value: "POINTS", label: "Points", hint: "Problems are worth 100, 200, 300… by position." },
];

const RATING_OPTIONS: SegmentOption<RatingMode>[] = [
  { value: "RANGE", label: "Rating range" },
  { value: "EXACT", label: "Per problem" },
];

const BEST_OF_OPTIONS: SegmentOption<string>[] = [
  { value: "1", label: "Single", hint: "One game decides it." },
  { value: "3", label: "Best of 3", hint: "First to 2 wins takes the series." },
  { value: "5", label: "Best of 5", hint: "First to 3 wins takes the series." },
];

function CreateDuelForm() {
  const { user, loading: sessionLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = ((): Mode => {
    const m = searchParams.get("mode");
    return m === "CLASSIC" || m === "BLITZ" || m === "LOCKOUT" ? m : "LOCKOUT";
  })();

  const [name, setName] = useState("Algorium Duel");
  const [format, setFormat] = useState<Format>(
    searchParams.get("solo") ? "SOLO" : "PLAYER",
  );
  const [mode, setMode] = useState<Mode>(initialMode);
  const [scoring, setScoring] = useState<Scoring>("ICPC");
  const [problemCount, setProblemCount] = useState(3);
  const [duration, setDuration] = useState(30);
  const [bestOf, setBestOf] = useState("1");
  const [ratingMode, setRatingMode] = useState<RatingMode>("RANGE");
  const [minRating, setMinRating] = useState(800);
  const [maxRating, setMaxRating] = useState(1600);
  const [exactRatings, setExactRatings] = useState<number[]>([800, 1000, 1200]);
  const [allowedTags, setAllowedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<TagMode>("ANY");
  const [isPublic, setIsPublic] = useState(false);
  const [seed, setSeed] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A practice run or a supervised room can't be part of a series.
  useEffect(() => {
    if (format !== "PLAYER" && bestOf !== "1") setBestOf("1");
    if (format === "SOLO" && isPublic) setIsPublic(false);
  }, [format, bestOf, isPublic]);

  // Keep the per-problem rating list the same length as the problem count.
  const setCount = (count: number) => {
    setProblemCount(count);
    setExactRatings((prev) => {
      const next = prev.slice(0, count);
      let last = next.at(-1) ?? 1200;
      while (next.length < count) {
        last = Math.min(3500, last + 200);
        next.push(last);
      }
      return next;
    });
  };

  const toggleTag = (tag: string) => {
    const isAllowed = allowedTags.includes(tag);
    const isExcluded = excludedTags.includes(tag);

    if (isAllowed) {
      // allowed → excluded
      setAllowedTags((t) => t.filter((x) => x !== tag));
      setExcludedTags((t) => [...t, tag]);
    } else if (isExcluded) {
      // excluded → off
      setExcludedTags((t) => t.filter((x) => x !== tag));
    } else {
      // off → allowed
      setAllowedTags((t) => [...t, tag]);
    }
  };

  const tagState = (tag: string) =>
    allowedTags.includes(tag)
      ? "include"
      : excludedTags.includes(tag)
        ? "exclude"
        : "off";

  const summary = useMemo(() => {
    const parts = [
      `${problemCount} problem${problemCount === 1 ? "" : "s"}`,
      `${duration} min`,
      ratingMode === "RANGE"
        ? `${minRating}–${maxRating}`
        : exactRatings.join(" / "),
    ];
    if (bestOf !== "1") parts.push(`best of ${bestOf}`);
    return parts.join(" · ");
  }, [problemCount, duration, ratingMode, minRating, maxRating, exactRatings, bestOf]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError("Sign in with your Codeforces handle before hosting a duel.");
      return;
    }
    if (ratingMode === "RANGE" && minRating > maxRating) {
      setError("Minimum rating can't be higher than the maximum.");
      return;
    }
    if (duration < MIN_DURATION || duration > MAX_DURATION) {
      setError(`Duration must be between ${MIN_DURATION} and ${MAX_DURATION} minutes.`);
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch<{ room: { code: string } }>(
        "/api/contests/create",
        {
          method: "POST",
          body: {
            name: name.trim(),
            mode,
            pointingSystem: scoring,
            hostingType: format === "SUPERVISED" ? "SUPERVISED" : "PLAYER_HOST",
            isSolo: format === "SOLO",
            isPublic,
            problemCount,
            durationMinutes: duration,
            minRating,
            maxRating,
            ratings: ratingMode === "EXACT" ? exactRatings : undefined,
            allowedTags,
            excludedTags,
            tagMatchMode: tagMode,
            bestOf: Number(bestOf),
            seed: seed.trim(),
          },
        },
      );
      router.push(`/room/${data.room.code}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the duel."));
      setSubmitting(false);
    }
  }

  if (sessionLoading) {
    return <LoadingScreen icon={<Swords className="size-6" />} message="Loading…" />;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <PageHeader
        eyebrow="New room"
        title="Create a duel"
        description={summary}
        actions={
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            loadingText="Generating…"
            className="hidden sm:inline-flex"
          >
            Create room
          </Button>
        }
      />

      {!user && (
        <Alert tone="warning">
          You need to sign in with your Codeforces handle before you can host.
        </Alert>
      )}
      {error && (
        <Alert tone="danger" shake>
          {error}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-x-10">
        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <Card>
            <Field label="Duel name" htmlFor="duel-name">
              <Input
                id="duel-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
          </Card>

          <Card className="flex flex-col gap-5">
            <Field label="Format">
              <SegmentedControl
                value={format}
                onChange={setFormat}
                options={FORMAT_OPTIONS}
                ariaLabel="Room format"
              />
            </Field>

            <Field label="Mode">
              <SegmentedControl
                value={mode}
                onChange={setMode}
                options={MODE_OPTIONS}
                ariaLabel="Contest mode"
              />
            </Field>

            <Field label="Scoring">
              <SegmentedControl
                value={scoring}
                onChange={setScoring}
                options={SCORING_OPTIONS}
                ariaLabel="Scoring system"
              />
            </Field>

            {format === "PLAYER" && (
              <Field label="Series">
                <SegmentedControl
                  value={bestOf}
                  onChange={setBestOf}
                  options={BEST_OF_OPTIONS}
                  ariaLabel="Series length"
                />
              </Field>
            )}
          </Card>

          <Card className="flex flex-col gap-5">
            <Switch
              id="public-room"
              checked={isPublic}
              onChange={setIsPublic}
              disabled={format === "SOLO"}
              label={
                <span className="flex items-center gap-2">
                  <Globe className="size-3.5 text-ink-faint" />
                  List in open duels
                </span>
              }
              description={
                format === "SOLO"
                  ? "Practice runs are always private."
                  : "Anyone can find and join this room from the home page. Leave off to share the code privately."
              }
            />
          </Card>
        </div>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-6">
            <Field label={`Problems — ${problemCount}`}>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: MAX_PROBLEMS }, (_, i) => i + 1).map(
                  (n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      className={cn(
                        "size-10 cursor-pointer rounded-full border font-mono text-sm font-bold transition-colors",
                        problemCount === n
                          ? "border-ink bg-ink text-ink-invert"
                          : "border-white/15 bg-transparent text-ink-dim hover:border-white/35 hover:text-ink",
                      )}
                    >
                      {n}
                    </button>
                  ),
                )}
              </div>
            </Field>

            <Field
              label={`Duration — ${duration} min`}
              hint={`Anything from ${MIN_DURATION} to ${MAX_DURATION} minutes.`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDuration(preset)}
                    className={cn(
                      "h-10 cursor-pointer rounded-full border px-4 font-mono text-sm font-bold transition-colors",
                      duration === preset
                        ? "border-ink bg-ink text-ink-invert"
                        : "border-white/15 bg-transparent text-ink-dim hover:border-white/35 hover:text-ink",
                    )}
                  >
                    {preset}m
                  </button>
                ))}
                <Input
                  type="number"
                  aria-label="Custom duration in minutes"
                  min={MIN_DURATION}
                  max={MAX_DURATION}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-10 w-24 text-center font-mono"
                />
              </div>
            </Field>
          </Card>

          <Card className="flex flex-col gap-5">
            <Field label="Difficulty">
              <SegmentedControl
                value={ratingMode}
                onChange={setRatingMode}
                options={RATING_OPTIONS}
                size="sm"
                ariaLabel="Rating selection mode"
              />
            </Field>

            {ratingMode === "RANGE" ? (
              <div className="flex items-end gap-3">
                <Field label="Min" htmlFor="min-rating" className="flex-1">
                  <Input
                    id="min-rating"
                    type="number"
                    step={100}
                    min={800}
                    max={3500}
                    value={minRating}
                    onChange={(e) => setMinRating(Number(e.target.value))}
                    className="text-center font-mono"
                  />
                </Field>
                <span className="pb-3 text-ink-faint">—</span>
                <Field label="Max" htmlFor="max-rating" className="flex-1">
                  <Input
                    id="max-rating"
                    type="number"
                    step={100}
                    min={800}
                    max={3500}
                    value={maxRating}
                    onChange={(e) => setMaxRating(Number(e.target.value))}
                    className="text-center font-mono"
                  />
                </Field>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {exactRatings.map((rating, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-6 shrink-0 font-mono text-xs font-bold text-ink-faint">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <input
                      type="range"
                      min={800}
                      max={3500}
                      step={100}
                      value={rating}
                      aria-label={`Rating for problem ${String.fromCharCode(65 + idx)}`}
                      onChange={(e) => {
                        const next = [...exactRatings];
                        next[idx] = Number(e.target.value);
                        setExactRatings(next);
                      }}
                      className="min-w-0 flex-1"
                    />
                    <span className="w-12 shrink-0 text-right font-mono text-sm font-bold text-ink">
                      {rating}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <Field
              label="Tags"
              hint="Tap once to require a tag, twice to exclude it, a third time to clear."
            >
              <div className="flex flex-wrap gap-2">
                {POPULAR_TAGS.map((tag) => (
                  <Chip
                    key={tag}
                    state={tagState(tag)}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Chip>
                ))}
              </div>
            </Field>

            {allowedTags.length > 1 && (
              <Field label="Tag matching">
                <SegmentedControl
                  value={tagMode}
                  onChange={setTagMode}
                  size="sm"
                  options={[
                    {
                      value: "ANY" as TagMode,
                      label: "Any tag",
                      hint: "Problems need at least one of the selected tags.",
                    },
                    {
                      value: "ALL" as TagMode,
                      label: "All tags",
                      hint: "Problems must carry every selected tag — much stricter.",
                    },
                  ]}
                />
              </Field>
            )}
          </Card>

          <Card>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent p-0 text-left"
            >
              <span className="text-eyebrow text-ink-faint">Advanced</span>
              <Sparkles className="size-4 text-ink-faint" />
            </button>

            {showAdvanced && (
              <div className="mt-4">
                <Field
                  label="Seed"
                  htmlFor="seed"
                  hint="Same seed and settings reproduce the same problem set. Leave blank for random."
                >
                  <div className="flex gap-2">
                    <Input
                      id="seed"
                      value={seed}
                      maxLength={64}
                      placeholder="random"
                      onChange={(e) => setSeed(e.target.value)}
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setSeed(Math.random().toString(36).slice(2, 10))
                      }
                      aria-label="Generate a random seed"
                    >
                      <Dices className="size-4" />
                    </Button>
                  </div>
                </Field>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Sticky submit on phones, where the header button is hidden. */}
      <div className="pb-safe sticky bottom-0 -mx-4 border-t border-white/8 bg-canvas/95 px-4 py-3 backdrop-blur-md sm:hidden">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          loadingText="Generating…"
        >
          Create room
        </Button>
      </div>
    </form>
  );
}

export default function CreateContestPage() {
  return (
    <Suspense
      fallback={
        <LoadingScreen
          icon={<Swords className="size-6" />}
          message="Loading the duel builder…"
        />
      }
    >
      <CreateDuelForm />
    </Suspense>
  );
}
