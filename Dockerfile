# Builds two images from one file:
#
#   docker build --target web     -t algorium-web .
#   docker build --target workers -t algorium-workers .
#
# The web target serves Next's standalone output; the workers target runs the
# two background loops, which are plain long-lived Node processes and cannot
# live on a serverless host. They share the build stage so the Prisma client is
# generated once.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
# `npm ci` triggers postinstall -> prisma generate, which needs the schema
# above but no database connection.
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` reads these at module scope but never connects. Real values are
# supplied at run time; the public ones are inlined into the client bundle, so
# pass the actual project URL as a build arg if you serve this image directly.
ARG NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="placeholder"
ARG NEXT_PUBLIC_LIVEKIT_URL=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    DIRECT_URL="postgresql://build:build@localhost:5432/build" \
    JWT_SECRET="build-only-secret-at-least-thirty-two-chars"

RUN npm run build

# ── web ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0

RUN addgroup -S app && adduser -S app -G app

# `output: "standalone"` emits a self-contained server with only the modules it
# actually imports; static/ and public/ are not included in it.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

# ── workers ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS workers
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

# The workers run from source through tsx, so they need node_modules, the
# generated Prisma client (already inside node_modules) and src/.
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=app:app /app/prisma ./prisma

USER app

# Both loops handle SIGTERM, so let Docker deliver it straight to npm's child
# rather than wrapping this in a shell that would swallow it.
STOPSIGNAL SIGTERM
CMD ["npm", "run", "start:workers"]
