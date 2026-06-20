import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { isRailWallEdge } from "../Spatial/grid/CellEdge.js";
import { cellIsStaticWall } from "../Spatial/grid/gridCellTopology.js";
/** @typedef {{ kind: "voxel", col: number, row: number } | { kind: "rail", col: number, row: number, side: number }} WallDamageTarget */
/** @typedef {{ kind: "voxel", col: number, row: number, hp: number } | { kind: "rail", col: number, row: number, side: number, hp: number }} WallDamageEntry */
export function wallDamageKey(target) {
    return target.kind === "voxel" ? `v:${target.col},${target.row}` : `r:${target.col},${target.row}:${target.side}`;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {object} segment */
export function resolveWallDamageTarget(grid, segment) {
    if (segment.passageEdge) return null;
    const col = segment.gridCol;
    const row = segment.gridRow;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    if (segment.isStaticGridProxy && cellIsStaticWall(grid, col, row)) return { kind: "voxel", col, row };
    if (segment.isEdgeRail) {
        const side = segment.gridSide;
        if (side == null) return null;
        const edge = grid.edgeStore.get(col, row, side, grid.cols);
        if (!isRailWallEdge(edge)) return null;
        return { kind: "rail", col, row, side };
    }
    return null;
}
/**
 * @param {number} preSpeed
 * @param {number} approachDot — negative when driving into the wall normal
 * @param {{ minStrikeSpeed: number, referenceMaxSpeed: number, maxHitDamage: number, minAngleFactor: number }} config
 */
export function computeStrikerWallDamage(preSpeed, approachDot, config) {
    if (preSpeed < config.minStrikeSpeed || approachDot >= 0) return 0;
    const speedSpan = config.referenceMaxSpeed - config.minStrikeSpeed;
    const speedT = speedSpan <= 0 ? 1 : Math.min(1, Math.max(0, (preSpeed - config.minStrikeSpeed) / speedSpan));
    const angleT = Math.min(1, Math.max(config.minAngleFactor, -approachDot / preSpeed));
    return config.maxHitDamage * speedT * angleT;
}
export function createGridWallDamageSession() {
    return {
        /** @type {Map<string, WallDamageEntry>} */
        entries: new Map(),
        /** @type {Map<string, number>} */
        pendingDamage: new Map(),
    };
}
function entryForTarget(target, maxHp) {
    if (target.kind === "voxel") return { kind: "voxel", col: target.col, row: target.row, hp: maxHp };
    return { kind: "rail", col: target.col, row: target.row, side: target.side, hp: maxHp };
}
/** @param {ReturnType<typeof createGridWallDamageSession>} session @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {WallDamageTarget} target @param {number} maxHp */
function ensureWallDamageEntry(session, grid, target, maxHp) {
    const key = wallDamageKey(target);
    let entry = session.entries.get(key);
    if (entry) return entry;
    if (!resolveWallDamageTarget(grid, targetToSegment(target))) return null;
    entry = entryForTarget(target, maxHp);
    session.entries.set(key, entry);
    return entry;
}
function targetToSegment(target) {
    if (target.kind === "voxel") return { gridCol: target.col, gridRow: target.row, isStaticGridProxy: true, isEdgeRail: false };
    return { gridCol: target.col, gridRow: target.row, gridSide: target.side, isEdgeRail: true, isStaticGridProxy: false };
}
/**
 * @param {ReturnType<typeof createGridWallDamageSession>} session
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../Spatial/collision/wallResolution.js").WallHit[]} hits
 * @param {number} preSpeed
 * @param {{ maxHp: number, minStrikeSpeed: number, referenceMaxSpeed: number, maxHitDamage: number, minAngleFactor: number }} config
 */
export function queueStrikerWallHits(session, grid, hits, preSpeed, config) {
    for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const target = resolveWallDamageTarget(grid, hit.segment);
        if (!target) continue;
        const damage = computeStrikerWallDamage(preSpeed, hit.approachDot, config);
        if (damage <= 0) continue;
        const key = wallDamageKey(target);
        const prev = session.pendingDamage.get(key) ?? 0;
        if (damage > prev) session.pendingDamage.set(key, damage);
    }
}
/**
 * @param {object} state
 * @param {ReturnType<typeof createGridWallDamageSession>} session
 * @param {import("./deferredGridWallCommit.js").DeferredGridWallCommit} commit
 * @param {{ maxHp: number, minStrikeSpeed: number, referenceMaxSpeed: number, maxHitDamage: number, minAngleFactor: number }} config
 */
export function applyPendingStrikerWallDamage(state, session, commit, config) {
    if (!session.pendingDamage.size) return null;
    const grid = state.obstacleGrid;
    const voxels = [];
    const rails = [];
    for (const [key, damage] of session.pendingDamage) {
        const target = parseWallDamageKey(key);
        if (!target) continue;
        if (!resolveWallDamageTarget(grid, targetToSegment(target))) {
            session.entries.delete(key);
            continue;
        }
        const entry = ensureWallDamageEntry(session, grid, target, config.maxHp);
        if (!entry) continue;
        entry.hp -= damage;
        if (entry.hp > 0) continue;
        session.entries.delete(key);
        if (entry.kind === "voxel") voxels.push({ col: entry.col, row: entry.row });
        else rails.push({ col: entry.col, row: entry.row, side: entry.side });
    }
    session.pendingDamage.clear();
    if (voxels.length || rails.length) commit.clearWalls({ voxels, rails });
    return commit.flush();
}
/** @param {string} key */
function parseWallDamageKey(key) {
    if (key[0] === "v") {
        const parts = key.slice(2).split(",");
        if (parts.length !== 2) return null;
        return { kind: "voxel", col: Number(parts[0]), row: Number(parts[1]) };
    }
    if (key[0] === "r") {
        const body = key.slice(2);
        const colon = body.lastIndexOf(":");
        const comma = body.indexOf(",");
        if (colon < 0 || comma < 0) return null;
        return { kind: "rail", col: Number(body.slice(0, comma)), row: Number(body.slice(comma + 1, colon)), side: Number(body.slice(colon + 1)) };
    }
    return null;
}
