import { gate } from './scripts/access.mjs';

// Vercel compiles the middleware entrypoint from `middleware.js` only; a .mjs entrypoint is
// silently skipped, so the gate itself lives in a module the test suite can import.
export default async function middleware(request) {
  return (await gate(request, process.env)) ?? undefined;
}

// Art, fonts and the hashed bundles skip the gate: running an HMAC over each of ~390 image
// requests would cost more than it protects, and none of them is reachable without the
// gated page that names it. The pages, the rules and the design notes all go through.
export const config = { matcher: ['/((?!art/|fonts/|assets/).*)'] };
