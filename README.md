# @graphrefly/vue

Vue-owned bindings over the framework-neutral stores exported by `@graphrefly/ts/adapters`.

## Where things are

| Path | Contents |
|---|---|
| [src/](src/) | Package implementation and tests |
| [package.json](package.json) | Public exports, dependencies and commands |
| [docs/](docs/README.md) | Rules/owner map, work and evidence links |
| [CHANGELOG.md](CHANGELOG.md) | Package release history |

## Where things stand

The [documentation map](docs/README.md) links the package API owner, root protocol
and current work/evidence. Version and export facts remain in package metadata;
this entrypoint does not infer acceptance from a release or test result.

## Start locally

Use the [mise toolchain](.mise.toml), then:

```sh
mise trust
mise install
pnpm install
```

| Command | What it does |
|---|---|
| `pnpm test` | Package tests |
| `pnpm run lint` | Biome check |
| `pnpm run typecheck` | TypeScript types |
| `pnpm run build` | Package, declarations and export checks |

[Agent entrypoint](AGENTS.md).
