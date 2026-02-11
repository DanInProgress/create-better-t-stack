# Guide 4: Deployment Workflows

## Quick Reference

**Audience**: DevOps/Deployment developer
**Dependencies**:

- Guide 0 (Architecture overview)
- Guide 2 (CLI implementation - for package.json scripts injection)
  **Estimated reading time**: 45-60 minutes
  **Purpose**: Implement CI/CD pipelines, README generation, and deployment documentation for both PocketHost and self-hosted deployments

---

## Executive Summary

This guide covers the implementation of deployment workflows for PocketBase in create-better-t-stack. The integration supports two deployment strategies:

1. **PocketHost**: Cloud-hosted PocketBase with automated FTP deployment via GitHub Actions
2. **Self-hosted**: Local/VPS deployment with PocketBase binary and package.json scripts

### Key Components

- **GitHub Actions workflow** for automated PocketHost deployment
- **README generation** with deployment-specific instructions
- **Package.json scripts** for self-hosted development
- **Environment variable management** across development and production
- **Verification steps** for testing deployments

---

## Deployment Strategy Overview

### Decision Tree

```
User selects PocketBase
    ├── Self-hosted?
    │   ├── Yes: Download binary, create package.json scripts, local README
    │   └── No: PocketHost → Create GitHub Actions workflow, cloud README
    └── Manual setup?
        └── Yes: Generate templates without automated setup
```

### File Structure Comparison

**PocketHost Deployment**:

```
packages/backend/
├── .github/
│   └── workflows/
│       └── deploy-pockethost.yml    # Auto-deploy on push
├── pb_hooks/                        # Deployed via FTP
├── pb_migrations/                   # Deployed via FTP
├── .gitignore                       # Excludes pb_data (cloud-managed)
└── README.md                        # PocketHost-specific docs
```

**Self-hosted Deployment**:

```
packages/backend/
├── pocketbase                       # Downloaded binary (gitignored)
├── pb_hooks/                        # Local hooks
├── pb_migrations/                   # Local migrations
├── pb_data/                        # Local SQLite DB (gitignored)
├── pb_public/                      # Static files
├── package.json                    # Contains dev/serve/migrate scripts
├── .gitignore                      # Excludes binary and pb_data
└── README.md                       # Self-hosted docs
```

---

## 1. PocketHost Deployment

### 1.1 GitHub Actions Workflow

**Source**: `gemini-3-pro/packages/template-generator/templates/backend/pocketbase/.github/workflows/deploy.yml`

**Location**: `.github/workflows/deploy-pockethost.yml`

```yaml
name: Deploy to PocketHost

on:
  push:
    branches:
      - main
    paths:
      - "packages/backend/**"

jobs:
  web-deploy:
    name: Deploy to PocketHost
    runs-on: ubuntu-latest
    steps:
      - name: 🚚 Get latest code
        uses: actions/checkout@v4

      - name: 📦 Install dependencies
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - run: bun install

      - name: 🔨 Build Backend Hooks
        run: bun run build --filter=@{{projectName}}/backend

      - name: 📂 Sync Hooks
        uses: SamKirkland/FTP-Deploy-Action@v4.3.4
        with:
          server: ftp.pockethost.io
          username: ${{ secrets.POCKETHOST_USERNAME }}
          password: ${{ secrets.POCKETHOST_PASSWORD }}
          local-dir: ./packages/backend/pb_hooks/
          server-dir: /pb_hooks/

      - name: 📂 Sync Migrations
        uses: SamKirkland/FTP-Deploy-Action@v4.3.4
        with:
          server: ftp.pockethost.io
          username: ${{ secrets.POCKETHOST_USERNAME }}
          password: ${{ secrets.POCKETHOST_PASSWORD }}
          local-dir: ./packages/backend/pb_migrations/
          server-dir: /pb_migrations/
```

#### Workflow Breakdown

**Trigger Configuration**:

```yaml
on:
  push:
    branches:
      - main
    paths:
      - "packages/backend/**"
```

- Only deploys when `packages/backend` files change
- Prevents unnecessary deployments for frontend-only changes
- Triggers on main branch push only

**Build Step**:

```yaml
- name: 🔨 Build Backend Hooks
  run: bun run build --filter=@{{projectName}}/backend
```

- Uses Turborepo filter to build only backend package
- Compiles TypeScript hooks to JavaScript
- `{{projectName}}` is replaced during template generation

**FTP Deployment**:

- Uses `SamKirkland/FTP-Deploy-Action@v4.3.4`
- Deploys to `ftp.pockethost.io` (PocketHost's FTP server)
- Separate steps for `pb_hooks` and `pb_migrations`
- Credentials stored in GitHub Secrets

#### Alternative: Claude Sonnet 4.5 Implementation

**Source**: `claude-sonnet-4_5/apps/cli/src/helpers/database-providers/pocketbase-pockethost-setup.ts` (lines 176-214)

```typescript
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
```

**Key Differences**:

1. More granular path filtering (only pb_hooks and pb_migrations)
2. No build step (assumes pre-built or no build needed)
3. Uses FTPS protocol explicitly
4. Separate secrets for host, username, password (more flexible)

**Recommendation**: Use Gemini's approach with build step for TypeScript hooks, but add FTPS protocol for security.

### 1.2 Secret Management Documentation

**Required GitHub Secrets**:

| Secret Name           | Value             | Where to Find                                                |
| --------------------- | ----------------- | ------------------------------------------------------------ |
| `POCKETHOST_USERNAME` | Your FTP username | PocketHost Dashboard → Instance → Settings → FTP Credentials |
| `POCKETHOST_PASSWORD` | Your FTP password | Same location                                                |

**Setup Instructions** (for README):

```markdown
### Setting up GitHub Actions Deployment

1. **Get FTP Credentials**:
   - Log in to [PocketHost](https://pockethost.io)
   - Navigate to your instance dashboard
   - Go to Settings → FTP Credentials
   - Note your FTP username and password

2. **Add GitHub Secrets**:
   - Go to your GitHub repository
   - Navigate to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Add the following secrets:
     - `POCKETHOST_USERNAME`: Your FTP username
     - `POCKETHOST_PASSWORD`: Your FTP password

3. **Deploy**:
   - Push to the `main` branch
   - GitHub Actions will automatically build and deploy your hooks and migrations
   - Check the Actions tab for deployment status
```

### 1.3 PocketHost README Template

**Source**: `claude-sonnet-4_5/apps/cli/src/helpers/database-providers/pocketbase-pockethost-setup.ts` (lines 58-128)

**Location**: `packages/backend/README.md`

```markdown
# PocketBase Backend (PocketHost)

This directory contains your PocketBase backend files for deployment to PocketHost.

## Directory Structure

- `pb_hooks/` - Server-side JavaScript hooks for custom logic
- `pb_migrations/` - Database migration files

**Note:** When deploying to PocketHost, only `pb_hooks` and `pb_migrations` are uploaded.
The `pb_data` directory is managed by PocketHost in the cloud.

## Getting Started

### 1. Create a PocketHost Instance

1. Visit [PocketHost.io](https://pockethost.io) and sign up
2. Create a new instance
3. Note your instance URL (e.g., `https://your-instance.pockethost.io`)

### 2. Access Admin Dashboard

Visit `https://your-instance.pockethost.io/_/` to access the admin panel.

### 3. Development Workflow

For local development, you can:

- Use the PocketHost instance directly (recommended for small projects)
- Run PocketBase locally with `pocketbase serve` (requires downloading binary)

### 4. Deployment

#### Option A: Manual Deployment via FTP

1. Get FTP credentials from PocketHost dashboard
2. Connect using an FTP client (FileZilla, Cyberduck, etc.)
3. Upload files from `pb_hooks/` and `pb_migrations/` to the corresponding directories

#### Option B: Automated Deployment via GitHub Actions

Use the provided GitHub Actions workflow in `.github/workflows/deploy-pockethost.yml`:

1. Add secrets to your GitHub repository:
   - `POCKETHOST_USERNAME`: Your FTP username
   - `POCKETHOST_PASSWORD`: Your FTP password

2. Push to your main branch to trigger deployment

## Environment Variables

The following environment variables are configured:

- Frontend (`apps/web/.env`):
  - `NEXT_PUBLIC_POCKETBASE_URL` - Your PocketHost instance URL

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
```

### 1.4 Environment Variables (PocketHost)

**Source**: `claude-sonnet-4_5/apps/cli/src/helpers/database-providers/pocketbase-pockethost-setup.ts` (lines 143-173)

**Frontend** (`apps/web/.env`):

```env
# PocketHost instance URL
NEXT_PUBLIC_POCKETBASE_URL=https://your-instance.pockethost.io
POCKETBASE_URL=https://your-instance.pockethost.io
```

**Backend** (`packages/backend/.env`):

```env
# Environment variables
.env
.env.local
```

**Note**: Backend has no runtime env vars for PocketHost - all configuration is managed by PocketHost.

---

## 2. Self-Hosted Deployment

### 2.1 Package.json Scripts

**Source**: `claude-sonnet-4_5/apps/cli/src/helpers/database-providers/pocketbase-self-hosted-setup.ts` (lines 264-312)

**Location**: `packages/backend/package.json`

```json
{
  "name": "@{{projectName}}/backend",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "./pocketbase serve",
    "serve": "./pocketbase serve",
    "migrate": "./pocketbase migrate",
    "admin:create": "./pocketbase admin create",
    "admin:update": "./pocketbase admin update"
  }
}
```

**Script Descriptions**:

| Script         | Command                     | Purpose                                           |
| -------------- | --------------------------- | ------------------------------------------------- |
| `dev`          | `./pocketbase serve`        | Start development server at http://127.0.0.1:8090 |
| `serve`        | `./pocketbase serve`        | Alias for dev (consistency with other stacks)     |
| `migrate`      | `./pocketbase migrate`      | Apply pending migrations                          |
| `admin:create` | `./pocketbase admin create` | Create admin account via CLI                      |
| `admin:update` | `./pocketbase admin update` | Update admin account via CLI                      |

**Implementation** (for CLI generator):

```typescript
async function addPackageJsonScripts(
  projectDir: string,
): Promise<Result<void, DatabaseSetupError>> {
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
```

### 2.2 Self-Hosted README Template

**Source**: `claude-sonnet-4_5/apps/cli/src/helpers/database-providers/pocketbase-self-hosted-setup.ts` (lines 147-202)

**Location**: `packages/backend/README.md`

```markdown
# PocketBase Backend

This directory contains your PocketBase backend instance.

## Directory Structure

- `pb_data/` - SQLite database and file storage (gitignored)
- `pb_hooks/` - Server-side JavaScript hooks for custom logic
- `pb_migrations/` - Database migration files
- `pb_public/` - Static files served at the root URL
- `pocketbase` - PocketBase executable (gitignored)

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

- `POCKETBASE_URL` - The URL of your PocketBase instance (default: http://127.0.0.1:8090)
- `PB_ENCRYPTION_KEY` - Optional 32-character encryption key for sensitive data

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
```

### 2.3 Environment Variables (Self-Hosted)

**Source**: `claude-sonnet-4_5/apps/cli/src/helpers/database-providers/pocketbase-self-hosted-setup.ts` (lines 217-262)

**Frontend** (`apps/web/.env`):

```env
# PocketBase instance URL (development)
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
POCKETBASE_URL=http://127.0.0.1:8090
```

**Backend** (`packages/backend/.env.local`):

```env
# PocketBase instance URL
POCKETBASE_URL=http://127.0.0.1:8090

# Optional: 32-character encryption key for sensitive data
PB_ENCRYPTION_KEY=
```

**Production Environment Variables**:

```env
# Frontend (apps/web/.env.production)
NEXT_PUBLIC_POCKETBASE_URL=https://your-domain.com
POCKETBASE_URL=https://your-domain.com

# Backend (packages/backend/.env.production)
POCKETBASE_URL=https://your-domain.com
PB_ENCRYPTION_KEY=<32-char-random-key>
```

---

## 3. Deployment Comparison

### 3.1 Feature Matrix

| Feature                  | PocketHost              | Self-Hosted                   |
| ------------------------ | ----------------------- | ----------------------------- |
| **Deployment**           | GitHub Actions (FTP)    | Manual/Docker/VPS             |
| **Database**             | Cloud-managed SQLite    | Local SQLite                  |
| **File Storage**         | Cloud S3-compatible     | Local filesystem              |
| **Backups**              | Automatic               | Manual/scripted               |
| **Scaling**              | PocketHost handles      | DIY (reverse proxy, etc.)     |
| **Cost**                 | PocketHost subscription | Server costs only             |
| **Setup Time**           | ~5 minutes              | ~30 minutes                   |
| **Maintenance**          | Minimal                 | Full control/responsibility   |
| **GitHub Actions**       | Yes (auto-deploy)       | No (optional custom workflow) |
| **package.json scripts** | No                      | Yes (dev, migrate, admin)     |
| **README Focus**         | Cloud deployment        | Local development             |

### 3.2 Environment Variables Comparison

| Variable                     | PocketHost                         | Self-Hosted                                                       |
| ---------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_POCKETBASE_URL` | `https://instance.pockethost.io`   | `http://127.0.0.1:8090` (dev)<br>`https://your-domain.com` (prod) |
| `POCKETBASE_URL`             | `https://instance.pockethost.io`   | `http://127.0.0.1:8090` (dev)<br>`https://your-domain.com` (prod) |
| `PB_ENCRYPTION_KEY`          | Not needed (managed by PocketHost) | Optional 32-char key                                              |
| `POCKETHOST_USERNAME`        | GitHub Secret only                 | N/A                                                               |
| `POCKETHOST_PASSWORD`        | GitHub Secret only                 | N/A                                                               |

---

## 4. README Generation Patterns

### 4.1 Common Template Structure

Both README templates follow this structure:

```markdown
# [Deployment Type] Backend

## Directory Structure

[List directories with descriptions]

## Getting Started

[Step-by-step setup instructions]

## Development Workflow

[How to develop locally]

## Deployment

[Deployment-specific instructions]

## Environment Variables

[List and explain env vars]

## Resources

[Links to documentation]

## Tips

[Best practices and gotchas]
```

### 4.2 Template Variables

When generating READMEs, replace these template variables:

| Variable          | Example Value                     | Used In                      |
| ----------------- | --------------------------------- | ---------------------------- |
| `{{projectName}}` | `my-app`                          | Workflow file, package names |
| `{{instanceUrl}}` | `https://my-app.pockethost.io`    | PocketHost README            |
| `{{adminUrl}}`    | `https://my-app.pockethost.io/_/` | Both READMEs                 |

### 4.3 Conditional Content

**PocketHost-specific sections**:

- GitHub Actions setup instructions
- FTP credential documentation
- Cloud-managed database notes

**Self-hosted-specific sections**:

- Binary download instructions
- Package.json script documentation
- VPS/Docker deployment guidance
- Backup and maintenance notes

---

## 5. Future Deployment Options

### 5.1 Docker Support

**Potential implementation**:

```dockerfile
# Dockerfile (packages/backend/Dockerfile)
FROM alpine:3.18

# Install PocketBase
RUN apk add --no-cache \
    ca-certificates \
    unzip \
    wget

RUN wget https://github.com/pocketbase/pocketbase/releases/download/v0.23.4/pocketbase_0.23.4_linux_amd64.zip \
    && unzip pocketbase_0.23.4_linux_amd64.zip \
    && rm pocketbase_0.23.4_linux_amd64.zip

EXPOSE 8090

# Copy hooks and migrations
COPY pb_hooks /pb_hooks
COPY pb_migrations /pb_migrations

# Start PocketBase
CMD ["/pocketbase", "serve", "--http=0.0.0.0:8090"]
```

**docker-compose.yml**:

```yaml
services:
  pocketbase:
    build: ./packages/backend
    ports:
      - "8090:8090"
    volumes:
      - ./packages/backend/pb_data:/pb_data
      - ./packages/backend/pb_public:/pb_public
    environment:
      - PB_ENCRYPTION_KEY=${PB_ENCRYPTION_KEY}
```

**Benefits**:

- Consistent deployment across environments
- Easy scaling with Docker Swarm/Kubernetes
- Simplified dependency management

### 5.2 Railway/Fly.io Deployment

**Railway Considerations**:

- PocketBase binary in Docker image
- Persistent volume for `pb_data`
- Environment variables via Railway dashboard
- Auto-deploy on GitHub push

**Example railway.toml**:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "packages/backend/Dockerfile"

[deploy]
startCommand = "/pocketbase serve --http=0.0.0.0:$PORT"
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

**Fly.io Considerations**:

- Similar Docker approach
- Persistent volumes for SQLite
- Global deployment with edge caching
- Automatic HTTPS

**Example fly.toml**:

```toml
app = "my-pocketbase-app"
primary_region = "iad"

[build]
  dockerfile = "packages/backend/Dockerfile"

[http_service]
  internal_port = 8090
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[mounts]
  source = "pb_data"
  destination = "/pb_data"
```

### 5.3 VPS Self-Hosted

**systemd Service** (for Linux VPS):

```ini
# /etc/systemd/system/pocketbase.service
[Unit]
Description=PocketBase
After=network.target

[Service]
Type=simple
User=pocketbase
Group=pocketbase
WorkingDirectory=/home/pocketbase/app
ExecStart=/home/pocketbase/app/pocketbase serve --http=0.0.0.0:8090
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

**Nginx Reverse Proxy**:

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. Verification Steps

### 6.1 Workflow Validation

**GitHub Actions Workflow**:

1. **Syntax Validation**:

```bash
# Install actionlint
brew install actionlint  # macOS
# or
go install github.com/rhysd/actionlint/cmd/actionlint@latest

# Validate workflow
actionlint .github/workflows/deploy-pockethost.yml
```

2. **Local Testing** (using act):

```bash
# Install act
brew install act  # macOS

# Test workflow locally
act push -W .github/workflows/deploy-pockethost.yml
```

3. **Dry Run**:

```bash
# Push to test branch
git checkout -b test-deployment
git push origin test-deployment

# Check Actions tab in GitHub
# Verify workflow doesn't run (not on main branch)
```

### 6.2 Deployment Testing

**PocketHost Deployment**:

1. **Manual FTP Test**:

```bash
# Install lftp
brew install lftp  # macOS

# Test connection
lftp -u username,password ftp.pockethost.io

# List directory
ls /pb_hooks/

# Upload test file
put test.js -o /pb_hooks/test.js
```

2. **GitHub Actions Test**:

```bash
# Add secrets to GitHub
# Settings → Secrets → New repository secret

# Push to main
git checkout main
git merge test-deployment
git push origin main

# Check Actions tab
# Verify successful deployment
```

3. **Verify Deployment**:

```bash
# Check PocketHost dashboard
# Logs should show new hooks/migrations

# Test endpoint
curl https://your-instance.pockethost.io/api/health
```

**Self-Hosted Deployment**:

1. **Binary Test**:

```bash
cd packages/backend

# Test binary
./pocketbase --version

# Start server
./pocketbase serve

# Test admin UI
curl http://127.0.0.1:8090/_/
```

2. **Script Test**:

```bash
# Test package.json scripts
bun run dev          # Should start server
bun run migrate      # Should apply migrations
bun run admin:create # Should prompt for admin creation
```

3. **Environment Variables**:

```bash
# Check env vars are loaded
cat apps/web/.env | grep POCKETBASE_URL
cat packages/backend/.env.local | grep POCKETBASE_URL
```

### 6.3 README Verification

**Checklist**:

- [ ] All links are valid and accessible
- [ ] Code snippets are syntactically correct
- [ ] Commands work as documented
- [ ] Screenshots/examples are current
- [ ] Deployment instructions are complete
- [ ] Troubleshooting section addresses common issues

**Testing**:

```bash
# Test all commands in README
cd packages/backend

# Follow README instructions step-by-step
# Document any errors or unclear steps
```

---

## 7. Implementation Checklist

### 7.1 PocketHost Setup

- [ ] Create GitHub Actions workflow file
  - [ ] Configure trigger (main branch, backend paths)
  - [ ] Add build step (esbuild for TypeScript hooks)
  - [ ] Add FTP deploy steps (pb_hooks, pb_migrations)
  - [ ] Use correct action versions
- [ ] Generate PocketHost README
  - [ ] Include directory structure
  - [ ] Document GitHub Actions setup
  - [ ] Add FTP manual deployment instructions
  - [ ] List environment variables
  - [ ] Add troubleshooting section
- [ ] Set up environment variables
  - [ ] Frontend: NEXT_PUBLIC_POCKETBASE_URL
  - [ ] Frontend: POCKETBASE_URL
  - [ ] Document GitHub Secrets needed
- [ ] Create .gitignore
  - [ ] Exclude pb_data (cloud-managed)
  - [ ] Exclude .env files
  - [ ] Include pb_hooks and pb_migrations

### 7.2 Self-Hosted Setup

- [ ] Inject package.json scripts
  - [ ] dev script: ./pocketbase serve
  - [ ] serve script: ./pocketbase serve
  - [ ] migrate script: ./pocketbase migrate
  - [ ] admin:create script
  - [ ] admin:update script
- [ ] Generate self-hosted README
  - [ ] Include directory structure
  - [ ] Document development workflow
  - [ ] Add deployment options (VPS, Docker)
  - [ ] List environment variables
  - [ ] Add resources and links
- [ ] Set up environment variables
  - [ ] Frontend: NEXT_PUBLIC_POCKETBASE_URL (http://127.0.0.1:8090)
  - [ ] Backend: POCKETBASE_URL
  - [ ] Backend: PB_ENCRYPTION_KEY (optional)
- [ ] Create .gitignore
  - [ ] Exclude pocketbase binary
  - [ ] Exclude pb_data directory
  - [ ] Exclude .env files
  - [ ] Include pb_hooks and pb_migrations

### 7.3 Verification

- [ ] Test GitHub Actions workflow (PocketHost)
  - [ ] Validate YAML syntax
  - [ ] Test FTP connection
  - [ ] Verify successful deployment
- [ ] Test package.json scripts (Self-hosted)
  - [ ] Run dev script
  - [ ] Test migration script
  - [ ] Verify admin creation
- [ ] Validate README accuracy
  - [ ] Test all commands
  - [ ] Verify all links
  - [ ] Check code snippets
- [ ] Test environment variables
  - [ ] Development environment
  - [ ] Production environment (if applicable)

---

## 8. Common Issues and Troubleshooting

### 8.1 GitHub Actions Issues

**Problem**: Workflow doesn't trigger
**Solution**:

- Verify path filters match actual changed files
- Check branch name (must be `main`)
- Ensure workflow file is in `.github/workflows/`

**Problem**: FTP deployment fails
**Solution**:

```yaml
# Add debug output
- name: Debug FTP Connection
  run: |
    echo "Testing FTP connection..."
    curl -v ftp://ftp.pockethost.io/ --user "${{ secrets.POCKETHOST_USERNAME }}:${{ secrets.POCKETHOST_PASSWORD }}"
```

**Problem**: Build fails before deployment
**Solution**:

- Check TypeScript compilation errors
- Verify esbuild configuration
- Ensure all dependencies are installed

### 8.2 Self-Hosted Issues

**Problem**: Binary not found
**Solution**:

```bash
# Check binary exists
ls -la packages/backend/pocketbase

# Check permissions
chmod +x packages/backend/pocketbase

# Test binary
./pocketbase --version
```

**Problem**: Port already in use
**Solution**:

```bash
# Find process using port 8090
lsof -i :8090

# Kill process
kill -9 <PID>

# Or use different port
./pocketbase serve --http=127.0.0.1:8091
```

**Problem**: Migration fails
**Solution**:

```bash
# Check migration files
ls packages/backend/pb_migrations/

# Run with verbose output
./pocketbase migrate --debug

# Rollback if needed
./pocketbase migrate down
```

### 8.3 Environment Variable Issues

**Problem**: Frontend can't connect to backend
**Solution**:

```bash
# Check env vars are loaded
echo $NEXT_PUBLIC_POCKETBASE_URL

# Restart development server
bun run dev

# Verify URL is correct
curl $NEXT_PUBLIC_POCKETBASE_URL/api/health
```

**Problem**: CORS errors
**Solution**:

```javascript
// Add to pb_hooks/main.pb.js
routerAdd("GET", "/api/health", (c) => {
  c.response().header().set("Access-Control-Allow-Origin", "*");
  return c.json(200, { status: "ok" });
});
```

---

## Summary

This guide covers the complete deployment workflow implementation for PocketBase in create-better-t-stack:

1. **PocketHost Deployment**: GitHub Actions workflow with automated FTP deployment, cloud-optimized README, and minimal configuration
2. **Self-Hosted Deployment**: Package.json scripts for local development, comprehensive README with deployment options, and full control
3. **README Generation**: Deployment-specific templates with clear instructions and troubleshooting
4. **Environment Variables**: Proper separation between development and production, frontend and backend
5. **Future Options**: Docker, Railway/Fly.io, and VPS deployment considerations
6. **Verification**: Complete testing procedures for workflows, deployments, and documentation

**Next Steps**:

- Implement GitHub Actions workflow generator in CLI
- Create README template system with variable substitution
- Add package.json script injection logic
- Test both deployment paths end-to-end
- Document verification procedures in CI/CD pipeline

**Related Guides**:

- Guide 0: Architecture overview and deployment strategy decisions
- Guide 2: CLI implementation for setup orchestration
- Guide 3: Backend package implementation (hooks, migrations, build pipeline)
