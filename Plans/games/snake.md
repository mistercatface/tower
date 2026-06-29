# Snake Game — Proving Ground

The snake mode is the primary pressure test for generic AI, navigation, physics chains, combat, and procgen chunk recipes. Game-specific rules live here; reusable pieces get extracted to `Libraries/AI`, `Libraries/Navigation`, `Libraries/Sandbox`, and other engine homes.

**Related:** generic AI stack → [AI.md](../AI.md) · layout recipes → [Mazes.md](../Mazes.md) · editor/game shell → [sandbox-editor.md](../sandbox-editor.md) · active FSM plan → [fsmroadmap.md](../current/fsmroadmap.md)

---

## Entry Points

| Path | Role |
|---|---|
| `Libraries/Game/gameLaunchers.js` | `snake` launcher → `setupSnakeGame` |
| `Libraries/Game/snake/setupSnakeGame.js` | Scene spawn, agent session, HUD, camera, shadow/bloom controls, tick hook |
| `Libraries/Game/snake/snakeAgentSession.js` | `SnakeAgentSession`, `DynamicSpeciesMap`, alive-agent loop, frame orchestrator |
| `Libraries/Game/snake/AgentInstance.js` | Agent runtime instance, autosim, metabolism, relationships, HPA nav |
| `Libraries/Game/snake/GroundNavIntentAdapter.js` | Target memory, FSM adapter, ranged-combat action state |
| `Libraries/Game/snake/snakeScene.js` | Split-map orchestration (cavern + rail maze bands) |
| `Config/games/snake.js` | `SNAKE_GAME_DEFAULTS` — all gameplay tuning and profile schemas |

Launch: `?game=snake` via `runGameLaunch` → game shell (no TileLab sidebar). See [sandbox-editor.md](../sandbox-editor.md#game-shell-vs-tilelab).

---

## Species Model

Three agent species share one session through profile-driven configuration:

| Species | ID | Body | Intent modes |
|---|---|---|---|
| **Snake** | `snake` | Linked ball chain (`spawnAgentChain`) | explore, seek_food, seek_prey, flee, seek_ally |
| **Flee agent** | `flee_agent` | Single rolling ball / triangle body | explore, flee, shoot_enemy, seek_enemy, seek_ammo, seek_food, seek_ally |
| **Squid** | `squid` | Cluster / chain-combat body | explore, seek_food, seek_prey, flee |

```text
Config/games/snake.js
  agentProfiles

AgentProfiles.js
  profile ids, registry, identity helpers, engagement facts

snakeAgentSession.js
  DynamicSpeciesMap
  registry
  instancesByHeadId
  instancesByMemberId
  engagementByHeadId

AgentInstance.js
  runtime profile + relationship rules + metabolism + nav + intent adapter
```

Relationship resolution is profile-specific. Snakes use faction plus segment count for ally/rival/threat/prey. Flee agents use proximity and faction rules, including ammo/combat decisions. Squid uses cluster/brain-ram combat rules and proximity-based prey/threat relationships.

---

## Tick Pipeline

```text
setupSnakeGame.tick(dt)
  snakeAgentSession.tickAliveAgents
    AgentFrameOrchestrator.beginFrame
    beginSnakePerceptionFrame
    instance.autosim.tick(dt, admitted)
      if admitted: intent.tick -> perceive, score, transition
      always: combat action, movement intent, HPA nav, metabolism
    customSystems.js
      tickGunBullets
      resolveGunBulletContacts
    endSnakePerceptionFrame
  hud.update

Kinetic frame
  physics substeps
  applyContactSideEffects
    resolveSnakeCombatFromContacts
    applySnakeHuntContactDrive
    segment fracture / wall damage side effects
  syncAgentsAfterPhysics
```

Perception is batched per simulation tick so agent heads share one observer-vision frame build. The frame orchestrator admits expensive perception/decision work under `config.aiBudget`; locomotion and metabolism continue every tick.

---

## Agent Intent Stack

```text
AgentIntent.js
  generic flat FSM host

GroundNavIntentAdapter.js
  target memory
  committed goal handling
  combat action phases
  HPA target handoff

AgentDecisionContext.js
  visible / known slots
  reachSteps
  hunger, threat, ally, ammo, combat facts
  mode scoring and engagement derive

classifyAgentVision.js + agentWorldPerception.js
  shared threat / prey / food / ammo / ally classification
```

The current pattern is schema-driven: profile config declares remembered slots, event targets, decision fields, modes, scorers, guards, sprint rules, and relationship policy. The adapter writes facts once, then scoring reads from the decision context.

**Locomotion:** all species still use per-agent HPA (`cellTargetHpaNav`) for agent movement. Flow fields are wired for sandbox flow nav and decision reach, not agent steering yet. Next work lives in [fsmroadmap.md](../current/fsmroadmap.md) Part 2.

---

## Ranged Combat And Ammo

Flee agents can carry a configured weapon profile:

- `shoot_enemy` handles reaction, aim, fire delay, magazine, reload, and strafe movement.
- `seek_enemy` closes distance when the target is outside ideal weapon range.
- `seek_ammo` uses visible and remembered ammo shards when reload pressure is high.
- `gunAgent/gunBulletSystem.js` ticks projectile entities and resolves contacts.
- `WorldSceneRenderer.js` renders projectiles as faction-colored capsules.

Ammo collection is handled as an agent contact collectible in `AgentInstance.collectContactProp`.

---

## Engagement Blackboard

Followers do not inspect neighbor autosim modes directly. Agents publish engagement facts after a decision, and other agents read from the session.

| Step | Where |
|---|---|
| Derive | `deriveSnakeEngagementState` in `AgentDecisionContext.js` |
| Publish/read | engagement helpers in `AgentProfiles.js` |
| Store | `session.engagementByHeadId` on `state.sandbox.snakeGame` |
| Consume | ally memory and `seek_ally` scoring require leadworthy or close-enough ally facts |

Vision still sees all same-faction allies; memory and regroup scoring filter what becomes actionable.

---

## Perception And Vision

- **Entry:** `perceiveAgentWorld` + `classifyAgentVision`.
- **Vision frame:** `snakePerception.js` wraps observer frame begin/end and cached per-tick visibility.
- **Geometry:** 360-degree grid-cell collection + grid LOS in `Libraries/Navigation/perception`.
- **Food/ammo:** profile `visibleSources` decide which collectable categories enter slots.
- **Slots:** threat, prey/enemy, food, ammo, ally, counts, centroids, and combat visibility.

Config: `shared.visionRange`, `shared.fleeRange`, `shared.lethalThreatRange`, `shared.intentMemory`, profile weapon ranges, and profile decision schema.

---

## Metabolism, Growth, Sprint

- `AgentMetabolism` is in `AgentInstance.js`.
- Hunger drains by profile `metabolism.hungerDrainMs`; eating restores `foodValue`.
- Snake overflow growth uses `growthCost` and appends chain segments up to `maxAliveSegmentCount`.
- Starvation can shed snake tail segments on `starveShedIntervalMs`.
- Sprint rules are profile-driven and can depend on mode, threat severity, hunger, food/ammo pressure, and combat state.

---

## Combat And Fracture

| System | File | Notes |
|---|---|---|
| Contact combat | `snakeCombat.js` | Chain/ball/squid ram rules, relationship-aware prey strikes |
| Ranged combat | `GroundNavIntentAdapter.js`, `gunAgent/gunBulletSystem.js` | Action phases and projectile simulation |
| Split | `AgentInstance.splitAtStruckSegment` | Smaller snake splits at struck segment |
| Segment fracture | `snakeSegmentFracture.js` | Retired segments become fracturable food props |
| Wall damage | `gridWallDamage.js` + config `wallDamage` | Shared kinetic strike threshold |
| Death | profile species handlers from `snakeAgentSession.js` | Chain retire, shatter, registry purge |

Fractured segments register as food targets through `snakeFood.js`.

---

## Scene And Procgen Hook

`snakeScene.js` composes the playfield:

- upper band: cellular-automata cavern;
- lower band: rail maze via split layout;
- surface profile bands from `surfaceRegions`;
- walkable index and nav commit after stamping;
- profile populations spawned with occupied-cell exclusion.

The algorithm catalog remains in [Mazes.md](../Mazes.md).

---

## HUD, Debug, And Callouts

| UI | File |
|---|---|
| Focused name, camera switch, overlays, shadow/bloom controls | `snakeHud.js`, `setupSnakeGame.js` |
| Camera cycle | `CameraTargetCycler` over alive head IDs |
| Focused debug overlays | `appendSnakeGameOverlayCommands` |
| Flee callouts | `FleeAgentCalloutDirector` |

Focused debug can show vision cells, spatial memory, path preview, and committed target rings. LOS shadow and bloom controls are game-shell presentation controls, not AI state.

---

## Config Surface

Grouped knobs in `Config/games/snake.js`:

| Group | Keys |
|---|---|
| Session / AI budget | `aiBudget`, `agentCallouts`, focused debug |
| Shared agent facts | `shared.visionRange`, reach horizon, memory, flee/targeting hysteresis |
| Profiles | `agentProfiles.snake`, `flee_agent`, `squid` |
| Combat | profile `combat`, `weapon`, `attackRange`, `splitImpulseThreshold`, `wallDamage` |
| Metabolism / sprint | profile `metabolism`, `hungerBands`, `sprint` |
| Scoring | profile `decisionWeights`, `decisionPressure`, `decision.modes` |
| World | `cavern`, `rail`, `surfaceRegions` |

Tests override via `applySnakeGameConfig`.

---

## Extracted Vs Still Snake-Specific

| Extracted to engine | Still in `Libraries/Game/snake` |
|---|---|
| `AgentIntent`, utility scoring, EQS scoring | Session wiring, scene composition, HUD/callouts |
| `AgentProfiles`, identity, engagement helpers | `AgentInstance`, snake/flee/squid combat traits |
| `classifyAgentVision`, `agentWorldPerception` | `GroundNavIntentAdapter`, because it owns snake-game locomotion/action policy |
| Grid-cell vision, observer frame, LOS | `snakePerception`, `snakeFood`, profile spawning |
| `flowTargetSteps` decision reach | HPA head-nav execution for this game mode |

Rule of thumb: if another game mode needs the same primitive, move it toward `Libraries/AI` or `Libraries/Navigation`. If it references snake-game collectables, chain topology, or this session's custom combat, keep it here until a second consumer appears.

---

## Key Tests

Representative suites:

`snakeDecisionModel`, `snakeIntent`, `snakeFsmTransitions`, `snakeAutosim`, `snakeInstance`, `snakeMulti`, `snakePerfBudget`, `snakeSplit`, `snakeSegmentFracture`, `snakeStarvation`, `agentFrameOrchestrator`, `agentAllyPerception`, `agentAllyMemory`, `agentRelationships`, `agentCombatTraits`, `fleeAgentDecision`, `fleeAgentCombat`, `fleeAgentMetabolism`, `fleeAgentCallouts`, `ammoEconomy`, `gunBullet`, `createAgentSpecies`, `squidVsSquidCombat`, `squidVsFleeCombat`, `focusedAgentDebugOverlays`.

Harness: `tests/harness/snakeGameHarness.js`.

_Last updated: profile-driven snake/flee/squid stack, frame orchestrator, flee gun/ammo economy, and callouts._
