# Algorium

Algorium is a real-time competitive programming platform for 1v1 duels
on official Codeforces problems. Host a room, share a six-character code, and
race an opponent through problems neither of you has solved before. Verdicts are
pulled from the Codeforces API and pushed to both scoreboards within seconds —
nobody has to paste anything back.

Built with Next.js 16 (App Router), Prisma, PostgreSQL, Supabase Realtime and
Tailwind CSS v4.

---

## Contents

- [Quick start](#quick-start)
- [Environment](#environment)
- [How a duel works](#how-a-duel-works)
- [Game modes and scoring](#game-modes-and-scoring)
- [Room formats](#room-formats)
- [Proctoring: required camera and microphone](#proctoring-required-camera-and-microphone)
- [Series and rematches](#series-and-rematches)
- [Elo ladder](#elo-ladder)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [API reference](#api-reference)
- [Realtime events](#realtime-events)
- [Data model notes](#data-model-notes)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Quick start

```bash
git clone <repo> && cd cfdual
npm install

cp .env.example .env      # then fill it in — JWT_SECRET is mandatory

npx prisma generate       # run again after any schema change
npx prisma migrate dev    # or: npx prisma db push

npm run dev:all
```

Open <http://localhost:3000>.

### Scripts

| Script                  | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `npm run dev`           | Next.js dev server only                                                   |
| `npm run dev:all`       | Dev server plus both background workers (what you normally want)          |
| `npm run worker:eval`   | Polls live contests, ingests verdicts, enforces camera rules, finalises   |
| `npm run worker:cache`  | Warms the Redis cache of each player's solved problems                    |
| `npm run start:workers` | Both workers without the dev server, for a separate process in production |
| `npm run build`         | Production build                                                          |
| `npm run typecheck`     | `tsc --noEmit`                                                            |
| `npm run lint`          | ESLint                                                                    |
| `npm run db:push`       | Push the schema without creating a migration                              |
| `npm run db:migrate`    | Create and apply a migration                                              |

The app is usable without the workers — the arena falls back to calling
`/api/contests/[id]/evaluate` on a timer — but the workers keep duels in sync
even when nobody has the page open, and they are what ends a contest when the
clock runs out on an abandoned tab.

---

## Environment

Copy `.env.example` to `.env`. Every variable is documented there; the ones that
matter most:

| Variable                               | Required          | Notes                                                   |
| -------------------------------------- | ----------------- | ------------------------------------------------------- |
| `DATABASE_URL`                         | yes               | Pooled Postgres connection used by the app              |
| `DIRECT_URL`                           | yes               | Direct connection, used by `prisma migrate`             |
| `NEXT_PUBLIC_SUPABASE_URL`             | yes               | Supabase project URL, for realtime                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes               | Supabase anon/publishable key                           |
| `JWT_SECRET`                           | yes in production | Session signing key, minimum 32 characters              |
| `EMAIL_USER` / `EMAIL_PASS`            | optional          | Gmail address and app password for password-reset codes |
| `LIVEKIT_URL` / `_API_KEY` / `_API_SECRET` | optional      | Carries video in proctored rooms                        |
| `NEXT_PUBLIC_LIVEKIT_URL`              | optional          | Same URL, exposed to the browser                        |
| `REDIS_URL`                            | optional          | Defaults to `redis://localhost:6379`                    |

### JWT_SECRET

Sessions are signed JWTs stored in an `HttpOnly` cookie. In production the app
refuses to boot without a secret of at least 32 characters; in development it
falls back to a fixed development key and prints a warning.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Changing the secret invalidates every existing session, which signs all users
out once. Set it in your host's environment settings when deploying — `.env` is
gitignored and does not ship with the build.

### Redis

Redis caches the set of problems each player has already solved, so generating a
contest does not have to wait on the Codeforces API. It is genuinely optional:
every helper degrades to a cache miss when Redis is unreachable, and the only
symptom is slower room creation plus a single warning line at startup.

### LiveKit

Only needed if hosts will require a camera or microphone. Create a project at
[cloud.livekit.io](https://cloud.livekit.io), copy the URL, API key and secret,
and point a webhook at `https://<your-domain>/api/media/webhook`.

The webhook is not decoration. It is how the server learns that a camera was
switched off by someone who has no interest in reporting it, and it is verified
against the same API key and secret — an unsigned request is rejected, because
otherwise anyone could mark any player compliant.

Without LiveKit the feature still runs: the lobby check, the requirement and the
enforcement sweep all work off device state reported by each browser. What you
lose is players seeing each other, and the ability to catch a camera that is
published but muted. Treat it as optional-but-recommended rather than truly
optional if the rooms matter.

---

## How a duel works

1. **Sign in.** You prove you own a Codeforces handle by submitting deliberately
   broken code to an assigned problem. The app looks for the resulting
   `COMPILATION_ERROR` on your public submission list within a five-minute
   window — only the real account owner can produce one. After that you set an
   email and password for instant sign-in next time.

2. **Host or join.** Configure a room and share the six-character code, or make
   it public so anyone can join it from the open-duels list on the home page.

3. **Solve on Codeforces.** Problems open on Codeforces as normal and you submit
   there with your own account. The app never sees your code.

4. **Watch the board.** Both the background worker and the arena itself poll
   `user.status` for each player, match submissions against the contest problems
   and window, and broadcast the result over Supabase Realtime.

Problem selection deliberately excludes anything either player has already
solved, interactive and `*special` problems, and gym contests, and prefers older
contests (`contestId <= 1500`) when there are enough candidates. If your filters
are too tight the generator relaxes them in stages — first dropping tags, then
widening the rating window by 400 either side — rather than failing outright.

---

## Game modes and scoring

| Mode        | Rule                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Lockout** | Every problem is open. The first accepted solution claims it permanently.                                               |
| **Blitz**   | A strictly linear race. Only the current problem is available; solving it locks it and opens the next for both players. |
| **Classic** | Both players can solve everything. Most solved wins, with penalty time as the tie-break.                                |

Two scoring systems are available:

- **ICPC** — your score is the number of problems solved. Penalty is the minutes
  elapsed at each solve plus 20 minutes for every wrong submission that preceded
  it.
- **Points** — problems are worth 100, 200, 300 and so on by position, so later
  problems are worth chasing. Penalty still breaks ties.

Tie-breaks apply in this order: primary score, then total penalty, then whoever
completed their final accepted solution earliest. If all three tie it is a draw.

A contest ends when the timer expires, when the completion condition for the
mode is met (all problems locked, or both players solving everything in
Classic), or when a player resigns.

---

## Room formats

| Format        | Behaviour                                                                   |
| ------------- | --------------------------------------------------------------------------- |
| **Play**      | You host and compete. The first person to join is your opponent.            |
| **Supervise** | You host but do not play. The first two people to join are the contestants. |
| **Practice**  | A solo timed run. Unrated, no opponent, no match history.                   |

Rooms are private by default — only someone with the code can join. Toggling
**list in open duels** publishes the room on the home page, where it stays
visible for two hours or until someone takes the free slot.

Configurable per room: mode, scoring system, one to eight problems, any duration
from 5 to 300 minutes, a rating range or an exact rating per problem, required
and excluded tags with ANY/ALL matching, and an optional seed for a reproducible
problem set.

---

## Proctoring: required camera and microphone

A host can require contestants to keep their camera on, their microphone on, or
both, for the whole duel. Configure it on the create screen; the requirement is
shown as a badge in the open-duels list so nobody joins a proctored room without
knowing.

**What it is.** Presence and accountability. A camera shows who is at the
keyboard. It cannot see a second device off to the side, and it is not evidence
of how a problem was solved — the results screen says as much. Treat it as
raising the cost of cheating, not as closing the hole.

### How it behaves

| Stage | Behaviour |
| ----- | --------- |
| **Lobby** | Each contestant runs a device check. The host cannot start until every contestant's required devices are live — enforced in `/api/rooms/[code]/start`, not just by a disabled button. |
| **In contest** | Tiles appear beside the scoreboard, and as a fourth tab on mobile. If one of your required devices goes off, the problem panel is covered and a countdown starts. |
| **Grace period** | 10–300 seconds, default 30. Long enough to survive a reconnect or an unplugged webcam; short enough that walking away is caught. |
| **Expiry** | `WARN` announces and logs the incident and the duel continues. `FORFEIT` resigns the offender, awarding the win exactly as a manual resignation does. |
| **After** | The results screen shows total time off and incident count per player, from the `MediaEvent` log. |

Supervisors are exempt — they proctor rather than compete, so their own camera
stays their business. Practice runs cannot require media at all; there is nobody
on the other side.

### Where enforcement actually happens

The countdown in the arena is a courtesy: it lives in the offender's browser, so
closing the tab kills it. The rule is enforced by a sweep in the background
worker, on the same tick as the Codeforces evaluation, which reads three
sources in order of authority:

1. **LiveKit's view** of published, unmuted tracks. The only source that catches
   a camera which is published but muted — LiveKit fires no webhook for a mute,
   because the track stays published.
2. **The webhook**, for the fast path: unpublishing a track or closing the tab
   arrives within a second.
3. **Self-reported state**, when LiveKit is not configured or briefly
   unreachable.

`/api/rooms/[code]/media/violation` takes no body on purpose. A client can ask
for the room to be re-checked; it never gets to say who is in violation. That
keeps a modified client from framing an opponent, and staying silent buys
nothing, since the worker reaches the same conclusion within a tick.

**Not included:** recording. Nothing is stored, and the device check says so.
Adding it would mean storage, consent and retention decisions that this feature
deliberately does not make.

---

## Series and rematches

Player-hosted rooms can be a **best of three or five**. Each game is its own
room with a fresh problem set; the series score follows across them and the
first player to take the majority wins it.

After any duel either player can start a **rematch**, which clones the settings
into a new room, generates new problems, seats both players, and sends the
opponent an invite over realtime. Inside an undecided series the same button
becomes **play next game** and continues that series rather than starting a new
one. Rematch is idempotent — if both players press it, the second request
returns the room the first one created.

---

## Elo ladder

Every rated duel moves your Algorium Elo. It starts at 1200 and is entirely
separate from your Codeforces rating: beating a stronger opponent is worth more
than beating a weaker one.

| Condition                  | K-factor |
| -------------------------- | -------- |
| Fewer than 10 duels played | 48       |
| Rating below 1400          | 32       |
| Rating below 1900          | 24       |
| 1900 and above             | 16       |

Ratings have a floor of 100. Resignations count as losses. Solo practice never
affects your rating and is not recorded in match history. The standings page
ranks by Elo and lists only players who have actually completed a duel.

Cosmetic tiers: Rookie (below 1200), Challenger (1200), Specialist (1400),
Expert (1600), Master (1900), Grandmaster (2200).

---

## Architecture

**Evaluation.** `src/lib/services/contest-evaluator.ts` holds the single
evaluation pass — fetch recent submissions for both players, ingest anything
inside the contest window that matches a contest problem, apply lockout rules,
recompute standings, and finish the contest if its completion condition is met.
The background worker and the on-demand API route both call it, so the two
cannot drift apart.

**Finalisation.** `contest-finalizer.ts` is the only place a contest is closed.
It claims the contest with a conditional `updateMany` guarded on
`status != FINISHED`, which acts as an optimistic lock: whichever caller flips
the row wins and every other concurrent caller gets `null` back. Everything that
follows — participant finals, win/loss/draw counters, Elo, streaks, match
history and the series score — happens inside one transaction, and the finish is
broadcast from there rather than from each call site.

**Ingestion is idempotent.** The evaluate route and the worker frequently
process the same Codeforces submission at the same moment. Submissions are
upserted against `@@unique([contestId, cfSubmissionId])`, and a problem is
claimed with a conditional update guarded on `lockedWinnerId IS NULL`, so only
the first writer wins.

**Realtime with a fallback.** Supabase Realtime is the primary channel. The
arena additionally calls `/api/contests/[id]/evaluate` every twelve seconds, so
a dropped broadcast or a stopped worker degrades to a short delay rather than a
frozen page.

**Validation.** Every request body is parsed with a Zod schema from
`src/lib/validation.ts` before it reaches Prisma, and responses are normalised
through `apiSuccess` / `apiError`, which also serialises `BigInt` columns.

**Proctoring degrades rather than fails.** `media-policy.ts` holds the rules,
`media-enforcer.ts` runs the sweep, and `livekit.ts` returns `null` instead of
throwing when the credentials are absent. A deployment with no media provider
still runs proctored duels on self-reported device state — weaker, but working —
which keeps the requirement from depending on a third party being configured.

---

## Project layout

```
src/
  app/
    api/                  route handlers
    arena/[code]/         live duel
    room/[code]/          lobby
    create/               duel builder
    profile/[handle]/     player profile
    standings/            Elo ladder (server component)
    docs/ contact/ change-pass/
    globals.css           design tokens and base styles
  components/
    ui/                   design-system primitives
    arena/                duel UI, useArena and useMedia hooks
    room/                 lobby device check
    auth/                 Codeforces sign-in flow
    Navbar.tsx
  context/                user session, theme
  lib/
    services/             broadcast, evaluator, finalizer, standings, rooms,
                          media policy / enforcement
    livekit.ts            token minting and webhook verification
    validation.ts         Zod schemas
    elo.ts                rating maths
    codeforces.ts         API client with timeouts and retries
    api-utils.ts          response helpers, auth guard, rate limiting
  worker/                 the two background daemons
prisma/schema.prisma
```

### Styling

Tailwind CSS v4. All design tokens live in `src/app/globals.css` under `@theme`,
which means colours, radii, shadows and animations are available as ordinary
utility classes: `bg-surface`, `text-ink-dim`, `border-line`, `rounded-lg`,
`animate-fade-up`. Custom utilities (`panel`, `text-display`, `text-eyebrow`,
`no-scrollbar`, `pb-safe`) are defined in the same file.

The palette is dark-only: a black canvas, near-white ink, and a green brand
accent. Layouts are mobile-first and tested down to 360px — the navbar collapses
to a sheet, the arena becomes a three-tab view, modals become bottom sheets, and
wide tables fall back to stacked cards.

Note that `buttonStyles` lives in `src/components/ui/button-styles.ts` with no
`"use client"` directive so server components can call it. Importing it from a
client module would break the static build of `/standings`.

---

## API reference

All responses are JSON. Errors are `{ error, code, details? }` with an
appropriate status. Authenticated routes read the session cookie; the user id is
always taken from the session, never from the request body.

### Contests and rooms

| Method | Path                          | Auth | Rate limit | Description                                                 |
| ------ | ----------------------------- | ---- | ---------- | ----------------------------------------------------------- |
| POST   | `/api/contests/create`        | yes  | 10 / min   | Create a room, generate problems, optionally start a series |
| POST   | `/api/contests/[id]/evaluate` | yes  | 30 / min   | Run one evaluation pass; participants only                  |
| GET    | `/api/rooms/[code]`           | no   | —          | Full room state for the lobby and arena                     |
| POST   | `/api/rooms/[code]/join`      | yes  | 30 / min   | Take a free slot                                            |
| POST   | `/api/rooms/[code]/start`     | yes  | —          | Host only; starts the clock                                 |
| POST   | `/api/rooms/[code]/leave`     | yes  | —          | Cancels before the start, resigns after it                  |
| POST   | `/api/rooms/[code]/rematch`   | yes  | 10 / min   | Clone a finished room, or continue a series                 |
| GET    | `/api/rooms/public`           | no   | —          | Open-duels lobby                                            |

### Proctoring

| Method | Path                                | Auth | Rate limit | Description                                                    |
| ------ | ----------------------------------- | ---- | ---------- | -------------------------------------------------------------- |
| POST   | `/api/rooms/[code]/media/token`     | yes  | 20 / min   | Mint a LiveKit join token; participants only                   |
| POST   | `/api/rooms/[code]/media/state`     | yes  | 60 / min   | Report your own device state                                   |
| POST   | `/api/rooms/[code]/media/violation` | yes  | 20 / min   | Ask the server to re-check the room now; empty body by design  |
| GET    | `/api/rooms/[code]/media/events`    | yes  | —          | Compliance log; room members only                              |
| POST   | `/api/media/webhook`                | signed | —        | LiveKit callbacks, verified against the API key and secret     |

`/media/state` is chattier than the other routes because devices flap — a lid
closing, a reconnect — hence the higher limit.

### Users

| Method | Path                                  | Rate limit | Description                              |
| ------ | ------------------------------------- | ---------- | ---------------------------------------- |
| POST   | `/api/users/login`                    | 8 / min    | Step 1: password path or ownership proof |
| POST   | `/api/users/login/verify`             | 15 / min   | Step 2: check for the compilation error  |
| POST   | `/api/users/register`                 | 6 / min    | Step 3: set email and password           |
| POST   | `/api/users/auth`                     | 10 / min   | Password sign-in                         |
| POST   | `/api/users/logout`                   | —          | Clear the session cookie                 |
| GET    | `/api/users/me`                       | —          | Current session user                     |
| GET    | `/api/users/active-room`              | —          | Room the user is currently in, if any    |
| POST   | `/api/users/forgot-password/send-otp` | 3 / min    | Email a six-digit code                   |
| POST   | `/api/users/forgot-password/reset`    | 6 / min    | Consume the code, set a new password     |

### Other

| Method | Path                    | Rate limit | Description                             |
| ------ | ----------------------- | ---------- | --------------------------------------- |
| GET    | `/api/profile/[handle]` | —          | Duel stats, Elo standing, match history |
| POST   | `/api/contact`          | 3 / 10 min | Contact form                            |

Rate limiting is a fixed-window counter held in process memory. On a single
node that is fine; if you scale to multiple instances, move the buckets into
Redis, which is already a dependency.

Two endpoints deliberately avoid leaking whether an account exists:
`/api/users/auth` returns one generic message for both a missing handle and a
wrong password, and `/api/users/forgot-password/send-otp` always returns 200
with a masked destination.

---

## Realtime events

Most events are broadcast on the channel `room-<CODE>`. Names are centralised in
`ROOM_EVENTS` in `src/lib/services/broadcast.ts`.

| Event                         | Sent when                                             |
| ----------------------------- | ----------------------------------------------------- |
| `new-recent-action`           | A submission is created or leaves TESTING             |
| `problems-update`             | Problem state changed, typically a lock               |
| `scoreboard-update`           | Standings recomputed                                  |
| `blitz-problem-locked`        | A problem was claimed in Lockout                      |
| `strict-blitz-problem-locked` | A problem was claimed in Blitz, with the next index   |
| `contest-finished`            | Contest closed, with winner, standings and Elo deltas |
| `contest-started`             | Host started the contest                              |
| `room-cancelled`              | Room closed before starting                           |
| `player-joined`               | Someone took a slot                                   |
| `rematch-ready`               | A rematch room exists and is waiting                  |

Camera and microphone traffic goes on its own channel, `room-<CODE>-media`, so
it does not share a topic with the lobby's presence state:

| Event             | Sent when                                                 |
| ----------------- | --------------------------------------------------------- |
| `media-state`     | Any device changed. Carries the full roster, not a delta, so a client that missed a message self-heals |
| `media-violation` | A grace period expired — warned or forfeited              |

The lobby additionally uses Supabase presence to show who is currently
connected, and in a proctored room the presence payload carries each player's
device state so the other side updates instantly.

---

## Data model notes

Several unique constraints double as concurrency guards:

- `Submission @@unique([contestId, cfSubmissionId])` — makes verdict ingestion
  idempotent across the worker and the API route. Without it, duplicate rows
  inflate penalty time.
- `Participant @@unique([contestId, userId])` — makes joining idempotent.
- `Problem @@unique([contestId, indexInContest])`.

`MediaEvent` is append-only and carries a `source` of `client` or `server`. The
distinction is kept deliberately: a self-reported event is weaker evidence than
one LiveKit observed, and the compliance summary is honest about which it has.
`Participant.violationSince` is null whenever a player is compliant, which is
what lets the worker find every open violation across all live contests with one
indexed lookup.

If `prisma migrate` fails on one of these, the table already contains duplicate
rows from before the constraint existed. Remove them first, for example:

```sql
DELETE FROM "Submission" a USING "Submission" b
WHERE a.ctid < b.ctid
  AND a."contestId" = b."contestId"
  AND a."cfSubmissionId" = b."cfSubmissionId";
```

Indexes are defined for the access patterns that matter: the Elo and win
leaderboards, room lookups by status and participant, submissions by contest and
time, and match history by user and date.

---

## Deployment

1. Set every variable from `.env.example` in your host's environment,
   `JWT_SECRET` included.
2. Run `npx prisma migrate deploy` against the production database.
3. Deploy the Next.js app as usual. `postinstall` runs `prisma generate`.
4. Run the workers as a **separate long-lived process** —
   `npm run start:workers`. They are infinite loops and will not survive on a
   serverless platform. A small container or a worker dyno is enough; both
   handle `SIGINT` and `SIGTERM` cleanly.
5. Point `REDIS_URL` at a managed Redis instance if you want warm caches.

If you skip step 4 the app still works, because the arena polls the evaluate
endpoint, but contests will only be finalised while at least one player has the
page open.

---

## Troubleshooting

**`[auth] JWT_SECRET is unset or weak`** — expected in development. Set
`JWT_SECRET` in `.env` and restart; environment variables are read at boot.

**`[redis] unavailable ... ECONNREFUSED 127.0.0.1:6379`** — harmless. Redis is
optional; the app falls back to calling Codeforces directly. Start Redis or set
`REDIS_URL` to remove the warning.

**Type errors about `elo`, `isSolo`, `series` or `tagMatchMode`** — the
generated Prisma client is stale. Run `npx prisma generate`.

**"Attempted to call X from the server"** — a server component is calling a
plain function exported from a `"use client"` module. Move the function to a
module without the directive, as `button-styles.ts` does.

**"No Codeforces problems matched those filters"** — the rating window, tag
requirements and your existing solve history left nothing available. Widen the
rating range, switch tag matching from ALL to ANY, or clear the tags.

**Verification never finds the compilation error** — the submission must be on
the exact problem shown, must actually receive the `COMPILATION ERROR` verdict
rather than a runtime or wrong-answer verdict, and must be under five minutes
old. Codeforces also rate limits its API, so wait a few seconds before retrying.
