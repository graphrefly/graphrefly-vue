# @graphrefly/react

Reactive binding + presentation layer for [GraphReFly](https://github.com/) on React.

**Status: lightweight React SDK.** The original binding-core spike validated the single
unverified assumption behind the workbench product vision: that a **two-way reactive
binding** between GraphReFly graph nodes and React widgets works cleanly —

- input widget → boundary writable `state` node (reactive input, not imperative)
- output widget ← boundary `derived` node (push-on-subscribe)

It builds **on top of** `@graphrefly/ts` (the engine); it never reimplements the substrate.
Framework node bindings and the framework-neutral boundary manifest are owned by
`@graphrefly/ts` focused subpaths. This package re-exports the React binding basics and
adds only React live topology hooks plus reference UI. Its package surface is intentionally
root-only until a focused optional subpath is reviewed for any heavy/product-shaped surface.

## Public SDK Surface

- `useNodeValue(node)` — React-owned binding over the framework-neutral `@graphrefly/ts/adapters` store contract.
- `useNodeInput(node)` — React-owned writable binding; `undefined` remains SENTINEL/no DATA.
- `useNodeRecord(keysNode, factory)` — React-owned keyed binding; `factory` must have stable identity.
- `boundaryManifest(graph)` — re-export from `@graphrefly/ts/inspection/boundary`.
- `useBoundaryManifest(graph)` — React hook that refreshes the manifest on topology changes.
- `AutoPanel` — small reference presentation over the binding primitives, with optional
  caller-supplied trusted widget catalog/resolver props plus local capability
  display/admission affordances over generic `BoundaryCapabilityRef` data.
- `TopologyFlowPanel` — live DOM/SVG reference topology sidebar over `graph.describe()`.
- `useA2UIBoundaryDataModel(graph)` / `useA2UIBoundaryDataModelUpdate(graph, opts)` —
  fixed-schema A2UI data-model lowering for live boundary values. It preserves
  GraphReFly SENTINEL/null/non-JSON distinctions and leaves component trees/catalogs to
  trusted product UI code.
- `boundaryManifestToA2UICapabilityDataModel(manifest, opts)` /
  `boundaryManifestToA2UICapabilityDataModelUpdate(manifest, opts)` — separate
  fixed-schema A2UI capability projection over generic `BoundaryCapabilityRef` data.
  Callers may add minimal status/admission facts; OAuth flows, provider registries, config
  forms, setup actions, and hard admission enforcement stay in product/Canvas/solution code.

## Toolchain

Mirrors the graphrefly-ts family: mise + Node 24 + Corepack/pnpm + Biome.

```bash
mise trust && mise install   # Node 24
corepack enable && pnpm install   # or: mise run bootstrap
pnpm lint
pnpm typecheck
```

## Not here (lives in the product repo)

Canvas product state, widget-slot pinning, workspace placement, dataPath ownership,
reactive-layout ownership, measurement-provider policy, registry / app-store, fork +
one-click-config, BYOK/Nano wiring, OAuth/MCP connectors, relay/push, billing. This package
is the reusable React live hook/reference UI layer only; its widget and capability resolvers
are trusted React presentation hooks, its A2UI helpers are fixed-schema data-model lowering
only, and its topology panel is DOM-bound reference UI, not generic boundary metadata or a
pure `GraphSpec → string` renderer.
