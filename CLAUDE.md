# graphrefly-react — agent context

`@graphrefly/react` — React **live hook + reference presentation** layer for GraphReFly. Builds on
`@graphrefly/ts` (the engine); **never reimplements the substrate**. The reusable framework
node bindings and framework-neutral boundary manifest live in `@graphrefly/ts` focused
subpaths (D238); this repo consumes/re-exports them and owns only React live topology hooks
and reference UI.

> **This file points, it does not host.** Authority for the engine + protocol lives elsewhere;
> do not duplicate it here.

## Where the truth lives

| Concern | Source |
|---|---|
| Engine / protocol / substrate | `~/src/graphrefly-ts` (`@graphrefly/ts`) + `~/src/graphrefly` (spec/decisions) |
| Product vision (why this repo exists) | memory `project_workbench_platform_vision` |
| Narrative plan + layering | `docs/plan.md` |
| **Live slice status (single source)** | `plan/slices.jsonl` → `dashboard/dashboard.html` (`pnpm dashboard`) |

## Architectural floor (cite, never violate)

- **Substrate stays in graphrefly-ts** — data/render separation + no cross-language peer-deps.
  This repo is React/binding-layer; the engine is never reimplemented here.
- **Pure `GraphSpec → string` projections** (mermaid/d2/ascii) live in graphrefly-ts
  `extra/render`, NOT here. Only the interactive, DOM-bound layer lives here.
- **React live boundary + reference UI are the irreplaceable pieces here.** Canvas / widgets /
  charts / code-editor are rentable OSS layered on top, while generic bindings stay in TS.

## Binding invariants (from the family — keep bulletproof)

- **Reactive, not imperative** — input writes go through clean-slate writable node surfaces such as
  `StateNode.set(v)`, never a presentation-owned trigger or substrate reimplementation.
- **SENTINEL** — `undefined` = node never emitted DATA (global SENTINEL); `null` = a *valid*
  DATA value. Distinguish with `=== undefined`, never falsiness.
- **push-on-subscribe** — subscribing delivers cached DATA; wire observers before any kick.
- Build live hooks over `@graphrefly/ts/adapters/react` and
  `@graphrefly/ts/inspection/boundary`; don't recreate framework-specific substrate or
  boundary semantics here.

## Commands

```bash
pnpm test            # vitest (jsdom + RTL)
pnpm run lint        # biome
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsc
pnpm run dashboard       # regenerate dashboard/dashboard.html
pnpm run dashboard:check # consistency gate (non-zero on broken state)
```

## Status

Binding-core spike DONE + PARKED, with D238 bindings/boundary moved to TS-owned subpaths.
Product slices = post-graphrefly-1.0
(see dashboard). Do not build product layers on the still-converging substrate.
