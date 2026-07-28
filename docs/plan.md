# graphrefly-react — plan (narrative)

> Live status lives in [`plan/slices.jsonl`](../plan/slices.jsonl) and the generated
> `dashboard/dashboard.html` (`pnpm dashboard`). This file is the **narrative**; it
> does not duplicate per-slice status. Single source of truth = the jsonl.

## What this is

`@graphrefly/react` — the React **live hook + reference presentation SDK** for GraphReFly.
It builds on top of `@graphrefly/ts` (the engine); it **never reimplements the
substrate**. After D238, `@graphrefly/ts` owns framework node bindings and the
framework-neutral boundary manifest; this package consumes/re-exports those contracts and
keeps only React live topology hooks plus reference UI.

## What the spike proved

The riskiest, previously-unvalidated assumption of the workbench product vision is now
proven on the real substrate:

- **node ⇄ widget two-way reactive binding works** — input widget → boundary
  writable `state` node (reactive write), output widget ← boundary `derived`
  (push-on-subscribe); SENTINEL (`undefined`) is distinguishable from a valid `null`.
  The reusable hook implementation now lives in `@graphrefly/ts/adapters/react`.
- **a graph's boundary can be read structurally** (`boundaryManifest`) and
  **auto-rendered into a bound, reactive UI with zero hand-wiring** (`AutoPanel`).
  The framework-neutral boundary contract now lives in `@graphrefly/ts/inspection/boundary`.
- **trusted catalog-backed widgets can replace the crude default `typeof` selection**
  inside the React reference UI. `AutoPanel` accepts caller-provided catalog/resolver props
  while the generic boundary manifest remains structural and TS-owned.
- **React consumers can observe boundary topology without copying binding wiring**
  (`useBoundaryManifest`), while package exports/declarations make the SDK consumable by
  product hosts such as `@graphrefly/canvas`.
- **React consumers can inspect live topology visually** (`TopologyFlowPanel`) from the
  TS-owned `describe()` snapshot and `observeTopology()` stream, without copying pure
  renderers or owning Canvas product state.
- **React consumers can lower live boundary values into an A2UI-style data model**
  (`useA2UIBoundaryDataModel*`) for fixed-schema surfaces. This follows D347:
  component trees/catalogs/renderer registries stay in trusted UI/product layers, while
  GraphReFly boundary values feed `updateDataModel`.

→ the moat ("malleable reactive substrate → auto-grown UI") is technically real.

## Sequencing — when the rest happens

- **De-risking is done.** The spike's job (answer "does the binding core work?") is complete.
- **Product slices remain PARKED until graphrefly hits 1.0.** Building more on a still-converging
  substrate = rework + dilutes the ts/rust/py tracks. The spike exists precisely so the build
  can be deferred with confidence.
- **Parallel-safe now:** docs + dashboard (this), and keeping the spike green if a substrate
  API shifts. The binding only touches the *stable* part of the protocol
  (observe/subscribe/SENTINEL/teardown).

See the slice table (`pnpm dashboard`) for live status. Product/runtime layers such as
capability tags from meta, productionization, registry/app-store, workspace placement, and
full Canvas ownership remain outside this package unless a slice explicitly lands here.
Recent design locks narrow those future paths: D348 allows only generic capability refs in
TS-owned boundary inspection, D344 keeps dynamic A2UI generation/validation in product
pipelines, D345 keeps durable Workspace/Canvas APIs solution-level, and D346 keeps React
package productionization lightweight unless focused optional subpaths are introduced.

## Layering (where code belongs)

- `@graphrefly/ts` (in graphrefly-ts) — substrate + graph layer, framework node bindings,
  and the framework-neutral boundary manifest.
- pure `GraphSpec → string` renderers (`graphSpecToMermaid/D2/Ascii`) — stay in graphrefly-ts
  (`extra/render`); framework-agnostic data layer.
- **this repo** — React live boundary hook + reference presentation. It does not own Canvas
  slots/pinning/topology lens/dataPath/workspace placement.
- `TopologyFlowPanel` is a DOM-bound reference topology view over `describe()`, not a pure
  renderer and not a Canvas runtime.
- A2UI support here is fixed-schema data-model lowering only. Dynamic schema generation,
  catalog negotiation, renderer registries, and validation loops belong above this package
  under D344 unless a future slice explicitly locks a focused optional surface here.
- registry / app-store / fork / relay / BYOK — the **product** repo, not here.
