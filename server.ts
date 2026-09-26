/**
 * Vercel Node server entrypoint (and local `pnpm dev` target).
 *
 * Vercel detects `server.ts` / `src/server.ts` and captures `server.listen()`.
 * This file lives at the repo root to avoid colliding with the `src/server/`
 * route module directory. Application routing stays in `src/server/index.ts`.
 *
 * @see https://vercel.com/docs/functions/runtimes/node-js
 */
import { createServer } from "node:http";

import { env } from "./src/config/env.js";
import { createNativeNotesRequestListener } from "./src/server/index.js";

const server = createServer(createNativeNotesRequestListener());

server.listen(Number(process.env.PORT ?? env.PORT), () => {
  const address = server.address();
  const port =
    address && typeof address === "object" ? address.port : env.PORT;
  console.log(`NativeNotes listening on port ${port}`);
});
