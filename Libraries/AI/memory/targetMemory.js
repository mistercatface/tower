function makeEmptyRecords(kinds) {
    const records = {};
    for (const kind of kinds) records[kind] = null;
    return records;
}
function makeRecord(kind, target, observer, grid, ttlTicks) {
    const cell = { col: grid.worldCol(target.x), row: grid.worldRow(target.y) };
    const dx = target.x - observer.x;
    const dy = target.y - observer.y;
    const lastDistance = Math.hypot(dx, dy);
    return { kind, id: target.id ?? null, x: target.x, y: target.y, cell, ageTicks: 0, ttlTicks, confidence: 1, lastDistance, lastDistanceCells: lastDistance / grid.cellSize };
}
function ageRecord(record) {
    if (!record) return null;
    record.ageTicks++;
    record.confidence = Math.max(0, 1 - record.ageTicks / Math.max(record.ttlTicks, 1));
    return record.ageTicks <= record.ttlTicks ? record : null;
}
function snapshotRecord(record) {
    if (!record) return null;
    return {
        kind: record.kind,
        id: record.id,
        cell: { ...record.cell },
        ageTicks: record.ageTicks,
        ttlTicks: record.ttlTicks,
        confidence: record.confidence,
        lastDistance: record.lastDistance,
        lastDistanceCells: record.lastDistanceCells,
    };
}
export function targetFromMemoryRecord(record) {
    if (!record) return null;
    return { id: record.id, x: record.x, y: record.y, memoryRecord: record };
}
export function createTargetMemory(kinds, ttlByKind) {
    const records = makeEmptyRecords(kinds);
    return {
        observe(kind, target, observer, grid) {
            if (target) records[kind] = makeRecord(kind, target, observer, grid, ttlByKind[kind]);
            else records[kind] = ageRecord(records[kind]);
        },
        record(kind) {
            return records[kind];
        },
        snapshot() {
            const out = {};
            for (const kind of kinds) out[kind] = snapshotRecord(records[kind]);
            return out;
        },
        clear() {
            for (const kind of kinds) records[kind] = null;
        },
        clearTarget(id) {
            for (const kind of kinds) if (records[kind]?.id === id) records[kind] = null;
        },
    };
}
