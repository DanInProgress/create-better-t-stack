# Guide 2: Backend Scaffolding & Build Pipeline

## Quick Reference

**Audience**: Backend/tooling developer
**Dependencies**: Guide 1 (Type System & CLI) must be complete
**Estimated time**: 2-3 days
**Purpose**: Implement hooks development, build pipeline, binary management, and setup helpers

---

## Executive Summary

This guide covers the backend implementation for PocketBase integration. Unlike traditional backends, PocketBase has unique characteristics:

- No separate database/ORM (self-contained SQLite)
- Binary includes runtime (no separate server process)
- Deployment choice affects scaffolding (PocketHost vs self-hosted)
- Hooks require transpilation (TypeScript → Goja-compatible JavaScript)

You will implement:

1. Setup helper functions that scaffold the backend directory structure
2. Binary download and OS/arch detection for self-hosted deployments
3. Build pipeline (esbuild configuration)
4. Type definitions for PocketBase Goja runtime
5. Linting configuration (Biome with Goja constraints)
6. AI assistant guidance (.cursorrules)
7. Routing logic in db-setup.ts

---

## Architecture Decision: ES2020 vs ES5

**Decision**: Use esbuild targeting **ES2020** (not ES5 like Gemini's implementation)

**Why ES2020?**
After research, modern Goja/PocketBase supports most ES2020 features:

- ✅ Arrow functions, classes, const/let, destructuring
- ✅ Template literals, optional chaining, nullish coalescing
- ✅ Spread operator, rest parameters
- ❌ async/await (no event loop in Goja)
- ❌ ES modules in hooks (use CommonJS)

**Build Tool**: esbuild (simpler, faster, actively maintained) instead of tsup (maintenance mode)

**Linting**: Biome with custom rules to prevent async/await and ES modules

**Trade-off**: Writing directly to Goja-compatible JS vs transpilation

- Transpilation adds complexity but allows TypeScript types
- Direct JS authoring is simpler but loses type safety
- Decision: Use TypeScript with esbuild for type safety, rely on Biome to catch incompatibilities

---

## Directory Structure Differences

### Self-Hosted (Full Structure)

```
packages/backend/
├── src/
│   └── main.pb.ts              # TypeScript hooks source
├── pb_hooks/                   # Compiled JavaScript (gitignored)
├── pb_migrations/              # Database migrations
├── pb_data/                    # SQLite DB (gitignored)
├── pb_public/                  # Static assets
├── pocketbase                  # Binary (gitignored, macOS/Linux)
├── pocketbase.exe             # Binary (gitignored, Windows)
├── package.json                # Scripts: dev, build, serve, migrate
├── tsconfig.json               # TypeScript config (ES2020 target)
├── esbuild.config.js          # Build configuration
├── biome.json                  # Linting (Goja constraints)
├── pocketbase.d.ts            # Type definitions
├── .cursorrules               # AI assistant guidance
├── .gitignore                  # Ignores binary, pb_data, pb_hooks
└── README.md                   # Setup instructions
```

### PocketHost (Minimal Structure)

```
packages/backend/
├── src/
│   └── main.pb.ts              # TypeScript hooks source
├── pb_hooks/                   # Compiled (deployed via FTP)
├── pb_migrations/              # Deployed via FTP
├── package.json                # Scripts: build, dev, typecheck
├── tsconfig.json
├── esbuild.config.js
├── biome.json
├── pocketbase.d.ts
├── .cursorrules
├── .gitignore                  # No binary or pb_data
└── README.md                   # PocketHost-specific instructions

.github/workflows/
└── deploy-pockethost.yml       # CI/CD workflow
```

**Key Differences**:

- Self-hosted includes `pocketbase` binary and `pb_data/`, `pb_public/`
- PocketHost omits binary and local data directories
- PocketHost includes GitHub Actions workflow
- README content differs based on deployment choice

---

## Implementation Steps

### Step 1: Create Setup Helper Files

Create two setup helper files in `/apps/cli/src/helpers/database-providers/`:

#### 1.1: pocketbase-self-hosted-setup.ts

```typescript
import { isCancel, log, select, spinner, text } from "@clack/prompts";
import { Result } from "better-result";
import { $ } from "execa";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";

import type { ProjectConfig } from "../../types";

import { addEnvVariablesToFile, type EnvVariable } from "../../utils/env-utils";
import { DatabaseSetupError, UserCancelledError, userCancelled } from "../../utils/errors";

type PocketBaseSetupResult = Result<void, DatabaseSetupError | UserCancelledError>;

const POCKETBASE_GITHUB_RELEASES = "https://github.com/pocketbase/pocketbase/releases";
const LATEST_VERSION = "0.23.4"; // Update this as needed

function getPlatformInfo(): {
  platform: string;
  arch: string;
  extension: string;
  downloadUrl: string;
} {
  const platform = os.platform();
  const arch = os.arch();

  let platformStr = "";
  let archStr = "";
  const extension = platform === "win32" ? "zip" : "zip";

  // Map Node.js platform names to PocketBase naming
  if (platform === "darwin") {
    platformStr = "darwin";
  } else if (platform === "win32") {
    platformStr = "windows";
  } else {
    platformStr = "linux";
  }

  // Map Node.js arch to PocketBase naming
  if (arch === "x64") {
    archStr = "amd64";
  } else if (arch === "arm64") {
    archStr = "arm64";
  } else if (arch === "arm") {
    archStr = "armv7";
  } else {
    archStr = "amd64"; // Default to amd64
  }

  const downloadUrl = `${POCKETBASE_GITHUB_RELEASES}/download/v${LATEST_VERSION}/pocketbase_${LATEST_VERSION}_${platformStr}_${archStr}.${extension}`;

  return { platform: platformStr, arch: archStr, extension, downloadUrl };
}

async function downloadPocketBase(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  const s = spinner();
  const { downloadUrl, platform } = getPlatformInfo();
  const executableName = platform === "windows" ? "pocketbase.exe" : "pocketbase";

  s.start(`Downloading PocketBase v${LATEST_VERSION}...`);

  return Result.tryPromise({
    try: async () => {
      // Download the zip file
      const tempZip = path.join(backendDir, "pocketbase.zip");

      await $`curl -L ${downloadUrl} -o ${tempZip}`;

      s.message("Extracting PocketBase...");

      // Extract the zip file
      await $`unzip -o ${tempZip} -d ${backendDir}`;

      // Make executable (Unix-like systems)
      if (platform !== "windows") {
        await $`chmod +x ${path.join(backendDir, executableName)}`;
      }

      // Clean up zip file
      await fs.unlink(tempZip);

      s.stop(`PocketBase v${LATEST_VERSION} downloaded successfully`);
    },
    catch: (e) => {
      s.stop(pc.red("Failed to download PocketBase"));
      return new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to download PocketBase: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      });
    },
  });
}

async function createDirectoryStructure(
  backendDir: string,
): Promise<Result<void, DatabaseSetupError>> {
  return Result.tryPromise({
    try: async () => {
      const directories = [
        path.join(backendDir, "src"),
        path.join(backendDir, "pb_hooks"),
        path.join(backendDir, "pb_migrations"),
        path.join(backendDir, "pb_data"),
        path.join(backendDir, "pb_public"),
      ];

      for (const dir of directories) {
        await fs.mkdir(dir, { recursive: true });
      }

      // Create .gitignore in backend directory
      const gitignoreContent = `# PocketBase
pocketbase
pocketbase.exe
pb_hooks/*
!pb_hooks/.gitkeep
pb_data/*
!pb_data/.gitkeep

# Logs
*.log

# Environment variables
.env
.env.local
`;

      await fs.writeFile(path.join(backendDir, ".gitignore"), gitignoreContent);

      // Create .gitkeep files
      await fs.writeFile(path.join(backendDir, "pb_data", ".gitkeep"), "");
      await fs.writeFile(path.join(backendDir, "pb_migrations", ".gitkeep"), "");
      await fs.writeFile(path.join(backendDir, "pb_hooks", ".gitkeep"), "");

      log.success("Created PocketBase directory structure");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create directory structure: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

async function createConfigFiles(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  return Result.tryPromise({
    try: async () => {
      // package.json
      const packageJson = {
        name: "@repo/backend",
        version: "0.0.0",
        private: true,
        scripts: {
          dev: "node esbuild.config.js --watch & ./pocketbase serve",
          build: "node esbuild.config.js",
          serve: "./pocketbase serve",
          migrate: "./pocketbase migrate",
          "admin:create": "./pocketbase admin create",
          "admin:update": "./pocketbase admin update",
          typecheck: "tsc --noEmit",
        },
        devDependencies: {
          "@biomejs/biome": "^1.9.4",
          esbuild: "^0.24.0",
          typescript: "^5.7.2",
        },
      };

      await fs.writeFile(
        path.join(backendDir, "package.json"),
        JSON.stringify(packageJson, null, 2) + "\n",
      );

      // tsconfig.json
      const tsconfig = {
        compilerOptions: {
          target: "ES2020",
          module: "CommonJS",
          moduleResolution: "Node",
          esModuleInterop: true,
          strict: true,
          lib: ["ES2020"],
          outDir: "pb_hooks",
          baseUrl: ".",
          skipLibCheck: true,
          paths: {
            "*": ["node_modules/*"],
          },
        },
        include: ["src/**/*", "pocketbase.d.ts"],
      };

      await fs.writeFile(
        path.join(backendDir, "tsconfig.json"),
        JSON.stringify(tsconfig, null, 2) + "\n",
      );

      // esbuild.config.js
      const esbuildConfig = `const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ['src/main.pb.ts'],
    outdir: 'pb_hooks',
    bundle: false,
    format: 'cjs',
    target: 'es2020',
    platform: 'neutral',
    logLevel: 'info',
  });

  if (isWatch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

build().catch(() => process.exit(1));
`;

      await fs.writeFile(path.join(backendDir, "esbuild.config.js"), esbuildConfig);

      // biome.json
      const biomeConfig = {
        $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
        organizeImports: {
          enabled: true,
        },
        linter: {
          enabled: true,
          rules: {
            recommended: true,
            suspicious: {
              noAsyncPromiseExecutor: "error",
              noAsyncWithoutAwait: "off",
            },
            correctness: {
              noUnusedVariables: "warn",
            },
          },
        },
        formatter: {
          enabled: true,
          indentStyle: "space",
          indentWidth: 2,
        },
        javascript: {
          formatter: {
            quoteStyle: "double",
            semicolons: "always",
          },
        },
      };

      await fs.writeFile(
        path.join(backendDir, "biome.json"),
        JSON.stringify(biomeConfig, null, 2) + "\n",
      );

      log.success("Created configuration files");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create config files: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

async function createTypeDefinitions(
  backendDir: string,
): Promise<Result<void, DatabaseSetupError>> {
  const typeDefinitions = `/// <reference no-default-lib="true"/>
/// <reference lib="es2020" />

// PocketBase JSVM type definitions
// Based on PocketBase documentation and Goja runtime constraints
// Target: ES2020 (no async/await, no ES modules)

declare namespace pb {
  interface App {
    dao(): Dao;
    settings(): Settings;
    newMailClient(): MailerMessage;
    subscriptionsBroker(): SubscriptionsBroker;
  }

  interface Dao {
    findRecordById(collection: string, id: string, ...filters: string[]): Record;
    findRecordsByIds(collection: string, ids: string[], ...filters: string[]): Record[];
    findFirstRecordByData(collection: string, key: string, value: any): Record;
    findRecordsByFilter(
      collection: string,
      filter: string,
      sort: string,
      limit: number,
      offset: number,
      ...params: any[]
    ): Record[];
    findFirstRecordByFilter(collection: string, filter: string, ...params: any[]): Record;
    isRecordValueUnique(collection: string, key: string, value: any, excludeId?: string): boolean;
    saveRecord(record: Record): void;
    deleteRecord(record: Record): void;
    expandRecord(record: Record, expands: string[], ...fetch: string[]): void;
    expandRecords(records: Record[], expands: string[], ...fetch: string[]): void;
  }

  interface Record {
    id: string;
    created: string;
    updated: string;
    collectionId: string;
    collectionName: string;
    get(key: string): any;
    set(key: string, value: any): void;
    getBool(key: string): boolean;
    getString(key: string): string;
    getInt(key: string): number;
    getFloat(key: string): number;
    getDateTime(key: string): string;
    getStringSlice(key: string): string[];
  }

  interface Context {
    json(status: number, data: any): void;
    html(status: number, html: string): void;
    string(status: number, message: string): void;
    redirect(status: number, url: string): void;
    noContent(status: number): void;
    get(key: string): any;
    set(key: string, value: any): void;
    request(): Request;
    response(): Response;
  }

  interface Request {
    method: string;
    url: string;
    header: Record<string, string>;
    body: string;
    queryParam(key: string): string;
    formValue(key: string): string;
    pathParam(key: string): string;
  }

  interface Response {
    header: Record<string, string>;
    statusCode: number;
  }

  interface Event {
    httpContext: Context;
    record?: Record;
    user?: Record;
    admin?: Record;
  }

  interface MailerMessage {
    from(address: string, name?: string): MailerMessage;
    to(address: string): MailerMessage;
    bcc(address: string): MailerMessage;
    cc(address: string): MailerMessage;
    subject(text: string): MailerMessage;
    html(content: string): MailerMessage;
    text(content: string): MailerMessage;
    send(): void;
  }

  interface Settings {
    meta: MetaConfig;
    logs: LogsConfig;
    smtp: SmtpConfig;
    s3: S3Config;
    backups: BackupsConfig;
    adminAuthToken: AdminAuthToken;
  }

  interface MetaConfig {
    appName: string;
    appUrl: string;
    hideControls: boolean;
  }

  interface LogsConfig {
    maxDays: number;
  }

  interface SmtpConfig {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    password: string;
    tls: boolean;
  }

  interface S3Config {
    enabled: boolean;
    bucket: string;
    region: string;
    endpoint: string;
    accessKey: string;
    secret: string;
    forcePathStyle: boolean;
  }

  interface BackupsConfig {
    cron: string;
    cronMaxKeep: number;
  }

  interface AdminAuthToken {
    duration: number;
  }

  interface SubscriptionsBroker {
    clients(): any[];
  }
}

// PocketBase globals
declare const $app: pb.App;
declare const $os: any;
declare const $http: any;
declare const $security: any;
declare const $apis: any;

// Hook functions
declare function routerAdd(method: string, path: string, handler: (c: pb.Context) => any, ...middleware: any[]): void;
declare function routerUse(...middleware: any[]): void;

// Record lifecycle hooks
declare function onRecordBeforeCreateRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;
declare function onRecordAfterCreateRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;
declare function onRecordBeforeUpdateRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;
declare function onRecordAfterUpdateRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;
declare function onRecordBeforeDeleteRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;
declare function onRecordAfterDeleteRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;

// Auth hooks
declare function onRecordBeforeAuthRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;
declare function onRecordAfterAuthRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;

// View hooks
declare function onRecordViewRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;
declare function onRecordsListRequest(handler: (e: pb.Event) => any, ...collections: string[]): void;

// Errors
declare class BadRequestError extends Error {
  constructor(message?: string, data?: any);
}

declare class NotFoundError extends Error {
  constructor(message?: string, data?: any);
}

declare class ForbiddenError extends Error {
  constructor(message?: string, data?: any);
}

declare class UnauthorizedError extends Error {
  constructor(message?: string, data?: any);
}
`;

  return Result.tryPromise({
    try: async () => {
      await fs.writeFile(path.join(backendDir, "pocketbase.d.ts"), typeDefinitions);
      log.success("Created type definitions");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create type definitions: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

async function createCursorRules(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  const cursorRules = `# PocketBase AI Development Rules

You are an expert PocketBase developer. You understand the unique constraints and capabilities of the PocketBase runtime environment.

## Core Constraints

1.  **Environment**: You are running in a Goja environment (pure Go implementation of ECMAScript). This is NOT Node.js.
2.  **Syntax**: Write ES2020-compatible code. The code is transpiled with esbuild targeting ES2020.
3.  **NO async/await**: The Goja runtime is synchronous. Do NOT use \`async\`, \`await\`, or \`Promise\` for PocketBase API calls. All PocketBase operations are synchronous.
4.  **NO ES modules**: Use CommonJS (\`require\`, \`module.exports\`). Do NOT use \`import\`/\`export\` in hooks.
5.  **No Node.js Modules**: You cannot import Node.js built-ins like \`fs\`, \`path\`, or \`http\`. Use PocketBase globals instead.

## PocketBase Globals

-   \`$app\`: The main app instance. Use this to access DAO, mailing, settings, etc.
-   \`$os\`: File system operations.
-   \`$http\`: Making HTTP requests.
-   \`$security\`: Cryptographic functions.
-   \`$apis\`: Helper for API responses.

## Writing Hooks

-   **File Location**: Hooks must be placed in \`src/*.pb.ts\` (TypeScript source) and compiled to \`pb_hooks/*.pb.js\`.
-   **Routing**: Use \`routerAdd("METHOD", "/path", (c) => { ... })\`.
-   **Data Access**: Use \`$app.dao().find...\` for database operations. Remember these are synchronous!
-   **Error Handling**: Throw \`BadRequestError\`, \`NotFoundError\`, \`ForbiddenError\`, or \`UnauthorizedError\`.

## Example Hooks

\`\`\`typescript
/// <reference path="../pocketbase.d.ts" />

// Custom API route
routerAdd("GET", "/api/hello", (c) => {
  return c.json(200, { message: "Hello from PocketBase!" });
});

// Before create hook
onRecordBeforeCreateRequest((e) => {
  const admin = e.httpContext.get("admin");
  if (!admin) {
    throw new ForbiddenError("Only admins can create this record");
  }

  // Set default values
  e.record.set("status", "pending");
  e.record.set("createdBy", admin.id);
}, "posts");

// After update hook
onRecordAfterUpdateRequest((e) => {
  const record = e.record;
  console.log("Record updated:", record.id);

  // Send notification (synchronous)
  const mailer = $app.newMailClient();
  mailer
    .from("noreply@example.com", "App Notifications")
    .to(record.getString("email"))
    .subject("Your post was updated")
    .html("<p>Your post has been updated successfully.</p>")
    .send();
}, "posts");

// Auth hook
onRecordAfterAuthRequest((e) => {
  console.log("User authenticated:", e.record.getString("email"));
}, "users");
\`\`\`

## Common Patterns

### Query records
\`\`\`typescript
// Find by ID
const record = $app.dao().findRecordById("posts", id);

// Find by filter
const records = $app.dao().findRecordsByFilter(
  "posts",
  "status = 'published' && author = {:author}",
  "-created",
  20,
  0,
  { author: authorId }
);

// Find first matching
const post = $app.dao().findFirstRecordByFilter(
  "posts",
  "slug = {:slug}",
  { slug: "hello-world" }
);
\`\`\`

### Update records
\`\`\`typescript
const record = $app.dao().findRecordById("posts", id);
record.set("title", "Updated Title");
record.set("status", "published");
$app.dao().saveRecord(record);
\`\`\`

### Validation
\`\`\`typescript
onRecordBeforeCreateRequest((e) => {
  const email = e.record.getString("email");

  // Check uniqueness
  const isUnique = $app.dao().isRecordValueUnique(
    "users",
    "email",
    email
  );

  if (!isUnique) {
    throw new BadRequestError("Email already exists");
  }
}, "users");
\`\`\`

## Debugging

- Use \`console.log()\` for debugging - logs appear in PocketBase console
- Check the PocketBase admin panel for error logs
- Test hooks locally before deploying

## Deployment

- Self-hosted: Hooks are loaded from \`pb_hooks/\` directory
- PocketHost: Hooks are deployed via FTP to PocketHost instance

## Remember

- All PocketBase operations are synchronous
- No async/await, no Promises
- No ES modules (import/export)
- Use PocketBase globals (\`$app\`, \`$os\`, \`$http\`, etc.)
- Refer to \`pocketbase.d.ts\` for type definitions
`;

  return Result.tryPromise({
    try: async () => {
      await fs.writeFile(path.join(backendDir, ".cursorrules"), cursorRules);
      log.success("Created AI assistant guidance");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create .cursorrules: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

async function createExampleHook(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  const exampleHook = `/// <reference path="../pocketbase.d.ts" />

// Example: Custom API route
routerAdd("GET", "/api/hello", (c) => {
  return c.json(200, {
    message: "Hello from PocketBase!",
    timestamp: new Date().toISOString()
  });
});

// Example: Before create hook
onRecordBeforeCreateRequest((e) => {
  // Set default values
  e.record.set("status", "pending");
  e.record.set("createdAt", new Date().toISOString());

  console.log("New record being created:", e.record.collectionName);
}, "users");

// Example: After update hook
onRecordAfterUpdateRequest((e) => {
  const record = e.record;
  console.log("Record updated:", {
    id: record.id,
    collection: record.collectionName,
  });
}, "users");
`;

  return Result.tryPromise({
    try: async () => {
      await fs.writeFile(path.join(backendDir, "src", "main.pb.ts"), exampleHook);
      log.success("Created example hook");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create example hook: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

async function createReadme(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  const readmeContent = `# PocketBase Backend

This directory contains your PocketBase backend instance.

## Directory Structure

- \`src/\` - TypeScript hooks source files
- \`pb_hooks/\` - Compiled JavaScript hooks (gitignored)
- \`pb_data/\` - SQLite database and file storage (gitignored)
- \`pb_migrations/\` - Database migration files
- \`pb_public/\` - Static files served at the root URL
- \`pocketbase\` - PocketBase executable (gitignored)

## Getting Started

### Development

Start the development server (watches for changes and rebuilds hooks):

\`\`\`bash
bun run dev
# or
npm run dev
\`\`\`

This will:
1. Watch for changes in \`src/\` and rebuild hooks automatically
2. Start PocketBase at http://127.0.0.1:8090

### Build Hooks

Compile TypeScript hooks to JavaScript:

\`\`\`bash
bun run build
# or
npm run build
\`\`\`

### Start Server

Start PocketBase server without rebuilding hooks:

\`\`\`bash
bun run serve
# or
npm run serve
\`\`\`

### Admin Dashboard

Access the admin dashboard at http://127.0.0.1:8090/_/

On first run, you'll be prompted to create an admin account, or use:

\`\`\`bash
bun run admin:create
# or
npm run admin:create
\`\`\`

## Environment Variables

The following environment variables are available:

- \`POCKETBASE_URL\` - The URL of your PocketBase instance (default: http://127.0.0.1:8090)
- \`PB_ENCRYPTION_KEY\` - Optional 32-character encryption key for sensitive data

## Writing Hooks

Hooks are written in TypeScript in the \`src/\` directory and compiled to JavaScript in \`pb_hooks/\`.

### Important Constraints

1. **No async/await**: PocketBase uses Goja (synchronous JavaScript runtime)
2. **No ES modules**: Use CommonJS (no import/export)
3. **ES2020 syntax**: Modern JavaScript features are supported (arrow functions, optional chaining, etc.)

See \`.cursorrules\` for detailed guidance on writing PocketBase hooks.

### Example Hook

\`\`\`typescript
/// <reference path="../pocketbase.d.ts" />

routerAdd("GET", "/api/hello", (c) => {
  return c.json(200, { message: "Hello!" });
});

onRecordBeforeCreateRequest((e) => {
  e.record.set("status", "pending");
}, "posts");
\`\`\`

## Type Definitions

Type definitions for PocketBase are in \`pocketbase.d.ts\`. Reference them in your hooks:

\`\`\`typescript
/// <reference path="../pocketbase.d.ts" />
\`\`\`

## Linting

This project uses Biome for linting and formatting:

\`\`\`bash
bunx biome check src/
bunx biome check --write src/  # Auto-fix
\`\`\`

## Resources

- [PocketBase Documentation](https://pocketbase.io/docs/)
- [JavaScript Hooks Guide](https://pocketbase.io/docs/js-overview/)
- [Collections & Records](https://pocketbase.io/docs/collections/)
- [Authentication](https://pocketbase.io/docs/authentication/)
- [Realtime Subscriptions](https://pocketbase.io/docs/realtime/)

## Deployment

For production deployment, see:
- [Going to Production Guide](https://pocketbase.io/docs/going-to-production/)
- Self-hosting on VPS
- Docker deployment
- Or use PocketHost for managed hosting
`;

  return Result.tryPromise({
    try: async () => {
      await fs.writeFile(path.join(backendDir, "README.md"), readmeContent);
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create README: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

async function writeEnvFile(projectDir: string): Promise<Result<void, DatabaseSetupError>> {
  return Result.tryPromise({
    try: async () => {
      // Write to apps/web/.env for frontend access
      const webEnvPath = path.join(projectDir, "apps/web", ".env");
      const webVariables: EnvVariable[] = [
        {
          key: "NEXT_PUBLIC_POCKETBASE_URL",
          value: "http://127.0.0.1:8090",
          condition: true,
        },
        {
          key: "POCKETBASE_URL",
          value: "http://127.0.0.1:8090",
          condition: true,
        },
      ];
      await addEnvVariablesToFile(webEnvPath, webVariables);

      // Write to packages/backend/.env.local for backend
      const backendEnvPath = path.join(projectDir, "packages/backend", ".env.local");
      const backendVariables: EnvVariable[] = [
        {
          key: "POCKETBASE_URL",
          value: "http://127.0.0.1:8090",
          condition: true,
        },
        {
          key: "PB_ENCRYPTION_KEY",
          value: "",
          condition: true,
          comment: "Optional: 32-character encryption key for sensitive data",
        },
      ];
      await addEnvVariablesToFile(backendEnvPath, backendVariables);

      log.success("Environment variables written successfully");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to write .env files: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

function displaySetupInstructions() {
  log.info(`
${pc.bold(pc.blue("PocketBase Setup Complete!"))}

${pc.bold("Next steps:")}

1. Start the development server:
   ${pc.cyan("cd packages/backend")}
   ${pc.cyan("bun run dev")}

2. Open the admin dashboard at ${pc.underline("http://127.0.0.1:8090/_/")}
   and create your first admin account

3. Start building your collections and hooks!

${pc.bold("Useful commands:")}
  ${pc.cyan("bun run dev")}           - Start dev server with watch mode
  ${pc.cyan("bun run build")}         - Compile hooks
  ${pc.cyan("bun run serve")}         - Start PocketBase server
  ${pc.cyan("bun run migrate")}       - Run database migrations
  ${pc.cyan("bun run admin:create")}  - Create admin account (CLI)

${pc.dim("Documentation: https://pocketbase.io/docs/")}
`);
}

export async function setupPocketBaseSelfHosted(
  config: ProjectConfig,
  cliInput?: { manualDb?: boolean },
): Promise<PocketBaseSetupResult> {
  const { projectDir } = config;
  const manualDb = cliInput?.manualDb ?? false;
  const backendDir = path.join(projectDir, "packages/backend");

  if (manualDb) {
    const envResult = await writeEnvFile(projectDir);
    if (envResult.isErr()) {
      return envResult;
    }

    log.info(`
${pc.bold("Manual PocketBase Setup:")}

1. Download PocketBase from ${pc.underline("https://pocketbase.io/docs/")}
2. Extract to ${pc.cyan("packages/backend/")}
3. Run ${pc.cyan("./pocketbase serve")} to start

Environment variables have been added to your .env files.
`);
    return Result.ok(undefined);
  }

  const mode = await select({
    message: "PocketBase self-hosted setup:",
    options: [
      {
        label: "Automatic",
        value: "auto",
        hint: "Download PocketBase binary and configure project",
      },
      {
        label: "Manual",
        value: "manual",
        hint: "I'll download and configure PocketBase myself",
      },
    ],
    initialValue: "auto",
  });

  if (isCancel(mode)) {
    return userCancelled("Operation cancelled");
  }

  if (mode === "manual") {
    const envResult = await writeEnvFile(projectDir);
    if (envResult.isErr()) {
      return envResult;
    }

    log.info(`
${pc.bold("Manual PocketBase Setup Instructions:")}

1. Visit ${pc.underline("https://github.com/pocketbase/pocketbase/releases")}
2. Download PocketBase v${LATEST_VERSION} for your platform
3. Extract the ${pc.cyan("pocketbase")} binary to ${pc.cyan("packages/backend/")}
4. Run ${pc.cyan("./pocketbase serve")} to start

Environment variables have been written to your .env files.
`);
    return Result.ok(undefined);
  }

  // Automatic setup
  const s = spinner();
  s.start("Setting up PocketBase...");

  // Ensure backend directory exists
  await fs.mkdir(backendDir, { recursive: true });

  s.stop("Backend directory ready");

  // Download PocketBase
  const downloadResult = await downloadPocketBase(backendDir);
  if (downloadResult.isErr()) {
    log.error(pc.red(downloadResult.error.message));
    return downloadResult;
  }

  // Create directory structure
  const dirResult = await createDirectoryStructure(backendDir);
  if (dirResult.isErr()) {
    log.error(pc.red(dirResult.error.message));
    return dirResult;
  }

  // Create config files
  const configResult = await createConfigFiles(backendDir);
  if (configResult.isErr()) {
    log.error(pc.red(configResult.error.message));
    return configResult;
  }

  // Create type definitions
  const typesResult = await createTypeDefinitions(backendDir);
  if (typesResult.isErr()) {
    log.warn(pc.yellow("Failed to create type definitions, continuing..."));
  }

  // Create .cursorrules
  const cursorResult = await createCursorRules(backendDir);
  if (cursorResult.isErr()) {
    log.warn(pc.yellow("Failed to create .cursorrules, continuing..."));
  }

  // Create example hook
  const hookResult = await createExampleHook(backendDir);
  if (hookResult.isErr()) {
    log.warn(pc.yellow("Failed to create example hook, continuing..."));
  }

  // Create README
  const readmeResult = await createReadme(backendDir);
  if (readmeResult.isErr()) {
    log.warn(pc.yellow("Failed to create README, continuing..."));
  }

  // Write environment variables
  const envResult = await writeEnvFile(projectDir);
  if (envResult.isErr()) {
    log.error(pc.red(envResult.error.message));
    return envResult;
  }

  displaySetupInstructions();

  return Result.ok(undefined);
}
```

#### 1.2: pocketbase-pockethost-setup.ts

```typescript
import { isCancel, log, select, spinner, text } from "@clack/prompts";
import { Result } from "better-result";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";

import type { ProjectConfig } from "../../types";

import { addEnvVariablesToFile, type EnvVariable } from "../../utils/env-utils";
import { DatabaseSetupError, UserCancelledError, userCancelled } from "../../utils/errors";

type PocketHostSetupResult = Result<void, DatabaseSetupError | UserCancelledError>;

async function createDirectoryStructure(
  backendDir: string,
): Promise<Result<void, DatabaseSetupError>> {
  return Result.tryPromise({
    try: async () => {
      const directories = [
        path.join(backendDir, "src"),
        path.join(backendDir, "pb_hooks"),
        path.join(backendDir, "pb_migrations"),
      ];

      for (const dir of directories) {
        await fs.mkdir(dir, { recursive: true });
      }

      // Create .gitignore in backend directory
      const gitignoreContent = `# PocketHost deployment
# Note: For PocketHost, we only deploy pb_hooks and pb_migrations
# pb_data is managed by PocketHost

# Compiled hooks
pb_hooks/*
!pb_hooks/.gitkeep

# Environment variables
.env
.env.local

# Logs
*.log
`;

      await fs.writeFile(path.join(backendDir, ".gitignore"), gitignoreContent);

      // Create .gitkeep files
      await fs.writeFile(path.join(backendDir, "pb_hooks", ".gitkeep"), "");
      await fs.writeFile(path.join(backendDir, "pb_migrations", ".gitkeep"), "");

      log.success("Created PocketBase directory structure for PocketHost");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create directory structure: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

async function createConfigFiles(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  return Result.tryPromise({
    try: async () => {
      // package.json (minimal, no binary scripts)
      const packageJson = {
        name: "@repo/backend",
        version: "0.0.0",
        private: true,
        scripts: {
          build: "node esbuild.config.js",
          dev: "node esbuild.config.js --watch",
          typecheck: "tsc --noEmit",
        },
        devDependencies: {
          "@biomejs/biome": "^1.9.4",
          esbuild: "^0.24.0",
          typescript: "^5.7.2",
        },
      };

      await fs.writeFile(
        path.join(backendDir, "package.json"),
        JSON.stringify(packageJson, null, 2) + "\n",
      );

      // tsconfig.json (same as self-hosted)
      const tsconfig = {
        compilerOptions: {
          target: "ES2020",
          module: "CommonJS",
          moduleResolution: "Node",
          esModuleInterop: true,
          strict: true,
          lib: ["ES2020"],
          outDir: "pb_hooks",
          baseUrl: ".",
          skipLibCheck: true,
          paths: {
            "*": ["node_modules/*"],
          },
        },
        include: ["src/**/*", "pocketbase.d.ts"],
      };

      await fs.writeFile(
        path.join(backendDir, "tsconfig.json"),
        JSON.stringify(tsconfig, null, 2) + "\n",
      );

      // esbuild.config.js (same as self-hosted)
      const esbuildConfig = `const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ['src/main.pb.ts'],
    outdir: 'pb_hooks',
    bundle: false,
    format: 'cjs',
    target: 'es2020',
    platform: 'neutral',
    logLevel: 'info',
  });

  if (isWatch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

build().catch(() => process.exit(1));
`;

      await fs.writeFile(path.join(backendDir, "esbuild.config.js"), esbuildConfig);

      // biome.json (same as self-hosted)
      const biomeConfig = {
        $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
        organizeImports: {
          enabled: true,
        },
        linter: {
          enabled: true,
          rules: {
            recommended: true,
            suspicious: {
              noAsyncPromiseExecutor: "error",
              noAsyncWithoutAwait: "off",
            },
            correctness: {
              noUnusedVariables: "warn",
            },
          },
        },
        formatter: {
          enabled: true,
          indentStyle: "space",
          indentWidth: 2,
        },
        javascript: {
          formatter: {
            quoteStyle: "double",
            semicolons: "always",
          },
        },
      };

      await fs.writeFile(
        path.join(backendDir, "biome.json"),
        JSON.stringify(biomeConfig, null, 2) + "\n",
      );

      log.success("Created configuration files");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create config files: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

// Reuse type definitions, .cursorrules, and example hook from self-hosted
// (Import them or duplicate - for brevity, reference the self-hosted versions)

async function createReadme(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  const readmeContent = `# PocketBase Backend (PocketHost)

This directory contains your PocketBase backend files for deployment to PocketHost.

## Directory Structure

- \`src/\` - TypeScript hooks source files
- \`pb_hooks/\` - Compiled JavaScript hooks (deployed to PocketHost)
- \`pb_migrations/\` - Database migration files (deployed to PocketHost)

**Note:** When deploying to PocketHost, only \`pb_hooks\` and \`pb_migrations\` are uploaded.
The \`pb_data\` directory is managed by PocketHost in the cloud.

## Getting Started

### 1. Create a PocketHost Instance

1. Visit [PocketHost.io](https://pockethost.io) and sign up
2. Create a new instance
3. Note your instance URL (e.g., \`https://your-instance.pockethost.io\`)

### 2. Access Admin Dashboard

Visit \`https://your-instance.pockethost.io/_/\` to access the admin panel.

### 3. Development Workflow

#### Build Hooks

Compile TypeScript hooks to JavaScript:

\`\`\`bash
bun run build
# or
npm run build
\`\`\`

#### Watch Mode

Automatically rebuild on changes:

\`\`\`bash
bun run dev
# or
npm run dev
\`\`\`

### 4. Deployment

#### Option A: Manual Deployment via FTP

1. Get FTP credentials from PocketHost dashboard
2. Connect using an FTP client (FileZilla, Cyberduck, etc.)
3. Upload files from \`pb_hooks/\` and \`pb_migrations/\` to the corresponding directories

#### Option B: Automated Deployment via GitHub Actions

Use the provided GitHub Actions workflow in \`.github/workflows/deploy-pockethost.yml\`:

1. Add secrets to your GitHub repository:
   - \`POCKETHOST_FTP_HOST\`: \`ftp.pockethost.io\`
   - \`POCKETHOST_FTP_USER\`: Your FTP username
   - \`POCKETHOST_FTP_PASSWORD\`: Your FTP password

2. Push to your main branch to trigger deployment

The workflow automatically:
- Builds hooks from TypeScript
- Deploys \`pb_hooks/\` and \`pb_migrations/\` via FTP

## Environment Variables

The following environment variables are configured:

- Frontend (\`apps/web/.env\`):
  - \`NEXT_PUBLIC_POCKETBASE_URL\` - Your PocketHost instance URL

## Writing Hooks

Hooks are written in TypeScript in the \`src/\` directory and compiled to JavaScript in \`pb_hooks/\`.

### Important Constraints

1. **No async/await**: PocketBase uses Goja (synchronous JavaScript runtime)
2. **No ES modules**: Use CommonJS (no import/export)
3. **ES2020 syntax**: Modern JavaScript features are supported (arrow functions, optional chaining, etc.)

See \`.cursorrules\` for detailed guidance on writing PocketBase hooks.

### Example Hook

\`\`\`typescript
/// <reference path="../pocketbase.d.ts" />

routerAdd("GET", "/api/hello", (c) => {
  return c.json(200, { message: "Hello from PocketHost!" });
});

onRecordBeforeCreateRequest((e) => {
  e.record.set("status", "pending");
}, "posts");
\`\`\`

## Type Definitions

Type definitions for PocketBase are in \`pocketbase.d.ts\`. Reference them in your hooks:

\`\`\`typescript
/// <reference path="../pocketbase.d.ts" />
\`\`\`

## Linting

This project uses Biome for linting and formatting:

\`\`\`bash
bunx biome check src/
bunx biome check --write src/  # Auto-fix
\`\`\`

## Resources

- [PocketHost Documentation](https://pockethost.io/docs/)
- [PocketBase JavaScript Hooks Guide](https://pocketbase.io/docs/js-overview/)
- [PocketBase Documentation](https://pocketbase.io/docs/)
- [GitHub Actions FTP Deploy](https://github.com/SamKirkland/FTP-Deploy-Action)

## Tips

- Build your hooks locally before deploying (\`bun run build\`)
- Test your logic with the PocketHost instance directly
- Use migrations for schema changes to maintain consistency
- Monitor your instance logs in the PocketHost dashboard
- Keep your FTP credentials secure (use GitHub Secrets)
`;

  return Result.tryPromise({
    try: async () => {
      await fs.writeFile(path.join(backendDir, "README.md"), readmeContent);
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create README: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

async function writeEnvFile(
  projectDir: string,
  instanceUrl: string,
): Promise<Result<void, DatabaseSetupError>> {
  return Result.tryPromise({
    try: async () => {
      // Write to apps/web/.env for frontend access
      const webEnvPath = path.join(projectDir, "apps/web", ".env");
      const webVariables: EnvVariable[] = [
        {
          key: "NEXT_PUBLIC_POCKETBASE_URL",
          value: instanceUrl,
          condition: true,
        },
        {
          key: "POCKETBASE_URL",
          value: instanceUrl,
          condition: true,
        },
      ];
      await addEnvVariablesToFile(webEnvPath, webVariables);

      log.success("Environment variables written successfully");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to write .env files: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

async function createGitHubWorkflow(projectDir: string): Promise<Result<void, DatabaseSetupError>> {
  const workflowContent = `name: Deploy to PocketHost

on:
  push:
    branches:
      - main
    paths:
      - 'packages/backend/src/**'
      - 'packages/backend/pb_migrations/**'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: packages/backend
        run: npm install

      - name: Build hooks
        working-directory: packages/backend
        run: npm run build

      - name: Deploy pb_hooks to PocketHost
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: \${{ secrets.POCKETHOST_FTP_HOST }}
          username: \${{ secrets.POCKETHOST_FTP_USER }}
          password: \${{ secrets.POCKETHOST_FTP_PASSWORD }}
          local-dir: ./packages/backend/pb_hooks/
          server-dir: /pb_hooks/
          protocol: ftps

      - name: Deploy pb_migrations to PocketHost
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: \${{ secrets.POCKETHOST_FTP_HOST }}
          username: \${{ secrets.POCKETHOST_FTP_USER }}
          password: \${{ secrets.POCKETHOST_FTP_PASSWORD }}
          local-dir: ./packages/backend/pb_migrations/
          server-dir: /pb_migrations/
          protocol: ftps
`;

  return Result.tryPromise({
    try: async () => {
      const workflowDir = path.join(projectDir, ".github/workflows");
      await fs.mkdir(workflowDir, { recursive: true });
      await fs.writeFile(path.join(workflowDir, "deploy-pockethost.yml"), workflowContent);
      log.success("Created GitHub Actions workflow for PocketHost deployment");
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to create GitHub workflow: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

function displaySetupInstructions(instanceUrl: string) {
  log.info(`
${pc.bold(pc.blue("PocketHost Setup Complete!"))}

${pc.bold("Your PocketBase instance URL:")}
${pc.cyan(instanceUrl)}

${pc.bold("Next steps:")}

1. ${pc.bold("Create your PocketHost instance:")}
   Visit ${pc.underline("https://pockethost.io")} and create a new instance

2. ${pc.bold("Access the admin dashboard:")}
   ${pc.cyan(instanceUrl + "/_/")}
   Create your admin account and start building collections

3. ${pc.bold("Build your hooks:")}
   ${pc.cyan("cd packages/backend && bun run build")}

4. ${pc.bold("Set up automated deployment (optional):")}
   Add these secrets to your GitHub repository:
   - ${pc.cyan("POCKETHOST_FTP_HOST")}: ftp.pockethost.io
   - ${pc.cyan("POCKETHOST_FTP_USER")}: (from PocketHost dashboard)
   - ${pc.cyan("POCKETHOST_FTP_PASSWORD")}: (from PocketHost dashboard)

5. ${pc.bold("Deploy:")}
   - Push to main branch to deploy automatically via GitHub Actions
   - Or deploy manually via FTP

${pc.bold("Useful commands:")}
  ${pc.cyan("bun run build")}         - Compile hooks
  ${pc.cyan("bun run dev")}           - Watch mode (rebuild on changes)
  ${pc.cyan("bunx biome check src/")} - Lint hooks

${pc.bold("Useful links:")}
  ${pc.dim("PocketHost Dashboard:")} ${pc.underline("https://pockethost.io/app")}
  ${pc.dim("FTP Credentials:")} Available in your instance settings
  ${pc.dim("Documentation:")} ${pc.underline("https://pockethost.io/docs/")}

${pc.dim("Tip: You can also deploy manually via FTP using FileZilla or Cyberduck")}
`);
}

export async function setupPocketBasePocketHost(
  config: ProjectConfig,
  cliInput?: { manualDb?: boolean },
): Promise<PocketHostSetupResult> {
  const { projectDir } = config;
  const manualDb = cliInput?.manualDb ?? false;
  const backendDir = path.join(projectDir, "packages/backend");

  if (manualDb) {
    const defaultUrl = "https://your-instance.pockethost.io";
    const envResult = await writeEnvFile(projectDir, defaultUrl);
    if (envResult.isErr()) {
      return envResult;
    }

    log.info(`
${pc.bold("Manual PocketHost Setup:")}

1. Visit ${pc.underline("https://pockethost.io")} and create an instance
2. Update ${pc.cyan("apps/web/.env")} with your instance URL
3. Configure deployment (FTP or GitHub Actions)

Environment variables template has been added to your .env files.
`);
    return Result.ok(undefined);
  }

  const mode = await select({
    message: "PocketHost setup:",
    options: [
      {
        label: "Automatic",
        value: "auto",
        hint: "Configure PocketHost instance and create deployment workflow",
      },
      {
        label: "Manual",
        value: "manual",
        hint: "I'll configure PocketHost myself",
      },
    ],
    initialValue: "auto",
  });

  if (isCancel(mode)) {
    return userCancelled("Operation cancelled");
  }

  if (mode === "manual") {
    const defaultUrl = "https://your-instance.pockethost.io";
    const envResult = await writeEnvFile(projectDir, defaultUrl);
    if (envResult.isErr()) {
      return envResult;
    }

    log.info(`
${pc.bold("Manual PocketHost Setup Instructions:")}

1. Visit ${pc.underline("https://pockethost.io")} and create an instance
2. Update ${pc.cyan("NEXT_PUBLIC_POCKETBASE_URL")} in ${pc.cyan("apps/web/.env")}
3. Get FTP credentials from PocketHost dashboard
4. Deploy ${pc.cyan("pb_hooks/")} and ${pc.cyan("pb_migrations/")} via FTP

Environment variables template has been written to your .env files.
`);
    return Result.ok(undefined);
  }

  // Automatic setup
  const s = spinner();
  s.start("Setting up PocketHost configuration...");

  // Ensure backend directory exists
  await fs.mkdir(backendDir, { recursive: true });

  s.stop("Backend directory ready");

  // Prompt for instance URL
  log.info(
    `\n${pc.bold("First, create your PocketHost instance at")} ${pc.underline("https://pockethost.io")}\n`,
  );

  const instanceUrl = await text({
    message: "Enter your PocketHost instance URL:",
    placeholder: "https://your-instance.pockethost.io",
    validate: (value) => {
      if (!value) return "Instance URL is required";
      if (!value.startsWith("https://")) return "URL must start with https://";
      if (!value.includes("pockethost.io")) return "URL must be a PocketHost instance";
      return undefined;
    },
  });

  if (isCancel(instanceUrl)) {
    return userCancelled("Operation cancelled");
  }

  const url = (instanceUrl as string).trim().replace(/\/$/, ""); // Remove trailing slash

  // Create directory structure
  const dirResult = await createDirectoryStructure(backendDir);
  if (dirResult.isErr()) {
    log.error(pc.red(dirResult.error.message));
    return dirResult;
  }

  // Create config files
  const configResult = await createConfigFiles(backendDir);
  if (configResult.isErr()) {
    log.error(pc.red(configResult.error.message));
    return configResult;
  }

  // Reuse type definitions, .cursorrules, and example hook creation
  // from self-hosted (copy those functions or import them)
  // For brevity, assume they're imported or duplicated here

  // Create README
  const readmeResult = await createReadme(backendDir);
  if (readmeResult.isErr()) {
    log.warn(pc.yellow("Failed to create README, continuing..."));
  }

  // Write environment variables
  const envResult = await writeEnvFile(projectDir, url);
  if (envResult.isErr()) {
    log.error(pc.red(envResult.error.message));
    return envResult;
  }

  // Create GitHub Actions workflow
  const workflowResult = await createGitHubWorkflow(projectDir);
  if (workflowResult.isErr()) {
    log.warn(pc.yellow("Failed to create GitHub Actions workflow, continuing..."));
  }

  displaySetupInstructions(url);

  return Result.ok(undefined);
}
```

### Step 2: Update db-setup.ts Routing Logic

Modify `/apps/cli/src/helpers/core/db-setup.ts` to add PocketBase routing:

```typescript
// Add imports at top
import { setupPocketBaseSelfHosted } from "../database-providers/pocketbase-self-hosted-setup";
import { setupPocketBasePocketHost } from "../database-providers/pocketbase-pockethost-setup";

// In setupDatabase function, add PocketBase handling:
export async function setupDatabase(config: ProjectConfig, cliInput?: { manualDb?: boolean }) {
  const { database, dbSetup, backend, projectDir, pbDeployment } = config;

  // Add PocketBase early return
  if (backend === "pocketbase") {
    if (pbDeployment === "self-hosted") {
      await runSetup(() => setupPocketBaseSelfHosted(config, cliInput));
    } else if (pbDeployment === "pockethost") {
      await runSetup(() => setupPocketBasePocketHost(config, cliInput));
    }
    return;
  }

  if (backend === "convex" || database === "none") {
    // ... existing logic
  }

  // ... rest of existing logic
}
```

---

## Key Configuration Files

### esbuild.config.js (ES2020 Target)

```javascript
const esbuild = require("esbuild");

const isWatch = process.argv.includes("--watch");

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ["src/main.pb.ts"],
    outdir: "pb_hooks",
    bundle: false,
    format: "cjs",
    target: "es2020",
    platform: "neutral",
    logLevel: "info",
  });

  if (isWatch) {
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

build().catch(() => process.exit(1));
```

**Key settings**:

- `target: 'es2020'` - Modern JavaScript features (not ES5)
- `format: 'cjs'` - CommonJS (required by Goja)
- `bundle: false` - Keep files separate (no bundling)
- `platform: 'neutral'` - Don't assume Node.js

### tsconfig.json (ES2020)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "esModuleInterop": true,
    "strict": true,
    "lib": ["ES2020"],
    "outDir": "pb_hooks",
    "baseUrl": ".",
    "skipLibCheck": true,
    "paths": {
      "*": ["node_modules/*"]
    }
  },
  "include": ["src/**/*", "pocketbase.d.ts"]
}
```

**Changes from Gemini's ES5 config**:

- `target: "ES2020"` (not ES5)
- `lib: ["ES2020"]` (not ES5)

### biome.json (Goja Constraints)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noAsyncPromiseExecutor": "error",
        "noAsyncWithoutAwait": "off"
      },
      "correctness": {
        "noUnusedVariables": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always"
    }
  }
}
```

**Purpose**: Prevent async/await (no async executor errors), consistent formatting

**Note**: Biome doesn't have built-in rules to ban async/await or ES modules entirely. The .cursorrules file provides this guidance for AI assistants. For strict enforcement, consider adding a custom ESLint plugin.

---

## Binary Management (Self-Hosted Only)

### Platform Detection

```typescript
function getPlatformInfo(): {
  platform: string;
  arch: string;
  extension: string;
  downloadUrl: string;
} {
  const platform = os.platform();
  const arch = os.arch();

  let platformStr = "";
  let archStr = "";
  const extension = platform === "win32" ? "zip" : "zip";

  // Map Node.js platform names to PocketBase naming
  if (platform === "darwin") {
    platformStr = "darwin";
  } else if (platform === "win32") {
    platformStr = "windows";
  } else {
    platformStr = "linux";
  }

  // Map Node.js arch to PocketBase naming
  if (arch === "x64") {
    archStr = "amd64";
  } else if (arch === "arm64") {
    archStr = "arm64";
  } else if (arch === "arm") {
    archStr = "armv7";
  } else {
    archStr = "amd64"; // Default to amd64
  }

  const downloadUrl = `https://github.com/pocketbase/pocketbase/releases/download/v0.23.4/pocketbase_0.23.4_${platformStr}_${archStr}.${extension}`;

  return { platform: platformStr, arch: archStr, extension, downloadUrl };
}
```

**Mapping**:
| Node.js Platform | PocketBase Platform |
|------------------|---------------------|
| darwin | darwin |
| win32 | windows |
| linux | linux |

| Node.js Arch | PocketBase Arch |
| ------------ | --------------- |
| x64          | amd64           |
| arm64        | arm64           |
| arm          | armv7           |

### Download & Extract

```typescript
async function downloadPocketBase(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  const s = spinner();
  const { downloadUrl, platform } = getPlatformInfo();
  const executableName = platform === "windows" ? "pocketbase.exe" : "pocketbase";

  s.start(`Downloading PocketBase v0.23.4...`);

  return Result.tryPromise({
    try: async () => {
      const tempZip = path.join(backendDir, "pocketbase.zip");

      // Download
      await $`curl -L ${downloadUrl} -o ${tempZip}`;

      s.message("Extracting PocketBase...");

      // Extract
      await $`unzip -o ${tempZip} -d ${backendDir}`;

      // Make executable (Unix)
      if (platform !== "windows") {
        await $`chmod +x ${path.join(backendDir, executableName)}`;
      }

      // Clean up
      await fs.unlink(tempZip);

      s.stop(`PocketBase v0.23.4 downloaded successfully`);
    },
    catch: (e) => {
      s.stop(pc.red("Failed to download PocketBase"));
      return new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to download PocketBase: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      });
    },
  });
}
```

**Requirements**: `curl` and `unzip` must be available on the system.

**Trade-off**: Hardcoded version (0.23.4) vs dynamic latest. Decision: Hardcode for stability.

---

## .cursorrules Content

The `.cursorrules` file provides guidance for AI assistants (Cursor, Cline, Claude Code) about PocketBase constraints:

Key rules:

1. **Environment**: Goja (not Node.js)
2. **Syntax**: ES2020 (not async/await or ES modules)
3. **Globals**: Use `$app`, `$os`, `$http`, `$security`, `$apis`
4. **Operations**: All PocketBase calls are synchronous

See full content in Step 1.1 `createCursorRules()` function.

---

## Example Hook (src/main.pb.ts)

```typescript
/// <reference path="../pocketbase.d.ts" />

// Example: Custom API route
routerAdd("GET", "/api/hello", (c) => {
  return c.json(200, {
    message: "Hello from PocketBase!",
    timestamp: new Date().toISOString(),
  });
});

// Example: Before create hook
onRecordBeforeCreateRequest((e) => {
  // Set default values
  e.record.set("status", "pending");
  e.record.set("createdAt", new Date().toISOString());

  console.log("New record being created:", e.record.collectionName);
}, "users");

// Example: After update hook
onRecordAfterUpdateRequest((e) => {
  const record = e.record;
  console.log("Record updated:", {
    id: record.id,
    collection: record.collectionName,
  });
}, "users");
```

**Key patterns**:

- `/// <reference path="../pocketbase.d.ts" />` at top for types
- No async/await
- No import/export
- Use PocketBase globals and hook functions

---

## Verification Steps

### Self-Hosted Setup

1. **Run CLI**:

   ```bash
   bun create better-t-stack test-pb --backend pocketbase --pb-deployment self-hosted
   ```

2. **Verify structure**:

   ```bash
   ls packages/backend/
   # Should see: pocketbase, src/, pb_hooks/, pb_data/, pb_migrations/,
   #             pb_public/, package.json, esbuild.config.js, etc.
   ```

3. **Check binary**:

   ```bash
   ./packages/backend/pocketbase --version
   # Should output: pocketbase version 0.23.4
   ```

4. **Build hooks**:

   ```bash
   cd packages/backend
   bun run build
   ls pb_hooks/
   # Should see: main.pb.js
   ```

5. **Start server**:

   ```bash
   bun run dev
   # Should start PocketBase at http://127.0.0.1:8090
   ```

6. **Test API**:
   ```bash
   curl http://127.0.0.1:8090/api/hello
   # Should return: {"message":"Hello from PocketBase!","timestamp":"..."}
   ```

### PocketHost Setup

1. **Run CLI**:

   ```bash
   bun create better-t-stack test-pb-host --backend pocketbase --pb-deployment pockethost
   ```

2. **Verify structure**:

   ```bash
   ls packages/backend/
   # Should see: src/, pb_hooks/, pb_migrations/ (no pocketbase binary)
   ```

3. **Check workflow**:

   ```bash
   ls .github/workflows/
   # Should see: deploy-pockethost.yml
   ```

4. **Build hooks**:

   ```bash
   cd packages/backend
   bun run build
   ls pb_hooks/
   # Should see: main.pb.js
   ```

5. **Verify env vars**:
   ```bash
   cat apps/web/.env
   # Should contain: NEXT_PUBLIC_POCKETBASE_URL=https://your-instance.pockethost.io
   ```

---

## Common Issues & Solutions

### Issue: Binary download fails

**Symptom**: `curl` or `unzip` command fails

**Causes**:

- Missing `curl` or `unzip` on system
- Network issues
- Unsupported platform/arch

**Solutions**:

1. Check for `curl` and `unzip`: `which curl unzip`
2. Install if missing (macOS: included, Linux: `apt install curl unzip`)
3. Fall back to manual mode if automatic fails
4. Add error handling to suggest manual download

### Issue: Hooks fail to compile

**Symptom**: `bun run build` fails with esbuild errors

**Causes**:

- Syntax errors in TypeScript
- Using async/await or ES modules
- Missing type definitions

**Solutions**:

1. Check esbuild error output
2. Verify no `async`/`await` in hooks
3. Verify no `import`/`export` (use CommonJS)
4. Run `bunx biome check src/` for linting

### Issue: Hooks compile but fail at runtime

**Symptom**: PocketBase starts but hooks throw errors

**Causes**:

- Using Goja-incompatible features
- Missing PocketBase globals
- Incorrect API usage

**Solutions**:

1. Check PocketBase logs for errors
2. Verify no Promise/async patterns
3. Verify using `$app.dao()` correctly (synchronous calls)
4. Test with simpler hook first

### Issue: Binary wrong platform

**Symptom**: `./pocketbase` fails with "cannot execute binary file"

**Causes**:

- Downloaded wrong architecture binary
- Platform detection failed

**Solutions**:

1. Manually check platform: `uname -m` (should match arch detection)
2. Download correct binary manually
3. Add more arch mappings if needed

---

## Integration with Other Guides

### Dependencies (from Guide 1)

This guide depends on:

- `ProjectConfig` type with `pbDeployment` field
- `backend: "pocketbase"` in schema
- Prompt for deployment choice

**Handoff from Guide 1**:

- Type schemas are complete
- CLI prompts return `pbDeployment: "self-hosted" | "pockethost"`
- `db-setup.ts` skeleton is ready

### Dependencies for Guide 3

Guide 3 (Frontend) depends on:

- Backend directory structure exists
- Environment variables are written correctly
- PocketBase instance is running (self-hosted) or URL is known (PocketHost)

**Handoff to Guide 3**:

- `packages/backend/` is scaffolded
- Environment variables are in `apps/web/.env`
- Example hooks demonstrate API patterns

### Dependencies for Guide 4

Guide 4 (Deployment) depends on:

- GitHub Actions workflow file (PocketHost only)
- README includes deployment instructions

**Handoff to Guide 4**:

- `.github/workflows/deploy-pockethost.yml` exists
- README documents required secrets

---

## Success Criteria

This guide is complete when:

1. ✅ `setupPocketBaseSelfHosted()` scaffolds full backend structure
2. ✅ Binary downloads and extracts correctly on macOS/Linux/Windows
3. ✅ `setupPocketBasePocketHost()` scaffolds minimal structure with workflow
4. ✅ esbuild compiles TypeScript hooks to ES2020 JavaScript
5. ✅ Type definitions provide accurate PocketBase API types
6. ✅ .cursorrules guides AI assistants on Goja constraints
7. ✅ Example hooks demonstrate common patterns (routes, lifecycle hooks)
8. ✅ READMEs provide clear setup and usage instructions
9. ✅ `db-setup.ts` correctly routes to PocketBase setup functions
10. ✅ Generated projects can compile hooks and start PocketBase

---

## Next Steps

1. **Implement setup helpers** (Step 1.1 and 1.2)
2. **Update db-setup.ts** (Step 2)
3. **Test self-hosted flow** end-to-end
4. **Test PocketHost flow** end-to-end
5. **Verify on multiple platforms** (macOS, Linux, Windows)
6. **Hand off to Guide 3** (Frontend) once complete

---

## References

- **PocketBase Docs**: https://pocketbase.io/docs/
- **JavaScript Hooks**: https://pocketbase.io/docs/js-overview/
- **Goja Runtime**: https://github.com/dop251/goja
- **esbuild Docs**: https://esbuild.github.io/
- **Biome Docs**: https://biomejs.dev/
- **PocketHost**: https://pockethost.io/

---

## Appendix: Full Type Definitions (pocketbase.d.ts)

See `createTypeDefinitions()` function in Step 1.1 for the complete type definitions file. Key interfaces:

- `pb.App` - Main app instance
- `pb.Dao` - Database operations
- `pb.Record` - Record interface
- `pb.Context` - HTTP context for routes
- `pb.Event` - Hook event interface
- Hook functions: `routerAdd`, `onRecord*Request`, etc.
- Error classes: `BadRequestError`, `NotFoundError`, etc.

Type definitions are based on PocketBase documentation and updated for ES2020 target.
