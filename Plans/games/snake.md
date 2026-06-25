# Snake game — proving ground

The snake mode is the primary **pressure test** for generic AI, navigation, physics chains, and procgen chunk recipes. Game-specific rules live here; reusable pieces get extracted to `Libraries/AI`, `Libraries/Navigation`, `Libraries/Sandbox`, etc.

**Related:** generic AI stack → [AI.md](../AI.md) · layout recipes → [Mazes.md](../Mazes.md) · editor/game shell → [sandbox-editor.md](../sandbox-editor.md)

---

## Entry points

| Path | Role |
|---|---|
| `Libraries/Game/gameLaunchers.js` | `snake` launcher → `setupSnakeGame` |
| `Libraries/Game/snake/setupSnakeGame.js` | Scene spawn, agent session, camera cycler, HUD, tick hooks |
| `Libraries/Game/snake/snakeScene.js` | Split-map orchestration (cavern + rail maze bands) |
| `Config/games/snake.js` | `SNAKE_GAME_DEFAULTS` — all gameplay tuning |
| `Libraries/Game/snake/snakeGameConfig.js` | Runtime config merge + derived helpers (spacing, eat radius, wall damage) |

Launch: `?game=snake` via `runGameLaunch` → game shell (no TileLab sidebar). See [sandbox-editor.md](../sandbox-editor.md#game-shell-vs-tilelab).

---

## Species model

Three agent species share one session via the **profile-driven species registry** pattern:

| Species | ID | Body | Intent modes |
|---|---|---|---|
| **Snake** | `snake` | Linked ball chain (`spawnLinkedBallChain`) | explore, seek_food, seek_prey, flee, seek_ally |
| **Flee agent** | `flee_agent` | Single rolling ball (`spawnPopulationInScene`) | explore, seek_food, flee, seek_ally |
| **Ball agent** | `ball_agent` | Single ball, facing sync | explore, seek_food, flee, seek_ally, ranged_combat |

```text
DynamicSpeciesMap (Map lookup via species/index.js)
  agentProfile.js — config-driven species profiles (lifecycle, weapon config)

createSnakeAgentSession(state, { registry, navWalkable, speciesById })
  registry              — agentPopulationRegistry (alive/dead by headId)
  instancesByHeadId     — AgentInstance (all species)
  autosimsByHeadId      — createAgentAutosim per head
  engagementByHeadId    — published engagement facts (see below)
```

**Relationship resolution** (`resolveAgentRelationship`): species-specific, configured via profiles. Snakes use faction + segment count (ally / rival / threat / prey). Flee/ball agents treat snakes as threat, same-faction balls as ally.

Registry + session: `Libraries/Game/snake/snakeAgentSession.js`, `Libraries/AI/agents/agentPopulationRegistry.js`, `Libraries/Game/snake/species/index.js`.

---

## Tick pipeline (one frame)

```text
setupSnakeGame.tick(dt)
  agentFrameOrchestrator.js            — coordinates simulation frame ticks
  validateAliveAgents
  beginSnakePerceptionFrame            — batch vision builds per tick
  tickAliveAgents                      — species.tick → autosim / profile instance
  customSystems.js                     — runs tickGunBullets and resolveGunBulletContacts
  endSnakePerceptionFrame
  hud.update

Kinetic frame (shared sim):
  physics substeps
  applyContactSideEffects              — combat, hunt drive, segment fracture
  syncAgentsAfterPhysics               — chain sync, presentation, diagnostics
```

Perception is **batched** when `session._batchingPerception` is set so all heads share one observer-vision frame build per tick.

---

## Agent intent stack (adapter pattern)

Generic loop in `Libraries/AI`; species supply facts and scorers:

```text
createAgentIntent (generic FSM host)
  ├─ createSnakeForageIntent (snake)
  │    perceiveSnakeIntentWorld → perceiveAgentWorld → classifyAgentVision
  │    snakeIntentMemory → AI/memory/targetMemory.js
  │    buildSnakeDecisionContext → snakeDecisionModel.js → utilityScoring
  │    publishAgentEngagement(session, headId, engagementState)
  │    snakeIntentStates (explore / seek_food / seek_prey / flee / seek_ally)
  │
  └─ Dynamic Profile-driven Intents (flee_agent, ball_agent)
       uses dynamic agentProfile configs for target memory and utility scorers.
       ball_agent includes ranged_combat intent triggers (aim, fire, reload phases).
```

**Ranged Combat / Gun System:**
Wired in `rangedCombat.js` and `gunAgent/gunBulletSystem.js`. Agents with a configured weapon profile can target and shoot projectiles. Bullet ticks and contacts are evaluated in custom systems runners. Projectiles are rendered as faction-colored capsules directly in `WorldSceneRenderer.js`.

**Locomotion:** all species use per-agent HPA (`cellTargetHpaNav`). Flow fields exist for sandbox drag-nav only — not steering yet ([AI.md](../AI.md#future-local-flow-horizons)).

---

## Engagement blackboard (follow worthy allies)

Followers do **not** peek at neighbor autosim modes. Each agent publishes a fact after deciding; others read from session:

| Step | Where |
|---|---|
| Derive | `deriveSnakeEngagementState(blackboard, chosenIntent)` — active when acting on seek_food / seek_prey / flee with salient target; **never** active for explore or seek_ally |
| Publish | `publishAgentEngagement(session, headId, state)` in `createSnakeForageIntent` after `buildSnakeDecisionContext` |
| Read | `readAgentEngagement` / `isAgentEngaged` in `Libraries/AI/agents/agentEngagement.js` |
| Consume | `deriveAllyState` → `leadworthy`; `scoreSeekAllyDetail` requires leadworthy; `snakeIntentMemory` only stamps engaged allies |

`session.engagementByHeadId` lives on `state.sandbox.snakeGame`. Vision still sees all same-faction allies; memory and seek_ally scoring filter by engagement.

---

## Perception & vision

- **Entry:** `perceiveSnakeIntentWorld` → shared `perceiveAgentWorld` + `classifyAgentVision`
- **Vision frame:** `requireSnakeVisionFrame` / `beginSnakePerceptionFrame` — cached per tick, position + range key
- **Geometry:** 360° grid-cell collection + grid LOS (`Libraries/Navigation/perception/gridCellVision.js`)
- **Food:** `snakeFood.js` — visible shard food deduped against `vision.cells`
- **Slots:** threat, prey, food, ally (+ allyCount, allyCentroid)

Config: `visionRange`, `fleeRange` (defaults to vision range), `lethalThreatRange`, `intentMemory` TTLs.

---

## Metabolism, growth, sprint

- **Hunger bar** (0–1) drains per `metabolism.hungerDrainMs`; eating restores `foodValue`; overflow → growth via `growthCost`.
- **Consolidated Metabolism**: All hunger, starvation, scaling, and segment growth logic is managed under `agentMetabolism.js`.
- **Segments**: `minAliveSegmentCount` … `maxAliveSegmentCount`; starvation sheds on interval.
- **Sprint**: burns hunger faster (`sprint.hungerDrainMultiplier`); modes: flee (severe threat), seek_prey, seek_food under threat.
- **Facts**: `deriveSnakeHungerState` → satisfied / hungry / desperate gates scoring and regroup.

---

## Combat & fracture

| System | File | Notes |
|---|---|---|
| Hunt / strike | `snakeCombat.js`, `snakeStriker.js` | Kinetic ram, faction-aware targeting |
| Ranged Combat | `rangedCombat.js`, `gunAgent/gunBulletSystem.js` | Projectiles/gun simulation with aim, fire, reload phases |
| Split | contact resolver + `splitImpulseThreshold` | Smaller snake splits at struck segment |
| Segment fracture | `snakeSegmentFracture.js` | Retired segments → fracturable food props |
| Wall damage | `gridWallDamage.js` + config `wallDamage` | Shared `SNAKE_KINETIC_MIN_STRIKE_SPEED` |
| Death | `snakeSpecies.die` | Chain retire, shatter, registry purge |

Fractured segments register as **food** targets via `snakeFood` query.

---

## Scene & procgen hook

`snakeScene.js` composes the playfield (not the algorithm catalog — see [Mazes.md](../Mazes.md)):

- Upper band: cellular-automata cavern (`generateLabCaverns`)
- Lower band: R-DFS rail maze (`generateLabRailDfsMaze`) via split layout
- Walkable index + nav commit after stamp

Flee agents spawn after snakes with occupied-cell exclusion.

---

## HUD & debug overlays

| UI | File |
|---|---|
| Focused name + Switch Camera + Overlay toggle | `snakeHud.js` |
| Camera cycle | `CameraTargetCycler` — all alive head IDs |
| Combat chips (optional) | `snakeCombatHud.js` |

**Focused agent debug** (`appendSnakeGameOverlayCommands`):

- Vision cell highlights
- Spatial memory heatmap (brain LRU)
- Path preview (≤3 nodes)
- Committed target ring

Toggled at runtime via HUD **Overlay** button → `showFocusedAgentDebug` in active config. Layer flags: `focusedAgentDebug.{vision, spatialMemory, path}`.

Context resolver: `resolveFocusedAgentDebugContext` — works for snake autosim and flee instance.

---

## Config surface (`Config/games/snake.js`)

Grouped knobs (override via `applySnakeGameConfig` in tests):

| Group | Keys |
|---|---|
| Population | `snakeCount`, `boidCount`, segment props, `linkSlack`, radii |
| Flee agent | nested `fleeAgent.*` — metabolism, sprint, cohesion, `fleePackBlend` |
| Vision / flee | `visionRange`, `fleeRange`, `lethalThreatRange`, `fleeHysteresis`, `terminalHoming` |
| Memory | `spatialMemoryCapacity`, `navMemoryStepPenalty`, `intentMemory` TTLs |
| Scoring | `decisionWeights`, `decisionPressure`, `rivalBand`, `factionCohesion` |
| Combat / world | `splitImpulseThreshold`, `wallDamage`, `cavern`, `rail` |
| Debug | `showFocusedAgentDebug`, `focusedAgentDebug`, `showMemoryHeatmap` |

---

## Extracted vs still snake-specific

| Extracted to engine | Still in `Libraries/Game/snake` |
|---|---|
| `createAgentIntent`, utility scoring, target memory | `snakeDecisionModel`, hunger/threat facts, seek_ally cohesion scorers |
| `classifyAgentVision`, `agentWorldPerception` | `snakeIntent`, `snakeIntentMemory`, DynamicSpeciesMap resolver |
| `agentEngagement` publish/read | `deriveSnakeEngagementState`, session wiring |
| Grid-cell vision, observer frame | `snakePerception` batching, food query |
| `agentPopulationRegistry` | `AgentInstance`, combat traits, `agentMetabolism.js`, `agentFrameOrchestrator.js`, `rangedCombat.js`, `gunAgent/gunBulletSystem.js` |

**Rule of thumb:** if a second game mode would need the same primitive, it belongs in `Libraries/AI` or `Libraries/Navigation`. If it references segment count, snake chains, or shard food, it stays here until a second consumer appears.

---

## Key tests

`snakeDecisionModel`, `snakeIntent`, `snakeFsmTransitions`, `agentAllyPerception`, `agentAllyMemory`, `focusedAgentDebugOverlays`, `snakeSplit`, `snakeSegmentFracture`, `snakeMulti`, `gridCellVision`, `gunBullet.test.js`, `shatterPerformance.test.js`.

Harness: `tests/harness/snakeGameHarness.js`.
