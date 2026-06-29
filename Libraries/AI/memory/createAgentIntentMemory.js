import { isAgentEngaged } from "../agents/AgentProfiles.js";
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
    const memorySource = { threat: false, prey: false, food: false, ally: false };
    const world = { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0, memorySource };
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
            const threat = mergeTarget(visibleWorld, "threat", memory.record("threat"), state);
            const prey = mergeTarget(visibleWorld, "prey", memory.record("prey"), state);
            const food = mergeTarget(visibleWorld, "food", memory.record("food"), state);
            const ally = mergeAlly(visibleWorld, memory.record("ally"), state, session, filterAllyForEngagement);
            world.threat = threat;
            world.prey = prey;
            world.food = food;
            world.ally = ally;
            world.threatCount = visibleWorld.threatCount ?? 0;
            world.allyCount = visibleWorld.ally ? (visibleWorld.allyCount ?? 1) : ally ? 1 : 0;
            world.allyCentroid = visibleWorld.ally ? (visibleWorld.allyCentroid ?? null) : null;
            memorySource.threat = !visibleWorld.threat && !!threat;
            memorySource.prey = !visibleWorld.prey && !!prey;
            memorySource.food = !visibleWorld.food && !!food;
            memorySource.ally = !visibleWorld.ally && !!ally;
            return world;
        },
        getWorld() {
            return world;
        },
        snapshot() {
            return memory.snapshot();
        },
        clear() {
            memory.clear();
            world.threat = null;
            world.prey = null;
            world.food = null;
            world.ally = null;
            world.allyCount = 0;
            world.allyCentroid = null;
            world.threatCount = 0;
            memorySource.threat = false;
            memorySource.prey = false;
            memorySource.food = false;
            memorySource.ally = false;
        },
        clearTarget(id) {
            memory.clearTarget(id);
        },
    };
}
