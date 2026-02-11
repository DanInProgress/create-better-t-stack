# Guide 1: Type System & CLI Integration

## Quick Reference

- **Audience**: CLI/types developer
- **Dependencies**: None (can start immediately)
- **Estimated time**: 4-6 hours
- **Key files**:
  - `/packages/types/src/schemas.ts`
  - `/apps/cli/src/prompts/backend.ts`
  - `/apps/cli/src/prompts/pb-deployment.ts` (new file)
  - `/apps/cli/src/prompts/database.ts`
  - `/apps/cli/src/prompts/orm.ts`
  - `/apps/cli/src/prompts/database-setup.ts`
  - `/apps/cli/src/prompts/config-prompts.ts`

---

## Context

### Why Type System Changes Are Needed

PocketBase introduces a new backend option that differs from traditional backends (Hono, Express, Fastify) in several ways:

1. **Self-contained**: No separate database/ORM (includes SQLite)
2. **Deployment choice**: Self-hosted vs PocketHost affects scaffolding
3. **No separate runtime**: Binary includes JavaScript runtime (Goja)

The type system needs to:

- Add `"pocketbase"` to backend options
- Create a new `PBDeploymentSchema` for deployment choices
- Ensure database/ORM prompts skip for PocketBase (returns `"none"`)

### Architectural Context

From the architectural analysis:

- PocketBase is unique among backends because it bundles database, runtime, and API layer
- The deployment choice (self-hosted vs PocketHost) is a first-class CLI concern
- Type safety ensures incompatible combinations are prevented at compile time

---

## Implementation Steps

### Step 1: Add PocketBase to BackendSchema

**File**: `/packages/types/src/schemas.ts`

**Location**: Find the `BackendSchema` definition (around line 9-11).

**Change**: Add `"pocketbase"` to the enum array.

```typescript
export const BackendSchema = z
  .enum(["hono", "express", "fastify", "elysia", "convex", "pocketbase", "self", "none"])
  .describe("Backend framework");
```

**Explanation**: This makes PocketBase a valid backend option throughout the type system. The order places it after Convex and before the special `"self"` and `"none"` options.

---

### Step 2: Create PBDeploymentSchema

**File**: `/packages/types/src/schemas.ts`

**Location**: After `DatabaseSetupSchema` definition (around line 73).

**Add**:

```typescript
export const PBDeploymentSchema = z
  .enum(["self-hosted", "pockethost", "none"])
  .describe("PocketBase deployment option");
```

**Explanation**:

- `"self-hosted"`: Downloads binary, scaffolds full local structure
- `"pockethost"`: Sets up cloud deployment with GitHub Actions
- `"none"`: Manual configuration (user handles setup)

---

### Step 3: Update CreateInputSchema

**File**: `/packages/types/src/schemas.ts`

**Location**: In the `CreateInputSchema` object (around line 114-141).

**Add**: Insert this line in the appropriate alphabetical position (after `orm`, before other fields):

```typescript
export const CreateInputSchema = z.object({
  projectName: z.string().optional(),
  template: TemplateSchema.optional(),
  yes: z.boolean().optional(),
  yolo: z.boolean().optional(),
  verbose: z.boolean().optional(),
  database: DatabaseSchema.optional(),
  orm: ORMSchema.optional(),
  auth: AuthSchema.optional(),
  payments: PaymentsSchema.optional(),
  frontend: z.array(FrontendSchema).optional(),
  addons: z.array(AddonsSchema).optional(),
  examples: z.array(ExamplesSchema).optional(),
  git: z.boolean().optional(),
  packageManager: PackageManagerSchema.optional(),
  install: z.boolean().optional(),
  dbSetup: DatabaseSetupSchema.optional(),
  pbDeployment: PBDeploymentSchema.optional(), // ← ADD THIS LINE
  backend: BackendSchema.optional(),
  runtime: RuntimeSchema.optional(),
  api: APISchema.optional(),
  webDeploy: WebDeploySchema.optional(),
  serverDeploy: ServerDeploySchema.optional(),
  directoryConflict: DirectoryConflictSchema.optional(),
  renderTitle: z.boolean().optional(),
  disableAnalytics: z.boolean().optional(),
  manualDb: z.boolean().optional(),
});
```

---

### Step 4: Update ProjectConfigSchema

**File**: `/packages/types/src/schemas.ts`

**Location**: In the `ProjectConfigSchema` object (around line 156-177).

**Add**: Insert this line after `dbSetup`:

```typescript
export const ProjectConfigSchema = z.object({
  projectName: z.string(),
  projectDir: z.string(),
  relativePath: z.string(),
  database: DatabaseSchema,
  orm: ORMSchema,
  backend: BackendSchema,
  runtime: RuntimeSchema,
  frontend: z.array(FrontendSchema),
  addons: z.array(AddonsSchema),
  examples: z.array(ExamplesSchema),
  auth: AuthSchema,
  payments: PaymentsSchema,
  git: z.boolean(),
  packageManager: PackageManagerSchema,
  install: z.boolean(),
  dbSetup: DatabaseSetupSchema,
  pbDeployment: PBDeploymentSchema, // ← ADD THIS LINE
  api: APISchema,
  webDeploy: WebDeploySchema,
  serverDeploy: ServerDeploySchema,
});
```

---

### Step 5: Update BetterTStackConfigSchema

**File**: `/packages/types/src/schemas.ts`

**Location**: In the `BetterTStackConfigSchema` object (around line 179-198).

**Add**: Insert this line after `dbSetup`:

```typescript
export const BetterTStackConfigSchema = z.object({
  version: z.string().describe("CLI version used to create this project"),
  createdAt: z.string().describe("Timestamp when the project was created"),
  reproducibleCommand: z.string().optional().describe("Command to reproduce this project setup"),
  database: DatabaseSchema,
  orm: ORMSchema,
  backend: BackendSchema,
  runtime: RuntimeSchema,
  frontend: z.array(FrontendSchema),
  addons: z.array(AddonsSchema),
  examples: z.array(ExamplesSchema),
  auth: AuthSchema,
  payments: PaymentsSchema,
  packageManager: PackageManagerSchema,
  dbSetup: DatabaseSetupSchema,
  pbDeployment: PBDeploymentSchema, // ← ADD THIS LINE
  api: APISchema,
  webDeploy: WebDeploySchema,
  serverDeploy: ServerDeploySchema,
});
```

---

### Step 6: Export PB_DEPLOYMENT_VALUES Constant

**File**: `/packages/types/src/schemas.ts`

**Location**: At the end of the file, after other exported constants (around line 222-238).

**Add**:

```typescript
export const DATABASE_VALUES = DatabaseSchema.options;
export const ORM_VALUES = ORMSchema.options;
export const BACKEND_VALUES = BackendSchema.options;
export const RUNTIME_VALUES = RuntimeSchema.options;
export const FRONTEND_VALUES = FrontendSchema.options;
export const ADDONS_VALUES = AddonsSchema.options;
export const EXAMPLES_VALUES = ExamplesSchema.options;
export const PACKAGE_MANAGER_VALUES = PackageManagerSchema.options;
export const DATABASE_SETUP_VALUES = DatabaseSetupSchema.options;
export const PB_DEPLOYMENT_VALUES = PBDeploymentSchema.options; // ← ADD THIS LINE
export const API_VALUES = APISchema.options;
export const AUTH_VALUES = AuthSchema.options;
export const PAYMENTS_VALUES = PaymentsSchema.options;
export const WEB_DEPLOY_VALUES = WebDeploySchema.options;
export const SERVER_DEPLOY_VALUES = ServerDeploySchema.options;
export const DIRECTORY_CONFLICT_VALUES = DirectoryConflictSchema.options;
export const TEMPLATE_VALUES = TemplateSchema.options;
```

---

### Step 7: Add PocketBase Option to Backend Prompt

**File**: `/apps/cli/src/prompts/backend.ts`

**Location**: In the `backendOptions` array, after the Convex option (around line 60-68).

**Add**:

```typescript
if (!hasIncompatibleFrontend) {
  backendOptions.push({
    value: "convex" as const,
    label: "Convex",
    hint: "Reactive backend-as-a-service platform",
  });
}

// ← ADD THIS BLOCK
backendOptions.push({
  value: "pocketbase" as const,
  label: "PocketBase",
  hint: "Open source backend in 1 file (SQLite, Auth, Realtime)",
});

backendOptions.push({
  value: "none" as const,
  label: "None",
  hint: "No backend server",
});
```

**Explanation**: PocketBase is placed after Convex and before "None". The hint describes its key features concisely.

---

### Step 8: Create PocketBase Deployment Prompt File

**File**: `/apps/cli/src/prompts/pb-deployment.ts` (NEW FILE)

**Create this complete file**:

```typescript
import type { Backend, PBDeployment } from "../types";

import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableSelect } from "./navigable";

export async function getPBDeploymentChoice(backend?: Backend, pbDeployment?: PBDeployment) {
  if (backend !== "pocketbase") {
    return "none";
  }

  if (pbDeployment !== undefined) return pbDeployment as PBDeployment;

  const options: Array<{ value: PBDeployment; label: string; hint: string }> = [
    {
      value: "self-hosted" as const,
      label: "Self-hosted",
      hint: "Download PocketBase binary for local development and VPS deployment",
    },
    {
      value: "pockethost" as const,
      label: "PocketHost",
      hint: "Managed cloud hosting with instant deployment and FTPS sync",
    },
    {
      value: "none" as const,
      label: "None",
      hint: "Manual setup - I'll configure PocketBase myself",
    },
  ];

  const response = await navigableSelect<PBDeployment>({
    message: "Select PocketBase deployment",
    options,
    initialValue: "self-hosted",
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}
```

**Explanation**:

- **Early return**: If backend is not PocketBase, returns `"none"` (prompt skipped)
- **Flag handling**: If `pbDeployment` flag is provided via CLI, uses that value
- **Three options**: Self-hosted (default), PocketHost, or manual setup
- **Error handling**: Throws `UserCancelledError` if user cancels (Ctrl+C)

---

### Step 9: Update Database Prompt to Skip for PocketBase

**File**: `/apps/cli/src/prompts/database.ts`

**Location**: At the start of the `getDatabaseChoice` function (around line 7-10).

**Change**:

```typescript
export async function getDatabaseChoice(database?: Database, backend?: Backend, runtime?: Runtime) {
  if (backend === "convex" || backend === "pocketbase" || backend === "none") {
    return "none";
  }

  if (database !== undefined) return database;

  // ... rest of function
}
```

**Explanation**: PocketBase has a built-in SQLite database, so the database selection prompt is skipped entirely.

---

### Step 10: Update ORM Prompt to Skip for PocketBase

**File**: `/apps/cli/src/prompts/orm.ts`

**Location**: At the start of the `getORMChoice` function (around line 25-34).

**Change**:

```typescript
export async function getORMChoice(
  orm: ORM | undefined,
  hasDatabase: boolean,
  database?: Database,
  backend?: Backend,
  runtime?: Runtime,
) {
  if (backend === "convex" || backend === "pocketbase") {
    return "none";
  }

  if (!hasDatabase) return "none";
  if (orm !== undefined) return orm;

  // ... rest of function
}
```

**Explanation**: PocketBase doesn't use an ORM; database access is via its built-in JavaScript SDK and hooks API.

---

### Step 11: Update Database Setup Prompt to Skip for PocketBase

**File**: `/apps/cli/src/prompts/database-setup.ts`

**Location**: At the start of the `getDBSetupChoice` function (around line 6-15).

**Change**:

```typescript
export async function getDBSetupChoice(
  databaseType: string,
  dbSetup: DatabaseSetup | undefined,
  _orm?: ORM,
  backend?: Backend,
  runtime?: Runtime,
) {
  if (backend === "convex" || backend === "pocketbase") {
    return "none";
  }

  if (dbSetup !== undefined) return dbSetup as DatabaseSetup;

  if (databaseType === "none") {
    return "none";
  }

  // ... rest of function
}
```

**Explanation**: PocketBase deployment is handled by the separate `pbDeployment` prompt, not the general database setup flow.

---

### Step 12: Integrate PBDeployment into Config Prompts Flow

**File**: `/apps/cli/src/prompts/config-prompts.ts`

**Part A - Import**: Add to the imports at the top (around line 1-40):

```typescript
import type {
  Addons,
  API,
  Auth,
  Backend,
  Database,
  DatabaseSetup,
  Examples,
  Frontend,
  ORM,
  PackageManager,
  PBDeployment, // ← ADD THIS LINE
  Payments,
  ProjectConfig,
  Runtime,
  ServerDeploy,
  WebDeploy,
} from "../types";
```

**Part B - Import function**: Add to the prompt imports:

```typescript
import { getAddonsChoice } from "./addons";
import { getApiChoice } from "./api";
import { getAuthChoice } from "./auth";
import { getBackendFrameworkChoice } from "./backend";
import { getDatabaseChoice } from "./database";
import { getDBSetupChoice } from "./database-setup";
import { getExamplesChoice } from "./examples";
import { getFrontendChoice } from "./frontend";
import { getGitChoice } from "./git";
import { getinstallChoice } from "./install";
import { navigableGroup } from "./navigable-group";
import { getORMChoice } from "./orm";
import { getPackageManagerChoice } from "./package-manager";
import { getPBDeploymentChoice } from "./pb-deployment"; // ← ADD THIS LINE
import { getPaymentsChoice } from "./payments";
import { getRuntimeChoice } from "./runtime";
import { getServerDeploymentChoice } from "./server-deploy";
import { getDeploymentChoice } from "./web-deploy";
```

**Part C - Type definition**: Update `PromptGroupResults` type (around line 42-60):

```typescript
type PromptGroupResults = {
  frontend: Frontend[];
  backend: Backend;
  runtime: Runtime;
  database: Database;
  orm: ORM;
  api: API;
  auth: Auth;
  payments: Payments;
  addons: Addons[];
  examples: Examples[];
  dbSetup: DatabaseSetup;
  pbDeployment: PBDeployment; // ← ADD THIS LINE
  git: boolean;
  packageManager: PackageManager;
  install: boolean;
  webDeploy: WebDeploy;
  serverDeploy: ServerDeploy;
};
```

**Part D - Silent mode defaults**: Update the silent mode return statement (around line 68-90):

```typescript
if (isSilent()) {
  return {
    projectName,
    projectDir,
    relativePath,
    frontend: flags.frontend ?? [...DEFAULT_CONFIG.frontend],
    backend: flags.backend ?? DEFAULT_CONFIG.backend,
    runtime: flags.runtime ?? DEFAULT_CONFIG.runtime,
    database: flags.database ?? DEFAULT_CONFIG.database,
    orm: flags.orm ?? DEFAULT_CONFIG.orm,
    auth: flags.auth ?? DEFAULT_CONFIG.auth,
    payments: flags.payments ?? DEFAULT_CONFIG.payments,
    addons: flags.addons ?? [...DEFAULT_CONFIG.addons],
    examples: flags.examples ?? [...DEFAULT_CONFIG.examples],
    git: flags.git ?? DEFAULT_CONFIG.git,
    packageManager: flags.packageManager ?? DEFAULT_CONFIG.packageManager,
    install: flags.install ?? DEFAULT_CONFIG.install,
    dbSetup: flags.dbSetup ?? DEFAULT_CONFIG.dbSetup,
    pbDeployment: flags.pbDeployment ?? DEFAULT_CONFIG.pbDeployment, // ← ADD THIS LINE
    api: flags.api ?? DEFAULT_CONFIG.api,
    webDeploy: flags.webDeploy ?? DEFAULT_CONFIG.webDeploy,
    serverDeploy: flags.serverDeploy ?? DEFAULT_CONFIG.serverDeploy,
  };
}
```

**Part E - Prompt flow**: Add pbDeployment to the navigableGroup prompts (around line 93-144):

```typescript
const result = await navigableGroup<PromptGroupResults>(
  {
    frontend: () => getFrontendChoice(flags.frontend, flags.backend, flags.auth),
    backend: ({ results }) => getBackendFrameworkChoice(flags.backend, results.frontend),
    runtime: ({ results }) => getRuntimeChoice(flags.runtime, results.backend),
    database: ({ results }) => getDatabaseChoice(flags.database, results.backend, results.runtime),
    orm: ({ results }) =>
      getORMChoice(
        flags.orm,
        results.database !== "none",
        results.database,
        results.backend,
        results.runtime,
      ),
    api: ({ results }) =>
      getApiChoice(flags.api, results.frontend, results.backend) as Promise<API>,
    auth: ({ results }) => getAuthChoice(flags.auth, results.backend, results.frontend),
    payments: ({ results }) =>
      getPaymentsChoice(flags.payments, results.auth, results.backend, results.frontend),
    addons: ({ results }) => getAddonsChoice(flags.addons, results.frontend, results.auth),
    examples: ({ results }) =>
      getExamplesChoice(
        flags.examples,
        results.database,
        results.frontend,
        results.backend,
        results.api,
      ) as Promise<Examples[]>,
    dbSetup: ({ results }) =>
      getDBSetupChoice(
        results.database ?? "none",
        flags.dbSetup,
        results.orm,
        results.backend,
        results.runtime,
      ),
    pbDeployment: (
      { results }, // ← ADD THIS BLOCK
    ) => getPBDeploymentChoice(results.backend, flags.pbDeployment),
    webDeploy: ({ results }) =>
      getDeploymentChoice(flags.webDeploy, results.runtime, results.backend, results.frontend),
    serverDeploy: ({ results }) =>
      getServerDeploymentChoice(
        flags.serverDeploy,
        results.runtime,
        results.backend,
        results.webDeploy,
      ),
    git: () => getGitChoice(flags.git),
    packageManager: () => getPackageManagerChoice(flags.packageManager),
    install: () => getinstallChoice(flags.install),
  },
  {
    onCancel: () => {
      throw new UserCancelledError({ message: "Operation cancelled" });
    },
  },
);
```

**Part F - Return statement**: Add pbDeployment to the returned config (around line 152-173):

```typescript
return {
  projectName: projectName,
  projectDir: projectDir,
  relativePath: relativePath,
  frontend: result.frontend,
  backend: result.backend,
  runtime: result.runtime,
  database: result.database,
  orm: result.orm,
  auth: result.auth,
  payments: result.payments,
  addons: result.addons,
  examples: result.examples,
  git: result.git,
  packageManager: result.packageManager,
  install: result.install,
  dbSetup: result.dbSetup,
  pbDeployment: result.pbDeployment, // ← ADD THIS LINE
  api: result.api,
  webDeploy: result.webDeploy,
  serverDeploy: result.serverDeploy,
};
```

---

### Step 13: Update DEFAULT_CONFIG (if exists)

**File**: `/apps/cli/src/constants.ts` (or wherever DEFAULT_CONFIG is defined)

**Add**: Insert pbDeployment with default value:

```typescript
export const DEFAULT_CONFIG = {
  backend: "hono",
  database: "none",
  orm: "none",
  runtime: "bun",
  frontend: ["next"],
  addons: [],
  examples: [],
  auth: "none",
  payments: "none",
  git: true,
  packageManager: "bun",
  install: true,
  dbSetup: "none",
  pbDeployment: "none", // ← ADD THIS LINE
  api: "trpc",
  webDeploy: "none",
  serverDeploy: "none",
};
```

---

## Code Snippets Summary

### Complete Type Additions (schemas.ts)

```typescript
// 1. Update BackendSchema
export const BackendSchema = z
  .enum(["hono", "express", "fastify", "elysia", "convex", "pocketbase", "self", "none"])
  .describe("Backend framework");

// 2. Add PBDeploymentSchema
export const PBDeploymentSchema = z
  .enum(["self-hosted", "pockethost", "none"])
  .describe("PocketBase deployment option");

// 3. Update CreateInputSchema (add one field)
pbDeployment: PBDeploymentSchema.optional(),

// 4. Update ProjectConfigSchema (add one field)
pbDeployment: PBDeploymentSchema,

// 5. Update BetterTStackConfigSchema (add one field)
pbDeployment: PBDeploymentSchema,

// 6. Export constant
export const PB_DEPLOYMENT_VALUES = PBDeploymentSchema.options;
```

### Complete Prompt File (pb-deployment.ts)

See Step 8 above for the complete file contents.

### Constraint Prompt Updates

```typescript
// database.ts
if (backend === "convex" || backend === "pocketbase" || backend === "none") {
  return "none";
}

// orm.ts
if (backend === "convex" || backend === "pocketbase") {
  return "none";
}

// database-setup.ts
if (backend === "convex" || backend === "pocketbase") {
  return "none";
}
```

---

## Verification

### Unit Tests

Create test file: `/apps/cli/tests/prompts/pb-deployment.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { getPBDeploymentChoice } from "../../src/prompts/pb-deployment";

describe("getPBDeploymentChoice", () => {
  it("should return 'none' when backend is not pocketbase", async () => {
    const result = await getPBDeploymentChoice("hono");
    expect(result).toBe("none");
  });

  it("should use provided pbDeployment flag", async () => {
    const result = await getPBDeploymentChoice("pocketbase", "pockethost");
    expect(result).toBe("pockethost");
  });

  it("should return 'none' for non-pocketbase backends", async () => {
    const backends = ["hono", "express", "fastify", "elysia", "convex", "self", "none"];
    for (const backend of backends) {
      const result = await getPBDeploymentChoice(backend as any);
      expect(result).toBe("none");
    }
  });
});
```

### Schema Validation Tests

Create test file: `/packages/types/tests/schemas.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { BackendSchema, PBDeploymentSchema } from "../src/schemas";

describe("PocketBase Schemas", () => {
  it("BackendSchema should include pocketbase", () => {
    const result = BackendSchema.safeParse("pocketbase");
    expect(result.success).toBe(true);
  });

  it("PBDeploymentSchema should validate self-hosted", () => {
    const result = PBDeploymentSchema.safeParse("self-hosted");
    expect(result.success).toBe(true);
  });

  it("PBDeploymentSchema should validate pockethost", () => {
    const result = PBDeploymentSchema.safeParse("pockethost");
    expect(result.success).toBe(true);
  });

  it("PBDeploymentSchema should validate none", () => {
    const result = PBDeploymentSchema.safeParse("none");
    expect(result.success).toBe(true);
  });

  it("PBDeploymentSchema should reject invalid values", () => {
    const result = PBDeploymentSchema.safeParse("invalid");
    expect(result.success).toBe(false);
  });
});
```

### Integration Test

Test the complete prompt flow:

```bash
# In your CLI package directory
bun run build

# Test with flags
bun run cli create test-pb --backend pocketbase --pb-deployment self-hosted --yes

# Verify:
# - Project created successfully
# - pbDeployment set to "self-hosted" in config
# - database, orm, and dbSetup all set to "none"
```

### Manual Testing Checklist

- [ ] Type schemas compile without errors
- [ ] PocketBase appears in backend options prompt
- [ ] Selecting PocketBase triggers pbDeployment prompt
- [ ] Database prompt is skipped when PocketBase is selected
- [ ] ORM prompt is skipped when PocketBase is selected
- [ ] Database setup prompt is skipped when PocketBase is selected
- [ ] CLI flags work: `--backend pocketbase --pb-deployment pockethost`
- [ ] Config file includes pbDeployment field
- [ ] Other backends are unaffected by changes

---

## Troubleshooting

### Type Errors After Schema Updates

**Symptom**: TypeScript errors about missing `pbDeployment` property.

**Solution**:

1. Ensure all three schemas are updated (CreateInputSchema, ProjectConfigSchema, BetterTStackConfigSchema)
2. Run `bun run typecheck` in the types package
3. Rebuild: `bun run build --filter=@better-t-stack/types`

### Prompt Not Showing

**Symptom**: pbDeployment prompt doesn't appear when selecting PocketBase.

**Solution**:

1. Check that `getPBDeploymentChoice` is imported in `config-prompts.ts`
2. Verify the prompt is added to `navigableGroup` object
3. Ensure `backend === "pocketbase"` condition is correct

### Database/ORM Prompts Still Showing

**Symptom**: Database or ORM prompts appear even when PocketBase is selected.

**Solution**:

1. Check the early return conditions in `database.ts`, `orm.ts`, and `database-setup.ts`
2. Ensure the condition includes: `backend === "pocketbase"`
3. Verify the backend value is being passed correctly through the prompt chain

### DEFAULT_CONFIG Errors

**Symptom**: Errors about missing `pbDeployment` in DEFAULT_CONFIG.

**Solution**:

1. Add `pbDeployment: "none"` to DEFAULT_CONFIG constant
2. Ensure it matches the type signature of ProjectConfig

---

## References

- **Guide 0**: Overview & Architecture - See architectural decisions and integration context
- **Architectural Analysis**: `/Users/dfallon/.claude/plans/wild-wobbling-elephant.md` - Full technical analysis
- **Source Implementation**:
  - `/claude-sonnet-4_5/packages/types/src/schemas.ts` - Complete schema implementation
  - `/claude-sonnet-4_5/apps/cli/src/prompts/pb-deployment.ts` - Deployment prompt
  - `/claude-sonnet-4_5/apps/cli/src/prompts/` - Constraint prompt updates

---

## Next Steps

After completing this guide:

1. **Verify all tests pass**: Run unit tests and integration tests
2. **Coordinate with Guide 2 developer**: The backend scaffolding guide depends on these type definitions
3. **Update documentation**: If you discover any issues or improvements, document them
4. **Move to Guide 2**: Once types are complete, the backend scaffolding can proceed

The type system and CLI prompts are now ready to support PocketBase integration. The next developer can use these types to implement the actual backend scaffolding and setup helpers.
