# @graphrefly/vue agent entrypoint

Start with [README](README.md) and the [documentation map](docs/README.md).
This repository owns its package/binding work; protocol and shared runtime
contracts remain [root](../graphrefly/AGENTS.md) and
[TS-owned](../graphrefly-ts/AGENTS.md). Public exports and check commands live in
[package metadata](package.json); the map does not introduce a local ledger.

Resolve authority and new scope through [root admission](../graphrefly/authority/README.md)
and [the owner locator](../graphrefly/authority/ledgers.jsonl).
Follow [personal governance](/Users/davidchenallio/.codex/skills/project-governance/SKILL.md)
for records, execution/spend/retry classification and stalled-work boundaries.
Use [bmad-build](.agents/skills/bmad-build/SKILL.md) and
[bmad-qa](.agents/skills/bmad-qa/SKILL.md) within approved work with local gates.
Human review uses [bmad-checkpoint-preview](.agents/skills/bmad-checkpoint-preview/SKILL.md):
build-handoff for ordinary delivery, interactive for checkpoint/`--practice`.
