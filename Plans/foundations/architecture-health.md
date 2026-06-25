# Architecture health — structural honesty

The spoke docs and [ROADMAP.md](../ROADMAP.md) describe **what the engine can do**. This doc describes **how the codebase is actually shaped**: separation, coupling, debt, and where boundaries are soft or missing.

**Not a feature backlog** — for ships and grabs use [NOW.md](../NOW.md). For where code lives use [library-audit.md](../library-audit.md).

**Legend:** 🟢 relatively clean · 🟡 workable but blurred · 🔴 high coupling / hard to change · 📋 documented debt

---

## One-liner

**Capability-rich, boundary-soft.** Core sim layers (grid, physics collision, pathfinding workers, render pipelines) are real and tested. Everything **around** them — editor shell, sandbox session, game launch, prop behaviors, snake adapters — grew as one vertical stack and still shares a fat global `state` bag with optional hooks.

The *direction* is right (snake proves → extract to `Libraries/AI` / `Navigation`). The *inventory* of finished extractions is smaller than the inventory of features.

---

## Intended layering vs what runs today

**Intent** (from ROADMAP architecture map):

```text
Foundations (grid, nav runtime, workers, caches)
  → domain libraries (Motion, Pathfinding, Render, AI, RoomGraph, …)
    → sandbox substrate (placement, snapshots, floor mechanisms)
      → editor shell (TileLab UI, tools)
        → game modes (snake, puzzle) as thin launchers
```

**Reality:**

```text
TileLabGameState (SharedGameState + sandbox + editor + optional appLaunch)
  ↔ Apps/Editor/engine.js (RAF tick owns physics, floor, game session hooks, customSystems)
  ↔ preview.js / Render.js (draw path pulls editor + sandbox + surfaces)
  ↔ Libraries/Sandbox/* (behaviors, groundNav, chains, belts, damage, snapshots)
  ↔ Libraries/Game/snake/* (consolidated metabolism, dynamic species registry, gun combat, imports groundNav)
  ↔ Libraries/AI/* (extracted profiles, identity, and generic intent)
```

Games are **not** thin at the import graph level, but species creation has been decoupled via profile configurations (`agentProfile.js`) and dynamic species maps.

---

## Layer health (maintenance lens)

| Layer | Health | Notes |
|---|---|---|
| `Libraries/Spatial/grid` + epoch spine | 🟢 | Clear write/read contract → [grid-contract.md](./grid-contract.md) |
| `Libraries/Motion` + `Spatial/collision` | 🟢 | v1 scope stable; contact side effects are the extension point |
| `Libraries/Pathfinding` + workers | 🟢 | Strong; naming settled on `NavRuntime` / `NavTopology` |
| `Libraries/Navigation/perception` | 🟢 | Vision frame + grid LOS; recently unified |
| `Libraries/Render/overlays` + pipeline rule | 🟢 | Enforced by `.cursor/rules/rendering-pipelines.mdc` |
| `Libraries/AI` (agent intent, utility, memory) | 🟡 | Generic core exists; only two consumers; slot pipeline deferred |
| `Libraries/Sandbox/groundNav` | 🟡 | **Locomotion lives in Sandbox**, not Navigation — snakes and editor props share behaviors here |
| `Libraries/Sandbox` floor/mechanisms | 🟡 | Belts, power, buttons — puzzle layer mixed with editor tick |
| `Libraries/SandboxEditor` + `sandboxSession` | 🔴 | Large god-modules (~560+ lines); tools + session + placement in one place |
| `Apps/Editor` | 🔴 | Shell **is** the runtime; `engine.js` knows game launch hooks, physics, floor, radio |
| `GameState/SharedGameState` | 🟡 | Constructs grid, nav worker, flow field, surfaces, kinetic — hard to test in isolation |
| `Libraries/Game/snake` | 🟡 | Extracting well by pattern, still sandbox-coupled |
| `Render/` vs `Libraries/Render/` | 🟡 | Split top-level frame bootstrap vs library draw helpers — easy to pick wrong home |
| `prop.strategy` + behaviors | 🟡 | Two autonomy models: **prop behaviors** (sandbox) vs **agent intent** (AI) |

---

## Separation problems (the messy list)

### 1. Global state as the integration bus

`TileLabGameState` extends `SharedGameState` and adds:

- `sandbox` — controller, entity meta, zone subscriptions, **`snakeGame` session hung here**
- `editor` — canvas, toggles, panels, layout
- `appLaunch` — `{ id, launcher, session }` with optional `tick`, `applyContactSideEffects`, `appendOverlayCommands`

`Apps/Editor/engine.js` branches on `state.appLaunch?.session` for physics side effects and agent ticks. There is no narrow game runtime interface — just optional methods on an ad-hoc session object.

**Symptom:** hard to answer “what does snake depend on?” without tracing `state.*` fields across Editor, Sandbox, and Game.

---

### 2. Sandbox is “engine + editor + toys”

`Libraries/Sandbox` contains:

- Editor-facing: selection, snapshots, placement order, camera target
- Simulation: chains, wall damage, floor occupancy, grid zone tick
- Locomotion: **all ground-nav behaviors** (HPA, flow, direct, cell-target)
- Mechanisms: belts, buttons, passage power

That is at least three concerns in one package name. New code gravitates here because it already has `state` access and prop hooks.

**Symptom:** “Is this engine or tooling?” → often “whatever Sandbox was importing last week.”

---

### 3. Two ways to make things autonomous

| Model | Where | Drives |
|---|---|---|
| **Prop behavior** | `Libraries/Sandbox/behaviors`, `sandboxEntityMeta` | Flipper, drag launch, ground-nav on selection |
| **Agent intent** | `Libraries/AI/agentIntent`, game adapters | Snake, flee agents |

They share grid and nav but not a unified host. Snake autosim selects its own intent; sandbox props get behavior ids from inspectors. No shared “actor” abstraction.

**Symptom:** duplicate concepts (target, FSM, steering) with different names — see [glossary.md](../glossary.md).

---

### 4. Game shell still mounts lab infrastructure

`mountGameShell.js` runs TileLab world init, profile seeding, lab viewport helpers, and `drawLabFrame` — not a isolated game runtime. Puzzle and snake modes are **launcher configs** on the same editor engine.

**Symptom:** game mode is a UI flag + hook object, not a separate composition root.

---

### 5. Incomplete extractions (snake proving ground)

**Extracted (good pattern):**

- `classifyAgentVision`, `targetMemory`, `utilityScoring`, `createAgentIntent`
- `agentEngagement` publish/read
- `NavRuntime` / perception frame
- Agent profiles (`agentProfile.js`), unique identities (`agentIdentity.js`)
- Dynamic population spawning in scenes (`spawnPopulationInScene.js`)
- Consolidated agent metabolism (`agentMetabolism.js`)

**Still snake-adjacent or session-specific:**

- Locomotion: `cellTargetHpaNav` under **Sandbox/groundNav**
- Chain-specific spawn/growth: `spawnLinkedBallChain`, `growChainSegment`
- Combat side effects wired in `setupSnakeGame` → `engine.js` hook
- HUD in game code; overlay append via `appLaunch.session`

**Deferred:**

- Generic perception → memory → blackboard slot pipeline ([AI.md](../AI.md))
- Flow fields for agents (infra in pathfinding; locomotion in sandbox only)

**Symptom:** docs say “generic AI ~70%”; import graph is cleaner due to profile-driven config but some sandbox coupling remains.

---

### 6. Hub files resist change

| File | ~Lines | Problem |
|---|---:|---|
| `Libraries/Sandbox/sandboxSession.js` | 560 | Session + placement + many tool paths |
| `Libraries/SandboxEditor/createSandboxController.js` | 567 | Controller + behaviors + inspector wiring |
| `Apps/Editor/ui/preview.js` | 163 | Draw orchestration crosses render, sandbox, surfaces, editor |

Refactors touch these constantly because they sit at the center of the star.

---

### 7. Partial contracts and known holes

Documented in domain docs but **architecturally** mean the system is not closed:

| Hole | Impact |
|---|---|
| Single-cell belt edit may not fully resync nav | Editor can desync walkability from visuals |
| Kinetic props don’t occupy grid | Nav ignores snake bodies; AI uses physics separately |
| Snapshot format versioning immature | Persistence is fragile for long-lived scenes |
| No import-layer enforcement | Any file can import any file; boundaries are conventional |
| `Libraries/FSM/transition.js` vs `AI/agentIntent` | Two FSM-ish systems |

---

## What is actually in good shape

Credit where due — not everything is mud:

1. **Grid + nav epoch spine** — edits have a commit path; workers key off one cache key.
2. **Physics v1** — narrow phase, islands, warm-start; scope controlled.
3. **Render pipeline rule** — four pipelines + overlays; agents can be steered by cursor rule.
4. **Pathfinding worker architecture** — SAB slots, incremental replan; pro-grade for a grid engine.
5. **Species registry** — `snakeSpecies` / `fleeAgentSpecies` on shared session is a clean multi-agent pattern.
6. **Engagement blackboard** — small, explicit session fact; better than peeking autosim.
7. **Test harness density** — snake, nav, physics have real node tests (coverage map in library-audit).

---

## Structural debt register

Actionable **architecture** items (not “add shadows”). Revisit when touching nearby code.

| ID | Debt | Severity | Likely fix shape |
|---|---|---|---|
| S1 | `appLaunch.session` optional hooks in `engine.js` | 🔴 | Narrow `GameRuntime` interface mounted on state; engine calls fixed methods |
| S2 | `groundNav` under Sandbox | 🟡 | Move locomotion behaviors to `Libraries/Navigation/locomotion` (or similar); sandbox re-exports during migration |
| S3 | `state.sandbox.snakeGame` | 🟡 | `state.gameSession` or launcher-owned bag — sandbox shouldn’t know snake |
| S4 | `sandboxSession` / `createSandboxController` size | 🔴 | Split: pointer/session vs placement vs inspector binding |
| S5 | Dual autonomy (behavior vs intent) | 🟡 | Document per use-case; long-term unify under “actor” or keep explicit split in glossary |
| S6 | Game shell = lab engine | 🟡 | Accept for now OR extract `GameLoop` without editor profile/map overview |
| S7 | No import boundary lint | 🟡 | Optional: `Apps/` may not import from `Apps/` sibling; `Game/` may not import `SandboxEditor` |
| S8 | Slot pipeline deferred | 🟡 | Third consumer or copy-paste pain triggers extract |
| S9 | `preview.js` draw soup | 🟡 | Thin `composeFrame(state)` with pass list; editor toggles select passes |
| S10 | Snapshot schema tests missing | 🟡 | Round-trip test → unlock confident refactors |

Pick **one** structural item per refactor week alongside feature work — otherwise debt only grows in hub files.

---

## Dependency rules (today — conventional, not enforced)

When adding code, prefer this direction:

```text
Apps/Editor  →  Libraries/*, GameState, Render, Config
Libraries/Game  →  Libraries/AI, Navigation, Sandbox, Motion, …
Libraries/AI  →  Navigation, utility, memory  (NOT Game/snake)
Libraries/SandboxEditor  →  Sandbox, Render/overlays, Editor
Libraries/Sandbox  →  Spatial, Motion, Pathfinding, Navigation  (NOT Game)
```

**Red flags:**

- `Libraries/AI` importing `Libraries/Game`
- `Libraries/Navigation` importing `Sandbox`
- New locomotion in `Sandbox/groundNav` without asking if it belongs in Navigation
- New draw path that bypasses the four pipelines (see cursor rule)

---

## How this relates to other docs

| Question | Doc |
|---|---|
| What features exist / tiers? | Spoke docs, ROADMAP |
| Where is file X? | library-audit |
| How should grid edits work? | grid-contract |
| How does snake wire up? | games/snake |
| How does editor wire up? | sandbox-editor |
| **Is the shape healthy?** | **this doc** |
| Coding discipline (no shims, pipelines)? | `.cursor/rules/*.mdc` |

---

## When to update this doc

Update after:

- A hub file split or a new composition root (game runtime interface, locomotion move)
- A completed extraction (generic package promoted out of snake)
- A new **class** of coupling discovered (not every small fix)

Do **not** duplicate tier checkboxes here — link out instead.

*Last updated: Updated with dynamic profiles, agent identities, metabolism consolidation, and ranged combat custom systems hooks.*
