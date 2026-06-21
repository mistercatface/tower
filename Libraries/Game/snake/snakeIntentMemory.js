function makeEmptyRecords() {
    return { threat: null, prey: null, food: null };
}
function makeRecord(kind, target, seeker, grid, ttlTicks) {
    if (!target) return null;
    const cell = grid.worldToGrid(target.x, target.y);
    const dx = target.x - seeker.x;
    const dy = target.y - seeker.y;
    return { kind, id: target.id ?? null, x: target.x, y: target.y, cell, ageTicks: 0, ttlTicks, confidence: 1, lastDistance: Math.hypot(dx, dy) };
}
function ageRecord(record) {
    if (!record) return null;
    record.ageTicks++;
    record.confidence = Math.max(0, 1 - record.ageTicks / Math.max(record.ttlTicks, 1));
    return record.ageTicks <= record.ttlTicks ? record : null;
}
function targetFromRecord(record, state) {
    if (!record) return null;
    if (record.id != null) {
        const live = state.entityRegistry.getLive(record.id);
        if (!live || live.isDead) return null;
    }
    return { id: record.id, x: record.x, y: record.y, memoryRecord: record };
}
function snapshotRecord(record) {
    if (!record) return null;
    return { kind: record.kind, id: record.id, cell: { ...record.cell }, ageTicks: record.ageTicks, ttlTicks: record.ttlTicks, confidence: record.confidence, lastDistance: record.lastDistance };
}
export function createSnakeIntentMemory({ threatTtlTicks = 45, preyTtlTicks = 90, foodTtlTicks = 180 } = {}) {
    const records = makeEmptyRecords();
    function observe(kind, target, seeker, grid, ttlTicks) {
        if (target) records[kind] = makeRecord(kind, target, seeker, grid, ttlTicks);
        else records[kind] = ageRecord(records[kind]);
    }
    return {
        update(seeker, state, visibleWorld) {
            const grid = state.obstacleGrid;
            observe("threat", visibleWorld.threat, seeker, grid, threatTtlTicks);
            observe("prey", visibleWorld.prey, seeker, grid, preyTtlTicks);
            observe("food", visibleWorld.food, seeker, grid, foodTtlTicks);
        },
        enrichWorld(state, visibleWorld) {
            const threat = visibleWorld.threat ?? targetFromRecord(records.threat, state);
            const prey = visibleWorld.prey ?? targetFromRecord(records.prey, state);
            const food = visibleWorld.food ?? targetFromRecord(records.food, state);
            return {
                ...visibleWorld,
                threat,
                prey,
                food,
                memory: this.snapshot(),
                memorySource: { threat: !visibleWorld.threat && !!threat, prey: !visibleWorld.prey && !!prey, food: !visibleWorld.food && !!food },
            };
        },
        snapshot() {
            return { threat: snapshotRecord(records.threat), prey: snapshotRecord(records.prey), food: snapshotRecord(records.food) };
        },
        clear() {
            records.threat = null;
            records.prey = null;
            records.food = null;
        },
        clearTarget(id) {
            for (const kind of Object.keys(records)) if (records[kind]?.id === id) records[kind] = null;
        },
    };
}
