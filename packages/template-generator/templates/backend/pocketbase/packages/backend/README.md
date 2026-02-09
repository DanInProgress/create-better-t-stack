# PocketBase Backend

This directory contains the PocketBase backend configuration and hooks.

## Getting Started

1.  **Download PocketBase**: Download the appropriate PocketBase binary for your OS from the [releases page](https://pocketbase.io/docs/) and place it in this directory (`packages/backend/`).
2.  **Start the Server**: Run `./pocketbase serve` (Linux/Mac) or `pocketbase.exe serve` (Windows).
3.  **Access Admin UI**: Open http://127.0.0.1:8090/_/ in your browser to create your admin account.

## Development

-   **Hooks**: Write your TypeScript hooks in `src/`. They will be compiled to `pb_hooks/` by running `bun run dev` or `bun run build`.
-   **Types**: If you change your collections, run `npm run typegen` (if you have the typegen tool installed) to update TypeScript definitions.

## Deployment

This project is configured for deployment to [PocketHost](https://pockethost.io) via GitHub Actions.

1.  Create a PocketHost instance.
2.  Get your FTP credentials from the PocketHost dashboard.
3.  Add `POCKETHOST_USERNAME` and `POCKETHOST_PASSWORD` as secrets in your GitHub repository.
4.  Push changes to `main` to trigger deployment.
