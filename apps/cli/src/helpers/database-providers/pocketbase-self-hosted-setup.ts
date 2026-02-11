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
