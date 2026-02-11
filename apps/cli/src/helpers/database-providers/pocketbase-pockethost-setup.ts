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

// Reuse type definitions from self-hosted
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

// Reuse .cursorrules from self-hosted
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

// Reuse example hook from self-hosted
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

// PocketHost-specific README
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
