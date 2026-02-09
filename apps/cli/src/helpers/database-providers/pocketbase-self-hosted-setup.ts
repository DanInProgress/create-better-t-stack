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

async function downloadPocketBase(
  backendDir: string,
): Promise<Result<void, DatabaseSetupError>> {
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

async function createReadme(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  const readmeContent = `# PocketBase Backend

This directory contains your PocketBase backend instance.

## Directory Structure

- \`pb_data/\` - SQLite database and file storage (gitignored)
- \`pb_hooks/\` - Server-side JavaScript hooks for custom logic
- \`pb_migrations/\` - Database migration files
- \`pb_public/\` - Static files served at the root URL
- \`pocketbase\` - PocketBase executable (gitignored)

## Getting Started

### Development

Start the PocketBase server:

\`\`\`bash
bun run dev
# or
npm run dev
\`\`\`

This will start PocketBase at http://127.0.0.1:8090

### Admin Dashboard

Access the admin dashboard at http://127.0.0.1:8090/_/

On first run, you'll be prompted to create an admin account.

### Environment Variables

The following environment variables are available:

- \`POCKETBASE_URL\` - The URL of your PocketBase instance (default: http://127.0.0.1:8090)
- \`PB_ENCRYPTION_KEY\` - Optional 32-character encryption key for sensitive data

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

async function addPackageJsonScripts(projectDir: string): Promise<Result<void, DatabaseSetupError>> {
  return Result.tryPromise({
    try: async () => {
      const packageJsonPath = path.join(projectDir, "packages/backend", "package.json");

      try {
        // Check if package.json exists
        const content = await fs.readFile(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(content);

        // Add scripts
        packageJson.scripts = {
          ...packageJson.scripts,
          dev: "./pocketbase serve",
          serve: "./pocketbase serve",
          migrate: "./pocketbase migrate",
          "admin:create": "./pocketbase admin create",
          "admin:update": "./pocketbase admin update",
        };

        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
        log.success("Added PocketBase scripts to package.json");
      } catch {
        // If package.json doesn't exist, create a minimal one
        const packageJson = {
          name: "@repo/backend",
          version: "0.0.0",
          private: true,
          scripts: {
            dev: "./pocketbase serve",
            serve: "./pocketbase serve",
            migrate: "./pocketbase migrate",
            "admin:create": "./pocketbase admin create",
            "admin:update": "./pocketbase admin update",
          },
        };

        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
        log.success("Created package.json with PocketBase scripts");
      }
    },
    catch: (e) =>
      new DatabaseSetupError({
        provider: "pocketbase",
        message: `Failed to update package.json: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

function displaySetupInstructions() {
  log.info(`
${pc.bold(pc.blue("PocketBase Setup Complete!"))}

${pc.bold("Next steps:")}

1. Start the PocketBase server:
   ${pc.cyan("cd packages/backend")}
   ${pc.cyan("bun run dev")}

2. Open the admin dashboard at ${pc.underline("http://127.0.0.1:8090/_/")}
   and create your first admin account

3. Start building your collections and hooks!

${pc.bold("Useful commands:")}
  ${pc.cyan("bun run dev")}           - Start PocketBase server
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

  // Add package.json scripts
  const scriptsResult = await addPackageJsonScripts(projectDir);
  if (scriptsResult.isErr()) {
    log.warn(pc.yellow("Failed to add package.json scripts, continuing..."));
  }

  displaySetupInstructions();

  return Result.ok(undefined);
}
