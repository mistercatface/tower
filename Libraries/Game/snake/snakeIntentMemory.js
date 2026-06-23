import { createTargetMemory, targetFromMemoryRecord } from "../../AI/memory/targetMemory.js";
import { isAgentEngaged } from "../../AI/agents/agentEngagement.js";
const SNAKE_MEMORY_KINDS = ["threat", "prey", "food", "ally"];
function targetFromRecord(record, state) {
    if (!record) return null;
    if (record.id != null) {
        const live = state.entityRegistry.getLive(record.id);
        if (!live || live.isDead) return null;
    }
    return targetFromMemoryRecord(record);
}
function resolveLeadworthyAlly(session, ally) {
    if (!ally) return null;
    if (!session) return ally;
    return isAgentEngaged(session, ally.id) ? ally : null;
}
export function createSnakeIntentMemory({ threatTtlTicks = 45, preyTtlTicks = 90, foodTtlTicks = 180, allyTtlTicks = 60 } = {}) {
    const memory = createTargetMemory(SNAKE_MEMORY_KINDS, { threat: threatTtlTicks, prey: preyTtlTicks, food: foodTtlTicks, ally: allyTtlTicks });
    return {
        update(seeker, state, visibleWorld) {
            const grid = state.obstacleGrid;
            const session = state.sandbox?.snakeGame;
            memory.observe("threat", visibleWorld.threat, seeker, grid);
            memory.observe("prey", visibleWorld.prey, seeker, grid);
            memory.observe("food", visibleWorld.food, seeker, grid);
            memory.observe("ally", resolveLeadworthyAlly(session, visibleWorld.ally), seeker, grid);
        },
        enrichWorld(state, visibleWorld) {
            const session = state.sandbox?.snakeGame;
            const preyRecord = memory.record("prey");
            const foodRecord = memory.record("food");
            const allyRecord = memory.record("ally");
            const threat = visibleWorld.threat ?? targetFromRecord(memory.record("threat"), state);
            const prey = visibleWorld.prey ?? targetFromRecord(preyRecord, state);
            const food = visibleWorld.food ?? targetFromRecord(foodRecord, state);
            let ally = resolveLeadworthyAlly(session, visibleWorld.ally) ?? targetFromRecord(allyRecord, state);
            ally = resolveLeadworthyAlly(session, ally);
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
