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

async function createReadme(backendDir: string): Promise<Result<void, DatabaseSetupError>> {
  const readmeContent = `# PocketBase Backend (PocketHost)

This directory contains your PocketBase backend files for deployment to PocketHost.

## Directory Structure

- \`pb_hooks/\` - Server-side JavaScript hooks for custom logic
- \`pb_migrations/\` - Database migration files

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

For local development, you can:
- Use the PocketHost instance directly (recommended for small projects)
- Run PocketBase locally with \`pocketbase serve\` (requires downloading binary)

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

## Environment Variables

The following environment variables are configured:

- Frontend (\`apps/web/.env\`):
  - \`NEXT_PUBLIC_POCKETBASE_URL\` - Your PocketHost instance URL

## Resources

- [PocketHost Documentation](https://pockethost.io/docs/)
- [PocketBase JavaScript Hooks Guide](https://pocketbase.io/docs/js-overview/)
- [PocketBase Documentation](https://pocketbase.io/docs/)
- [GitHub Actions FTP Deploy](https://github.com/SamKirkland/FTP-Deploy-Action)

## Tips

- Test your hooks locally before deploying
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
      - 'packages/backend/pb_hooks/**'
      - 'packages/backend/pb_migrations/**'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

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

3. ${pc.bold("Set up automated deployment (optional):")}
   Add these secrets to your GitHub repository:
   - ${pc.cyan("POCKETHOST_FTP_HOST")}: ftp.pockethost.io
   - ${pc.cyan("POCKETHOST_FTP_USER")}: (from PocketHost dashboard)
   - ${pc.cyan("POCKETHOST_FTP_PASSWORD")}: (from PocketHost dashboard)

4. ${pc.bold("Develop locally:")}
   - Write your hooks in ${pc.cyan("packages/backend/pb_hooks/")}
   - Create migrations in ${pc.cyan("packages/backend/pb_migrations/")}
   - Push to deploy automatically via GitHub Actions

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
