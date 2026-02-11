# Guide 0: Overview & Architecture

## Quick Reference

**Audience**: All developers, project lead
**Dependencies**: None (start here)
**Estimated reading time**: 30-45 minutes
**Purpose**: Understand the complete PocketBase integration architecture, decisions, and coordination strategy

---

## Executive Summary

This guide provides the architectural overview for integrating PocketBase as a backend option in create-better-t-stack. The integration synthesizes the best approaches from three independent implementations (Claude Opus 4.6, Gemini 3 Pro, Claude Sonnet 4.5) into a production-ready solution.

### What is PocketBase?

PocketBase is an open-source backend in a single file that includes:

- SQLite database
- Realtime subscriptions
- Built-in authentication
- File storage
- Admin dashboard
- JavaScript hooks runtime (Goja)

### Integration Goals

1. **Deployment Flexibility**: Support both PocketHost (cloud) and self-hosted (local/VPS)
2. **Modern DX**: TypeScript hooks with ES2020 syntax, type-safe development
3. **Framework Quality**: Rich, framework-appropriate frontend integrations
4. **Binary Management**: Automatic binary download for self-hosted deployments
5. **Production Ready**: GitHub Actions CI/CD, comprehensive documentation

---

## Source Implementations Analysis

Three AI models independently implemented PocketBase integration. We analyzed all three to identify best practices:

### Claude Opus 4.6: Frontend Excellence

**Strengths**:

- Comprehensive auth components (sign-in, sign-up, user-menu, dashboard)
- Working examples (todo CRUD app)
- Multi-framework support (React, Nuxt, Svelte, Solid, Astro)
- Framework-specific environment variable handling

**Adopted patterns**:

- Auth component structure and organization
- Todo example implementation
- Framework-appropriate integrations

### Gemini 3 Pro: Build Pipeline Sophistication

**Strengths**:

- TypeScript hooks with transpilation (tsup → ES5)
- Comprehensive type definitions for Goja runtime
- `.cursorrules` for AI assistant guidance
- GitHub Actions deployment to PocketHost

**Adopted patterns**:

- Type definitions architecture (updated to ES2020)
- AI assistant guidance structure
- GitHub Actions deployment workflow
- Build pipeline concept (tool changed to esbuild)

### Claude Sonnet 4.5: Deployment Intelligence

**Strengths**:

- Binary auto-download with OS/arch detection
- Deployment decision tree (self-hosted vs PocketHost)
- Clean separation between deployment strategies
- Comprehensive README generation

**Adopted patterns**:

- Binary management implementation
- Deployment choice as first-class CLI concern
- Different scaffolding per deployment type
- Documentation generation

---

## Key Architectural Decisions

### 1. Hooks Development: TypeScript + esbuild → ES2020 ✅

**Decision**: TypeScript source → esbuild build → Goja-compatible JavaScript

**Why ES2020 instead of ES5?**
After research, we confirmed modern Goja/PocketBase supports nearly all ES2020 syntax:

- ✅ Arrow functions, classes, destructuring, optional chaining, nullish coalescing
- ❌ async/await (no event loop)
- ❌ ES modules in hooks (use CommonJS)

**Build tool: esbuild**

- Gemini used tsup (now in maintenance mode)
- esbuild is actively maintained, simpler, faster
- Target ES2020 (not ES5 like Gemini)

**Linting: Biome**

- Custom rules to enforce: No async/await, no ES modules
- Prevents Goja-incompatible patterns at compile time

**Pattern**:

```
src/main.pb.ts → [esbuild] → pb_hooks/main.pb.js
src/routes/*.pb.ts → [esbuild] → pb_hooks/routes/*.pb.js
```

### 2. Deployment Strategy: Multi-Modal CLI Choice ✅

**Decision**: Offer PocketHost (cloud) and self-hosted (local/VPS) at scaffold time

**Flow**:

```
User selects: --backend pocketbase
  ↓
CLI prompts: "How will you deploy PocketBase?"
  ├─ PocketHost → Scaffolds hooks + migrations + GitHub Actions
  └─ Self-hosted → Scaffolds full structure + downloads binary
```

**Rationale**:

- PocketHost: Easiest for beginners, production hosting included
- Self-hosted: Full control, local development, cost savings

### 3. Frontend Integration: Quality over Breadth ✅

**Decision**: Rich, framework-appropriate integrations, starting with Next.js

**Priority**:

1. **Tier 1 (MVP)**: Next.js with App Router patterns
2. **Tier 2**: TanStack Router, React Router
3. **Tier 3**: Nuxt, Svelte (when we can do them right)

**Anti-pattern to avoid**:

- ❌ Generic auth component copy-pasted to every framework
- ✅ Each framework integration feels native to that framework

**Example**:

- Next.js: Server Components + Client Components pattern
- TanStack Router: `beforeLoad` route protection
- Nuxt: Middleware + composables

### 4. Binary Management: Auto-Download ✅

**Decision**: Adopt Sonnet's OS/arch detection and automatic download

**Implementation**:

```typescript
function getPlatformInfo(): {
  platform: "darwin" | "windows" | "linux";
  arch: "amd64" | "arm64" | "armv7";
  downloadUrl: string;
};
```

**Why**:

- Better DX than "download manually and place in directory"
- Ensures correct binary for user's platform
- Enables immediate `./pocketbase serve` after scaffold

**Trade-off**: Hardcoded version (0.23.4) vs dynamic latest

### 5. Environment Variables: Framework-Specific ✅

**Decision**: Framework-aware env var naming (from Opus)

**Mapping**:
| Framework | Env Var Name |
|-----------|--------------|
| Next.js | `NEXT_PUBLIC_POCKETBASE_URL` |
| Nuxt | `NUXT_PUBLIC_POCKETBASE_URL` |
| TanStack Start | `VITE_POCKETBASE_URL` |
| Svelte/SvelteKit | `PUBLIC_POCKETBASE_URL` |
| Expo | `EXPO_PUBLIC_POCKETBASE_URL` |

**Default**: `http://127.0.0.1:8090`
**PocketHost**: User-provided instance URL

### 6. GitHub Actions Deployment: FTP to PocketHost ✅

**Decision**: Automated deployment via FTP (from Gemini/Sonnet)

**Workflow**:

- Trigger: Push to main with changes to pb_hooks/ or pb_migrations/
- Build hooks (TypeScript → JavaScript)
- Deploy via FTP to PocketHost

**Required secrets**:

- `POCKETHOST_FTP_HOST`
- `POCKETHOST_FTP_USER`
- `POCKETHOST_FTP_PASSWORD`

---

## Integration Architecture

### PocketBase Unique Characteristics

**Unlike other backends** (Hono/Express/Fastify):

- ✅ No separate database/ORM (self-contained SQLite)
- ✅ No separate runtime (binary includes runtime)
- ✅ Deployment choice affects scaffolding
- ✅ Frontend uses SDK directly (no tRPC/oRPC layer)
- ✅ Build step for hooks (TypeScript → JavaScript)

**Like other backends**:

- Added to `BackendSchema` enum
- Has templates in `/templates/backend/`
- Processes dependencies via processors
- Supports auth and examples

### Directory Structure

**Self-Hosted**:

```
packages/backend/
├── src/
│   └── main.pb.ts              # TypeScript hooks
├── pb_hooks/                   # Compiled JavaScript (gitignored)
├── pb_migrations/              # Database migrations
├── pb_data/                    # SQLite DB (gitignored)
├── pb_public/                  # Static assets
├── pocketbase                  # Binary (gitignored)
├── package.json                # Scripts: dev, serve, migrate
├── tsconfig.json
├── esbuild.config.js          # Build configuration
├── biome.json                  # Linting (Goja constraints)
├── pocketbase.d.ts            # Type definitions
├── .cursorrules               # AI guidance
└── README.md
```

**PocketHost**:

```
packages/backend/
├── src/
│   └── main.pb.ts
├── pb_hooks/                   # Compiled (deployed via FTP)
├── pb_migrations/              # Deployed via FTP
├── package.json
├── tsconfig.json
├── esbuild.config.js
├── biome.json
├── pocketbase.d.ts
├── .cursorrules
└── README.md

.github/workflows/
└── deploy-pockethost.yml       # CI/CD workflow
```

---

## Component Ownership Map

This table shows which guide covers each component:

| Component           | Guide   | Developer Role  |
| ------------------- | ------- | --------------- |
| Type schemas        | Guide 1 | CLI/Types       |
| CLI prompts         | Guide 1 | CLI/Types       |
| Backend templates   | Guide 2 | Backend/Tooling |
| Build configuration | Guide 2 | Backend/Tooling |
| Binary management   | Guide 2 | Backend/Tooling |
| Setup helpers       | Guide 2 | Backend/Tooling |
| Auth components     | Guide 3 | Frontend        |
| Todo examples       | Guide 3 | Frontend        |
| Template handlers   | Guide 3 | Frontend        |
| SDK integration     | Guide 3 | Frontend        |
| GitHub Actions      | Guide 4 | DevOps          |
| README generation   | Guide 4 | DevOps          |
| Testing strategy    | Guide 5 | QA              |
| Documentation       | Guide 5 | QA              |

---

## Integration Points in create-better-t-stack

### Files to Create (New)

**CLI**:

- `/apps/cli/src/prompts/pb-deployment.ts` - Deployment choice prompt
- `/apps/cli/src/helpers/database-providers/pocketbase-self-hosted-setup.ts`
- `/apps/cli/src/helpers/database-providers/pocketbase-pockethost-setup.ts`

**Templates**:

- `/packages/template-generator/templates/auth/pocketbase-auth/pocketbase/web/react/next/` - Auth components
- `/packages/template-generator/templates/examples/todo/pocketbase/web/react/next/` - Todo example
- Backend templates (handled by setup helpers, not traditional templates)

### Files to Modify (Existing)

**Types**:

- `/packages/types/src/schemas.ts` - Add PocketBase schemas

**CLI Prompts**:

- `/apps/cli/src/prompts/backend.ts` - Add PocketBase option
- `/apps/cli/src/prompts/database.ts` - Return "none" for PocketBase
- `/apps/cli/src/prompts/orm.ts` - Return "none" for PocketBase
- `/apps/cli/src/prompts/database-setup.ts` - Return "none" for PocketBase
- `/apps/cli/src/prompts/config-prompts.ts` - Add pbDeployment

**Setup Logic**:

- `/apps/cli/src/helpers/core/db-setup.ts` - Add PocketBase routing

**Template Handlers**:

- `/packages/template-generator/src/template-handlers/backend.ts` - Special case for PocketBase
- `/packages/template-generator/src/template-handlers/auth.ts` - Add pocketbase-auth
- `/packages/template-generator/src/template-handlers/examples.ts` - Add pocketbase examples

**Processors**:

- `/packages/template-generator/src/processors/api-deps.ts` - Add PocketBase SDK
- `/packages/template-generator/src/processors/env-vars.ts` - Add getPocketBaseVar()

---

## Implementation Phases

### Phase 1: Core Backend (MVP)

**Duration**: 2-3 days
**Guides**: 1, 2
**Deliverables**:

- PocketBase in CLI backend options
- Self-hosted scaffolding works
- Binary auto-downloads
- Hooks compile with esbuild

**Test**: `bun create better-t-stack test --backend pocketbase --pb-deployment self-hosted`

### Phase 2: PocketHost Deployment

**Duration**: 1-2 days
**Guides**: 4
**Deliverables**:

- PocketHost deployment option
- GitHub Actions workflow
- FTP deployment documentation

**Test**: `bun create better-t-stack test --backend pocketbase --pb-deployment pockethost`

### Phase 3: Frontend Integration

**Duration**: 2-3 days
**Guides**: 3
**Deliverables**:

- Next.js auth components
- Todo CRUD example
- SDK integration
- Environment variables

**Test**: Full-stack app with auth and todo

### Phase 4: Testing & Documentation

**Duration**: 2-3 days
**Guides**: 5
**Deliverables**:

- Integration tests
- Platform testing (Mac/Linux/Windows)
- User documentation
- Release checklist

---

## Development Coordination

### Parallel Work Strategy

**Week 1**:

- **Developer A**: Guide 1 (Type System & CLI)
- **Developer B**: Guide 4 (Deployment Workflows) - can reference Guide 2 plan
- Both work independently

**Week 2**:

- **Developer C**: Guide 2 (Backend Scaffolding) - needs Guide 1 complete
- Developer B continues/refines Guide 4

**Week 3**:

- **Developer D**: Guide 3 (Frontend) - needs Guides 1+2 complete

**Week 4**:

- **Developer E**: Guide 5 (Testing & Docs) - needs all guides complete

### Communication Points

**Daily standups should cover**:

1. Completion status of each guide
2. Blocking dependencies
3. Cross-guide integration questions
4. Testing results

**Key handoffs**:

- Guide 1 → Guide 2: Type schemas must be finalized
- Guide 2 → Guide 3: Backend scaffolding must work
- Guides 1+2 → Guide 3: Environment variable processor must be ready
- All → Guide 5: Features must be implementation-complete

---

## Known Trade-offs & Future Work

### Decisions Made

1. **Hooks**: TypeScript + esbuild (ES2020) ✅
2. **Linter**: Biome (project consistency) ✅
3. **Binary**: Auto-download with hardcoded version ✅
4. **Frontend**: Next.js only (MVP) ✅
5. **Deployment**: PocketHost + self-hosted ✅

### Future Enhancements (Out of Scope)

1. **Native/Expo Support** - React Native integration
2. **Type Generation** - `pocketbase-typegen` integration
3. **Binary Version Selection** - CLI flag for version
4. **Docker Deployment** - Container orchestration
5. **Migration Scaffolding** - CLI command for migrations
6. **Better-Auth Integration** - Alternative auth option
7. **Additional Frameworks** - Nuxt, Svelte, Solid

---

## Success Criteria

The integration is complete when:

1. ✅ PocketBase appears as backend option in CLI
2. ✅ Users can choose PocketHost or self-hosted deployment
3. ✅ PocketHost generates working GitHub Actions deployment
4. ✅ Self-hosted auto-downloads correct binary for OS/arch
5. ✅ Next.js frontend integrates with full auth flow
6. ✅ Todo example demonstrates CRUD operations
7. ✅ Environment variables correctly generated
8. ✅ Generated projects run end-to-end without manual steps
9. ✅ Documentation is clear and complete
10. ✅ Validation prevents incompatible configurations

---

## Troubleshooting Common Issues

### Binary Download Failures

**Symptom**: Binary fails to download or extract
**Causes**: Network issues, unsupported platform, permissions
**Solutions**: See Guide 2 for platform detection logic, manual download fallback

### Build Errors

**Symptom**: Hooks fail to compile with async/await or import/export errors
**Causes**: Using Goja-incompatible syntax
**Solutions**: See Guide 2 for Biome linting configuration

### FTP Deployment Issues

**Symptom**: GitHub Actions workflow fails to deploy
**Causes**: Missing secrets, incorrect FTP credentials
**Solutions**: See Guide 4 for secret configuration

### Auth Flow Problems

**Symptom**: Sign-in/sign-up not working
**Causes**: Environment variables misconfigured, PocketBase not running
**Solutions**: See Guide 3 for environment variable setup

---

## Quick Navigation

**Start implementing?**

- Read your assigned guide (Guides 1-5)
- Check dependencies in guide header
- Follow implementation steps
- Verify your work
- Coordinate handoffs

**Need technical details?**

- Architectural analysis: `/Users/dfallon/.claude/plans/wild-wobbling-elephant.md`
- Component catalog: See analysis document
- Source implementations: Directories in project root

**Questions about approach?**

- Check decision records in this guide
- Review source implementations analysis
- Coordinate with other developers

---

## References

- **Architectural Analysis**: Full decision rationale and source comparison
- **PocketBase Docs**: https://pocketbase.io/docs/
- **Goja Runtime**: https://github.com/dop251/goja
- **esbuild Docs**: https://esbuild.github.io/
- **PocketHost**: https://pockethost.io/

---

## Next Steps

1. **Read this guide completely** - Understand the full architecture
2. **Identify your role** - Which guide (1-5) are you responsible for?
3. **Check dependencies** - Can you start now, or wait for another guide?
4. **Read your guide** - Follow the implementation steps
5. **Coordinate** - Communicate progress and blockers
6. **Verify** - Test your work thoroughly
7. **Document** - Update guides if you find issues or improvements

The integration is complex but well-structured. Following the guides systematically will result in a production-ready PocketBase integration for create-better-t-stack.
