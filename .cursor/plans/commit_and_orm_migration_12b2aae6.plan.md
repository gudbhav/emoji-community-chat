---
name: Commit and ORM migration
overview: Commit all Dependabot security fixes on `dependabot-issue-resolution`, then branch off that commit to replace Prisma + PlanetScale (MySQL) with Drizzle ORM + Neon Postgres using a fresh database (no data migration).
todos:
  - id: commit-dependabot
    content: Stage 9 modified files (exclude dependabot.json), commit on dependabot-issue-resolution
    status: pending
  - id: branch-migrate
    content: Create migrate/drizzle-neon from dependabot-issue-resolution tip
    status: pending
  - id: deps-drizzle-neon
    content: Swap Prisma deps for drizzle-orm, drizzle-kit, @neondatabase/serverless; update package scripts
    status: pending
  - id: schema-db-layer
    content: Add drizzle.config.ts, src/db/schema.ts, rewrite src/server/db.ts
    status: pending
  - id: rewrite-consumers
    content: Update trpc context, posts router, ssgHelper to use db
    status: pending
  - id: cleanup-docs-env
    content: Remove prisma/, update .env.example, README, .gitignore
    status: pending
  - id: verify-migration
    content: Run typecheck, audit, build; document Neon db:push steps
    status: pending
isProject: false
---

# Commit Dependabot fixes and start Drizzle + Neon migration

## Part 1: Commit current branch

**Branch:** `[dependabot-issue-resolution](dependabot-issue-resolution)` (already checked out)

**Stage and commit** these modified files (9 files):


| Area         | Files                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies | `[package.json](package.json)`, `[package-lock.json](package-lock.json)`                                                                                                                                                                                                                                                                 |
| Next config  | `[next.config.mjs](next.config.mjs)`                                                                                                                                                                                                                                                                                                     |
| Clerk / API  | `[src/middleware.ts](src/middleware.ts)`, `[src/pages/index.tsx](src/pages/index.tsx)`, `[src/server/api/helpers/filterUserForClient.ts](src/server/api/helpers/filterUserForClient.ts)`, `[src/server/api/routers/posts.ts](src/server/api/routers/posts.ts)`, `[src/server/api/routers/profile.ts](src/server/api/routers/profile.ts)` |
| Docs         | `[README.md](README.md)`                                                                                                                                                                                                                                                                                                                 |


**Exclude** `[dependabot.json](dependabot.json)` from the commit (generated alert export; not required for the app to run). Add it to `[.gitignore](.gitignore)` only if you want it kept locally without tracking.

**Proposed commit message** (matches repo style: short, descriptive):

```
Fix Dependabot security vulnerabilities across dependencies.

Upgrade Next.js, Clerk, tRPC, and transitive packages; add npm overrides
so npm audit reports zero vulnerabilities. Update Clerk middleware and
API usage for v6 compatibility.
```

**Post-commit:** optionally push `dependabot-issue-resolution` if you want a PR for review before migration work.

---

## Part 2: Create migration branch

After the commit above:

```bash
git checkout -b migrate/drizzle-neon
```

Branch from the new tip of `dependabot-issue-resolution` so migration work includes the security upgrades.

---

## Part 3: Prisma + PlanetScale → Drizzle + Neon (fresh DB)

### Current state

- Schema: single `Post` model in `[prisma/schema.prisma](prisma/schema.prisma)` (MySQL, `relationMode = "prisma"` — PlanetScale pattern)
- DB access: `[src/server/db.ts](src/server/db.ts)` exports `prisma`
- Consumers: `[src/server/api/trpc.ts](src/server/api/trpc.ts)` (`ctx.prisma`), `[src/server/api/routers/posts.ts](src/server/api/routers/posts.ts)` (4 queries), `[src/server/api/helpers/ssgHelper.ts](src/server/api/helpers/ssgHelper.ts)`
- Env: `[src/env.mjs](src/env.mjs)` already validates `DATABASE_URL` as a URL

```mermaid
flowchart LR
  subgraph before [Current]
    tRPC --> prisma
    prisma --> PlanetScaleMySQL
  end
  subgraph after [Target]
    tRPC2[tRPC] --> drizzle
    drizzle --> NeonPostgres
  end
```



### Dependencies

**Add:**

- `drizzle-orm`
- `drizzle-kit` (dev)
- `@neondatabase/serverless` (Neon HTTP driver — fits Next.js serverless)

**Remove:**

- `@prisma/client`, `prisma`
- `postinstall: prisma generate` from `[package.json](package.json)`

**Scripts to add:**

- `db:generate` — `drizzle-kit generate`
- `db:migrate` — `drizzle-kit migrate`
- `db:push` — `drizzle-kit push` (handy for dev on fresh Neon)

### Schema and config (new files)

1. `**drizzle.config.ts`** — point at Neon `DATABASE_URL`, schema path `src/db/schema.ts`, dialect `postgresql`, output `drizzle/`
2. `**src/db/schema.ts`** — Drizzle equivalent of `Post`:
  - `id` — `text`, primary key, cuid default (`@paralleldrive/cuid2` or keep cuid via app layer)
  - `createdAt` — `timestamp`, default now
  - `content` — `varchar(255)`
  - `authorId` — `text` + index on `authorId`
3. `**src/server/db.ts`** — replace Prisma client with Neon + Drizzle:

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "~/db/schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

   Keep dev singleton pattern (attach `db` to `globalThis` in non-production) like current Prisma setup.

### Application rewrites


| File                                                                         | Change                                                                                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `[src/server/api/trpc.ts](src/server/api/trpc.ts)`                           | `import { db }` → `ctx: { db, userId }`                                                                                      |
| `[src/server/api/routers/posts.ts](src/server/api/routers/posts.ts)`         | Replace `ctx.prisma.post.*` with Drizzle `db.query.posts` / `db.insert` / `db.select`; import `Post` type from `~/db/schema` |
| `[src/server/api/helpers/ssgHelper.ts](src/server/api/helpers/ssgHelper.ts)` | Pass `db` instead of `prisma`                                                                                                |
| `[src/env.mjs](src/env.mjs)`                                                 | No structural change if `DATABASE_URL` stays; optional comment that Neon Postgres URL is expected                            |


**Query mapping (posts router):**

- `findMany` + `orderBy` + `take` → `db.select().from(posts).orderBy(desc(posts.createdAt)).limit(100)`
- `create` → `db.insert(posts).values({...}).returning()`
- `findUnique` → `db.select().where(eq(posts.id, id)).limit(1)`

### Cleanup

- Delete `[prisma/](prisma/)` directory and `[prisma/schema.prisma](prisma/schema.prisma)`
- Update `[.env.example](.env.example)`: Neon Postgres URL template + remove Prisma sqlite placeholder
- Update `[.gitignore](.gitignore)`: remove Prisma sqlite paths; add `drizzle/meta` if needed
- Update `[README.md](README.md)`: Prisma → Drizzle, PlanetScale → Neon

### Neon setup (manual, outside repo)

1. Create a Neon project and database
2. Copy pooled connection string into `.env` as `DATABASE_URL`
3. Run `npm run db:push` (or `db:migrate`) against the fresh Neon DB

### Verification on migration branch

- `npm run typecheck`
- `npm audit` (should remain clean)
- `npm run build` with valid `.env` (Clerk + Neon + Upstash)
- Smoke test: create post, list feed, `getById`, profile lookup

---

## Risk notes

- **MySQL → Postgres** is a provider change, not a drop-in ORM swap; table/column naming will follow Drizzle defaults (can match `Post` table name via `pgTable("Post", ...)` to minimize surprises).
- **No data migration** per your choice — existing PlanetScale data will not move automatically.
- Migration branch should be a **focused PR** separate from the Dependabot security PR for easier review.

