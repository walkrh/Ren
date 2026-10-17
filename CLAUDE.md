# CLAUDE.md — Ren

SvelteKit 2 + Svelte 5, TypeScript + Effect, Convex, Tailwind v4, shadcn-svelte (Formsnap + Superforms + Zod v4), Bun, deployed on Render. WorkOS AuthKit for auth.

## Core Principles

| Problem             | Thinking | Why                                        |
| ------------------- | -------- | ------------------------------------------ |
| UI/UX               | Careful  | Mistakes recoverable                       |
| Data loading & APIs | Hard     | Server/client boundaries have consequences |
| Business logic      | Harder   | Bugs corrupt data and break trust          |
| Auth & security     | Hardest  | Mistakes expose users                      |

When uncertain, escalate your thinking.

**Types first:** Convex schema → Zod schemas → stub queries/mutations → build UI. Ask: "What queries will I need? What are the access patterns? What fields will I regret not having?"

**Monolith to modular:** Start in one file, extract when patterns emerge (~100 lines or repeated). Premature abstraction creates wrong abstractions.

**Framework philosophy:** Svelte 5 runes (never stores). SvelteKit server/client boundary is sacred. Convex is real-time — never poll. Tailwind v4 inline utilities only. Effect/neverthrow for typed errors.

## How to Work

- run `bun run lint` to check for linting errors, `bun run format`, and `bun run check` to check for errors after making changes. Don't ignore linting errors. `bun run build` before deploy
- Look for existing patterns in the codebase before creating new ones. Suggest refactors when inconsistency found.
- Avoid `as any` at all costs — infer types from functions whenever possible.
- Check framework docs (Svelte 5, SvelteKit, Convex) when stuck, then existing codebase patterns.
- use bun for the package manager
- when installing new packages, use bun add instead of manually editing the package.json file
- use modern svelte and sveltekit patterns and primitives
- every svelte component should have lang="ts"
- after making changes to convex, run bun run convex:gen to generate the new api

## Auth: WorkOS AuthKit + Convex

Two libraries split the work: `@workos/authkit-sveltekit` handles the SvelteKit side (OAuth flow, encrypted session cookies, token refresh) and `@convex-dev/workos-authkit` handles the Convex side (webhook user sync, JWT validation). Do NOT install `@convex-dev/workos` — that's React-only and unrelated.

**Critical rules:**

- Auth gate lives in `(protected)/+layout.server.ts` using `locals.auth` — NEVER use `authKit.withAuth()`. It crashes `bun run build` because it evaluates at module load time before `configureAuthKit()` runs in hooks. Confirmed broken across projects.
- Client-side Convex auth bridge lives in `(protected)/+layout.svelte` using `useConvexClient().setAuth()` with a token refresh callback to `/api/auth/token`.
- All Convex functions must call `getAuthenticatedUser(ctx)` or `getAuthenticatedUserWithConvexId(ctx)` and scope queries by `ownerId`.
- Sign-out uses a hidden form with `requestSubmit()` posting to `/logout`.
- Webhook endpoint: `https://<deployment>.convex.site/workos/webhook` subscribing to `user.created`, `user.updated`, `user.deleted`.

**Reference files:** `src/routes/(protected)/+layout.server.ts`, `src/routes/(protected)/+layout.svelte`, `src/convex/lib/auth.ts`, `src/convex/auth.config.ts`, `src/convex/http.ts`

## Forms: Superforms + Formsnap (Two Modes)

We use **two form patterns** depending on whether the form's backend is Convex or SvelteKit:

**SPA mode (Convex-backed forms):** When Convex handles persistence, Superforms runs in SPA mode. No `+page.server.ts` actions, no `use:enhance`. Superforms validates client-side via `zod4Client`, and the `onUpdate` callback bridges validated data to Convex mutations via `useConvexClient()`. Config: `superForm(defaults, { SPA: true, validators: zod4Client(schema), onUpdate: ({ form }) => { client.mutation(...) } })`. A `+page.server.ts` load function can still provide initial form shape via `superValidate(zod4(schema))`.

**Traditional mode (SvelteKit-backed forms):** When the form action lives in SvelteKit (e.g., server-only operations, non-Convex integrations), use standard `+page.server.ts` actions with `use:enhance` for progressive enhancement. Server validates with `superValidate(request, zod4(schema))`, returns `fail(400, { form })` on error.

**Shared rules for both modes:**

- Schema: define in `src/lib/schemas/` using `zod/v4` — shared between client and server validation.
- Adapter: always `zod4` / `zod4Client` (not the default zod adapter).
- Always use Formsnap's `Form.Field`, `Form.Control`, `Form.FieldErrors` for consistent UI — the snippet pattern with `{#snippet children({ props })}` is required for Svelte 5.
- Choose the mode based on where the data lives: Convex → SPA mode, SvelteKit server → traditional mode.

**Reference files:** `src/lib/schemas/` for schemas, nearest `+page.svelte` with a form for either pattern.

## Convex Patterns

- **Queries:** `useQuery(api.x.y, () => ({}))` — second arg must be a function (enables reactivity + skip pattern). Wrap dynamic args in `$derived`.
- **Mutations:** `useConvexClient().mutation(api.x.y, args)` — there is no `useMutation` in convex-svelte.
- **Real-time by design.** If you're polling or refetching manually, you're fighting the framework.
- Handle all three states: loading (`isLoading`), error (`.error`), and empty (`data ?? []`).

## Svelte 5 Modern Patterns

- `{@attach ...}` replaces `use:action`
- `createContext` replaces `setContext`/`getContext` (type-safe)
- `$state.raw` for large objects that are reassigned not mutated (API responses, Convex query results)
- `onclick={handler}` not `on:click={handler}`
- clsx-style arrays/objects in `class` attribute, not `class:` directive
- `{#snippet}` + `{@render}` not `<slot>` / `<svelte:fragment>`
- `$inspect.trace(label)` for debugging reactivity
- `<svelte:boundary>` for error boundaries
- `$derived` for computed values, never `$effect` — effects are an escape hatch

## Security

- Server-side validation is mandatory — client checks are UX, not security
- Secrets in `$env/static/private` — never `PUBLIC_` prefixed
- Validate everything with Zod before it touches the database
- Auth checks in `+layout.server.ts` for route groups, not individual pages
- Write auth abstractly — provider may change

## Don't

- Use Svelte stores (deprecated — runes only)
- Use `@apply` or `<style>` blocks (Tailwind v4 inline only)
- Trust client-side auth for sensitive operations
- Skip loading/error/empty states in async UI
- Put auth checks only in `+page.svelte` instead of `+page.server.ts`
- Hardcode secrets or use `PUBLIC_` env vars for sensitive data
- Poll Convex — it's real-time
- Use `as any` — infer types from functions

## New Feature Checklist

- [ ] Convex schema + Zod validation schemas defined
- [ ] Forms use Superforms SPA mode + Formsnap + Convex mutation bridge
- [ ] Loading, error, and empty states handled
- [ ] Server-side auth check if protected
- [ ] Keyboard accessible + mobile responsive

## File Naming

Components: `PascalCase.svelte` · Utilities: `camelCase.ts` · Routes: kebab-case folders · Convex functions: `camelCase.ts`

## Svelte MCP Tools

1. **list-sections** — discover available doc sections (use first)
2. **get-documentation** — fetch full docs for relevant sections (be selective on tokens)
3. **svelte-autofixer** — MUST run on every .svelte file before finalizing. Loop until zero issues.
4. **playground-link** — generate playground URL only for code not written to files, after user confirms

When creating/editing `.svelte` or `.svelte.ts` files, delegate to the **svelte-file-editor subagent** when possible to preserve main context window space.

## Session Workflow

- At session start: read `ROADMAP.md` and `progress.md` to understand current state
- At session end: append a dated entry to `progress.md` with what was done, decisions made, and next steps
- Mark completed items in `ROADMAP.md` with date and PR number

## Project Notes

- Ren is a co-op wave-survival game: survivors of three races against the AI Overlords. Story and factions live in `LORE.md`; use it for any in-game copy or art prompts.
- Visual theme is crusader / illuminated manuscript. Fonts and colour tokens are defined in `src/routes/layout.css`; always reuse those tokens instead of new hex values.
- Hero art for the entry screen goes in `static/art/`.
