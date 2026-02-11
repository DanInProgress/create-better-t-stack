# Frontend Integration Guide: PocketBase Auth & Examples

This guide shows how to implement frontend components, auth integration, and example templates for the Better T-Stack CLI. It demonstrates the complete integration of PocketBase authentication and the Todo example.

## Overview

Frontend integration involves three key areas:

1. **Template Components**: Auth forms, user menus, protected routes, and example pages
2. **Template Handlers**: Logic that determines which templates to copy based on project configuration
3. **Dependency & Environment Processors**: Automatic package installation and environment variable setup

## Architecture Pattern

```
Template Structure:
templates/
  auth/
    pocketbase-auth/
      pocketbase/
        web/
          react/
            next/
              src/
                lib/pocketbase.ts.hbs
                components/
                  sign-in-form.tsx.hbs
                  sign-up-form.tsx.hbs
                  user-menu.tsx.hbs
                app/
                  dashboard/
                    page.tsx.hbs
        backend/
          pb_hooks.js.hbs
  examples/
    todo/
      pocketbase/
        web/
          react/
            next/
              src/
                components/todo-list.tsx.hbs
                lib/pocketbase.ts.hbs

Processing Flow:
1. User selects config → CLI prompts
2. Template handler processes config
3. Copies relevant templates to VFS
4. Dependency processor adds packages
5. Environment processor creates .env files
6. Project scaffolded
```

## 1. PocketBase Client Setup

The PocketBase client is the foundation for all frontend interactions with the backend.

### lib/pocketbase.ts

```typescript
import PocketBase from "pocketbase";
import { env } from "@{{projectName}}/env/web";

const pb = new PocketBase(env.NEXT_PUBLIC_POCKETBASE_URL);

export default pb;
```

**Key Features:**

- Single shared instance across the app
- Uses environment variable for URL configuration
- Auto-syncs authentication state via `authStore`
- Works in both server and client components

## 2. Authentication Components

### Sign-In Form (sign-in-form.tsx)

```typescript
"use client";

import pb from "@/lib/pocketbase";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useRouter } from "next/navigation";

export default function SignInForm({
	onSwitchToSignUp,
}: {
	onSwitchToSignUp: () => void;
}) {
	const router = useRouter();

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			try {
				await pb.collection("users").authWithPassword(value.email, value.password);
				router.push("/dashboard");
				toast.success("Sign in successful");
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Failed to sign in");
			}
		},
		validators: {
			onSubmit: z.object({
				email: z.email("Invalid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	return (
		<div className="mx-auto w-full mt-10 max-w-md p-6">
			<h1 className="mb-6 text-center text-3xl font-bold">Welcome Back</h1>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-4"
			>
				<div>
					<form.Field name="email">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Email</Label>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error?.message} className="text-red-500">
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<div>
					<form.Field name="password">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Password</Label>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error?.message} className="text-red-500">
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<form.Subscribe>
					{(state) => (
						<Button
							type="submit"
							className="w-full"
							disabled={!state.canSubmit || state.isSubmitting}
						>
							{state.isSubmitting ? "Signing in..." : "Sign In"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<div className="mt-4 text-center">
				<Button
					variant="link"
					onClick={onSwitchToSignUp}
					className="text-indigo-600 hover:text-indigo-800"
				>
					Need an account? Sign Up
				</Button>
			</div>
		</div>
	);
}
```

**Integration Pattern:**

- Uses TanStack React Form for type-safe form handling
- Zod validation integrated at form level
- PocketBase `authWithPassword` for authentication
- Router navigation after successful login
- Toast notifications for user feedback

### Sign-Up Form (sign-up-form.tsx)

```typescript
"use client";

import pb from "@/lib/pocketbase";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useRouter } from "next/navigation";

export default function SignUpForm({
	onSwitchToSignIn,
}: {
	onSwitchToSignIn: () => void;
}) {
	const router = useRouter();

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			try {
				await pb.collection("users").create({
					name: value.name,
					email: value.email,
					password: value.password,
					passwordConfirm: value.password,
				});
				await pb.collection("users").authWithPassword(value.email, value.password);
				router.push("/dashboard");
				toast.success("Account created successfully");
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Failed to create account");
			}
		},
		validators: {
			onSubmit: z.object({
				name: z.string().min(2, "Name must be at least 2 characters"),
				email: z.email("Invalid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	return (
		<div className="mx-auto w-full mt-10 max-w-md p-6">
			<h1 className="mb-6 text-center text-3xl font-bold">Create Account</h1>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-4"
			>
				<div>
					<form.Field name="name">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Name</Label>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error?.message} className="text-red-500">
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<div>
					<form.Field name="email">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Email</Label>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error?.message} className="text-red-500">
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<div>
					<form.Field name="password">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Password</Label>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error?.message} className="text-red-500">
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<form.Subscribe>
					{(state) => (
						<Button
							type="submit"
							className="w-full"
							disabled={!state.canSubmit || state.isSubmitting}
						>
							{state.isSubmitting ? "Creating account..." : "Sign Up"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<div className="mt-4 text-center">
				<Button
					variant="link"
					onClick={onSwitchToSignIn}
					className="text-indigo-600 hover:text-indigo-800"
				>
					Already have an account? Sign In
				</Button>
			</div>
		</div>
	);
}
```

**Two-Step Process:**

1. Create user account with PocketBase
2. Immediately authenticate the new user
3. Redirect to dashboard

### User Menu (user-menu.tsx)

```typescript
"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import pb from "@/lib/pocketbase";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";

export default function UserMenu() {
	const router = useRouter();
	const user = pb.authStore.record;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" />}>
				{user?.name || user?.email}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-card">
				<DropdownMenuGroup>
					<DropdownMenuLabel>My Account</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem>{user?.email}</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onClick={() => {
							pb.authStore.clear();
							router.push("/dashboard");
						}}
					>
						Sign Out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

**AuthStore Integration:**

- Direct access to authenticated user via `pb.authStore.record`
- `authStore.clear()` for logout
- Reactive to auth state changes

### Dashboard Page (dashboard/page.tsx)

```typescript
"use client";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import UserMenu from "@/components/user-menu";
import pb from "@/lib/pocketbase";
import { useState, useEffect } from "react";

export default function DashboardPage() {
	const [showSignIn, setShowSignIn] = useState(false);
	const [isValid, setIsValid] = useState(pb.authStore.isValid);

	useEffect(() => {
		const unsubscribe = pb.authStore.onChange(() => {
			setIsValid(pb.authStore.isValid);
		});
		return () => unsubscribe();
	}, []);

	if (!isValid) {
		return showSignIn ? (
			<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
		) : (
			<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
		);
	}

	return (
		<div>
			<h1>Dashboard</h1>
			<p>Welcome, {pb.authStore.record?.name || pb.authStore.record?.email}</p>
			<UserMenu />
		</div>
	);
}
```

**Protected Route Pattern:**

- Listen to `authStore.onChange` for reactivity
- Conditionally render auth forms or protected content
- Toggle between sign-in and sign-up views

## 3. Todo Example (Complete CRUD)

### todo-list.tsx

```typescript
"use client";

import pb from "@/lib/pocketbase";
import { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface Todo {
	id: string;
	text: string;
	completed: boolean;
}

export default function TodoList() {
	const [todos, setTodos] = useState<Todo[]>([]);
	const [newTodo, setNewTodo] = useState("");
	const [isLoading, setIsLoading] = useState(true);

	const fetchTodos = useCallback(async () => {
		try {
			const records = await pb.collection("todos").getFullList<Todo>({
				sort: "-created",
			});
			setTodos(records);
		} catch (error) {
			console.error("Failed to fetch todos:", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchTodos();
	}, [fetchTodos]);

	async function handleCreate(e: React.FormEvent) {
		e.preventDefault();
		if (!newTodo.trim()) return;

		try {
			await pb.collection("todos").create({
				text: newTodo.trim(),
				completed: false,
			});
			setNewTodo("");
			await fetchTodos();
		} catch (error) {
			console.error("Failed to create todo:", error);
		}
	}

	async function handleToggle(todo: Todo) {
		try {
			await pb.collection("todos").update(todo.id, {
				completed: !todo.completed,
			});
			await fetchTodos();
		} catch (error) {
			console.error("Failed to toggle todo:", error);
		}
	}

	async function handleDelete(id: string) {
		try {
			await pb.collection("todos").delete(id);
			await fetchTodos();
		} catch (error) {
			console.error("Failed to delete todo:", error);
		}
	}

	if (isLoading) {
		return <div className="text-center p-4">Loading todos...</div>;
	}

	return (
		<div className="mx-auto w-full max-w-md p-6">
			<h2 className="mb-4 text-2xl font-bold">Todos</h2>

			<form onSubmit={handleCreate} className="mb-4 flex gap-2">
				<Input
					value={newTodo}
					onChange={(e) => setNewTodo(e.target.value)}
					placeholder="Add a new todo..."
					className="flex-1"
				/>
				<Button type="submit" disabled={!newTodo.trim()}>
					Add
				</Button>
			</form>

			<ul className="space-y-2">
				{todos.map((todo) => (
					<li
						key={todo.id}
						className="flex items-center gap-2 rounded border p-2"
					>
						<input
							type="checkbox"
							checked={todo.completed}
							onChange={() => handleToggle(todo)}
							className="h-4 w-4"
						/>
						<span
							className={`flex-1 ${todo.completed ? "line-through opacity-50" : ""}`}
						>
							{todo.text}
						</span>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleDelete(todo.id)}
						>
							Delete
						</Button>
					</li>
				))}
			</ul>

			{todos.length === 0 && (
				<p className="text-center text-muted-foreground">
					No todos yet. Add one above!
				</p>
			)}
		</div>
	);
}
```

**CRUD Operations:**

- **Create**: `pb.collection("todos").create()`
- **Read**: `pb.collection("todos").getFullList()`
- **Update**: `pb.collection("todos").update(id, data)`
- **Delete**: `pb.collection("todos").delete(id)`

## 4. Template Handler Implementation

### auth.ts Handler

Location: `/packages/template-generator/src/template-handlers/auth.ts`

```typescript
export async function processAuthTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): Promise<void> {
  if (!config.auth || config.auth === "none") return;

  const hasReactWeb = config.frontend.some((f) =>
    ["tanstack-router", "react-router", "tanstack-start", "next"].includes(f),
  );
  // ... other framework checks

  const authProvider = config.auth;

  // PocketBase-specific logic
  if (config.backend === "pocketbase" && authProvider === "pocketbase-auth") {
    processTemplatesFromPrefix(
      vfs,
      templates,
      "auth/pocketbase-auth/pocketbase/backend",
      "packages/backend",
      config,
    );

    if (hasReactWeb) {
      const reactFramework = config.frontend.find((f) =>
        ["tanstack-router", "react-router", "tanstack-start", "next"].includes(f),
      );
      if (reactFramework) {
        processTemplatesFromPrefix(
          vfs,
          templates,
          `auth/pocketbase-auth/pocketbase/web/${reactFramework}`,
          "apps/web",
          config,
        );
      }
    }
    // ... other frameworks (Nuxt, Svelte, Solid, Astro)
    return;
  }
  // ... Better Auth, Clerk logic
}
```

**Key Functions:**

- `processTemplatesFromPrefix()`: Copies templates from source to destination
- Framework detection: Determines which templates to use
- Conditional processing: Only processes selected auth provider

### examples.ts Handler

Location: `/packages/template-generator/src/template-handlers/examples.ts`

```typescript
export async function processExampleTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): Promise<void> {
  if (!config.examples || config.examples.length === 0 || config.examples[0] === "none") return;

  const hasReactWeb = config.frontend.some((f) =>
    ["tanstack-router", "react-router", "tanstack-start", "next"].includes(f),
  );
  // ... other framework checks

  for (const example of config.examples) {
    if (example === "none") continue;

    if (config.backend === "pocketbase") {
      if (hasReactWeb) {
        const reactFramework = config.frontend.find((f) =>
          ["next", "react-router", "tanstack-router", "tanstack-start"].includes(f),
        );
        if (reactFramework) {
          processTemplatesFromPrefix(
            vfs,
            templates,
            `examples/${example}/pocketbase/web/${reactFramework}`,
            "apps/web",
            config,
          );
        }
      }
      // ... other frameworks
      continue;
    }

    // Convex backend handling
    if (config.backend === "convex") {
      processTemplatesFromPrefix(
        vfs,
        templates,
        `examples/${example}/convex/packages/backend`,
        "packages/backend",
        config,
      );
    }
    // ... server backend handling
  }
}
```

**Pattern:**

- Loop through selected examples
- Match backend + frontend combination
- Copy appropriate templates

## 5. Dependency Processor

### api-deps.ts - addPocketbaseDeps Function

Location: `/packages/template-generator/src/processors/api-deps.ts`

```typescript
function addPocketbaseDeps(vfs: VirtualFileSystem, frontendType: FrontendType): void {
  const webPath = "apps/web/package.json";
  const nativePath = "apps/native/package.json";

  if (vfs.exists(webPath)) {
    addPackageDependency({ vfs, packagePath: webPath, dependencies: ["pocketbase"] });
  }

  if (vfs.exists(nativePath) && frontendType.hasNative) {
    addPackageDependency({ vfs, packagePath: nativePath, dependencies: ["pocketbase"] });
  }
}

export function processApiDeps(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const { api, backend, frontend, auth } = config;
  const frontendType = getFrontendType(frontend);

  if (backend === "pocketbase") {
    addPocketbaseDeps(vfs, frontendType);
    return;
  }
  // ... other backend logic
}
```

**Automatic Installation:**

- Detects web and native apps
- Adds `pocketbase` package to appropriate package.json files
- No manual dependency management needed

## 6. Environment Variable Processor

### env-vars.ts - getPocketBaseVar Function

Location: `/packages/template-generator/src/processors/env-vars.ts`

```typescript
function getPocketBaseVar(frontend: string[]) {
  const hasNextJs = frontend.includes("next");
  const hasNuxt = frontend.includes("nuxt");
  const hasSvelte = frontend.includes("svelte");
  const hasTanstackStart = frontend.includes("tanstack-start");
  if (hasNextJs) return "NEXT_PUBLIC_POCKETBASE_URL";
  if (hasNuxt) return "NUXT_PUBLIC_POCKETBASE_URL";
  if (hasSvelte) return "PUBLIC_POCKETBASE_URL";
  if (hasTanstackStart) return "VITE_POCKETBASE_URL";
  return "VITE_POCKETBASE_URL";
}

function buildClientVars(
  frontend: string[],
  backend: ProjectConfig["backend"],
  auth: ProjectConfig["auth"],
): EnvVariable[] {
  const baseVar = getClientServerVar(frontend, backend);
  const envVarName =
    backend === "convex"
      ? getConvexVar(frontend)
      : backend === "pocketbase"
        ? getPocketBaseVar(frontend)
        : baseVar.key;
  const serverUrl =
    backend === "convex"
      ? "https://<YOUR_CONVEX_URL>"
      : backend === "pocketbase"
        ? "http://127.0.0.1:8090"
        : baseVar.value;

  const vars: EnvVariable[] = [
    {
      key: envVarName,
      value: serverUrl,
      condition: backend === "convex" || backend === "pocketbase" ? true : baseVar.write,
    },
  ];
  // ... additional vars
  return vars;
}

export function processEnvVariables(vfs: VirtualFileSystem, config: ProjectConfig): void {
  // ... setup

  if (hasWebFrontend) {
    const clientDir = "apps/web";
    if (vfs.directoryExists(clientDir)) {
      const envPath = `${clientDir}/.env`;
      const clientVars = buildClientVars(frontend, backend, auth);
      writeEnvFile(vfs, envPath, clientVars);
    }
  }
  // ... native and server env vars
}
```

**Auto-Generated .env:**

```bash
# apps/web/.env (Next.js)
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090

# apps/web/.env (Vite-based)
VITE_POCKETBASE_URL=http://127.0.0.1:8090

# apps/web/.env (Nuxt)
NUXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090

# apps/web/.env (SvelteKit/Astro)
PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
```

## 7. Framework-to-Environment Variable Mapping

| Framework                  | Environment Variable Prefix | Example                      |
| -------------------------- | --------------------------- | ---------------------------- |
| Next.js                    | `NEXT_PUBLIC_`              | `NEXT_PUBLIC_POCKETBASE_URL` |
| Nuxt                       | `NUXT_PUBLIC_`              | `NUXT_PUBLIC_POCKETBASE_URL` |
| SvelteKit                  | `PUBLIC_`                   | `PUBLIC_POCKETBASE_URL`      |
| Astro                      | `PUBLIC_`                   | `PUBLIC_POCKETBASE_URL`      |
| Vite (React Router, Solid) | `VITE_`                     | `VITE_POCKETBASE_URL`        |
| TanStack Start             | `VITE_`                     | `VITE_POCKETBASE_URL`        |
| TanStack Router            | `VITE_`                     | `VITE_POCKETBASE_URL`        |
| Expo (React Native)        | `EXPO_PUBLIC_`              | `EXPO_PUBLIC_POCKETBASE_URL` |

**Pattern Recognition:**
The processor automatically detects the framework and applies the correct prefix based on the frontend configuration.

## 8. Adding Support for New Frameworks

### Step 1: Add Framework Detection

In `template-handlers/auth.ts` and `template-handlers/examples.ts`:

```typescript
const hasTanStackRouter = config.frontend.includes("tanstack-router");
const hasReactRouter = config.frontend.includes("react-router");
```

### Step 2: Create Template Directory Structure

```
templates/
  auth/
    pocketbase-auth/
      pocketbase/
        web/
          react/
            tanstack-router/
              src/
                lib/pocketbase.ts.hbs
                components/
                  sign-in-form.tsx.hbs
                  sign-up-form.tsx.hbs
                  user-menu.tsx.hbs
                routes/
                  dashboard.tsx.hbs
```

### Step 3: Add Processing Logic

```typescript
if (hasReactWeb) {
  const reactFramework = config.frontend.find((f) =>
    ["tanstack-router", "react-router", "tanstack-start", "next"].includes(f),
  );
  if (reactFramework) {
    processTemplatesFromPrefix(
      vfs,
      templates,
      `auth/pocketbase-auth/pocketbase/web/react/${reactFramework}`,
      "apps/web",
      config,
    );
  }
}
```

### Step 4: Update Environment Variable Mapping

In `processors/env-vars.ts`:

```typescript
function getPocketBaseVar(frontend: string[]) {
  const hasNextJs = frontend.includes("next");
  const hasNuxt = frontend.includes("nuxt");
  const hasSvelte = frontend.includes("svelte");
  const hasTanstackRouter = frontend.includes("tanstack-router");
  const hasTanstackStart = frontend.includes("tanstack-start");

  if (hasNextJs) return "NEXT_PUBLIC_POCKETBASE_URL";
  if (hasNuxt) return "NUXT_PUBLIC_POCKETBASE_URL";
  if (hasSvelte) return "PUBLIC_POCKETBASE_URL";
  if (hasTanstackRouter) return "VITE_POCKETBASE_URL";
  if (hasTanstackStart) return "VITE_POCKETBASE_URL";

  return "VITE_POCKETBASE_URL";
}
```

### Step 5: Framework-Specific Adjustments

**TanStack Router Example:**

- Uses file-based routing with `routes/` directory
- Different navigation API: `useNavigate()` instead of Next.js `useRouter()`
- Auth state management via context or global store

**React Router Example:**

- Similar to TanStack Router but uses `react-router-dom`
- Route protection via loaders and protected route components
- Different import paths for navigation hooks

## 9. Component Patterns Across Frameworks

### Next.js (App Router)

```typescript
"use client";
import { useRouter } from "next/navigation";

const router = useRouter();
router.push("/dashboard");
```

### TanStack Router

```typescript
import { useNavigate } from "@tanstack/react-router";

const navigate = useNavigate();
navigate({ to: "/dashboard" });
```

### React Router

```typescript
import { useNavigate } from "react-router-dom";

const navigate = useNavigate();
navigate("/dashboard");
```

### TanStack Start

```typescript
import { useNavigate } from "@tanstack/react-router";
// Uses server functions for data mutations
import { createServerFn } from "@tanstack/start";
```

## 10. Testing Your Implementation

### Verify Template Structure

```bash
# Check that templates exist
ls templates/auth/pocketbase-auth/pocketbase/web/react/next/

# Verify handlebars syntax
cat templates/auth/pocketbase-auth/pocketbase/web/react/next/src/lib/pocketbase.ts.hbs
```

### Test Handler Logic

```typescript
// In your test file
const config: ProjectConfig = {
  frontend: ["next"],
  backend: "pocketbase",
  auth: "pocketbase-auth",
  // ... other config
};

await processAuthTemplates(vfs, templates, config);

// Verify files were created
expect(vfs.exists("apps/web/src/lib/pocketbase.ts")).toBe(true);
expect(vfs.exists("apps/web/src/components/sign-in-form.tsx")).toBe(true);
```

### Verify Dependencies

```typescript
const packageJson = JSON.parse(vfs.readFile("apps/web/package.json"));
expect(packageJson.dependencies).toHaveProperty("pocketbase");
```

### Check Environment Variables

```typescript
const envContent = vfs.readFile("apps/web/.env");
expect(envContent).toContain("NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090");
```

## Summary

This guide demonstrated:

1. **PocketBase Client Setup**: Single instance pattern with environment configuration
2. **Auth Components**: Sign-in, sign-up, user menu with TanStack Form + Zod validation
3. **Protected Routes**: Dashboard page with auth state management
4. **CRUD Example**: Todo list with complete create, read, update, delete operations
5. **Template Handlers**: Logic for processing auth and example templates based on config
6. **Dependency Processor**: Automatic package.json updates
7. **Environment Processor**: Framework-aware .env file generation
8. **Framework Mapping**: Comprehensive table of environment variable prefixes
9. **Extension Pattern**: How to add support for new frameworks

**Key Takeaways:**

- Template structure mirrors project structure
- Handlers use framework detection for conditional processing
- Processors automate dependency and environment setup
- Consistent patterns across all frameworks
- Type-safe components with TypeScript, Zod, and TanStack Form
