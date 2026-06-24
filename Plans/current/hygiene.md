## Read this first — hygiene law

**Every pass on this plan is a deletion pass dressed as cleanup.** Pick one dialect, one write site, one factory per duplicated concept. Net **negative** line count. If the diff adds layers, getters, barrels, or copy-paste with a new filename — **stop**.

**Tests migrate with the dialect — same PR, no shims.** When a handle or API is deleted (`blackboard`, `decisionSnapshot`, `ElevationCamera`, `getPropAsset`), **update every test in that PR**. Never leave production aliases, adapter wrappers, or dual-shape returns so old test imports keep working. Deprecated dialect in `Libraries/` because `tests/` still says `blackboard` is the same bug as keeping `px/py/zoom` in draw code because tests never got updated. If a test only asserts obsolete shape, **delete or rewrite the test** — do not preserve the obsolete shape in prod. See [`../stupid.md`](../stupid.md#tests-follow-the-dialect--never-ship-compatibility-shims).

This work spans AI, navigation, and game adapters. The spoke docs below are **binding**. Re-read the relevant rows before opening a PR.

### Authority docs

| Doc                                                     | Governs for this plan                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`../stupid.md`](../stupid.md)                          | No getter/resolver theater; no fake “load” or mini-services; static config = import at use site; no threading catalogs through constructors; **delete > add** |
| [`../passthrough.md`](../passthrough.md)                | No forwarding layers; no parallel bags; no `{ buildX }` that only passes args through; Tier 1b reach passthrough **must not come back**                       |
| [`../normalization.md`](../normalization.md)            | One dialect end-to-end; one shared module per duplicated pattern; structural wins not micro-opts; Part 1 before flow locomotion                               |
| [`../objects.md`](../objects.md)                        | Hot path = module scratch + generation stamp; **zero** per-tick `{ stepsTo() }`, opts bags, `new TypedArray` in decision tick                                 |
| [`../frame.md`](../frame.md)                            | Shared sync pattern: **sync once · read many** — like `viewport`, not a returned handle object                                                                |
| [`fsmroadmap.md`](fsmroadmap.md)                              | Shipped phase 1 + Part 1 archive — **do not regress**                                                                                                         |
| [`../../AI.md`](../../AI.md#future-local-flow-horizons) | Generic loop in `Libraries/AI`; species facts/scorers in game adapters                                                                                        |
| [`../../pathfinding.md`](../../pathfinding.md)          | Flow infra detail; HPA + flow hybrid notes for Part 2                                                                                                         |

### What “passthrough” means here

A function, object, param, or layer that exists **only to forward data the caller already has**. In this plan that includes:

- Copying distance/target fields perception → memory → blackboard → scorer (Tier 1b — **dead**, see [`fsmroadmap.md`](fsmroadmap.md))
- Threading `reachSteps` through memory enrich instead of computing once at intent adapter
- `buildNavReachHorizon()` → `{ stepsTo }` closure every agent
- `buildSnakeDecisionContext` / `buildFleeDecisionContext` wrappers that add no logic
- Threading the same config through 3 functions when `getSnakeGameConfig()` at the read site works
- Factory that returns one closure and nothing else
- Second blackboard layer (`visible.*Dist`, `remembered.*Dist`, `known.*Dist`) for the same fact
- **`blackboard` + `decisionSnapshot` as sibling bags** (H2 — viewport/`ElevationCamera` class bug)
- **`facts.visible` / `facts.remembered` copies of `visibleWorld` / memory** — merge once into `known`
- **`readThreatState(world)` reading `blackboard ?? decisionSnapshot`** — one handle only
- **One-export micro-files** whose only caller is another module in the same PR (inline or merge — see Part 1 review in [`fsmroadmap.md`](fsmroadmap.md#part-1-verdict))

**Fix pattern:** compute at the boundary · pass scalars/records once · delete the copies.

### What “stupid shit” means here

From [`../stupid.md`](../stupid.md) — same class of mistakes that already burned us on props, draw, and boot:

| Stupid                                                                                 | Do instead                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveSnakeReachConfig()`, `resolve*Reach*`, any boot getter for static game config  | `getSnakeGameConfig()` at use site                                                                                                          |
| `Libraries/AI/decision/` package or barrel                                             | Concrete file, e.g. `Libraries/AI/agents/deriveThreatState.js`                                                                              |
| “Framework PR” extracting helpers before **both** snake + flee import them             | Same PR wires both consumers or don’t extract                                                                                               |
| Generic perception→memory→blackboard slot pipeline                                     | Shared **functions**, not a pipeline abstraction                                                                                            |
| Behavior-tree layer over intent                                                        | Out of scope                                                                                                                                |
| Pre-bake `fleeRangeCells` on config via boot resolver                                  | Inline `Math.ceil` in threat derive ([`fsmroadmap.md`](fsmroadmap.md))                                                                      |
| `checkReachability` on flow types for decisions                                        | Deleted — use `flowTargetSteps.js`                                                                                                         |
| Per-agent `FlowFieldWindow` for **utility scoring**                                    | Sync BFS for decisions; flow windows **Part 2 locomotion only**                                                                             |
| Mock `{ stepsTo: () => N }` in tests                                                   | Real `flowTargetSteps` or stub `reachSteps` on context                                                                                      |
| **Compatibility shims / “thin aliases” so tests keep old imports or old object shape** | **Migrate tests in the same PR** — delete shim; see [`../stupid.md`](../stupid.md#tests-follow-the-dialect--never-ship-compatibility-shims) |
| One-export barrels (`import from "../AI/foo/index.js"`)                                | Import owning module directly                                                                                                               |
| Pass F-style file sprawl (5 helpers × 1 consumer)                                      | Merge into the factory file that owns the call site                                                                                         |
