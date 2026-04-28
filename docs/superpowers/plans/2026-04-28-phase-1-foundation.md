# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the monorepo with NestJS API + Next.js skeleton + Postgres + Redis + Docker Compose + base observability + CI. No business logic yet — every foundational piece must be in place so Phases 2-7 plug in without setup work.

**Architecture:** Monorepo with pnpm workspaces (`packages/api`, `packages/web`). NestJS scaffold with TypeORM (no entities yet), pino logging, helmet, health endpoints, OpenTelemetry tracing (console exporter dev), Prometheus metrics endpoint, problem+json exception filter, Zod validation pipe, correlation-ID middleware. Next.js 15 App Router with Tailwind + minimal shadcn/ui base. Postgres 16 + Redis 7 in Docker Compose with init scripts for extensions and Postgres roles. ESLint strict, Prettier, husky + lint-staged + commitlint. GitHub Actions CI matrix.

**Tech Stack:** Node 20, TypeScript 5 strict, NestJS 10, Next.js 15, Postgres 16, Redis 7, TypeORM 0.3, pnpm 9, Jest 29, Testcontainers, Docker, Helmet, pino, OpenTelemetry SDK, Prometheus client.

**Spec reference:** `docs/superpowers/specs/2026-04-28-keyloop-scenario-a-scheduler-design.md` — Sections 1 (architecture), 7.4 (Postgres roles), 7.8 (security headers + CORS), 9.4 (backup hint), 9.5 (migration strategy), 10.1-10.5 (observability), 13 (project structure), 14 (tech choices).

**Out of scope for Phase 1:** entities, migrations beyond extensions/roles, business logic, auth, RLS context interceptor, idempotency cache, rate limiting, outbox, FE pages beyond `/`, ADRs beyond ADR-0001 template, k6 load tests.

---

## File Structure

```
keyloop-scheduler/
├── package.json                                # workspace root with shared scripts
├── pnpm-workspace.yaml
├── .gitignore
├── .editorconfig
├── .nvmrc                                      # node 20
├── .commitlintrc.json
├── .husky/                                     # husky hooks
│   ├── pre-commit
│   └── commit-msg
├── README.md                                   # entry point + setup instructions
├── docker-compose.yml                          # postgres + redis (default profile)
├── docker-compose.observability.yml            # otel-collector + jaeger + prometheus (profile=observability)
├── .env.example                                # every env var documented
├── .github/workflows/
│   └── ci.yml                                  # api + web jobs in matrix
├── packages/
│   ├── api/                                    # NestJS backend
│   │   ├── package.json
│   │   ├── tsconfig.json                       # strict mode
│   │   ├── tsconfig.build.json
│   │   ├── nest-cli.json
│   │   ├── jest.config.ts                      # default
│   │   ├── jest.unit.config.ts
│   │   ├── jest.int.config.ts
│   │   ├── jest.e2e.config.ts
│   │   ├── .eslintrc.cjs
│   │   ├── .prettierrc.json
│   │   ├── otel-collector.yaml
│   │   ├── prometheus.yml
│   │   ├── db/init/
│   │   │   ├── 01-extensions.sql               # btree_gist + pgcrypto + citext
│   │   │   └── 02-roles.sql                    # owner / migrator / app
│   │   ├── src/
│   │   │   ├── tracing.ts                      # OTel SDK init — loaded BEFORE main.ts
│   │   │   ├── main.ts                         # bootstrap
│   │   │   ├── app.module.ts                   # wires modules + global filters/pipes
│   │   │   ├── config/
│   │   │   │   ├── config.module.ts
│   │   │   │   └── config.schema.ts            # Zod schema for env vars
│   │   │   ├── shared/
│   │   │   │   ├── filters/
│   │   │   │   │   └── problem-details.filter.ts
│   │   │   │   ├── pipes/
│   │   │   │   │   └── zod-validation.pipe.ts
│   │   │   │   ├── middleware/
│   │   │   │   │   └── request-id.middleware.ts
│   │   │   │   └── async-context/
│   │   │   │       └── request-context.ts
│   │   │   └── modules/
│   │   │       ├── health/
│   │   │       │   ├── health.controller.ts
│   │   │       │   └── health.module.ts
│   │   │       └── observability/
│   │   │           ├── observability.module.ts
│   │   │           └── metrics.service.ts
│   │   └── test/
│   │       ├── helpers/
│   │       │   └── testcontainers.ts
│   │       ├── setup.ts
│   │       └── e2e/
│   │           └── health.e2e-spec.ts
│   └── web/                                    # Next.js demo client
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── components.json
│       ├── .eslintrc.json
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx
│       │   │   └── globals.css
│       │   ├── lib/
│       │   │   └── utils.ts
│       │   └── components/ui/
│       │       ├── button.tsx
│       │       ├── input.tsx
│       │       ├── card.tsx
│       │       ├── toast.tsx
│       │       └── toaster.tsx
└── docs/
    ├── superpowers/
    │   ├── specs/
    │   │   └── 2026-04-28-keyloop-scenario-a-scheduler-design.md   # already exists
    │   └── plans/
    │       └── 2026-04-28-phase-1-foundation.md                    # this file
    └── adrs/
        ├── template.md
        └── 0001-record-architecture-decisions.md
```

---

## Task 1: Initialize git repository and root files

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `README.md`

- [ ] **Step 1: Initialize git**

```bash
cd /Users/luuphuc/Projects/keyloop/keyloop
git init
```

Expected: `Initialized empty Git repository`.

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
.next/
out/
coverage/
*.log
.DS_Store
.env
.env.local
.env.*.local
*.tsbuildinfo
.pnpm-store/
.idea/
.vscode/
!.vscode/extensions.json
.turbo/
```

- [ ] **Step 3: Create `.editorconfig`**

```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Create `.nvmrc`**

```
20
```

- [ ] **Step 5: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 6: Create root `package.json`**

```json
{
  "name": "keyloop-scheduler",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.7.0",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "lint": "pnpm -r run lint",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test",
    "build": "pnpm -r run build",
    "dev": "pnpm --parallel -r run dev"
  },
  "devDependencies": {
    "@commitlint/cli": "^19.4.0",
    "@commitlint/config-conventional": "^19.4.0",
    "husky": "^9.1.4",
    "lint-staged": "^15.2.7"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix"],
    "*.{json,md,yaml,yml}": ["prettier --write"]
  }
}
```

- [ ] **Step 7: Create `README.md` skeleton**

```markdown
# Keyloop Scheduler — Service Appointment Scheduler

Multi-tenant appointment booking system. See `docs/superpowers/specs/2026-04-28-keyloop-scenario-a-scheduler-design.md` for full design.

## Quick start

\`\`\`bash
pnpm install
docker compose up -d postgres redis
pnpm --filter @keyloop/api dev
pnpm --filter @keyloop/web dev
\`\`\`

## Documentation
- Design doc: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`
- Architecture decisions: `docs/adrs/`

## AI Collaboration Narrative

(Implementation phase — to be filled.)
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: initialize monorepo with pnpm workspace"
```

Expected: `1 file changed` (or more) — initial commit succeeds.

---

## Task 2: Set up commitlint + husky hooks

**Files:**
- Create: `.commitlintrc.json`
- Create: `.husky/commit-msg`
- Create: `.husky/pre-commit`

- [ ] **Step 1: Install husky + commitlint at root**

```bash
pnpm install
pnpm dlx husky init
```

Expected: `.husky/pre-commit` created automatically.

- [ ] **Step 2: Create `.commitlintrc.json`**

```json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [2, "always", ["feat", "fix", "docs", "style", "refactor", "perf", "test", "chore", "ci", "build", "revert"]],
    "subject-case": [0]
  }
}
```

- [ ] **Step 3: Create `.husky/commit-msg`**

```bash
pnpm dlx commitlint --edit "$1"
```

Make executable: `chmod +x .husky/commit-msg`.

- [ ] **Step 4: Update `.husky/pre-commit`**

```bash
pnpm dlx lint-staged
```

Make executable: `chmod +x .husky/pre-commit`.

- [ ] **Step 5: Verify commit-msg hook rejects bad message**

```bash
git add .
git commit -m "bad message" || echo "EXPECTED: hook rejected"
```

Expected: commit fails with commitlint error mentioning "type-enum".

- [ ] **Step 6: Commit with valid message**

```bash
git commit -m "chore: add commitlint and husky hooks"
```

Expected: commit succeeds.

---

## Task 3: Scaffold NestJS API package

**Files:**
- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`
- Create: `packages/api/tsconfig.build.json`
- Create: `packages/api/nest-cli.json`
- Create: `packages/api/src/main.ts`
- Create: `packages/api/src/app.module.ts`

- [ ] **Step 1: Create `packages/api/package.json`**

```json
{
  "name": "@keyloop/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "lint": "eslint \"{src,test}/**/*.ts\" --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "jest --config jest.config.ts",
    "test:unit": "jest --config jest.unit.config.ts",
    "test:int": "jest --config jest.int.config.ts --runInBand",
    "test:e2e": "jest --config jest.e2e.config.ts --runInBand"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.1",
    "@nestjs/config": "^3.2.3",
    "@nestjs/core": "^10.4.1",
    "@nestjs/platform-express": "^10.4.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/schematics": "^10.1.4",
    "@nestjs/testing": "^10.4.1",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.15",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^7.18.0",
    "@typescript-eslint/parser": "^7.18.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-prettier": "^5.2.1",
    "jest": "^29.7.0",
    "prettier": "^3.3.3",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.4",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Create `packages/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": false,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@app/*": ["src/*"],
      "@test/*": ["test/*"]
    }
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts", "**/*.test.ts"]
}
```

- [ ] **Step 4: Create `packages/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 5: Create `packages/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 6: Create `packages/api/src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

void bootstrap();
```

- [ ] **Step 7: Install dependencies**

```bash
cd /Users/luuphuc/Projects/keyloop/keyloop
pnpm install
```

Expected: install succeeds with no errors.

- [ ] **Step 8: Verify build**

```bash
pnpm --filter @keyloop/api typecheck
pnpm --filter @keyloop/api build
```

Expected: both succeed; `packages/api/dist/main.js` exists.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat(api): scaffold NestJS package with strict tsconfig"
```

---

## Task 4: Scaffold Next.js web package

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/next.config.mjs`
- Create: `packages/web/tailwind.config.ts`
- Create: `packages/web/postcss.config.js`
- Create: `packages/web/components.json`
- Create: `packages/web/src/app/layout.tsx`
- Create: `packages/web/src/app/page.tsx`
- Create: `packages/web/src/app/globals.css`
- Create: `packages/web/src/lib/utils.ts`

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@keyloop/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint --max-warnings 0",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.438.0",
    "next": "15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "tailwind-merge": "^2.5.2",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@types/node": "^20.14.15",
    "@types/react": "^18.3.4",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.0",
    "eslint-config-next": "15.0.0",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Create `packages/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": "./",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `packages/web/next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
};

export default nextConfig;
```

- [ ] **Step 4: Create `packages/web/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

- [ ] **Step 5: Create `packages/web/postcss.config.js`**

```javascript
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Create `packages/web/components.json` (shadcn/ui config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": { "components": "@/components", "utils": "@/lib/utils" }
}
```

- [ ] **Step 7: Create `packages/web/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 8: Create `packages/web/src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 9: Create `packages/web/src/app/layout.tsx`**

```tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Keyloop Scheduler',
  description: 'Service appointment scheduler — demo client',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Create `packages/web/src/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Keyloop Scheduler</h1>
        <p className="mt-2 text-muted-foreground">Demo client. Auth and booking flows arrive in Phase 7.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 11: Install + verify build**

```bash
pnpm install
pnpm --filter @keyloop/web typecheck
pnpm --filter @keyloop/web build
```

Expected: typecheck passes, build produces `.next/` directory.

- [ ] **Step 12: Commit**

```bash
git add .
git commit -m "feat(web): scaffold Next.js 15 with Tailwind and shadcn/ui base"
```

---

## Task 5: Postgres + Redis in Docker Compose with init scripts

**Files:**
- Create: `docker-compose.yml`
- Create: `packages/api/db/init/01-extensions.sql`
- Create: `packages/api/db/init/02-roles.sql`
- Create: `.env.example`

Reference: design doc Section 7.4 (Postgres role architecture).

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: keyloop-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: scheduler_owner
      POSTGRES_PASSWORD: ${POSTGRES_OWNER_PASSWORD:-owner}
      POSTGRES_DB: scheduler
    ports:
      - '${POSTGRES_PORT:-5432}:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./packages/api/db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U scheduler_owner -d scheduler']
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: keyloop-redis
    restart: unless-stopped
    ports:
      - '${REDIS_PORT:-6379}:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  postgres-data:
```

- [ ] **Step 2: Create `packages/api/db/init/01-extensions.sql`**

```sql
-- Extensions required by the scheduler
-- Reference: design doc Appendix A.1
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
```

- [ ] **Step 3: Create `packages/api/db/init/02-roles.sql`**

```sql
-- Postgres role architecture
-- Reference: design doc Section 7.4

-- Owner role: schema management, BYPASSRLS by default (owner of tables).
-- POSTGRES_USER from compose maps to scheduler_owner already; no creation here.

-- Migrator role: CI/CD pipeline. BYPASSRLS for migrations + seeds.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scheduler_migrator') THEN
    CREATE ROLE scheduler_migrator LOGIN PASSWORD 'migrator' BYPASSRLS;
  END IF;
END $$;
GRANT scheduler_owner TO scheduler_migrator;

-- App runtime role: NestJS process. NO BYPASSRLS — RLS-enforced.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scheduler_app') THEN
    CREATE ROLE scheduler_app LOGIN PASSWORD 'app';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO scheduler_app;

-- Future tables and sequences will need GRANT statements; per-migration grants are fine.
```

- [ ] **Step 4: Create `.env.example`**

```
# Database — owner used by migrations, app used at runtime
POSTGRES_OWNER_PASSWORD=owner
POSTGRES_PORT=5432
DATABASE_URL=postgresql://scheduler_app:app@localhost:5432/scheduler
DATABASE_URL_MIGRATIONS=postgresql://scheduler_owner:owner@localhost:5432/scheduler

# Redis
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

# API
PORT=3001
LOG_LEVEL=info
NODE_ENV=development
APP_VERSION=dev

# JWT (Phase 3)
JWT_ACCESS_SECRET=change-me-32-chars-minimum-required
JWT_REFRESH_SECRET=change-me-32-chars-minimum-required

# OTel (empty = console exporter)
OTLP_ENDPOINT=

# CORS — comma-separated origins
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

- [ ] **Step 5: Start services and verify Postgres extensions + roles**

```bash
docker compose up -d postgres redis
sleep 8
docker compose exec postgres psql -U scheduler_owner -d scheduler -c "SELECT extname FROM pg_extension WHERE extname IN ('btree_gist','pgcrypto','citext') ORDER BY extname;"
```

Expected output:
```
   extname
-------------
 btree_gist
 citext
 pgcrypto
(3 rows)
```

- [ ] **Step 6: Verify roles**

```bash
docker compose exec postgres psql -U scheduler_owner -d scheduler -c "SELECT rolname FROM pg_roles WHERE rolname IN ('scheduler_owner','scheduler_migrator','scheduler_app') ORDER BY rolname;"
```

Expected:
```
       rolname
---------------------
 scheduler_app
 scheduler_migrator
 scheduler_owner
(3 rows)
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(infra): add Postgres + Redis Docker Compose with init scripts"
```

---

## Task 6: Environment config with Zod validation

**Files:**
- Create: `packages/api/src/config/config.schema.ts`
- Create: `packages/api/src/config/config.module.ts`
- Modify: `packages/api/src/app.module.ts`
- Test: `packages/api/src/config/config.schema.spec.ts`

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @keyloop/api add @nestjs/config
```

- [ ] **Step 2: Write the failing test `config.schema.spec.ts`**

```typescript
import { configSchema } from './config.schema';

describe('configSchema', () => {
  const validBase = {
    NODE_ENV: 'development',
    PORT: '3001',
    DATABASE_URL: 'postgresql://app:app@localhost:5432/scheduler',
    DATABASE_URL_MIGRATIONS: 'postgresql://owner:owner@localhost:5432/scheduler',
    REDIS_URL: 'redis://localhost:6379',
    LOG_LEVEL: 'info',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    APP_VERSION: 'dev',
  };

  it('accepts a valid config and parses PORT to number', () => {
    const result = configSchema.parse(validBase);
    expect(result.PORT).toBe(3001);
    expect(typeof result.PORT).toBe('number');
  });

  it('rejects too-short JWT_ACCESS_SECRET', () => {
    expect(() => configSchema.parse({ ...validBase, JWT_ACCESS_SECRET: 'short' })).toThrow();
  });

  it('rejects invalid DATABASE_URL', () => {
    expect(() => configSchema.parse({ ...validBase, DATABASE_URL: 'not-a-url' })).toThrow();
  });

  it('defaults LOG_LEVEL to info when missing', () => {
    const { LOG_LEVEL: _, ...rest } = validBase;
    const result = configSchema.parse(rest);
    expect(result.LOG_LEVEL).toBe('info');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @keyloop/api test src/config/config.schema.spec.ts
```

Expected: test fails because `config.schema.ts` does not exist.

- [ ] **Step 4: Implement `packages/api/src/config/config.schema.ts`**

```typescript
import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_MIGRATIONS: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  OTLP_ENDPOINT: z.string().optional().default(''),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  APP_VERSION: z.string().default('dev'),
});

export type AppConfig = z.infer<typeof configSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @keyloop/api test src/config/config.schema.spec.ts
```

Expected: 4 passing tests.

- [ ] **Step 6: Implement `packages/api/src/config/config.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { configSchema } from './config.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: (raw): unknown => {
        const parsed = configSchema.safeParse(raw);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
          throw new Error(`Invalid environment configuration:\n  ${issues}`);
        }
        return parsed.data;
      },
    }),
  ],
})
export class ConfigModule {}
```

- [ ] **Step 7: Wire up in `app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 8: Verify boot fails on bad env**

```bash
cd packages/api
JWT_ACCESS_SECRET=short DATABASE_URL='postgresql://x:y@localhost/z' DATABASE_URL_MIGRATIONS='postgresql://x:y@localhost/z' REDIS_URL='redis://localhost:6379' CORS_ALLOWED_ORIGINS='http://localhost:3000' JWT_REFRESH_SECRET='b'$(printf 'b%.0s' $(seq 1 31)) pnpm dev 2>&1 | head -20 || true
```

Expected: error mentions `JWT_ACCESS_SECRET: String must contain at least 32 character(s)`.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat(api): add Zod-validated config module"
```

---

## Task 7: Pino structured logging

**Files:**
- Modify: `packages/api/src/app.module.ts`
- Modify: `packages/api/src/main.ts`
- Test: `packages/api/test/e2e/logging.e2e-spec.ts`

Reference: design doc Section 10.1.

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @keyloop/api add nestjs-pino pino pino-http pino-pretty
```

- [ ] **Step 2: Write failing e2e test `logging.e2e-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { AppModule } from '@app/app.module';
import { INestApplication } from '@nestjs/common';

describe('Logger (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterAll(async () => app.close());

  it('exposes a Logger instance', () => {
    const logger = app.get(Logger);
    expect(logger).toBeDefined();
    expect(typeof logger.log).toBe('function');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
pnpm --filter @keyloop/api test:e2e logging.e2e-spec.ts
```

Expected: failure (Logger not configured).

- [ ] **Step 4: Update `app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config/config.schema';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.refresh_token',
              '*.password_hash',
              '*.token_hash',
            ],
            censor: '[REDACTED]',
          },
          customProps: (req) => ({
            request_id: (req as { id?: string }).id,
          }),
          serializers: {
            req: (req) => ({ method: req.method, url: req.url, request_id: req.id }),
            res: (res) => ({ status_code: res.statusCode }),
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 5: Update `main.ts` to use pino as Nest logger**

```typescript
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  app.get(Logger).log(`API listening on http://localhost:${port}`);
}

void bootstrap();
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @keyloop/api test:e2e logging.e2e-spec.ts
```

Expected: passing.

- [ ] **Step 7: Smoke-test logger output**

```bash
cd packages/api
DATABASE_URL='postgresql://scheduler_app:app@localhost:5432/scheduler' \
DATABASE_URL_MIGRATIONS='postgresql://scheduler_owner:owner@localhost:5432/scheduler' \
REDIS_URL='redis://localhost:6379' \
JWT_ACCESS_SECRET='a'$(printf 'a%.0s' $(seq 1 31)) \
JWT_REFRESH_SECRET='b'$(printf 'b%.0s' $(seq 1 31)) \
CORS_ALLOWED_ORIGINS='http://localhost:3000' \
NODE_ENV=development \
LOG_LEVEL=debug \
timeout 5s pnpm dev | head -3 || true
```

Expected: human-readable single-line pino output via pino-pretty.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(api): add pino structured logging with redaction"
```

---

## Task 8: Health endpoints

**Files:**
- Create: `packages/api/src/modules/health/health.controller.ts`
- Create: `packages/api/src/modules/health/health.module.ts`
- Modify: `packages/api/src/app.module.ts`
- Test: `packages/api/test/e2e/health.e2e-spec.ts`

Reference: design doc Section 10.5.

- [ ] **Step 1: Install Terminus**

```bash
pnpm --filter @keyloop/api add @nestjs/terminus
```

- [ ] **Step 2: Write failing e2e test `health.e2e-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from '@app/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /health/liveness returns 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/readiness returns 200 (no DB indicator yet)', async () => {
    const res = await request(app.getHttpServer()).get('/health/readiness');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm --filter @keyloop/api test:e2e health.e2e-spec.ts
```

Expected: 404 errors (routes do not exist).

- [ ] **Step 4: Implement `health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get('liveness')
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  @Get('readiness')
  @HealthCheck()
  readiness() {
    // DB indicator added in Task 13 (TypeORM setup)
    return this.health.check([]);
  }
}
```

- [ ] **Step 5: Implement `health.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 6: Wire up in `app.module.ts` (full file replacement)**

```typescript
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/config.schema';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.refresh_token',
              '*.password_hash',
              '*.token_hash',
            ],
            censor: '[REDACTED]',
          },
          customProps: (req) => ({
            request_id: (req as { id?: string }).id,
          }),
          serializers: {
            req: (req) => ({ method: req.method, url: req.url, request_id: req.id }),
            res: (res) => ({ status_code: res.statusCode }),
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    HealthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Run e2e test**

```bash
pnpm --filter @keyloop/api test:e2e health.e2e-spec.ts
```

Expected: passing.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(api): add liveness and readiness health endpoints"
```

---

## Task 9: Helmet security headers + CORS

**Files:**
- Modify: `packages/api/src/main.ts`
- Test: `packages/api/test/e2e/security-headers.e2e-spec.ts`

Reference: design doc Section 7.8.

- [ ] **Step 1: Install Helmet**

```bash
pnpm --filter @keyloop/api add helmet
```

- [ ] **Step 2: Write failing e2e test `security-headers.e2e-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from '@app/app.module';

describe('Security headers (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.use(helmet());
    await app.init();
  });

  afterAll(async () => app.close());

  it('responds with X-Frame-Options DENY', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('responds with X-Content-Type-Options nosniff', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('responds with Strict-Transport-Security max-age', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm --filter @keyloop/api test:e2e security-headers.e2e-spec.ts
```

Expected: header expectations fail.

- [ ] **Step 4: Update `main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config/config.schema';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService) as ConfigService<AppConfig, true>;

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      noSniff: true,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.enableCors({
    origin: config.get('CORS_ALLOWED_ORIGINS').split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match', 'X-Request-Id'],
    exposedHeaders: ['ETag', 'X-Request-Id', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86_400,
  });

  const port = config.get('PORT');
  await app.listen(port);
  app.get(Logger).log(`API listening on http://localhost:${port}`);
}

void bootstrap();
```

- [ ] **Step 5: Run test to verify pass**

```bash
pnpm --filter @keyloop/api test:e2e security-headers.e2e-spec.ts
```

Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(api): add helmet security headers and CORS config"
```

---

## Task 10: Problem+json exception filter

**Files:**
- Create: `packages/api/src/shared/filters/problem-details.filter.ts`
- Modify: `packages/api/src/main.ts`
- Test: `packages/api/src/shared/filters/problem-details.filter.spec.ts`

Reference: design doc Section 5.2.

- [ ] **Step 1: Write failing unit test `problem-details.filter.spec.ts`**

```typescript
import { ProblemDetailsFilter } from './problem-details.filter';
import { ArgumentsHost, BadRequestException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';

function makeHost(req: any = { id: 'rid-1', url: '/test' }): ArgumentsHost {
  const response = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => req,
    }),
    __response: response,
  } as unknown as ArgumentsHost & { __response: typeof response };
}

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();

  it('shapes a BadRequestException as RFC 7807', () => {
    const host = makeHost();
    filter.catch(new BadRequestException({ code: 'INVALID_INPUT', message: 'bad' }), host);
    const res = (host as any).__response;
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe(400);
    expect(body.code).toBe('INVALID_INPUT');
    expect(body.request_id).toBe('rid-1');
    expect(body.instance).toBe('/test');
  });

  it('shapes a ConflictException with conflictingResource', () => {
    const host = makeHost();
    filter.catch(new ConflictException({ code: 'BAY_UNAVAILABLE', conflictingResource: 'bay' }), host);
    const body = (host as any).__response.json.mock.calls[0][0];
    expect(body.status).toBe(409);
    expect(body.code).toBe('BAY_UNAVAILABLE');
    expect(body.conflictingResource).toBe('bay');
  });

  it('shapes a generic Error as 500', () => {
    const host = makeHost();
    filter.catch(new Error('boom'), host);
    const res = (host as any).__response;
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @keyloop/api test src/shared/filters/problem-details.filter.spec.ts
```

Expected: file does not exist failure.

- [ ] **Step 3: Implement `problem-details.filter.ts`**

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance: string;
  request_id?: string;
  timestamp: string;
  [extra: string]: unknown;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const requestId = (request?.id as string | undefined) ?? undefined;
    const instance = (request?.url as string | undefined) ?? '';

    const { status, problem } = this.toProblem(exception, instance, requestId);

    if (status >= 500) {
      this.logger.error({ err: exception, request_id: requestId }, 'unhandled.exception');
    }

    response.status(status);
    response.setHeader('Content-Type', 'application/problem+json');
    response.json(problem);
  }

  private toProblem(exception: unknown, instance: string, requestId?: string): { status: number; problem: ProblemDetails } {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const detail = typeof raw === 'string' ? raw : (raw as Record<string, unknown>).message as string | undefined;
      const code = (typeof raw === 'object' && (raw as Record<string, unknown>).code) as string ?? this.codeForStatus(status);
      const extras: Record<string, unknown> = typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
      delete extras['statusCode'];
      delete extras['error'];
      delete extras['message'];
      delete extras['code'];

      return {
        status,
        problem: {
          type: `https://api.scheduler.local/problems/${code.toLowerCase()}`,
          title: this.titleForStatus(status),
          status,
          code,
          detail,
          instance,
          request_id: requestId,
          timestamp,
          ...extras,
        },
      };
    }

    return {
      status: 500,
      problem: {
        type: 'https://api.scheduler.local/problems/internal-error',
        title: 'Internal Server Error',
        status: 500,
        code: 'INTERNAL_ERROR',
        instance,
        request_id: requestId,
        timestamp,
      },
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST: return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED: return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN: return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND: return 'NOT_FOUND';
      case HttpStatus.CONFLICT: return 'CONFLICT';
      case HttpStatus.PRECONDITION_FAILED: return 'PRECONDITION_FAILED';
      case HttpStatus.LOCKED: return 'LOCKED';
      case HttpStatus.TOO_MANY_REQUESTS: return 'RATE_LIMIT_EXCEEDED';
      default: return 'ERROR';
    }
  }

  private titleForStatus(status: number): string {
    if (status >= 500) return 'Internal Server Error';
    if (status === 400) return 'Bad Request';
    if (status === 401) return 'Unauthorized';
    if (status === 403) return 'Forbidden';
    if (status === 404) return 'Not Found';
    if (status === 409) return 'Conflict';
    if (status === 412) return 'Precondition Failed';
    if (status === 423) return 'Locked';
    if (status === 429) return 'Too Many Requests';
    return 'Error';
  }
}
```

- [ ] **Step 4: Run unit test**

```bash
pnpm --filter @keyloop/api test src/shared/filters/problem-details.filter.spec.ts
```

Expected: 3 passing.

- [ ] **Step 5: Wire up globally in `main.ts`**

Add inside `bootstrap()` after CORS:

```typescript
import { ProblemDetailsFilter } from './shared/filters/problem-details.filter';

// ... after app.enableCors(...)
app.useGlobalFilters(new ProblemDetailsFilter());
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(api): add RFC 7807 problem+json global exception filter"
```

---

## Task 11: Correlation-ID middleware

**Files:**
- Create: `packages/api/src/shared/middleware/request-id.middleware.ts`
- Create: `packages/api/src/shared/async-context/request-context.ts`
- Modify: `packages/api/src/app.module.ts`
- Test: `packages/api/test/e2e/request-id.e2e-spec.ts`

Reference: design doc Section 10.4.

- [ ] **Step 1: Install ulid**

```bash
pnpm --filter @keyloop/api add ulid
```

- [ ] **Step 2: Write failing test `request-id.e2e-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { INestApplication, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from '@app/app.module';

describe('Request ID (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterAll(async () => app.close());

  it('generates X-Request-Id when not provided', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('honors incoming X-Request-Id', async () => {
    const incoming = '01HQXY1234567890ABCDEFGHJK';
    const res = await request(app.getHttpServer()).get('/health/liveness').set('X-Request-Id', incoming);
    expect(res.headers['x-request-id']).toBe(incoming);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm --filter @keyloop/api test:e2e request-id.e2e-spec.ts
```

Expected: header undefined / mismatch.

- [ ] **Step 4: Implement `request-context.ts`**

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getCurrentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
```

- [ ] **Step 5: Implement `request-id.middleware.ts`**

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ulid } from 'ulid';
import { requestContext } from '../async-context/request-context';

const HEADER = 'x-request-id';
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(HEADER);
    const id = incoming && ULID_RE.test(incoming) ? incoming : ulid();
    (req as Request & { id: string }).id = id;
    res.setHeader('X-Request-Id', id);
    requestContext.run({ requestId: id }, () => next());
  }
}
```

- [ ] **Step 6: Wire middleware in `app.module.ts` (full file replacement)**

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/config.schema';
import { HealthModule } from './modules/health/health.module';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.refresh_token',
              '*.password_hash',
              '*.token_hash',
            ],
            censor: '[REDACTED]',
          },
          customProps: (req) => ({
            request_id: (req as { id?: string }).id,
          }),
          serializers: {
            req: (req) => ({ method: req.method, url: req.url, request_id: req.id }),
            res: (res) => ({ status_code: res.statusCode }),
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 7: Run test to verify pass**

```bash
pnpm --filter @keyloop/api test:e2e request-id.e2e-spec.ts
```

Expected: passing.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(api): add correlation-ID middleware with ULID generation"
```

---

## Task 12: Zod validation pipe

**Files:**
- Create: `packages/api/src/shared/pipes/zod-validation.pipe.ts`
- Test: `packages/api/src/shared/pipes/zod-validation.pipe.spec.ts`

- [ ] **Step 1: Write failing unit test `zod-validation.pipe.spec.ts`**

```typescript
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ email: z.string().email(), age: z.number().int().min(0) }).strict();

describe('ZodValidationPipe', () => {
  it('returns parsed value on valid input', () => {
    const pipe = new ZodValidationPipe(schema);
    const out = pipe.transform({ email: 'a@b.c', age: 5 }, { type: 'body' } as any);
    expect(out).toEqual({ email: 'a@b.c', age: 5 });
  });

  it('throws BadRequestException with details on invalid input', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ email: 'not-an-email', age: -1 }, { type: 'body' } as any);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const body = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(body.errors)).toBe(true);
    }
  });

  it('rejects extra fields with .strict() schema', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ email: 'a@b.c', age: 5, extra: 1 }, { type: 'body' } as any)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @keyloop/api test src/shared/pipes/zod-validation.pipe.spec.ts
```

Expected: file missing.

- [ ] **Step 3: Implement `zod-validation.pipe.ts`**

```typescript
import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request body validation failed',
        errors: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      });
    }
    return result.data;
  }
}
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @keyloop/api test src/shared/pipes/zod-validation.pipe.spec.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(api): add ZodValidationPipe with strict schema enforcement"
```

---

## Task 13: TypeORM DataSource (no entities yet)

**Files:**
- Modify: `packages/api/src/app.module.ts`
- Modify: `packages/api/src/modules/health/health.controller.ts` (add DB indicator)
- Test: `packages/api/test/integration/typeorm.int-spec.ts`

Reference: design doc Section 14 (TypeORM choice).

- [ ] **Step 1: Install TypeORM + driver**

```bash
pnpm --filter @keyloop/api add @nestjs/typeorm typeorm pg
```

- [ ] **Step 2: Write failing integration test `typeorm.int-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '@app/app.module';

describe('TypeORM (integration — requires running Postgres)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterAll(async () => app.close());

  it('connects to Postgres successfully', async () => {
    const ds = app.get(DataSource);
    expect(ds.isInitialized).toBe(true);
    const result = await ds.query('SELECT 1 AS one');
    expect(result[0].one).toBe(1);
  });

  it('GET /health/readiness includes db indicator passing', async () => {
    const res = await request(app.getHttpServer()).get('/health/readiness');
    expect(res.status).toBe(200);
    expect(res.body.info?.postgres?.status).toBe('up');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Ensure Docker compose is running first (`docker compose up -d`).

```bash
pnpm --filter @keyloop/api test:int typeorm.int-spec
```

Expected: TypeORM not configured / no DB indicator.

- [ ] **Step 4: Update `app.module.ts` with TypeORM (full file replacement)**

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/config.schema';
import { HealthModule } from './modules/health/health.module';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.refresh_token',
              '*.password_hash',
              '*.token_hash',
            ],
            censor: '[REDACTED]',
          },
          customProps: (req) => ({
            request_id: (req as { id?: string }).id,
          }),
          serializers: {
            req: (req) => ({ method: req.method, url: req.url, request_id: req.id }),
            res: (res) => ({ status_code: res.statusCode }),
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        type: 'postgres' as const,
        url: config.get('DATABASE_URL'),
        entities: [],
        migrations: [],
        synchronize: false,
        logging: config.get('LOG_LEVEL') === 'debug' ? 'all' : ['error', 'warn'],
        cache: false,
      }),
    }),
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 5: Update `health.controller.ts` with DB indicator**

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get('liveness')
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  @Get('readiness')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.pingCheck('postgres', { timeout: 1000 }),
    ]);
  }
}
```

- [ ] **Step 6: Run integration test**

```bash
docker compose up -d postgres redis
pnpm --filter @keyloop/api test:int typeorm.int-spec
```

Expected: 2 passing.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(api): wire TypeORM DataSource and DB readiness probe"
```

---

## Task 14: OpenTelemetry tracing setup (console exporter dev)

**Files:**
- Create: `packages/api/src/tracing.ts`
- Modify: `packages/api/src/main.ts`

Reference: design doc Section 10.3.

- [ ] **Step 1: Install OTel packages**

```bash
pnpm --filter @keyloop/api add \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/sdk-trace-base \
  @opentelemetry/api
```

- [ ] **Step 2: Implement `packages/api/src/tracing.ts`**

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const otlpEndpoint = process.env.OTLP_ENDPOINT?.trim();
const traceExporter = otlpEndpoint
  ? new OTLPTraceExporter({ url: otlpEndpoint })
  : new ConsoleSpanExporter();

export const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'scheduler-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
  }),
  spanProcessor: new SimpleSpanProcessor(traceExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-pino': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().catch((err) => console.error('OTel shutdown error:', err));
});
```

- [ ] **Step 3: Update `main.ts` to load tracing first**

```typescript
import './tracing';   // ⚠️ MUST be the first import
import { NestFactory } from '@nestjs/core';
// ... rest unchanged
```

- [ ] **Step 4: Smoke-test span emission**

```bash
docker compose up -d postgres redis
cd packages/api
DATABASE_URL='postgresql://scheduler_app:app@localhost:5432/scheduler' \
DATABASE_URL_MIGRATIONS='postgresql://scheduler_owner:owner@localhost:5432/scheduler' \
REDIS_URL='redis://localhost:6379' \
JWT_ACCESS_SECRET=$(printf 'a%.0s' $(seq 1 32)) \
JWT_REFRESH_SECRET=$(printf 'b%.0s' $(seq 1 32)) \
CORS_ALLOWED_ORIGINS='http://localhost:3000' \
NODE_ENV=development \
LOG_LEVEL=info \
OTLP_ENDPOINT='' \
timeout 10s pnpm dev &
sleep 5
curl -s http://localhost:3001/health/readiness > /dev/null
sleep 2
```

Expected: console contains span output for HTTP request and PG query (printed by ConsoleSpanExporter).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(api): bootstrap OpenTelemetry SDK with console exporter"
```

---

## Task 15: Prometheus metrics endpoint

**Files:**
- Create: `packages/api/src/modules/observability/observability.module.ts`
- Create: `packages/api/src/modules/observability/metrics.service.ts`
- Modify: `packages/api/src/app.module.ts`
- Test: `packages/api/test/e2e/metrics.e2e-spec.ts`

Reference: design doc Section 10.2.

- [ ] **Step 1: Install Prometheus module**

```bash
pnpm --filter @keyloop/api add @willsoto/nestjs-prometheus prom-client
```

- [ ] **Step 2: Write failing test `metrics.e2e-spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from '@app/app.module';

describe('Metrics endpoint (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /metrics returns Prometheus exposition text', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('process_cpu_seconds_total');
    expect(res.text).toContain('nodejs_heap_size_total_bytes');
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm --filter @keyloop/api test:e2e metrics.e2e-spec.ts
```

Expected: 404.

- [ ] **Step 4: Implement `observability.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      defaultLabels: { app: 'scheduler-api' },
    }),
  ],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
```

- [ ] **Step 5: Implement `metrics.service.ts` with placeholder counters**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsService {
  // Phase 1 placeholder — full inventory wired in subsequent phases.
  // Counters/histograms registered here become available across the app.
  // No methods yet — services in later phases inject specific metrics
  // via @InjectMetric() and call .inc()/.observe() directly.
}
```

- [ ] **Step 6: Wire `ObservabilityModule` in `app.module.ts` (full file replacement)**

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/config.schema';
import { HealthModule } from './modules/health/health.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.refresh_token',
              '*.password_hash',
              '*.token_hash',
            ],
            censor: '[REDACTED]',
          },
          customProps: (req) => ({
            request_id: (req as { id?: string }).id,
          }),
          serializers: {
            req: (req) => ({ method: req.method, url: req.url, request_id: req.id }),
            res: (res) => ({ status_code: res.statusCode }),
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        type: 'postgres' as const,
        url: config.get('DATABASE_URL'),
        entities: [],
        migrations: [],
        synchronize: false,
        logging: config.get('LOG_LEVEL') === 'debug' ? 'all' : ['error', 'warn'],
        cache: false,
      }),
    }),
    HealthModule,
    ObservabilityModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 7: Run test**

```bash
pnpm --filter @keyloop/api test:e2e metrics.e2e-spec.ts
```

Expected: 1 passing.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(api): add Prometheus /metrics endpoint with default metrics"
```

---

## Task 16: Jest configurations (unit / integration / e2e)

**Files:**
- Create: `packages/api/jest.config.ts`
- Create: `packages/api/jest.unit.config.ts`
- Create: `packages/api/jest.int.config.ts`
- Create: `packages/api/jest.e2e.config.ts`
- Create: `packages/api/test/setup.ts`

- [ ] **Step 1: Create `jest.config.ts` (default — runs all)**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '\\.(spec|test|int-spec|e2e-spec)\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/tracing.ts'],
  coverageDirectory: 'coverage',
};

export default config;
```

- [ ] **Step 2: Create `jest.unit.config.ts`**

```typescript
import baseConfig from './jest.config';

export default { ...baseConfig, testRegex: '\\.spec\\.ts$' };
```

- [ ] **Step 3: Create `jest.int.config.ts`**

```typescript
import baseConfig from './jest.config';

export default {
  ...baseConfig,
  testRegex: '\\.int-spec\\.ts$',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};
```

- [ ] **Step 4: Create `jest.e2e.config.ts`**

```typescript
import baseConfig from './jest.config';

export default {
  ...baseConfig,
  testRegex: '\\.e2e-spec\\.ts$',
  setupFilesAfterEach: undefined,
  testTimeout: 30_000,
};
```

- [ ] **Step 5: Create `test/setup.ts` (placeholder for Phase 2 Testcontainers)**

```typescript
// Test setup — Testcontainers helpers wired in Task 17.
// This file currently sets sane defaults for env vars when missing.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'b'.repeat(32);
process.env.CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
```

- [ ] **Step 6: Verify all three configs run**

```bash
pnpm --filter @keyloop/api test:unit
pnpm --filter @keyloop/api test:e2e
```

Expected: all currently-existing tests pass with their respective configs.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "test(api): split Jest configs for unit, integration, and e2e"
```

---

## Task 17: Testcontainers Postgres helper

**Files:**
- Create: `packages/api/test/helpers/testcontainers.ts`
- Test: `packages/api/test/integration/testcontainers.int-spec.ts`

Reference: design doc Section 11.9.

- [ ] **Step 1: Install Testcontainers**

```bash
pnpm --filter @keyloop/api add -D @testcontainers/postgresql testcontainers
```

- [ ] **Step 2: Write failing test `testcontainers.int-spec.ts`**

```typescript
import { TestDb } from '@test/helpers/testcontainers';

jest.setTimeout(60_000);

describe('TestDb helper (integration — requires Docker)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = new TestDb();
    await db.start();
  });

  afterAll(async () => db.stop());

  it('starts a Postgres container with required extensions', async () => {
    const result = await db.ownerDs.query(
      "SELECT extname FROM pg_extension WHERE extname IN ('btree_gist','pgcrypto','citext') ORDER BY extname",
    );
    expect(result.map((r: { extname: string }) => r.extname)).toEqual(['btree_gist', 'citext', 'pgcrypto']);
  });

  it('creates scheduler_app role with no BYPASSRLS', async () => {
    const result = await db.ownerDs.query(
      `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('scheduler_owner','scheduler_app') ORDER BY rolname`,
    );
    expect(result.find((r: any) => r.rolname === 'scheduler_app').rolbypassrls).toBe(false);
  });

  it('truncateAll() empties tables (no-op when no tables exist)', async () => {
    await expect(db.truncateAll()).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm --filter @keyloop/api test:int testcontainers.int-spec
```

Expected: helper missing.

- [ ] **Step 4: Implement `test/helpers/testcontainers.ts`**

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

export class TestDb {
  container!: StartedPostgreSqlContainer;
  ownerDs!: DataSource;
  appDs!: DataSource;

  async start(): Promise<void> {
    this.container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('scheduler_test')
      .withUsername('owner')
      .withPassword('owner')
      .start();

    this.ownerDs = await this.connect('owner', 'owner');

    // Install extensions (mirrors db/init/01-extensions.sql)
    await this.ownerDs.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await this.ownerDs.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await this.ownerDs.query('CREATE EXTENSION IF NOT EXISTS citext');

    // Create scheduler_app role with no BYPASSRLS
    await this.ownerDs.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scheduler_app') THEN
          CREATE ROLE scheduler_app LOGIN PASSWORD 'app';
        END IF;
      END $$;
    `);
    await this.ownerDs.query('GRANT USAGE ON SCHEMA public TO scheduler_app');

    this.appDs = await this.connect('scheduler_app', 'app');
  }

  async truncateAll(): Promise<void> {
    const tables = await this.ownerDs.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (tables.length === 0) return;
    const names = tables.map((t: { tablename: string }) => `"${t.tablename}"`).join(',');
    await this.ownerDs.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  }

  async stop(): Promise<void> {
    await this.appDs?.destroy();
    await this.ownerDs?.destroy();
    await this.container?.stop();
  }

  private async connect(username: string, password: string): Promise<DataSource> {
    return new DataSource({
      type: 'postgres',
      host: this.container.getHost(),
      port: this.container.getPort(),
      username,
      password,
      database: this.container.getDatabase(),
      entities: [],
      synchronize: false,
      logging: false,
    }).initialize();
  }
}
```

- [ ] **Step 5: Run test**

```bash
pnpm --filter @keyloop/api test:int testcontainers.int-spec
```

Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "test(api): add Testcontainers helper with extensions and app role"
```

---

## Task 18: ESLint + Prettier for the API package

**Files:**
- Create: `packages/api/.eslintrc.cjs`
- Create: `packages/api/.prettierrc.json`

- [ ] **Step 1: Create `.eslintrc.cjs`**

```javascript
module.exports = {
  root: false,
  parser: '@typescript-eslint/parser',
  parserOptions: { project: './tsconfig.json', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:@typescript-eslint/strict',
    'prettier',
  ],
  env: { node: true, jest: true },
  ignorePatterns: ['dist', 'coverage', '.eslintrc.cjs', 'jest*.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    'prettier/prettier': 'error',
  },
};
```

- [ ] **Step 2: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 110,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 3: Run lint**

```bash
pnpm --filter @keyloop/api lint
```

Expected: passes (or only flags items already present — fix any genuine issues immediately, no warnings allowed because `--max-warnings 0`).

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore(api): add ESLint strict + Prettier config"
```

---

## Task 19: ESLint config for the web package

**Files:**
- Create: `packages/web/.eslintrc.json`

- [ ] **Step 1: Create `.eslintrc.json`**

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

- [ ] **Step 2: Run lint**

```bash
pnpm --filter @keyloop/web lint
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore(web): add ESLint config"
```

---

## Task 20: Observability stack Compose profile

**Files:**
- Create: `docker-compose.observability.yml`
- Create: `packages/api/otel-collector.yaml`
- Create: `packages/api/prometheus.yml`

Reference: design doc Section 10.7.

- [ ] **Step 1: Create `docker-compose.observability.yml`**

```yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.95.0
    container_name: keyloop-otel-collector
    command: ['--config=/etc/otelcol/config.yaml']
    volumes:
      - ./packages/api/otel-collector.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - '4318:4318'   # OTLP HTTP
    profiles: ['observability']

  jaeger:
    image: jaegertracing/all-in-one:1.55
    container_name: keyloop-jaeger
    environment:
      COLLECTOR_OTLP_ENABLED: 'true'
    ports:
      - '16686:16686'
    profiles: ['observability']

  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: keyloop-prometheus
    volumes:
      - ./packages/api/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports:
      - '9090:9090'
    profiles: ['observability']
```

- [ ] **Step 2: Create `packages/api/otel-collector.yaml`**

```yaml
receivers:
  otlp:
    protocols:
      http: { endpoint: '0.0.0.0:4318' }

exporters:
  otlp/jaeger:
    endpoint: 'jaeger:4317'
    tls: { insecure: true }
  debug: {}

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlp/jaeger, debug]
```

- [ ] **Step 3: Create `packages/api/prometheus.yml`**

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'scheduler-api'
    metrics_path: /metrics
    static_configs:
      - targets: ['host.docker.internal:3001']
```

- [ ] **Step 4: Smoke-test (optional, requires Docker on host)**

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability up -d
sleep 5
curl -fsS http://localhost:9090/-/healthy
curl -fsS http://localhost:16686 -o /dev/null
```

Expected: Prometheus healthy; Jaeger UI reachable.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore(infra): add observability profile with OTel collector, Jaeger, Prometheus"
```

---

## Task 21: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  api:
    name: API — lint, typecheck, test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: scheduler_owner
          POSTGRES_PASSWORD: owner
          POSTGRES_DB: scheduler
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U scheduler_owner -d scheduler"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    defaults: { run: { working-directory: packages/api } }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
        working-directory: ./
      - name: Initialize Postgres extensions and roles
        run: |
          PGPASSWORD=owner psql -h localhost -U scheduler_owner -d scheduler -f db/init/01-extensions.sql
          PGPASSWORD=owner psql -h localhost -U scheduler_owner -d scheduler -f db/init/02-roles.sql
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:unit
      - run: pnpm test:int
      - run: pnpm test:e2e
      - run: pnpm build

  web:
    name: Web — lint, typecheck, build
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: packages/web } }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
        working-directory: ./
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "ci: add GitHub Actions workflow for API and web packages"
```

---

## Task 22: ADR template + ADR-0001

**Files:**
- Create: `docs/adrs/template.md`
- Create: `docs/adrs/0001-record-architecture-decisions.md`

- [ ] **Step 1: Create `docs/adrs/template.md`**

```markdown
# ADR-NNNN — <Title>

**Status:** Proposed | Accepted | Superseded by ADR-XXXX
**Date:** YYYY-MM-DD

## Context
<Why are we deciding this? What forces are at play?>

## Decision
<What did we decide? Be specific.>

## Consequences
<What becomes easier? Harder? What follow-on work is implied?>
```

- [ ] **Step 2: Create `docs/adrs/0001-record-architecture-decisions.md`**

```markdown
# ADR-0001 — Record architecture decisions

**Status:** Accepted
**Date:** 2026-04-28

## Context

We are building a non-trivial multi-tenant booking system with several
non-obvious technical choices (EXCLUDE constraints over SERIALIZABLE
transactions, RLS over application-layer tenant scoping, Luxon for DST,
etc.). Without a record of *why* we chose each pattern, future engineers
will either repeat the original investigation or make changes that
violate the original intent.

## Decision

We adopt Architecture Decision Records (ADRs) following Michael Nygard's
template. ADRs live under `docs/adrs/`, are sequentially numbered, and
each captures: Context, Decision, and Consequences. ADRs are
markdown-only and reviewed as part of the regular pull-request process.

## Consequences

- Every non-obvious technical choice gets a one-page document.
- Reviewers can trace the rationale behind any decision without spelunking
  through commit history.
- Onboarding becomes faster: new contributors read ADRs before changing
  load-bearing code.
- Cost: ~30 minutes of writing per major decision. Acceptable.
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "docs: introduce ADR template and ADR-0001"
```

---

## Task 23: End-to-end smoke verification

- [ ] **Step 1: Boot the full stack**

```bash
docker compose up -d postgres redis
pnpm install
pnpm --filter @keyloop/api build
pnpm --filter @keyloop/web build
```

Expected: every step succeeds.

- [ ] **Step 2: Run all API tests**

```bash
pnpm --filter @keyloop/api test:unit
pnpm --filter @keyloop/api test:int
pnpm --filter @keyloop/api test:e2e
```

Expected: all green.

- [ ] **Step 3: Boot API in development mode**

```bash
cd packages/api
DATABASE_URL='postgresql://scheduler_app:app@localhost:5432/scheduler' \
DATABASE_URL_MIGRATIONS='postgresql://scheduler_owner:owner@localhost:5432/scheduler' \
REDIS_URL='redis://localhost:6379' \
JWT_ACCESS_SECRET=$(printf 'a%.0s' $(seq 1 32)) \
JWT_REFRESH_SECRET=$(printf 'b%.0s' $(seq 1 32)) \
CORS_ALLOWED_ORIGINS='http://localhost:3000' \
NODE_ENV=development \
LOG_LEVEL=info \
pnpm dev &
API_PID=$!
sleep 6

curl -fsS http://localhost:3001/health/liveness
echo
curl -fsS http://localhost:3001/health/readiness
echo
curl -fsS http://localhost:3001/metrics | head -5
echo
curl -fsS -i http://localhost:3001/health/liveness | grep -i 'x-request-id\|x-frame-options\|strict-transport'

kill $API_PID
```

Expected:
- liveness/readiness return JSON with `status: ok`.
- /metrics returns Prometheus format starting with `# HELP`.
- Response headers contain `X-Request-Id`, `X-Frame-Options: DENY`, `Strict-Transport-Security`.

- [ ] **Step 4: Boot web and verify home page**

```bash
cd packages/web
pnpm dev &
WEB_PID=$!
sleep 8
curl -fsS http://localhost:3000 | grep -q "Keyloop Scheduler"
kill $WEB_PID
```

Expected: response contains "Keyloop Scheduler".

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: phase 1 foundation complete" --allow-empty
git log --oneline -25
```

Expected: ~25 commits documenting Phase 1, ending with this final commit.

---

## Phase 1 Acceptance Criteria

After Phase 1, the following must be true:

1. `docker compose up -d` starts Postgres 16 with `btree_gist`, `pgcrypto`, `citext` extensions and three roles (`scheduler_owner`, `scheduler_migrator`, `scheduler_app`).
2. `pnpm --filter @keyloop/api dev` boots the API on port 3001 with structured pino logging.
3. `GET /health/liveness` returns 200 with `status: ok`.
4. `GET /health/readiness` returns 200 with `db.postgres.status = up`.
5. `GET /metrics` returns Prometheus exposition.
6. Every response includes `X-Request-Id`, `X-Frame-Options: DENY`, and `Strict-Transport-Security` headers.
7. Unhandled exceptions return RFC 7807 `application/problem+json` shape.
8. ZodValidationPipe is available for use; tested.
9. RequestIdMiddleware honors incoming `X-Request-Id` and generates ULID otherwise.
10. OpenTelemetry SDK initializes with `ConsoleSpanExporter` when `OTLP_ENDPOINT` is empty; emits HTTP and PG spans.
11. Testcontainers `TestDb` helper spins up Postgres with extensions and `scheduler_app` role.
12. `pnpm --filter @keyloop/api test:unit / test:int / test:e2e` all pass.
13. `pnpm --filter @keyloop/web dev` boots Next.js with Tailwind + base shadcn/ui, home page renders.
14. ESLint strict passes for both packages.
15. CI workflow runs API + Web jobs on push and PR.
16. ADR-0001 committed to `docs/adrs/`.
17. Conventional Commits enforced via husky + commitlint.

---

## Self-Review Notes

Reviewed against design doc spec sections:
- **Section 1 (Architecture):** ✅ tasks 3-15 cover NestJS scaffold, controller/service/domain/repository structure (modules created), cross-cuts (logging, metrics, tracing, request-id, problem+json filter, security headers).
- **Section 7.4 (Postgres roles):** ✅ task 5 creates owner/migrator/app roles.
- **Section 7.8 (Security headers + CORS):** ✅ task 9.
- **Section 9.5 (Migration strategy):** N/A this phase — Phase 2 implements migrations.
- **Section 10.1 (pino logging):** ✅ task 7.
- **Section 10.2 (Prometheus):** ✅ task 15.
- **Section 10.3 (OTel tracing):** ✅ task 14.
- **Section 10.4 (Correlation ID):** ✅ task 11.
- **Section 10.5 (Health):** ✅ tasks 8 and 13.
- **Section 13 (Project structure):** ✅ all tasks contribute to expected layout.
- **Section 14 (Tech choices):** ✅ stack pinned in package.json files.

Spec coverage gaps not in Phase 1 (intentional — deferred to later phases): all entities, RLS policies, EXCLUDE constraints, JWT auth, idempotency cache, rate limiter, optimistic locking, outbox, GDPR, k6, FE pages.

Type/symbol consistency check: `AppConfig`, `RequestContext`, `requestContext`, `ProblemDetailsFilter`, `ZodValidationPipe`, `RequestIdMiddleware`, `TestDb` referenced consistently across tasks. Method signatures match.

No placeholders, TBDs, or "implement later" comments found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-phase-1-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Pick approach to begin Phase 1 implementation.
