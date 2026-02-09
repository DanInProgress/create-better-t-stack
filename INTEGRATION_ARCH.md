# PocketBase Integration Architecture

This document outlines the architectural approach for integrating **PocketBase** as a backend option in `create-better-t-stack`.

## 1. High-Level Architecture & Role

PocketBase is integrated as a self-contained **Backend-as-a-Service (BaaS)** option, distinct from the traditional "API + Database" layers.

*   **Role:** Replaces the need for a separate API server (Hono, Express, etc.) and Database setup (Prisma, Drizzle, etc.). It provides Authentication, Database (SQLite), and Realtime subscriptions out of the box.
*   **Exclusivity:** It is mutually exclusive with other backend options like "Convex", "Supabase", and "Self (Fullstack)". Selecting PocketBase disables the prompts for API (tRPC/oRPC) and ORM (Prisma/Drizzle).
*   **Deployment Strategy:** Supports two primary deployment modes:
    1.  **Self-Hosted:** Local binary execution (cross-platform) with manual or VPS deployment.
    2.  **PocketHost:** Managed cloud hosting with automated FTP deployment via GitHub Actions.

## 2. CLI & Configuration Schema

The CLI has been extended to support PocketBase as a first-class citizen in the scaffolding process.

### Configuration Extensions
*   **`backend`**: Added `"pocketbase"` as a valid option in `ProjectConfig`.
*   **`pbDeployment`**: New configuration field to store the deployment choice (`"self-hosted" | "pockethost" | "none"`).

### Decision Tree
1.  **Backend Selection:**
    *   User selects **PocketBase** from the backend list in `apps/cli/src/prompts/backend.ts`.
2.  **Deployment Selection:**
    *   If PocketBase is selected, the user is prompted to choose a deployment strategy in `apps/cli/src/prompts/pb-deployment.ts`:
        *   **Self-hosted**: Downloads the binary locally.
        *   **PocketHost**: Configures for PocketHost.io.
        *   **None**: Manual setup.

## 3. Scaffolding & Setup Strategy

Unlike other backends that rely heavily on Handlebars templates in `packages/template-generator`, the PocketBase integration uses **CLI-driven setup helpers** to scaffold the environment dynamically.

### Self-Hosted (`apps/cli/src/helpers/database-providers/pocketbase-self-hosted-setup.ts`)
*   **Binary Management:** Automatically detects the OS and Architecture (Windows/Mac/Linux, AMD64/ARM64) and downloads the appropriate PocketBase binary from GitHub Releases.
*   **Directory Structure:** Creates the following structure in `packages/backend`:
    *   `pb_data/`: SQLite database (gitignored).
    *   `pb_hooks/`: JavaScript hooks for server-side logic.
    *   `pb_migrations/`: Database migrations.
    *   `pb_public/`: Static assets.
*   **Scripts:** Injects scripts into `packages/backend/package.json`:
    *   `dev`: `./pocketbase serve`
    *   `migrate`: `./pocketbase migrate`
    *   `admin:create`: `./pocketbase admin create`

### PocketHost (`apps/cli/src/helpers/database-providers/pocketbase-pockethost-setup.ts`)
*   **Cloud-First Approach:** Skips local binary download (unless requested) and focuses on the deployment pipeline.
*   **Directory Structure:** Creates only `pb_hooks` and `pb_migrations`, as `pb_data` is managed in the cloud.
*   **CI/CD:** Generates a GitHub Actions workflow (`.github/workflows/deploy-pockethost.yml`) that uses `SamKirkland/FTP-Deploy-Action` to sync hooks and migrations to PocketHost via FTPS.

## 4. Dependency Management

Dependencies are injected via `packages/template-generator/src/processors/api-deps.ts`.

*   **SDK Injection:**
    *   Adds `pocketbase` (JS SDK) to `apps/web/package.json`.
    *   Adds `pocketbase` to `apps/native/package.json` (if applicable).
*   **Versioning:** Uses a fixed version (currently `^0.23.4`) defined in `packages/template-generator/src/utils/add-deps.ts`.

## 5. Current Status vs. Intent

### ✅ Implemented (Functional)
*   **CLI Prompts:** Full support for selecting PocketBase and deployment target.
*   **Backend Scaffolding:**
    *   **Self-Hosted:** successfully downloads binary, sets up folders, creates README, and adds scripts.
    *   **PocketHost:** successfully sets up folders, creates README, and generates GitHub Action.
*   **Dependency Injection:** The `pocketbase` SDK is correctly added to frontend and native apps.

### 🚧 Missing (Roadmap / Intent)
*   **Frontend Integration Templates:**
    *   **Client Initialization:** There is currently **no code** generated in `apps/web` (React/Vue/Svelte/etc.) to initialize the PocketBase client (e.g., `lib/pocketbase.ts`).
    *   **Context Provider:** No React Context or similar provider is generated to make the PocketBase instance available throughout the app.
    *   **Example Usage:** No example hooks (e.g., `useAuth`, `useCollection`) or queries are generated.
    *   **Action Item:** The `templates.generated.ts` file in `packages/template-generator` needs to be updated to include PocketBase-specific templates for the frontend, mirroring the implementation of Convex (e.g., `{{#if (eq backend "pocketbase")}}`).

### Summary
The **infrastructure** (CLI, Backend Setup, CI/CD) is complete. The **application logic** (Frontend connection) is the remaining task to fully realize the integration.
