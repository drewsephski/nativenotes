# NativeNotes web (`apps/web`)

Next.js App Router shell for the signed-in notes experience. The Node backend at the repository root remains the source of truth for Better Auth, MCP, and notes APIs.

## Local development

```sh
# From repo root
pnpm dev       # backend :3000
pnpm dev:web   # this app :3001
```

Copy [`/.env.example`](./.env.example) → `.env.local` for dual-port CORS against the backend.

## Production

Deploy as a separate Vercel project with root directory `apps/web` and custom domain `nativenotes.app`. Set server-only:

```
NATIVE_NOTES_BACKEND_ORIGIN=https://nativenotes.vercel.app
```

Leave `NEXT_PUBLIC_NATIVE_NOTES_API_URL` unset so browsers use same-origin API/auth calls. See [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md#unified-production-routing).
