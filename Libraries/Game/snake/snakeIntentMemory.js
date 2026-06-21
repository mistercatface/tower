import { createTargetMemory, targetFromMemoryRecord } from "../../AI/memory/targetMemory.js";
const SNAKE_MEMORY_KINDS = ["threat", "prey", "food"];
function targetFromRecord(record, state) {
    if (!record) return null;
    if (record.id != null) {
        const live = state.entityRegistry.getLive(record.id);
        if (!live || live.isDead) return null;
    }
    return targetFromMemoryRecord(record);
}
export function createSnakeIntentMemory({ threatTtlTicks = 45, preyTtlTicks = 90, foodTtlTicks = 180 } = {}) {
    const memory = createTargetMemory(SNAKE_MEMORY_KINDS, { threat: threatTtlTicks, prey: preyTtlTicks, food: foodTtlTicks });
    return {
        update(seeker, state, visibleWorld) {
            const grid = state.obstacleGrid;
            memory.observe("threat", visibleWorld.threat, seeker, grid);
            memory.observe("prey", visibleWorld.prey, seeker, grid);
            memory.observe("food", visibleWorld.food, seeker, grid);
        },
        enrichWorld(state, visibleWorld) {
            const preyRecord = memory.record("prey");
            const foodRecord = memory.record("food");
            const threat = visibleWorld.threat ?? targetFromRecord(memory.record("threat"), state);
            const prey = visibleWorld.prey ?? targetFromRecord(preyRecord, state);
            const food = visibleWorld.food ?? targetFromRecord(foodRecord, state);
            return {
                ...visibleWorld,
                threat,
                prey,
                food,
                preyDist: visibleWorld.prey ? visibleWorld.preyDist : (preyRecord?.lastDistanceCells ?? null),
                foodDist: visibleWorld.food ? visibleWorld.foodDist : (foodRecord?.lastDistanceCells ?? null),
                memory: this.snapshot(),
                memorySource: { threat: !visibleWorld.threat && !!threat, prey: !visibleWorld.prey && !!prey, food: !visibleWorld.food && !!food },
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
