import { isAgentEngaged } from "../agents/agentEngagement.js";
import { createTargetMemory, targetFromMemoryRecord } from "./targetMemory.js";

const INTENT_MEMORY_KINDS = ["threat", "prey", "food", "ally"];

function allyIfEngaged(session, ally) {
    if (!ally) return null;
    if (session && !isAgentEngaged(session, ally.id)) return null;
    return ally;
}

function mergeTarget(visibleWorld, kind, record, state) {
    return visibleWorld[kind] ?? targetFromMemoryRecord(record, state);
}

function mergeAlly(visibleWorld, record, state, session, filterAllyForEngagement) {
    if (!filterAllyForEngagement) return mergeTarget(visibleWorld, "ally", record, state);
    let ally = allyIfEngaged(session, visibleWorld.ally) ?? targetFromMemoryRecord(record, state);
    return allyIfEngaged(session, ally);
}

export function createAgentIntentMemory({ threatTtlTicks = 45, preyTtlTicks = 90, foodTtlTicks = 180, allyTtlTicks = 60, filterAllyForEngagement = false } = {}) {
    const memory = createTargetMemory(INTENT_MEMORY_KINDS, { threat: threatTtlTicks, prey: preyTtlTicks, food: foodTtlTicks, ally: allyTtlTicks });
    return {
        update(seeker, state, visibleWorld) {
            const grid = state.obstacleGrid;
            const session = state.sandbox?.snakeGame;
            const ally = filterAllyForEngagement ? allyIfEngaged(session, visibleWorld.ally) : visibleWorld.ally;
            memory.observe("threat", visibleWorld.threat, seeker, grid);
            memory.observe("prey", visibleWorld.prey, seeker, grid);
            memory.observe("food", visibleWorld.food, seeker, grid);
            memory.observe("ally", ally, seeker, grid);
        },
        enrichWorld(state, visibleWorld) {
            const session = state.sandbox?.snakeGame;
            const threatRecord = memory.record("threat");
            const preyRecord = memory.record("prey");
            const foodRecord = memory.record("food");
            const allyRecord = memory.record("ally");
            const threat = mergeTarget(visibleWorld, "threat", threatRecord, state);
            const prey = mergeTarget(visibleWorld, "prey", preyRecord, state);
            const food = mergeTarget(visibleWorld, "food", foodRecord, state);
            const ally = mergeAlly(visibleWorld, allyRecord, state, session, filterAllyForEngagement);
            return {
                ...visibleWorld,
                threat,
                prey,
                food,
                ally,
                allyCount: visibleWorld.ally ? (visibleWorld.allyCount ?? 1) : ally ? 1 : 0,
                allyCentroid: visibleWorld.ally ? (visibleWorld.allyCentroid ?? null) : null,
                memory: this.snapshot(),
                memorySource: { threat: !visibleWorld.threat && !!threat, prey: !visibleWorld.prey && !!prey, food: !visibleWorld.food && !!food, ally: !visibleWorld.ally && !!ally },
            };
        },
        snapshot() {
            return memory.snapshot();
        },
        clear() {
            memory.clear();
        },
        clearTarget(id) {
            memory.clearTarget(id);
        },
    };
}
