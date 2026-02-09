# INTEGRATION_ARCH.md - PocketBase Integration Strategy

## 1. High-Level Architecture & Role

PocketBase is integrated into the `better-t-stack` as a **Self-Contained Backend-as-a-Service (BaaS)** option. It serves as a complete replacement for the traditional database + ORM + backend API layers found in other stack configurations (e.g., PostgreSQL + Prisma + Hono).

### Role in the Stack
-   **Backend Replacement**: When selected, PocketBase replaces the need for a separate API server (like Hono, Express, etc.). The PocketBase binary *is* the backend.
-   **Database & Auth**: It includes a built-in SQLite database, authentication system, and file storage, eliminating the need for external database services (like Neon, Turso) or auth providers (like Better-Auth, Clerk).
-   **Frontend Integration**: The frontend communicates directly with the PocketBase instance via the client SDK, similar to how one would interact with Firebase or Supabase.

### Mutual Exclusivity
To maintain architectural integrity, the system enforces strict mutual exclusivity rules. Selecting PocketBase as the backend:
-   **Disables Runtime Selection**: The runtime is inherently the PocketBase binary (Go), so Node/Bun runtimes for the backend are irrelevant.
-   **Disables Database & ORM**: Since PocketBase manages its own internal SQLite database, options for external databases (Postgres, MySQL, Mongo) and ORMs (Prisma, Drizzle) are disabled.
-   **Disables Auth & Payments**: Built-in auth is used; external providers are currently disabled to simplify the initial integration.

## 2. CLI & Configuration Schema

The CLI configuration has been extended to support this new architecture seamlessly.

### Schema Extensions
-   **`BackendSchema`**: Updated in `packages/types/src/schemas.ts` to include `"pocketbase"` as a valid enum value.
-   **Validation Logic**: implemented in `apps/cli/src/utils/config-validation.ts`, specifically the `validatePocketBaseConstraints` function. This function ensures that if `backend === 'pocketbase'`, then:
    -   `runtime` must be `'none'`
    -   `database` must be `'none'`
    -   `orm` must be `'none'`
    -   `dbSetup` must be `'none'`

### User Journey
The CLI prompts guide the user towards a valid configuration. If a user selects PocketBase, the validation logic prevents invalid combinations, ensuring the generated project is viable.

## 3. Scaffolding & Setup Strategy

The scaffolding strategy treats PocketBase as a "local-first" development environment that deploys to a managed host (PocketHost) or a self-hosted VPS.

### Directory Structure
The backend template is located at `packages/template-generator/templates/backend/pocketbase`. It generates the following structure in the user's project:
```
packages/backend/
├── pb_hooks/          # Compiled JS hooks (Git-tracked)
├── pb_migrations/     # Database migrations (Git-tracked)
├── src/               # TypeScript source for hooks
│   └── main.pb.ts     # Entry point for hooks
├── package.json       # Manages build scripts & types
├── tsup.config.ts     # Bundler configuration
└── .cursorrules       # AI context rules
```

### Local Binary Management
Unlike Node.js-based backends, PocketBase is distributed as a single Go binary.
-   **Manual Download**: The scaffolding process does *not* automatically download the binary (to avoid OS/arch complexity during scaffolding).
-   **Post-Install Instructions**: The CLI explicitly instructs the user to download the correct PocketBase binary for their OS and place it in `packages/backend/`.
-   **Execution**: The user runs `./pocketbase serve` to start the backend.

### TypeScript to Goja Transpilation
PocketBase uses **Goja** (a Go implementation of ECMAScript 5.1) for its hooks system.
-   **Problem**: Modern TypeScript/JavaScript is not directly compatible with Goja.
-   **Solution**: We use `tsup` to bundle and transpile TypeScript code from `src/` into a single ES5-compatible file in `pb_hooks/`.
-   **Configuration**: The `tsup.config.ts` targets `es5` and bundles all dependencies, ensuring the code runs correctly within the PocketBase runtime.

## 4. Dependency Management

### Backend
-   **Runtime**: The PocketBase binary (managed manually by the user).
-   **Dev Dependencies**:
    -   `pocketbase-typegen`: Generates TypeScript types from the SQLite database schema, ensuring type safety in hooks and the frontend.
    -   `tsup`: Handles the transpilation of hooks.

### Frontend
-   **Client SDK**: The `pocketbase` JavaScript SDK is injected into the frontend `package.json`.
-   **Initialization**: A helper file (`src/lib/pocketbase.ts`) is generated to initialize the client with the correct environment variables.

## 5. Current Status vs. Intent

### Implemented (Functional)
-   **CLI Integration**: Full schema support and validation logic to enforce constraints.
-   **Scaffolding**: correctly generates the folder structure, build configuration (`tsup`), and frontend connection logic.
-   **Hooks System**: The TypeScript-to-ES5 pipeline is fully configured and functional.
-   **Type Safety**: `pocketbase-typegen` is included for generating types from the local DB.

### Intent & Roadmap
-   **Automated Deployment**: A GitHub Actions workflow (`deploy.yml`) is included to deploy `pb_hooks` and `pb_migrations` to **PocketHost** via FTP. This aligns with the "Automated Deployment Pipelines" goal.
-   **Agentic AI Support**: A `.cursorrules` file is included in the backend template. This file provides specific instructions to AI coding assistants (like Cursor) on how to write code for the specific constraints of the PocketBase/Goja environment (e.g., "no async/await", "use $app DAO"). This directly addresses the "Agentic AI" requirement in the project scope.
-   **Frontend Interactions**: Basic client setup is done. Future work may involve generating more advanced React hooks or data fetching wrappers tailored to the user's specific schema.
