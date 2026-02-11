# Guide 5: Testing, Documentation & Release

## Quick Reference

**Audience**: QA/documentation lead
**Dependencies**: All guides (1-4) must be implementation-complete
**Estimated time**: 2-3 days
**Key deliverables**:

- Comprehensive test suite
- Platform validation (macOS, Linux, Windows)
- User documentation
- Release checklist

---

## Context

This guide covers the final phase of the PocketBase integration: ensuring quality through testing and providing excellent documentation for users. Unlike implementation guides that focus on writing new code, this guide focuses on validation, documentation, and release preparation.

### Why Testing Matters

The PocketBase integration introduces unique complexity:

- Binary downloads vary by OS/architecture
- Two distinct deployment paths (self-hosted vs PocketHost)
- TypeScript hooks compilation with Goja constraints
- Framework-specific environment variable handling
- GitHub Actions CI/CD workflows

Comprehensive testing ensures these components work together seamlessly.

### Why Documentation Matters

Users need clear guidance on:

- When to choose PocketBase over other backends
- How self-hosted vs PocketHost deployment works
- PocketBase-specific development patterns
- Troubleshooting common issues

---

## Testing Strategy

### Test Pyramid

```
         ┌─────────────────┐
         │   E2E Tests     │  Full CLI → Deployed App
         │   (Critical)    │
         ├─────────────────┤
         │ Integration     │  CLI + Template Processing
         │ Tests (Primary) │
         ├─────────────────┤
         │  Unit Tests     │  Binary Download, Validation
         │  (Foundation)   │
         └─────────────────┘
```

**Focus**: Integration and E2E tests are most critical for validating the full scaffolding experience.

---

## 1. Unit Tests

### 1.1 Binary Download Logic

Test platform detection and download URL generation.

**File**: `/apps/cli/test/pocketbase-binary.test.ts`

```typescript
import { describe, expect, it, mock } from "bun:test";
import os from "node:os";
import { getPlatformInfo } from "../src/helpers/database-providers/pocketbase-self-hosted-setup";

describe("PocketBase Binary Detection", () => {
  it("should generate correct download URL for macOS ARM64", () => {
    mock.module("node:os", () => ({
      platform: () => "darwin",
      arch: () => "arm64",
    }));

    const info = getPlatformInfo();
    expect(info.platform).toBe("darwin");
    expect(info.arch).toBe("arm64");
    expect(info.downloadUrl).toContain("darwin_arm64");
  });

  it("should generate correct download URL for Windows AMD64", () => {
    mock.module("node:os", () => ({
      platform: () => "win32",
      arch: () => "x64",
    }));

    const info = getPlatformInfo();
    expect(info.platform).toBe("windows");
    expect(info.arch).toBe("amd64");
    expect(info.downloadUrl).toContain("windows_amd64");
  });

  it("should generate correct download URL for Linux ARM64", () => {
    mock.module("node:os", () => ({
      platform: () => "linux",
      arch: () => "arm64",
    }));

    const info = getPlatformInfo();
    expect(info.platform).toBe("linux");
    expect(info.arch).toBe("arm64");
    expect(info.downloadUrl).toContain("linux_arm64");
  });

  it("should default to amd64 for unsupported architectures", () => {
    mock.module("node:os", () => ({
      platform: () => "linux",
      arch: () => "ia32",
    }));

    const info = getPlatformInfo();
    expect(info.arch).toBe("amd64");
  });
});
```

### 1.2 Validation Logic

Test that PocketBase constraints are enforced correctly.

**File**: `/apps/cli/test/pocketbase-validation.test.ts`

```typescript
import { describe, expect, it } from "bun:test";
import { validateConfig } from "../src/utils/config-validation";
import type { ProjectConfig } from "../src/types";

describe("PocketBase Configuration Validation", () => {
  it("should accept valid PocketBase configuration (self-hosted)", () => {
    const config: ProjectConfig = {
      projectName: "test-pb",
      backend: "pocketbase",
      runtime: "none",
      database: "none",
      orm: "none",
      api: "none",
      auth: "pocketbase-auth",
      frontend: ["next"],
      pbDeployment: "self-hosted",
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "none",
    };

    const result = validateConfig(config);
    expect(result.isOk()).toBe(true);
  });

  it("should accept valid PocketBase configuration (PocketHost)", () => {
    const config: ProjectConfig = {
      projectName: "test-pb-host",
      backend: "pocketbase",
      runtime: "none",
      database: "none",
      orm: "none",
      api: "none",
      auth: "pocketbase-auth",
      frontend: ["tanstack-router"],
      pbDeployment: "pockethost",
      dbSetup: "none",
      webDeploy: "none",
      serverDeploy: "none",
    };

    const result = validateConfig(config);
    expect(result.isOk()).toBe(true);
  });

  it("should reject PocketBase with non-none runtime", () => {
    const config: ProjectConfig = {
      projectName: "test-pb-invalid",
      backend: "pocketbase",
      runtime: "bun", // Invalid
      database: "none",
      orm: "none",
      api: "none",
      auth: "pocketbase-auth",
      frontend: ["next"],
      pbDeployment: "self-hosted",
    };

    const result = validateConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr().message).toContain("PocketBase backend requires '--runtime none'");
  });

  it("should reject PocketBase with external database", () => {
    const config: ProjectConfig = {
      projectName: "test-pb-invalid-db",
      backend: "pocketbase",
      runtime: "none",
      database: "postgres", // Invalid
      orm: "none",
      api: "none",
      auth: "pocketbase-auth",
      frontend: ["next"],
      pbDeployment: "self-hosted",
    };

    const result = validateConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr().message).toContain("PocketBase backend requires '--database none'");
  });

  it("should reject PocketBase with external ORM", () => {
    const config: ProjectConfig = {
      projectName: "test-pb-invalid-orm",
      backend: "pocketbase",
      runtime: "none",
      database: "none",
      orm: "drizzle", // Invalid
      api: "none",
      auth: "pocketbase-auth",
      frontend: ["next"],
      pbDeployment: "self-hosted",
    };

    const result = validateConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr().message).toContain("PocketBase backend requires '--orm none'");
  });

  it("should accept PocketBase with no auth", () => {
    const config: ProjectConfig = {
      projectName: "test-pb-no-auth",
      backend: "pocketbase",
      runtime: "none",
      database: "none",
      orm: "none",
      api: "none",
      auth: "none", // Valid
      frontend: ["next"],
      pbDeployment: "self-hosted",
    };

    const result = validateConfig(config);
    expect(result.isOk()).toBe(true);
  });
});
```

---

## 2. Integration Tests

### 2.1 CLI Flow Tests

Test the complete CLI scaffolding process.

**File**: `/apps/cli/test/pocketbase-integration.test.ts`

```typescript
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { rmSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { runTRPCTest, expectSuccess, type TestConfig } from "./test-utils";

const TEST_OUTPUT_DIR = path.join(process.cwd(), "test-output");

describe("PocketBase Integration Tests", () => {
  beforeAll(() => {
    // Clean up test output directory
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Clean up after tests
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe("Self-Hosted Deployment", () => {
    it("should create PocketBase project with self-hosted deployment", async () => {
      const config: TestConfig = {
        projectName: "pb-self-hosted-test",
        backend: "pocketbase",
        runtime: "none",
        database: "none",
        orm: "none",
        api: "none",
        auth: "pocketbase-auth",
        frontend: ["next"],
        pbDeployment: "self-hosted",
        addons: ["biome"],
        examples: ["todo"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
        install: false,
      };

      const result = await runTRPCTest(config);
      expectSuccess(result);

      // Verify directory structure
      const projectPath = path.join(TEST_OUTPUT_DIR, "pb-self-hosted-test");
      const backendPath = path.join(projectPath, "packages", "backend");

      expect(existsSync(backendPath)).toBe(true);
      expect(existsSync(path.join(backendPath, "src"))).toBe(true);
      expect(existsSync(path.join(backendPath, "pb_hooks"))).toBe(true);
      expect(existsSync(path.join(backendPath, "pb_migrations"))).toBe(true);
      expect(existsSync(path.join(backendPath, "pb_public"))).toBe(true);
      expect(existsSync(path.join(backendPath, "esbuild.config.js"))).toBe(true);
      expect(existsSync(path.join(backendPath, "biome.json"))).toBe(true);
      expect(existsSync(path.join(backendPath, "pocketbase.d.ts"))).toBe(true);
      expect(existsSync(path.join(backendPath, ".cursorrules"))).toBe(true);
      expect(existsSync(path.join(backendPath, "README.md"))).toBe(true);

      // Verify package.json scripts
      const packageJson = require(path.join(backendPath, "package.json"));
      expect(packageJson.scripts.dev).toBeDefined();
      expect(packageJson.scripts.build).toBeDefined();
      expect(packageJson.scripts.serve).toBeDefined();
    });

    it("should create PocketBase project with Next.js frontend", async () => {
      const config: TestConfig = {
        projectName: "pb-nextjs-test",
        backend: "pocketbase",
        runtime: "none",
        database: "none",
        orm: "none",
        api: "none",
        auth: "pocketbase-auth",
        frontend: ["next"],
        pbDeployment: "self-hosted",
        addons: ["none"],
        examples: ["todo"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
        install: false,
      };

      const result = await runTRPCTest(config);
      expectSuccess(result);

      const projectPath = path.join(TEST_OUTPUT_DIR, "pb-nextjs-test");
      const webPath = path.join(projectPath, "apps", "web");

      // Verify frontend integration
      expect(existsSync(path.join(webPath, "lib", "pocketbase.ts"))).toBe(true);
      expect(existsSync(path.join(webPath, "components", "auth"))).toBe(true);

      // Verify environment variables
      const envExample = path.join(projectPath, ".env.example");
      expect(existsSync(envExample)).toBe(true);
      const envContent = require("node:fs").readFileSync(envExample, "utf-8");
      expect(envContent).toContain("NEXT_PUBLIC_POCKETBASE_URL");
    });

    it("should create PocketBase project with TanStack Router", async () => {
      const config: TestConfig = {
        projectName: "pb-tanstack-test",
        backend: "pocketbase",
        runtime: "none",
        database: "none",
        orm: "none",
        api: "none",
        auth: "pocketbase-auth",
        frontend: ["tanstack-router"],
        pbDeployment: "self-hosted",
        addons: ["none"],
        examples: ["none"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
        install: false,
      };

      const result = await runTRPCTest(config);
      expectSuccess(result);

      const projectPath = path.join(TEST_OUTPUT_DIR, "pb-tanstack-test");
      const webPath = path.join(projectPath, "apps", "web");

      // Verify environment variable naming for Vite
      const envExample = path.join(projectPath, ".env.example");
      expect(existsSync(envExample)).toBe(true);
      const envContent = require("node:fs").readFileSync(envExample, "utf-8");
      expect(envContent).toContain("VITE_POCKETBASE_URL");
    });
  });

  describe("PocketHost Deployment", () => {
    it("should create PocketBase project with PocketHost deployment", async () => {
      const config: TestConfig = {
        projectName: "pb-pockethost-test",
        backend: "pocketbase",
        runtime: "none",
        database: "none",
        orm: "none",
        api: "none",
        auth: "pocketbase-auth",
        frontend: ["next"],
        pbDeployment: "pockethost",
        addons: ["none"],
        examples: ["none"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
        install: false,
      };

      const result = await runTRPCTest(config);
      expectSuccess(result);

      const projectPath = path.join(TEST_OUTPUT_DIR, "pb-pockethost-test");
      const backendPath = path.join(projectPath, "packages", "backend");

      // Verify backend structure (no pb_data or binary for PocketHost)
      expect(existsSync(backendPath)).toBe(true);
      expect(existsSync(path.join(backendPath, "src"))).toBe(true);
      expect(existsSync(path.join(backendPath, "pb_hooks"))).toBe(true);
      expect(existsSync(path.join(backendPath, "pb_migrations"))).toBe(true);

      // Verify GitHub Actions workflow
      const workflowPath = path.join(projectPath, ".github", "workflows", "deploy-pockethost.yml");
      expect(existsSync(workflowPath)).toBe(true);

      const workflowContent = require("node:fs").readFileSync(workflowPath, "utf-8");
      expect(workflowContent).toContain("Deploy to PocketHost");
      expect(workflowContent).toContain("FTP-Deploy-Action");
      expect(workflowContent).toContain("pb_hooks");
      expect(workflowContent).toContain("pb_migrations");
    });
  });

  describe("Authentication Integration", () => {
    it("should create auth components for Next.js", async () => {
      const config: TestConfig = {
        projectName: "pb-auth-next-test",
        backend: "pocketbase",
        runtime: "none",
        database: "none",
        orm: "none",
        api: "none",
        auth: "pocketbase-auth",
        frontend: ["next"],
        pbDeployment: "self-hosted",
        addons: ["none"],
        examples: ["none"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
        install: false,
      };

      const result = await runTRPCTest(config);
      expectSuccess(result);

      const projectPath = path.join(TEST_OUTPUT_DIR, "pb-auth-next-test");
      const authPath = path.join(projectPath, "apps", "web", "components", "auth");

      expect(existsSync(path.join(authPath, "sign-in.tsx"))).toBe(true);
      expect(existsSync(path.join(authPath, "sign-up.tsx"))).toBe(true);
      expect(existsSync(path.join(authPath, "user-menu.tsx"))).toBe(true);
    });

    it("should work with auth: none", async () => {
      const config: TestConfig = {
        projectName: "pb-no-auth-test",
        backend: "pocketbase",
        runtime: "none",
        database: "none",
        orm: "none",
        api: "none",
        auth: "none",
        frontend: ["next"],
        pbDeployment: "self-hosted",
        addons: ["none"],
        examples: ["none"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
        install: false,
      };

      const result = await runTRPCTest(config);
      expectSuccess(result);

      const projectPath = path.join(TEST_OUTPUT_DIR, "pb-no-auth-test");
      const authPath = path.join(projectPath, "apps", "web", "components", "auth");

      // Should not create auth components
      expect(existsSync(authPath)).toBe(false);
    });
  });

  describe("Example Templates", () => {
    it("should create todo example with PocketBase", async () => {
      const config: TestConfig = {
        projectName: "pb-todo-test",
        backend: "pocketbase",
        runtime: "none",
        database: "none",
        orm: "none",
        api: "none",
        auth: "pocketbase-auth",
        frontend: ["next"],
        pbDeployment: "self-hosted",
        addons: ["none"],
        examples: ["todo"],
        dbSetup: "none",
        webDeploy: "none",
        serverDeploy: "none",
        install: false,
      };

      const result = await runTRPCTest(config);
      expectSuccess(result);

      const projectPath = path.join(TEST_OUTPUT_DIR, "pb-todo-test");
      const examplesPath = path.join(projectPath, "apps", "web", "components", "examples");

      expect(existsSync(path.join(examplesPath, "todo-list.tsx"))).toBe(true);
    });
  });
});
```

---

## 3. E2E Test Scenarios

### 3.1 Complete Auth Flow

**Test scenario**: User signs up, logs in, and accesses protected resources.

**Manual test steps**:

1. **Scaffold project**:

   ```bash
   bun create better-t-stack pb-auth-e2e \
     --backend pocketbase \
     --pb-deployment self-hosted \
     --auth pocketbase-auth \
     --frontend next \
     --examples todo \
     --install
   ```

2. **Download PocketBase binary**:

   ```bash
   cd pb-auth-e2e/packages/backend
   # Download from https://pocketbase.io/docs/
   # Place binary in packages/backend/
   chmod +x ./pocketbase
   ```

3. **Start PocketBase**:

   ```bash
   ./pocketbase serve
   ```

4. **Create admin account**:
   - Navigate to `http://127.0.0.1:8090/_/`
   - Create admin account
   - Create `users` collection with email/password auth

5. **Start frontend**:

   ```bash
   cd ../../apps/web
   bun dev
   ```

6. **Test auth flow**:
   - Navigate to sign-up page
   - Create new user account
   - Verify redirect to dashboard
   - Log out
   - Log back in
   - Verify session persistence

7. **Test todo CRUD**:
   - Create new todo item
   - Mark todo as complete
   - Delete todo item
   - Verify realtime updates (if implemented)

**Expected results**:

- ✅ Sign-up creates user in PocketBase
- ✅ Login returns valid auth token
- ✅ Protected routes require authentication
- ✅ User menu displays correct user info
- ✅ Todo operations work correctly
- ✅ Environment variables are correctly loaded

### 3.2 Binary Download Flow

**Test scenario**: Verify binary downloads correctly on different platforms.

**Platforms to test**:

- macOS ARM64 (Apple Silicon)
- macOS AMD64 (Intel)
- Linux AMD64
- Linux ARM64
- Windows AMD64

**Manual test steps** (per platform):

1. **Scaffold project**:

   ```bash
   bun create better-t-stack pb-binary-test \
     --backend pocketbase \
     --pb-deployment self-hosted \
     --frontend next
   ```

2. **Verify binary download**:
   - Check that binary exists in `packages/backend/`
   - Verify executable permissions (Unix-like)
   - Verify correct OS/arch in filename

3. **Test binary execution**:
   ```bash
   cd packages/backend
   ./pocketbase --version  # Unix-like
   pocketbase.exe --version  # Windows
   ```

**Expected results**:

- ✅ Correct binary downloaded for platform
- ✅ Binary has executable permissions
- ✅ Binary runs without errors
- ✅ Version matches expected release

### 3.3 Template Processing Flow

**Test scenario**: Verify hooks compilation and template processing.

**Manual test steps**:

1. **Scaffold project with hooks**:

   ```bash
   bun create better-t-stack pb-hooks-test \
     --backend pocketbase \
     --pb-deployment self-hosted \
     --frontend next \
     --install
   ```

2. **Write TypeScript hook**:

   ```typescript
   // packages/backend/src/main.pb.ts
   onModelAfterCreate((e) => {
     console.log("New record created:", e.model.tableName());
   }, "users");
   ```

3. **Build hooks**:

   ```bash
   cd packages/backend
   bun run build
   ```

4. **Verify compiled output**:
   - Check `pb_hooks/main.pb.js` exists
   - Verify ES2020 syntax (arrow functions, destructuring)
   - Verify no async/await in output
   - Verify no ES module imports

5. **Test hook execution**:
   ```bash
   ./pocketbase serve
   # Create user via admin UI or API
   # Verify console log appears
   ```

**Expected results**:

- ✅ TypeScript compiles without errors
- ✅ Output is Goja-compatible
- ✅ Biome linting passes
- ✅ Hooks execute in PocketBase runtime
- ✅ Console logs appear in terminal

### 3.4 PocketHost Deployment Flow

**Test scenario**: Verify GitHub Actions deployment to PocketHost.

**Prerequisites**:

- PocketHost account
- GitHub repository
- FTP credentials configured as secrets

**Manual test steps**:

1. **Scaffold project**:

   ```bash
   bun create better-t-stack pb-deploy-test \
     --backend pocketbase \
     --pb-deployment pockethost \
     --frontend next \
     --install
   ```

2. **Configure GitHub secrets**:
   - `POCKETHOST_FTP_HOST`
   - `POCKETHOST_FTP_USER`
   - `POCKETHOST_FTP_PASSWORD`

3. **Commit and push**:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <repo-url>
   git push -u origin main
   ```

4. **Verify workflow execution**:
   - Check GitHub Actions tab
   - Verify hooks build step succeeds
   - Verify FTP upload completes
   - Check PocketHost instance for deployed files

5. **Test deployed instance**:
   - Update PocketBase URL in `.env`
   - Start frontend locally
   - Verify connection to PocketHost instance

**Expected results**:

- ✅ GitHub Actions workflow triggers
- ✅ Hooks build successfully
- ✅ Files upload via FTP
- ✅ PocketHost instance restarts with new hooks
- ✅ Frontend connects to deployed backend

---

## 4. Platform Testing Matrix

### Cross-Platform Validation

Test the complete scaffolding and execution flow on each platform:

| Platform | OS           | Architecture | Binary | Scripts | Build | Runtime |
| -------- | ------------ | ------------ | ------ | ------- | ----- | ------- |
| macOS    | Ventura+     | ARM64        | ✓      | ✓       | ✓     | ✓       |
| macOS    | Ventura+     | AMD64        | ✓      | ✓       | ✓     | ✓       |
| Linux    | Ubuntu 22.04 | AMD64        | ✓      | ✓       | ✓     | ✓       |
| Linux    | Ubuntu 22.04 | ARM64        | ✓      | ✓       | ✓     | ✓       |
| Windows  | 11           | AMD64        | ✓      | ✓       | ✓     | ✓       |

**Test checklist per platform**:

1. ✅ CLI runs without errors
2. ✅ Binary downloads correctly
3. ✅ Binary is executable
4. ✅ Hooks compile successfully
5. ✅ PocketBase serves on port 8090
6. ✅ Frontend connects to backend
7. ✅ Auth flow works end-to-end

### Known Platform Issues

**Windows**:

- Binary extraction may require manual unzip
- Path separators differ (use `path.join()`)
- Executable permissions not applicable

**Linux ARM64**:

- Verify Goja compatibility on ARM architecture
- Test on Raspberry Pi if available

**macOS**:

- Gatekeeper may block unsigned binary
- Users may need to allow in System Preferences

---

## 5. Documentation Requirements

### 5.1 Main README Updates

**File**: `/packages/create-bts/README.md`

**Changes needed**:

1. **Add PocketBase to backend options**:

```markdown
## Backend Options

- **Hono**: Lightweight web framework
- **Express**: Traditional Node.js framework
- **Fastify**: High-performance framework
- **Elysia**: Bun-first framework
- **Convex**: Backend-as-a-Service
- **PocketBase**: Open-source BaaS with SQLite (NEW)
- **Self**: Fullstack framework (Next.js, Nuxt)
- **None**: Frontend-only
```

2. **Add PocketBase example**:

````markdown
### PocketBase + Next.js

```bash
bun create better-t-stack my-app \
  --backend pocketbase \
  --pb-deployment self-hosted \
  --auth pocketbase-auth \
  --frontend next \
  --examples todo
```
````

Creates a project with:

- PocketBase backend with auto-downloaded binary
- Built-in authentication
- SQLite database
- TypeScript hooks with Goja runtime
- Next.js frontend with auth components

````

### 5.2 PocketBase-Specific Guide

**File**: `/docs/backends/pocketbase.md`

Create comprehensive PocketBase documentation:

```markdown
# PocketBase Backend Guide

## Overview

PocketBase is an open-source Backend-as-a-Service with built-in:
- SQLite database
- Authentication (email/password, OAuth2)
- Realtime subscriptions
- File storage
- Admin dashboard
- JavaScript hooks runtime (Goja)

## When to Choose PocketBase

**Choose PocketBase if**:
- You want a simple, self-contained backend
- SQLite is sufficient for your data needs
- You prefer file-based databases over managed services
- You want built-in auth without third-party providers
- You need realtime subscriptions out of the box

**Consider alternatives if**:
- You need PostgreSQL/MySQL-specific features
- Your app requires complex joins across large datasets
- You prefer ORM-based development (Prisma, Drizzle)
- You need multi-region distributed databases

## Deployment Options

### Self-Hosted

**Pros**:
- Full control over infrastructure
- No vendor lock-in
- Cost-effective for small projects
- Local development identical to production

**Cons**:
- Manual server management
- Requires VPS or hosting setup
- You handle backups and scaling

**Best for**: Side projects, internal tools, prototypes

### PocketHost

**Pros**:
- Managed hosting with automatic backups
- Zero-config deployment
- GitHub Actions CI/CD included
- Free tier available

**Cons**:
- Vendor lock-in
- Less control over infrastructure
- May have usage limits

**Best for**: Production apps, client projects, rapid deployment

## Getting Started

### Self-Hosted Setup

1. **Scaffold project**:
   ```bash
   bun create better-t-stack my-app \
     --backend pocketbase \
     --pb-deployment self-hosted \
     --auth pocketbase-auth \
     --frontend next
````

2. **Binary auto-download**:
   The CLI automatically downloads the correct PocketBase binary for your OS/architecture and places it in `packages/backend/`.

3. **Start PocketBase**:

   ```bash
   cd packages/backend
   ./pocketbase serve
   ```

4. **Create admin account**:
   Navigate to `http://127.0.0.1:8090/_/` and create your admin account.

5. **Start frontend**:
   ```bash
   cd ../../apps/web
   bun dev
   ```

### PocketHost Setup

1. **Scaffold project**:

   ```bash
   bun create better-t-stack my-app \
     --backend pocketbase \
     --pb-deployment pockethost \
     --auth pocketbase-auth \
     --frontend next
   ```

2. **Create PocketHost instance**:
   - Sign up at [pockethost.io](https://pockethost.io)
   - Create a new instance
   - Note your instance URL and FTP credentials

3. **Configure GitHub secrets**:

   ```
   POCKETHOST_FTP_HOST=ftp.pockethost.io
   POCKETHOST_FTP_USER=<your-username>
   POCKETHOST_FTP_PASSWORD=<your-password>
   ```

4. **Push to GitHub**:

   ```bash
   git push origin main
   ```

   The GitHub Actions workflow automatically deploys your hooks and migrations.

## Development Workflow

### TypeScript Hooks

Write hooks in TypeScript with full type safety:

```typescript
// packages/backend/src/main.pb.ts
onModelAfterCreate((e) => {
  console.log("User created:", e.model.get("email"));

  // Send welcome email
  const mailer = new MailerMessage({
    from: { address: "noreply@example.com" },
    to: [{ address: e.model.get("email") }],
    subject: "Welcome!",
    html: "<p>Welcome to our app!</p>",
  });

  $app.newMailClient().send(mailer);
}, "users");
```

**Build hooks**:

```bash
cd packages/backend
bun run build
```

**Watch mode**:

```bash
bun run dev
```

### Goja Runtime Constraints

PocketBase uses Goja (ES5.1 implementation). Follow these rules:

**Allowed**:

- ✅ Arrow functions
- ✅ Classes
- ✅ Destructuring
- ✅ Template literals
- ✅ Spread operator
- ✅ Optional chaining
- ✅ Nullish coalescing

**Not allowed**:

- ❌ async/await (no event loop)
- ❌ ES modules (use CommonJS)
- ❌ Top-level await
- ❌ Dynamic imports

The build system (esbuild) and linter (Biome) enforce these constraints.

### Database Migrations

Create migrations via the admin UI:

1. Go to `http://127.0.0.1:8090/_/`
2. Create/modify collections
3. Export collections (Settings > Export collections)
4. Migrations are auto-generated in `pb_migrations/`

**Manual migrations**:

```javascript
// packages/backend/pb_migrations/1234567890_add_todos.js
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("todos");

  collection.schema.addField(
    new SchemaField({
      name: "status",
      type: "select",
      options: {
        values: ["pending", "completed"],
      },
    }),
  );

  return dao.saveCollection(collection);
});
```

## Frontend Integration

### Client Initialization

The PocketBase client is initialized in `lib/pocketbase.ts`:

```typescript
import PocketBase from "pocketbase";

export const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL);

// Optional: Auto-refresh auth
pb.autoCancellation(false);
```

### Authentication

**Sign up**:

```typescript
const record = await pb.collection("users").create({
  email: "user@example.com",
  password: "securepassword",
  passwordConfirm: "securepassword",
  name: "John Doe",
});
```

**Sign in**:

```typescript
const authData = await pb
  .collection("users")
  .authWithPassword("user@example.com", "securepassword");

console.log(authData.token);
console.log(authData.record);
```

**Sign out**:

```typescript
pb.authStore.clear();
```

**Check auth state**:

```typescript
const isLoggedIn = pb.authStore.isValid;
const user = pb.authStore.model;
```

### CRUD Operations

**Create**:

```typescript
const record = await pb.collection("todos").create({
  title: "Buy groceries",
  completed: false,
  userId: pb.authStore.model?.id,
});
```

**Read**:

```typescript
// Get all
const records = await pb.collection("todos").getFullList();

// Get one
const record = await pb.collection("todos").getOne("RECORD_ID");

// Filter
const filtered = await pb.collection("todos").getList(1, 50, {
  filter: "completed = false",
});
```

**Update**:

```typescript
const record = await pb.collection("todos").update("RECORD_ID", {
  completed: true,
});
```

**Delete**:

```typescript
await pb.collection("todos").delete("RECORD_ID");
```

### Realtime Subscriptions

```typescript
pb.collection("todos").subscribe("*", (e) => {
  console.log(e.action); // create, update, delete
  console.log(e.record);
});

// Unsubscribe
pb.collection("todos").unsubscribe();
```

## API Reference

### Goja Global Objects

Available in hooks:

```typescript
$app: App; // PocketBase app instance
$http: HttpClient; // HTTP client
$security: Security; // Security utilities
$tokens: Tokens; // Token management
$mails: MailClient; // Email client
$os: OS; // OS utilities
$template: Template; // Template engine
```

### PocketBase SDK

Available in frontend:

```typescript
pb.collection(name); // Collection operations
pb.authStore; // Auth state management
pb.files; // File uploads/downloads
pb.realtime; // Realtime subscriptions
pb.admins; // Admin operations
pb.logs; // Log viewing
```

Full API reference: [PocketBase SDK Docs](https://github.com/pocketbase/js-sdk)

## Troubleshooting

### Binary Not Found

**Symptom**: `./pocketbase: command not found`

**Solution**:

1. Verify binary exists: `ls -la packages/backend/pocketbase`
2. Check permissions: `chmod +x packages/backend/pocketbase`
3. Re-download manually from [pocketbase.io](https://pocketbase.io/docs/)

### Hooks Not Compiling

**Symptom**: `Build failed: async/await is not supported`

**Solution**:

- Remove all `async`/`await` keywords
- Use synchronous APIs provided by PocketBase
- Check Biome linting for other Goja constraints

### Port Already in Use

**Symptom**: `Failed to serve: address already in use`

**Solution**:

```bash
# Find process using port 8090
lsof -i :8090

# Kill process
kill -9 <PID>
```

### FTP Deployment Fails

**Symptom**: GitHub Actions fails with "FTP connection timeout"

**Solution**:

1. Verify FTP credentials in GitHub secrets
2. Check PocketHost instance is running
3. Ensure `packages/backend/pb_hooks/` exists
4. Verify workflow triggers on correct paths

### Environment Variables Not Loading

**Symptom**: `pb` client shows undefined URL

**Solution**:

1. Check `.env` file exists
2. Verify correct variable name for framework:
   - Next.js: `NEXT_PUBLIC_POCKETBASE_URL`
   - Vite: `VITE_POCKETBASE_URL`
   - Nuxt: `NUXT_PUBLIC_POCKETBASE_URL`
3. Restart dev server after changing `.env`

## Production Deployment

### Self-Hosted VPS

**Requirements**:

- Linux server (Ubuntu 22.04 recommended)
- systemd for process management
- Reverse proxy (nginx/Caddy)

**Setup**:

1. Upload PocketBase binary and `pb_data/` to server
2. Create systemd service:

   ```ini
   [Unit]
   Description=PocketBase
   After=network.target

   [Service]
   Type=simple
   User=pocketbase
   WorkingDirectory=/opt/pocketbase
   ExecStart=/opt/pocketbase/pocketbase serve --http 0.0.0.0:8090
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

3. Configure nginx reverse proxy
4. Set up SSL with Let's Encrypt

### Docker

**Dockerfile**:

```dockerfile
FROM alpine:latest

RUN apk add --no-cache ca-certificates unzip wget

RUN wget https://github.com/pocketbase/pocketbase/releases/download/v0.23.4/pocketbase_0.23.4_linux_amd64.zip \
    && unzip pocketbase_0.23.4_linux_amd64.zip -d /pb/

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
```

### PocketHost Production

1. Push to GitHub main branch
2. GitHub Actions deploys automatically
3. PocketHost handles scaling and backups
4. Update frontend env vars to production URL

## Best Practices

1. **Use migrations for schema changes**: Never manually edit collections in production
2. **Enable auth rules**: Set collection permissions in admin UI
3. **Backup regularly**: PocketBase stores everything in `pb_data/data.db`
4. **Use environment variables**: Never hardcode URLs or credentials
5. **Monitor logs**: Check admin UI logs for errors and performance issues
6. **Test hooks locally**: Always test hooks before deploying to production

## Next Steps

- [Auth Components Guide](./auth-components.md)
- [Todo Example Walkthrough](./examples/todo.md)
- [Deployment Best Practices](./deployment.md)
- [PocketBase Official Docs](https://pocketbase.io/docs/)

````

### 5.3 Quickstart Examples

**File**: `/docs/quickstart/pocketbase-self-hosted.md`

```markdown
# Quickstart: PocketBase Self-Hosted

Get a full-stack app running in 5 minutes.

## 1. Scaffold Project

```bash
bun create better-t-stack my-pocketbase-app \
  --backend pocketbase \
  --pb-deployment self-hosted \
  --auth pocketbase-auth \
  --frontend next \
  --examples todo \
  --install
````

## 2. Start PocketBase

```bash
cd my-pocketbase-app/packages/backend
./pocketbase serve
```

Open `http://127.0.0.1:8090/_/` and create an admin account.

## 3. Start Frontend

```bash
cd ../../apps/web
bun dev
```

Open `http://localhost:3000` and see your app!

## 4. Next Steps

- Create a user account via the sign-up page
- Add a todo item
- Check the PocketBase admin UI to see the data
- Modify `packages/backend/src/main.pb.ts` to add custom hooks

````

**File**: `/docs/quickstart/pocketbase-pockethost.md`

```markdown
# Quickstart: PocketBase with PocketHost

Deploy to production with GitHub Actions.

## 1. Create PocketHost Instance

1. Sign up at [pockethost.io](https://pockethost.io)
2. Create a new instance
3. Note your instance URL: `https://your-instance.pockethost.io`
4. Get FTP credentials from instance settings

## 2. Scaffold Project

```bash
bun create better-t-stack my-app \
  --backend pocketbase \
  --pb-deployment pockethost \
  --auth pocketbase-auth \
  --frontend next \
  --install
````

## 3. Configure GitHub

1. Create GitHub repository
2. Add secrets:
   - `POCKETHOST_FTP_HOST`: `ftp.pockethost.io`
   - `POCKETHOST_FTP_USER`: Your PocketHost username
   - `POCKETHOST_FTP_PASSWORD`: Your FTP password

## 4. Deploy

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

GitHub Actions automatically deploys your hooks!

## 5. Update Frontend

Update `.env`:

```
NEXT_PUBLIC_POCKETBASE_URL=https://your-instance.pockethost.io
```

Start frontend:

```bash
cd apps/web
bun dev
```

Your app is now connected to production!

````

### 5.4 README Generation

Update the backend README template to be more comprehensive.

**File**: `/packages/template-generator/templates/backend/pocketbase/packages/backend/README.md.hbs`

```handlebars
# PocketBase Backend

This directory contains your PocketBase backend configuration, hooks, and migrations.

## Directory Structure

````

packages/backend/
├── src/ # TypeScript hooks source
│ └── main.pb.ts # Main hooks entry point
├── pb_hooks/ # Compiled JavaScript hooks (auto-generated)
├── pb_migrations/ # Database migrations
├── pb_public/ # Static files served by PocketBase
{{#if (eq pbDeployment "self-hosted")}}
├── pb_data/ # SQLite database (gitignored)
├── pocketbase # PocketBase binary (gitignored)
{{/if}}
├── esbuild.config.js # Build configuration
├── biome.json # Linter configuration
├── pocketbase.d.ts # Type definitions
├── .cursorrules # AI assistant guidance
└── README.md

````

## Getting Started

{{#if (eq pbDeployment "self-hosted")}}
### Self-Hosted Setup

1. **Start PocketBase**:
   ```bash
   ./pocketbase serve
````

2. **Access Admin UI**:
   Navigate to `http://127.0.0.1:8090/_/` and create your admin account.

3. **API Endpoint**:
   Your API is available at `http://127.0.0.1:8090/api/`
   {{else}}

### PocketHost Setup

This project is configured for [PocketHost](https://pockethost.io) deployment.

1. **Create PocketHost instance** at [pockethost.io](https://pockethost.io)

2. **Configure GitHub secrets**:
   - `POCKETHOST_FTP_HOST`
   - `POCKETHOST_FTP_USER`
   - `POCKETHOST_FTP_PASSWORD`

3. **Push to GitHub**:

   ```bash
   git push origin main
   ```

   Hooks and migrations will automatically deploy via GitHub Actions.

4. **Update frontend env vars**:
   ```
   {{getFrontendEnvVar "POCKETBASE_URL"}}=https://your-instance.pockethost.io
   ```
   {{/if}}

## Development Workflow

### Writing Hooks

Hooks are written in TypeScript and compiled to JavaScript for the Goja runtime.

**Example hook** (`src/main.pb.ts`):

```typescript
onModelAfterCreate((e) => {
  console.log("New user created:", e.model.get("email"));
}, "users");
```

### Building Hooks

**Build once**:

```bash
bun run build
```

**Watch mode** (rebuilds on changes):

```bash
bun run dev
```

### Goja Runtime Constraints

PocketBase uses Goja (ES5.1 runtime). Follow these rules:

**Allowed**:

- ✅ Arrow functions, classes, destructuring
- ✅ Optional chaining, nullish coalescing
- ✅ Template literals, spread operator

**Not allowed**:

- ❌ async/await (no event loop)
- ❌ ES modules (use CommonJS)
- ❌ Top-level await
- ❌ Dynamic imports

The linter (Biome) will catch violations of these constraints.

## Database Migrations

### Creating Migrations

1. Open admin UI: `http://127.0.0.1:8090/_/`
2. Create or modify collections
3. Migrations are auto-generated in `pb_migrations/`

### Applying Migrations

Migrations are automatically applied when PocketBase starts.

**Manual migration**:

```bash
./pocketbase migrate
```

## Scripts

- `bun run dev`: Build hooks in watch mode
- `bun run build`: Build hooks once
- `bun run serve`: Start PocketBase (alias for `./pocketbase serve`)
  {{#if (eq pbDeployment "self-hosted")}}
- `bun run migrate`: Apply migrations
- `bun run admin:create`: Create admin account via CLI
  {{/if}}

## Type Definitions

Type definitions for the Goja runtime are provided in `pocketbase.d.ts`.

**Available globals**:

- `$app`: PocketBase app instance
- `$http`: HTTP client
- `$security`: Security utilities
- `$tokens`: Token management
- `$mails`: Email client

## Resources

- [PocketBase Docs](https://pocketbase.io/docs/)
- [Goja Runtime Docs](https://github.com/dop251/goja)
- [PocketBase SDK](https://github.com/pocketbase/js-sdk)

{{#if (eq pbDeployment "pockethost")}}

## Deployment

Deployment is handled automatically via GitHub Actions. On push to `main`:

1. Hooks are built from TypeScript
2. `pb_hooks/` and `pb_migrations/` are uploaded to PocketHost via FTP
3. PocketHost instance restarts with new hooks

**Manual deployment**:
See `.github/workflows/deploy-pockethost.yml` for deployment configuration.
{{/if}}

````

---

## 6. Release Checklist

### Pre-Release Validation

- [ ] **All tests pass**
  - [ ] Unit tests (validation, binary detection)
  - [ ] Integration tests (CLI scaffolding)
  - [ ] E2E tests (auth flow, CRUD operations)

- [ ] **Platform testing complete**
  - [ ] macOS ARM64 (Apple Silicon)
  - [ ] macOS AMD64 (Intel)
  - [ ] Linux AMD64
  - [ ] Linux ARM64
  - [ ] Windows AMD64

- [ ] **Documentation complete**
  - [ ] Main README updated with PocketBase
  - [ ] PocketBase guide created
  - [ ] Quickstart examples written
  - [ ] API reference complete
  - [ ] Troubleshooting guide comprehensive

- [ ] **Template quality**
  - [ ] README generation works correctly
  - [ ] Environment variables generated correctly
  - [ ] Auth components scaffold properly
  - [ ] Todo example works end-to-end

- [ ] **Deployment workflows tested**
  - [ ] GitHub Actions workflow valid
  - [ ] FTP deployment works to PocketHost
  - [ ] Self-hosted deployment documented

- [ ] **Breaking changes assessed**
  - [ ] No breaking changes to existing backends
  - [ ] Schema changes documented
  - [ ] Migration guide (if needed)

### Feature Completeness

- [ ] **CLI Integration**
  - [ ] PocketBase appears in backend options
  - [ ] Deployment prompt works (self-hosted vs PocketHost)
  - [ ] Validation prevents invalid configurations
  - [ ] Help text accurate

- [ ] **Backend Scaffolding**
  - [ ] Binary downloads automatically
  - [ ] Directory structure correct
  - [ ] TypeScript hooks compile to Goja-compatible JS
  - [ ] Biome linting enforces constraints
  - [ ] Type definitions comprehensive

- [ ] **Frontend Integration**
  - [ ] Next.js: Client init, auth components, todo example
  - [ ] TanStack Router: Client init, auth components
  - [ ] Environment variables framework-specific

- [ ] **Deployment**
  - [ ] Self-hosted: README instructions clear
  - [ ] PocketHost: GitHub Actions workflow included
  - [ ] FTP credentials documented

### Known Issues and Limitations

Document any known issues for the release notes:

**Known Issues**:
1. **Windows binary extraction**: May require manual unzip on some Windows configurations
2. **macOS Gatekeeper**: Users may need to allow PocketBase binary in System Preferences
3. **Biome async/await detection**: Currently only flags usage, doesn't prevent compilation

**Limitations**:
1. **Frontend support**: MVP includes Next.js and TanStack Router only
2. **Type generation**: Manual `pocketbase-typegen` run required
3. **Binary version**: Hardcoded to v0.23.4 (not dynamic)
4. **Native support**: React Native/Expo not included in MVP
5. **Better-Auth integration**: Not available with PocketBase (uses built-in auth)

**Future Enhancements** (Out of Scope):
1. Additional frontend frameworks (Nuxt, Svelte, Solid)
2. Automatic type generation from schema
3. Dynamic binary version selection
4. Docker deployment option
5. Better-Auth integration as alternative
6. React Native/Expo support
7. Migration scaffolding CLI command

### Release Notes Template

```markdown
## PocketBase Backend Integration

We're excited to announce PocketBase support in create-better-t-stack!

### What is PocketBase?

PocketBase is an open-source Backend-as-a-Service that provides:
- SQLite database
- Built-in authentication
- Realtime subscriptions
- File storage
- Admin dashboard
- JavaScript hooks runtime

### Getting Started

**Self-hosted**:
```bash
bun create better-t-stack my-app \
  --backend pocketbase \
  --pb-deployment self-hosted \
  --auth pocketbase-auth \
  --frontend next
````

**PocketHost** (managed hosting):

```bash
bun create better-t-stack my-app \
  --backend pocketbase \
  --pb-deployment pockethost \
  --auth pocketbase-auth \
  --frontend next
```

### Features

- ✅ Automatic binary download for your OS/architecture
- ✅ TypeScript hooks with Goja runtime compatibility
- ✅ Next.js and TanStack Router support
- ✅ GitHub Actions deployment to PocketHost
- ✅ Full auth flow with sign-in/sign-up components
- ✅ Todo CRUD example
- ✅ Framework-specific environment variables

### Documentation

- [PocketBase Guide](./docs/backends/pocketbase.md)
- [Self-Hosted Quickstart](./docs/quickstart/pocketbase-self-hosted.md)
- [PocketHost Quickstart](./docs/quickstart/pocketbase-pockethost.md)

### Known Issues

- Windows users may need to manually unzip the binary
- macOS users may need to allow the binary in System Preferences
- Frontend support limited to Next.js and TanStack Router in this release

### What's Next?

We're planning to add:

- Additional frontend frameworks (Nuxt, Svelte, Solid)
- React Native/Expo support
- Automatic type generation from schema
- Docker deployment option

### Feedback

Try PocketBase and let us know what you think! Open an issue or discussion on GitHub.

````

---

## 7. Community Contribution Guide

### Contributing to PocketBase Integration

**Areas for contribution**:

1. **Additional Frontend Frameworks**
   - Nuxt auth components and integration
   - Svelte auth components
   - Solid.js support

2. **Enhanced Type Safety**
   - Automatic `pocketbase-typegen` integration
   - Better Goja constraint linting
   - Type-safe hooks API

3. **Deployment Options**
   - Docker Compose setup
   - Kubernetes manifests
   - Fly.io deployment guide

4. **Documentation**
   - Video tutorials
   - Blog posts and guides
   - Translation to other languages

5. **Testing**
   - Platform-specific tests
   - Performance benchmarks
   - Security audits

### Contribution Workflow

1. **Open an issue** describing the enhancement
2. **Get feedback** from maintainers
3. **Create a PR** with implementation
4. **Include tests** for your changes
5. **Update documentation** as needed

### Testing Your Contribution

Before submitting a PR:

1. **Run the test suite**:
   ```bash
   bun test
````

2. **Test scaffolding manually**:

   ```bash
   bun create better-t-stack test-app \
     --backend pocketbase \
     --pb-deployment self-hosted \
     --frontend next
   ```

3. **Verify end-to-end flow**:
   - Start PocketBase
   - Start frontend
   - Test auth and CRUD operations

4. **Test on your platform**:
   - Verify binary downloads correctly
   - Verify hooks compile
   - Verify runtime works

---

## 8. Test Automation

### CI/CD Pipeline

**GitHub Actions workflow** for automated testing:

**File**: `.github/workflows/test-pocketbase.yml`

```yaml
name: Test PocketBase Integration

on:
  pull_request:
    paths:
      - "apps/cli/**"
      - "packages/template-generator/**"
      - "packages/types/**"
      - ".github/workflows/test-pocketbase.yml"

jobs:
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test apps/cli/test/pocketbase-validation.test.ts
      - run: bun test apps/cli/test/pocketbase-binary.test.ts

  integration-tests:
    name: Integration Tests
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test apps/cli/test/pocketbase-integration.test.ts

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install

      # Scaffold project
      - run: |
          bun apps/cli/dist/index.js test-pb \
            --backend pocketbase \
            --pb-deployment self-hosted \
            --auth pocketbase-auth \
            --frontend next \
            --examples todo \
            --install

      # Download PocketBase
      - run: |
          cd test-pb/packages/backend
          wget https://github.com/pocketbase/pocketbase/releases/download/v0.23.4/pocketbase_0.23.4_linux_amd64.zip
          unzip pocketbase_0.23.4_linux_amd64.zip
          chmod +x pocketbase

      # Start PocketBase in background
      - run: |
          cd test-pb/packages/backend
          ./pocketbase serve &
          sleep 5

      # Build hooks
      - run: |
          cd test-pb/packages/backend
          bun run build

      # Verify hooks compiled
      - run: |
          test -f test-pb/packages/backend/pb_hooks/main.pb.js

      # Build frontend
      - run: |
          cd test-pb/apps/web
          bun run build
```

---

## Summary

This guide provides a comprehensive testing and documentation strategy for the PocketBase integration. By following these steps, you'll ensure:

1. ✅ **Quality**: Comprehensive test coverage across unit, integration, and E2E
2. ✅ **Reliability**: Platform validation on macOS, Linux, and Windows
3. ✅ **Usability**: Clear documentation with quickstarts and troubleshooting
4. ✅ **Completeness**: Release checklist ensures nothing is missed
5. ✅ **Community**: Contribution guide enables community enhancements

### Next Steps

1. **Implement test suite**: Write unit and integration tests
2. **Platform testing**: Validate on all target platforms
3. **Write documentation**: Create PocketBase guide and quickstarts
4. **Review release checklist**: Ensure all items complete
5. **Prepare release notes**: Document features and known issues
6. **Enable CI/CD**: Set up automated testing in GitHub Actions

The PocketBase integration will be production-ready when all tests pass, documentation is complete, and the release checklist is verified.

---

## References

- **Guide 0**: [Overview & Architecture](0-overview-and-architecture.md)
- **Guide 1**: [Type System & CLI](1-type-system-and-cli.md) (dependency)
- **Guide 2**: [Backend Scaffolding](2-backend-scaffolding-and-build.md) (dependency)
- **Guide 3**: [Frontend Integration](3-frontend-integration.md) (dependency)
- **Guide 4**: [Deployment Workflows](4-deployment-workflows.md) (dependency)
- **PocketBase Docs**: https://pocketbase.io/docs/
- **Bun Test Documentation**: https://bun.sh/docs/cli/test
