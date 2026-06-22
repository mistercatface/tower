import { createTargetMemory, targetFromMemoryRecord } from "../../../AI/memory/targetMemory.js";
const FLEE_MEMORY_KINDS = ["threat", "food", "ally"];
function targetFromRecord(record, state) {
    if (!record) return null;
    if (record.id != null) {
        const live = state.entityRegistry.getLive(record.id);
        if (!live || live.isDead) return null;
    }
    return targetFromMemoryRecord(record);
}
export function createFleeIntentMemory({ threatTtlTicks = 45, foodTtlTicks = 180, allyTtlTicks = 60 } = {}) {
    const memory = createTargetMemory(FLEE_MEMORY_KINDS, { threat: threatTtlTicks, food: foodTtlTicks, ally: allyTtlTicks });
    return {
        update(seeker, state, visibleWorld) {
            const grid = state.obstacleGrid;
            memory.observe("threat", visibleWorld.threat, seeker, grid);
            memory.observe("food", visibleWorld.food, seeker, grid);
            memory.observe("ally", visibleWorld.ally, seeker, grid);
        },
        enrichWorld(state, visibleWorld) {
            const foodRecord = memory.record("food");
            const allyRecord = memory.record("ally");
            const threat = visibleWorld.threat ?? targetFromRecord(memory.record("threat"), state);
            const food = visibleWorld.food ?? targetFromRecord(foodRecord, state);
            const ally = visibleWorld.ally ?? targetFromRecord(allyRecord, state);
            return {
                ...visibleWorld,
                threat,
                food,
                ally,
                threatDist: visibleWorld.threat ? visibleWorld.threatDist : (memory.record("threat")?.lastDistanceCells ?? null),
                foodDist: visibleWorld.food ? visibleWorld.foodDist : (foodRecord?.lastDistanceCells ?? null),
                allyDist: visibleWorld.ally ? visibleWorld.allyDist : (allyRecord?.lastDistance ?? null),
                allyCount: visibleWorld.ally ? (visibleWorld.allyCount ?? 1) : ally ? 1 : 0,
                allyCentroid: visibleWorld.ally ? (visibleWorld.allyCentroid ?? null) : null,
                threatCount: visibleWorld.threatCount ?? 0,
                aggregateThreatSeverity: visibleWorld.aggregateThreatSeverity ?? 0,
                memory: this.snapshot(),
                memorySource: { threat: !visibleWorld.threat && !!threat, food: !visibleWorld.food && !!food, ally: !visibleWorld.ally && !!ally },
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
