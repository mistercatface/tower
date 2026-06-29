---
name: AI Frame Orchestrator (Completed)
overview: "Completed archive for the config-driven AI frame orchestrator. Active follow-up work now lives in fsmroadmap.md."
todos:
    - id: config-update
      content: Add aiBudget to snake config and remove brainSyncOffScreenInterval
      status: completed
    - id: remove-obsolete-brain-sync
      content: Remove obsolete observer/perception-side sync throttling
      status: completed
    - id: create-orchestrator
      content: Implement frame admission logic
      status: completed
    - id: wire-orchestrator
      content: Wire admission into snakeAgentSession alive-agent loop
      status: completed
    - id: split-autosim
      content: Gate expensive perceive/decide work while locomotion and metabolism continue
      status: completed
    - id: clean-tests
      content: Update targeted tests around aiBudget and admission behavior
      status: completed
isProject: false
---

# Unified AI Frame Orchestrator — Completed

The frame orchestrator is shipped. The active FSM/agent roadmap now lives in [`fsmroadmap.md`](fsmroadmap.md).

## Current Implementation

| Concern | Current home |
|---|---|
| Config | `Config/games/snake.js` → `SNAKE_GAME_DEFAULTS.aiBudget` |
| Admission loop | `Libraries/Game/snake/snakeAgentSession.js` |
| Runtime admission behavior | `AgentFrameOrchestrator` in `snakeAgentSession.js` |
| Per-agent tick split | `AgentAutosim.tick(dtMs, admitted)` in `AgentInstance.js` |
| Tests | `tests/agentFrameOrchestrator.test.js`, `tests/snakePerfBudget.test.js` |

The key contract is unchanged from the original plan:

- admitted agents run expensive perception, decision, and FSM transition work;
- every alive active agent continues combat action updates, movement intent application, HPA locomotion, and metabolism;
- `aiBudget` controls focused/on-screen/off-screen/dormant admission.

## Follow-Up Work

The orchestrator itself is not the next bottleneck. Follow-up work is now:

1. Local flow locomotion for `flee_agent`.
2. FSM hot-path allocation cleanup where profiling points.
3. Path smoothing and local separation.

See [`fsmroadmap.md`](fsmroadmap.md) for the active sequence.
