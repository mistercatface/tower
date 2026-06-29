# FSM / Agent AI Roadmap

This is the active roadmap for the snake-game agent stack and the generic AI pieces it proves. It replaces older per-species plans that referenced split snake/flee modules.

**Legend:** ✅ shipped · 🟡 partial · ⬜ not started · ▶ next.

---

## Current Architecture Snapshot

```text
Config/games/snake.js
  agentProfiles: snake, flee_agent, squid

Libraries/AI/agents/AgentProfiles.js
  profile ids, registry, engagement facts

Libraries/Game/snake/snakeAgentSession.js
  SnakeAgentSession, DynamicSpeciesMap, AgentFrameOrchestrator

Libraries/Game/snake/AgentInstance.js
  AgentInstance, AgentAutosim, AgentMetabolism, relationship rules

Libraries/Game/snake/GroundNavIntentAdapter.js
  target memory, FSM adapter, ranged combat action state

Libraries/AI/agents/AgentDecisionContext.js
  schema-driven facts, mode scoring, engagement derive

Libraries/AI/agentIntent/AgentIntent.js
  generic flat intent FSM host
```

The main shipped change is that snake, flee, and squid no longer need separate intent/decision/memory stacks. Species-specific policy is expressed through profile schema and shared adapters.

---

## Part 1 — AI Consumer Dedupe And Flow Reach ✅

**Status:** shipped.

What landed:

- `flowTargetSteps.js` and `flowReachStaleCache.js` provide decision-time reach in path steps.
- Distances now resolve as `reachSteps` for utility scoring instead of copied `*Dist` fields through perception, memory, blackboard, and scorer layers.
- `AgentDecisionContext.js` owns shared decision facts and mode scoring.
- `GroundNavIntentAdapter.js` owns memory/intent integration for all active snake-game profiles.
- `AgentProfiles.js` owns profile ids, registry helpers, and engagement publish/read.

Review gates to keep:

- New species should configure profile schema instead of copying snake or flee decision modules.
- Reach facts should be computed once at the adapter boundary and read from decision context.
- Do not reintroduce `snakeDecisionModel.js`, `snakeIntentMemory.js`, `createSnakeForageIntent.js`, or a new `AI/memory/targetMemory.js` package unless a real second boundary appears.

---

## Part 2 — Local Flow Locomotion ▶ Next

**Status:** not started.

Today, agents still steer through per-agent HPA cell targets (`cellTargetHpaNav`). Flow fields are used for sandbox flow nav and decision reach, not locomotion.

Planned sequence:

1. **Flee flow steering slice:** add short-horizon local flow windows for `flee_agent` movement where goals are nearby and agent counts are high.
2. **Hybrid snake stack:** keep HPA for long-range corridor selection, then execute local movement with a flow window until invalidation or waypoint arrival.
3. **Blended fields:** combine threat repulsion with food/ammo/ally attraction for flee and pack behavior.

Keep the first slice narrow: preserve HPA as the shipped locomotion path until the flow execution path has focused tests and a visible behavior win.

---

## Part 3 — Worker And Slot Scaling 🟡

Flow and HPA workers are solid for current workloads. The next work is evidence-driven:

- profile per-agent flow window rebuild cost before adding pools;
- surface worker or graph patch failures clearly instead of silent degradation;
- size any new slot buffers from real agent/window counts.

---

## Part 4 — FSM Hygiene 🟡

The big dedupe is done, but the hot path still deserves cleanup when touched:

- reduce wrapper object creation in decision context build paths;
- avoid per-tick option objects or closures in perception/relationship plumbing;
- keep tests on public behavior, not private transition reason strings;
- delete obsolete compatibility names instead of forwarding to new modules.

This is cleanup, not a separate abstraction push. Add a behavior-tree or generic slot pipeline only when another game mode needs it.

---

## Current Next Ship

1. Local flow locomotion for `flee_agent`.
2. Path smoothing / string-pull for HPA paths.
3. FSM hot-path allocation cleanup where profiling shows it matters.

_Last updated: current profile-driven AI stack, flow-backed reach, and frame orchestrator status._
