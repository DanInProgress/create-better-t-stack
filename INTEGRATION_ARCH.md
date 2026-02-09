# INTEGRATION_ARCH.md - PocketBase Integration Strategy

This document outlines the architectural approach, implementation details, and current status of the **PocketBase** backend integration for `create-better-t-stack`.

## 1. High-Level Architecture & Role

**PocketBase** is integrated as a self-contained **Backend-as-a-Service (BaaS)** option, distinct from the traditional monolithic API server or other BaaS solutions like Convex.

*   **Role:** It serves as the primary backend, replacing the need for a separate `packages/api` (REST/TRPC/GraphQL), `packages/db` (ORM/Database), and `apps/server` (Node/Bun runtime). Instead, it utilizes a single binary (`pocketbase`) located in `packages/backend` which manages the database (embedded SQLite), authentication, realtime subscriptions, and file storage.
*   **Exclusivity:** The integration is designed to be **mutually exclusive** with:
    *   **Convex:** Another BaaS option.
    *   **Self (Fullstack):** Where the frontend framework handles API routes.
    *   **None:** No backend.
    *   **Database & ORM:** Since PocketBase manages its own data layer, all external database (Postgres, MySQL, etc.) and ORM (Prisma, Drizzle) selections are disabled.
    *   **Runtime:** The `runtime` option is forced to `none` as PocketBase is a pre-compiled Go binary, not a Node/Bun application.

## 2. CLI & Configuration Schema

The CLI has been extended to support `pocketbase` as a first-class `backend` option, with specific validation rules to enforce the architecture described above.

### Configuration Extensions

*   **`backend`**: Added `"pocketbase"` as a valid value in `ProjectConfig`.
*   **`auth`**: Added `"pocketbase-auth"` as the specific authentication provider for this backend.

### Decision Tree & Prompts

1.  **Backend Selection (`prompts/backend.ts`):**
    *   Users can select "PocketBase" from the list of backend frameworks.
    *   This option is available alongside "Convex", "Hono", "Express", etc.

2.  **Authentication Selection (`prompts/auth.ts`):**
    *   If `backend === "pocketbase"`, the CLI automatically restricts auth options to:
        *   **PocketBase Auth:** Built-in email/password and OAuth2.
        *   **None:** No authentication.
    *   Other providers (Better-Auth, Clerk) are hidden/disabled.

3.  **Validation Logic (`utils/config-validation.ts`):**
    *   **`validatePocketBaseConstraints`**: A dedicated validation function enforces:
        *   `runtime` must be `none`.
        *   `database` must be `none`.
        *   `orm` must be `none`.
        *   `api` must be `none`.
        *   `dbSetup` must be `none`.
        *   `serverDeploy` must be `none` (deployment is manual or via PocketHost).

## 3. Scaffolding & Setup Strategy

The scaffolding strategy prioritizes a "manual binary" approach for the backend, while fully automating the frontend client integration.

### Setup Helpers (`helpers/core/`)

*   **`create-project.ts`**:
    *   Detects `isPocketBase`.
    *   **Skips** `setupDatabase()`: No Docker, D1, or local DB setup is performed since PocketBase is self-contained.
*   **`post-installation.ts`**:
    *   Provides specific **Next Steps** for PocketBase:
        1.  Download the PocketBase binary from `pocketbase.io`.
        2.  Place it in `packages/backend/`.
        3.  Run `./pocketbase serve`.

### Template Generation (`packages/template-generator/`)

*   **Backend (`templates/backend/pocketbase`):**
    *   Generates a `packages/backend` directory.
    *   Includes a `README.md` with setup instructions.
    *   Includes a `pb_schema.json` (if available/planned) for schema sync.
    *   Includes `pb_hooks` for custom backend logic (JavaScript).

*   **Frontend (`templates/auth/pocketbase-auth`):**
    *   **Web (`apps/web`):** Scaffolds `lib/pocketbase.ts` client initialization and Auth components (Sign In, Sign Up) for React/Next.js/Nuxt/Svelte/etc.
    *   **Native (`apps/native`):** Scaffolds `lib/pocketbase.ts` and Auth screens for Expo/React Native.

*   **Examples (`templates/examples/todo`):**
    *   Scaffolds a Todo list implementation using PocketBase SDK for web frontends.
    *   *Note: Native example templates for PocketBase seem to be missing in `examples.ts`.*

## 4. Dependency Management

*   **Backend:**
    *   **Binary:** Managed manually by the user (download & place).
    *   **Hooks:** `pb_hooks` are JavaScript files; `bun` or `npm` dependencies for hooks (if any) would be in `packages/backend/package.json`.

*   **Frontend:**
    *   **`pocketbase` SDK:** Added to `apps/web/package.json` and `apps/native/package.json` dependencies.

*   **Environment Variables (`packages/env`):**
    *   **Generation:** `processors/env-vars.ts` generates `NEXT_PUBLIC_POCKETBASE_URL` (or equivalent) in `.env` files.
    *   **Validation:** `packages/env/src/web.ts` is generated.
    *   **Gap Identified:** The current `web.ts` template expects `NEXT_PUBLIC_SERVER_URL` for non-Convex backends, but the env var generator provides `NEXT_PUBLIC_POCKETBASE_URL`. This causes a validation mismatch that needs to be resolved.

## 5. Current Status vs. Intent

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **CLI Selection** | ✅ Complete | "PocketBase" option available and prompts correctly. |
| **Constraint Enforcement** | ✅ Complete | strict validation prevents incompatible options (DB, ORM, etc). |
| **Backend Scaffolding** | ✅ Complete | Generates `packages/backend` structure. |
| **Frontend Scaffolding** | ⚠️ Partial | Web templates (Auth + Todo) are implemented. Native Auth templates exist, but **Native Todo examples are missing**. |
| **Env Var Configuration** | ❌ **Buggy** | `.env` generation produces `*_POCKETBASE_URL`, but `env/web.ts` validation expects `*_SERVER_URL`. |
| **Deployment** | ⏳ Pending | Currently `serverDeploy` is forced to `none`. Deployment (e.g., PocketHost) is manual. |
| **Binary Management** | ⏳ Manual | User must manually download the binary. Future: Automate via script? |

### Next Steps (Roadmap)

1.  **Fix Env Var Mismatch:** Update `templates/packages/env/src/web.ts.hbs` to recognize `backend === "pocketbase"` and validate `*_POCKETBASE_URL` instead of `*_SERVER_URL`.
2.  **Add Native Examples:** Implement `examples/todo/pocketbase/native` templates in `examples.ts`.
3.  **Automate Binary Download:** Consider adding a `scripts/setup-pocketbase.ts` helper to download the correct binary for the OS/Arch.
4.  **Deployment Integration:** Add `pockethost` or Docker-based deployment options in `serverDeploy`.
