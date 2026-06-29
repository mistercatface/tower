function makeEmptyRecords(kinds) {
    const records = {};
    for (const kind of kinds) records[kind] = null;
    return records;
}
function makeRecord(kind, target, grid, ttlTicks) {
    const cell = { col: grid.worldCol(target.x), row: grid.worldRow(target.y) };
    return { kind, id: target.id ?? null, x: target.x, y: target.y, cell, ageTicks: 0, ttlTicks, confidence: 1 };
}
function refreshRecord(record, target, grid) {
    record.x = target.x;
    record.y = target.y;
    record.cell.col = grid.worldCol(target.x);
    record.cell.row = grid.worldRow(target.y);
    record.ageTicks = 0;
    record.confidence = 1;
}
function ageRecord(record) {
    if (!record) return null;
    record.ageTicks++;
    record.confidence = Math.max(0, 1 - record.ageTicks / Math.max(record.ttlTicks, 1));
    return record.ageTicks <= record.ttlTicks ? record : null;
}
function snapshotRecord(record) {
    if (!record) return null;
    return { kind: record.kind, id: record.id, cell: { ...record.cell }, ageTicks: record.ageTicks, ttlTicks: record.ttlTicks, confidence: record.confidence };
}
export function targetFromMemoryRecord(record, state = null) {
    if (!record) return null;
    if (state?.entityRegistry && record.id != null) {
        const live = state.entityRegistry.getLive(record.id);
        if (!live || live.isDead) return null;
    }
    return { id: record.id, x: record.x, y: record.y, memoryRecord: record };
}
export class TargetMemory {
    constructor(kinds, ttlByKind) {
        this.kinds = kinds;
        this.ttlByKind = ttlByKind;
        this.records = {};
        for (const kind of kinds) this.records[kind] = null;
    }
    observe(kind, target, observer, grid) {
        if (target) {
            const id = target.id ?? null;
            const existing = this.records[kind];
            if (existing && existing.id === id) refreshRecord(existing, target, grid);
            else this.records[kind] = makeRecord(kind, target, grid, this.ttlByKind[kind]);
        } else this.records[kind] = ageRecord(this.records[kind]);
    }
    record(kind) {
        return this.records[kind];
    }
    snapshot() {
        const out = {};
        for (const kind of this.kinds) out[kind] = snapshotRecord(this.records[kind]);
        return out;
    }
    clear() {
        for (const kind of this.kinds) this.records[kind] = null;
    }
    clearTarget(id) {
        for (const kind of this.kinds) if (this.records[kind]?.id === id) this.records[kind] = null;
    }
}
