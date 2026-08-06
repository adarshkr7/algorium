# CFDual

CFDual is a real-time competitive programming platform for 1v1 duels on Codeforces problems. Built with Next.js, Prisma and Supabase, it lets you create custom rooms, race an opponent in Lockout, Blitz or Classic mode, and watch standings update live as submissions are judged.

---

## Getting started

```bash
npm install
cp .env.example .env        # then fill it in
npx prisma generate         # regenerate the client after any schema change
npx prisma migrate dev      # or: npx prisma db push
npm run dev:all             # Next.js + both background workers
```

`npm run dev:all` runs three processes:

| Script                | What it does                                                        |
| --------------------- | ------------------------------------------------------------------- |
| `npm run dev`         | The Next.js app                                                      |
| `npm run worker:eval` | Polls live contests, ingests Codeforces verdicts, finalises contests |
| `npm run worker:cache`| Warms the Redis cache of each player's solved problems               |

The app works without the workers — the arena falls back to calling
`/api/contests/[id]/evaluate` on a timer — but the workers keep duels in sync
even when nobody has the page open.

### Required environment

`JWT_SECRET` is now **mandatory in production** and must be at least 32
characters. Previously a hardcoded fallback was used, which meant anyone
reading the source could forge a session cookie for any handle.

```bash
openssl rand -base64 48
```

In development a fallback is used and a warning is printed.

---

## Game modes

| Mode        | Rule                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| **Lockout** | All problems open. The first accepted solution claims a problem permanently. |
| **Blitz**   | Linear race — only the current problem is available; solving it opens the next. |
| **Classic** | Both players solve everything; ICPC scoring with penalty time.                |

Scoring is either **ICPC** (solve count + penalty) or **Points** (100 / 200 /
300… by position). Tie-breaks run: primary score → penalty → earliest final AC.

### Room formats

- **Play** — you host and compete.
- **Supervise** — you host and spectate; the first two joiners compete.
- **Practice** — solo timed run. Unrated, no match history.

Rooms can be **public** (listed in the open-duels lobby on the home page) or
private (code only). Player-hosted rooms can be a **best of 3 or 5**: each game
is its own room, and the series score carries across them.

### Elo ladder

Every rated duel moves your Algorium Elo, which starts at 1200 and is separate
from your Codeforces rating. K-factor is 48 for the first ten duels, then
32/24/16 by rating band. Resignations count as losses; practice runs never
count. The standings page ranks by Elo and only lists players who have actually
duelled.

---

## Project layout

```
src/
  app/                  routes + API handlers
  components/
    ui/                 design-system primitives (Button, Card, Modal, …)
    arena/              live-duel UI + the useArena hook
    auth/               Codeforces sign-in flow
  lib/
    services/           broadcast, standings, evaluator, finalizer, rooms
    validation.ts       Zod schemas for every request body
    elo.ts              rating maths
  worker/               the two background daemons
prisma/schema.prisma
```

Styling is Tailwind v4. All design tokens live in `src/app/globals.css` under
`@theme`, so colours, radii, shadows and animations are available as utility
classes (`bg-surface`, `text-ink-dim`, `border-line`, `animate-fade-up`, …).

---

## Notes on the data model

The schema adds several unique constraints that also act as concurrency guards:

- `Submission @@unique([contestId, cfSubmissionId])` — the evaluate route and
  the worker frequently process the same Codeforces submission at the same
  moment. Ingestion is an upsert, so duplicates (which inflated penalties) are
  impossible.
- `Participant @@unique([contestId, userId])` — makes joining idempotent.
- `Problem @@unique([contestId, indexInContest])`.

If `prisma migrate` fails on one of these, the existing table has duplicate
rows from before the fix. Clear them first, e.g.:

```sql
DELETE FROM "Submission" a USING "Submission" b
WHERE a.ctid < b.ctid
  AND a."contestId" = b."contestId"
  AND a."cfSubmissionId" = b."cfSubmissionId";
```
