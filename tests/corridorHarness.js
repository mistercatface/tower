import { corridorPathOccupiedCellKeys } from "../Libraries/Pathfinding/Corridor/corridorFootprint.js";
import { solveUniformCorridorBundle } from "../Libraries/Pathfinding/Corridor/corridorBundle.js";
import { maxCorridorLanesBetweenNodes } from "../Libraries/Pathfinding/Corridor/corridorWallSlots.js";
import { cellInsideAnyRoom } from "../Libraries/Pathfinding/Corridor/corridorWalkGrid.js";
import { createSeededRng } from "../Libraries/Math/SeededRng.js";
import { buildCorridorBeltsFromPaths, collapsePathRevisits, corridorExteriorCellFromWallHole, roomInteriorCellFromWallHole } from "../Libraries/RoomGraph/roomGraphCorridorBelts.js";
import { DEFAULT_CORRIDOR_EGRESS_CELLS } from "../Libraries/RoomGraph/roomGraphCorridorRails.js";
import { floorBeltEntryExitSides } from "../Libraries/Spatial/grid/FloorCell.js";
import { CARDINAL_OFFSETS } from "../Libraries/Spatial/grid/GridUtils.js";
export function makeRoomRect(c0, r0, width, height) {
    const c1 = c0 + width - 1;
    const r1 = r0 + height - 1;
    return { c0, c1, r0, r1, centerC: (c0 + (width - 1) / 2) | 0, centerR: (r0 + (height - 1) / 2) | 0 };
}
export function makeHorizontalFixture(roomAWidth, roomAHeight, gap, roomBWidth, roomBHeight, row = 8) {
    const roomA = makeRoomRect(8, row, roomAWidth, roomAHeight);
    const roomB = makeRoomRect(roomA.c1 + 1 + gap, row, roomBWidth, roomBHeight);
    return { name: `h ${roomAWidth}x${roomAHeight} gap${gap} ${roomBWidth}x${roomBHeight}`, roomA, roomB };
}
export function makeVerticalFixture(roomAWidth, roomAHeight, gap, roomBWidth, roomBHeight, col = 8) {
    const roomA = makeRoomRect(col, 8, roomAWidth, roomAHeight);
    const roomB = makeRoomRect(col, roomA.r1 + 1 + gap, roomBWidth, roomBHeight);
    return { name: `v ${roomAWidth}x${roomAHeight} gap${gap} ${roomBWidth}x${roomBHeight}`, roomA, roomB };
}
export function generateWidthOneFixtures() {
    const sizes = [4, 6, 8, 12];
    const gaps = [2, 4, 8, 16];
    const fixtures = [];
    for (const w of sizes)
        for (const h of sizes)
            for (const gap of gaps) {
                fixtures.push(makeHorizontalFixture(w, h, gap, w, h));
                fixtures.push(makeVerticalFixture(w, h, gap, w, h));
            }
    return fixtures;
}
export function solveTwoRoomBundle(fixture, corridorCount, corridorWidth, seed, canIntersect = false) {
    const rooms = [fixture.roomA, fixture.roomB];
    const rng = createSeededRng(seed);
    return solveUniformCorridorBundle(corridorCount, corridorWidth, {
        roomA: fixture.roomA,
        roomB: fixture.roomB,
        allRooms: rooms,
        egressCells: DEFAULT_CORRIDOR_EGRESS_CELLS,
        rng,
        options: { canIntersect },
    });
}
export function maxLanesForFixture(fixture, corridorWidth) {
    return maxCorridorLanesBetweenNodes(fixture.roomA, fixture.roomB, corridorWidth);
}
function cellKey(c, r) {
    return `${c},${r}`;
}
function neighborForSide(c, r, side) {
    const off = CARDINAL_OFFSETS[side];
    return { c: c + off.dc, r: r + off.dr };
}
function oppositeSide(side) {
    return (side + 2) % 4;
}
export function footprintKeysForPath(path, width) {
    return corridorPathOccupiedCellKeys(path, width, { interiorOnly: false });
}
function beltMap(belts) {
    const map = new Map();
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        map.set(cellKey(belt.col, belt.row), belt);
    }
    return map;
}
function assertBeltChains(footprint, beltsByCell, label, mouthExteriorKeys = new Set()) {
    for (const key of footprint) {
        const belt = beltsByCell.get(key);
        if (!belt) throw new Error(`${label}: missing belt at ${key}`);
    }
    for (const key of footprint) {
        const belt = beltsByCell.get(key);
        const { entrySide, exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
        const entry = neighborForSide(belt.col, belt.row, entrySide);
        const exit = neighborForSide(belt.col, belt.row, exitSide);
        const entryKey = cellKey(entry.c, entry.r);
        const exitKey = cellKey(exit.c, exit.r);
        const entryInFootprint = footprint.has(entryKey);
        const exitInFootprint = footprint.has(exitKey);
        if (entryInFootprint) {
            const entryBelt = beltsByCell.get(entryKey);
            const entryExit = floorBeltEntryExitSides(entryBelt.kind, entryBelt.facingIndex).exitSide;
            if (entryExit !== oppositeSide(entrySide)) throw new Error(`${label}: belt chain break ${entryKey} -> ${key} (entry side ${entrySide}, upstream exit ${entryExit})`);
        }
        if (exitInFootprint) {
            const exitBelt = beltsByCell.get(exitKey);
            const exitEntry = floorBeltEntryExitSides(exitBelt.kind, exitBelt.facingIndex).entrySide;
            if (exitEntry !== oppositeSide(exitSide)) throw new Error(`${label}: belt chain break ${key} -> ${exitKey} (exit side ${exitSide}, downstream entry ${exitEntry})`);
        }
        if (!entryInFootprint && !exitInFootprint) {
            if (mouthExteriorKeys.has(key)) continue;
            throw new Error(`${label}: dead-end belt at ${key}`);
        }
    }
}
function assertRoomInteriorBelts(interior, hole, beltsByCell, isSource, label) {
    const interiorBelt = beltsByCell.get(cellKey(interior.c, interior.r));
    if (!interiorBelt) throw new Error(`${label}: missing interior belt at ${interior.c},${interior.r}`);
    const interiorSides = floorBeltEntryExitSides(interiorBelt.kind, interiorBelt.facingIndex);
    if (isSource && interiorSides.exitSide !== hole.side) throw new Error(`${label}: source interior exit ${interiorSides.exitSide} != hole side ${hole.side}`);
    if (!isSource && interiorSides.entrySide !== hole.side) throw new Error(`${label}: target interior entry ${interiorSides.entrySide} != hole side ${hole.side}`);
}
function corridorOnlyFootprint(path, width) {
    return footprintKeysForPath(collapsePathRevisits(path), width);
}
export function assertLaneReachesRoomInteriors(fixture, bundle, laneIndex, label = "lane") {
    const rooms = [fixture.roomA, fixture.roomB];
    const parentHole = bundle.parentAnchors[laneIndex];
    const childHole = bundle.childAnchors[laneIndex];
    const interiorA = roomInteriorCellFromWallHole(parentHole);
    const interiorB = roomInteriorCellFromWallHole(childHole);
    const exteriorA = corridorExteriorCellFromWallHole(parentHole);
    const exteriorB = corridorExteriorCellFromWallHole(childHole);
    if (!cellInsideAnyRoom([fixture.roomA], interiorA.c, interiorA.r)) throw new Error(`${label}: source interior ${interiorA.c},${interiorA.r} is not inside room A`);
    if (!cellInsideAnyRoom([fixture.roomB], interiorB.c, interiorB.r)) throw new Error(`${label}: target interior ${interiorB.c},${interiorB.r} is not inside room B`);
    const belts = buildCorridorBeltsFromPaths([bundle.paths[laneIndex]], [bundle.corridorWidths[laneIndex]], rooms, { parentAnchors: [parentHole], childAnchors: [childHole] });
    const beltsByCell = beltMap(belts);
    if (!beltsByCell.has(cellKey(interiorA.c, interiorA.r))) throw new Error(`${label}: no belt inside room A at ${interiorA.c},${interiorA.r}`);
    if (!beltsByCell.has(cellKey(interiorB.c, interiorB.r))) throw new Error(`${label}: no belt inside room B at ${interiorB.c},${interiorB.r}`);
    assertRoomInteriorBelts(interiorA, parentHole, beltsByCell, true, label);
    assertRoomInteriorBelts(interiorB, childHole, beltsByCell, false, label);
    const corridorFootprint = corridorOnlyFootprint(bundle.paths[laneIndex], bundle.corridorWidths[laneIndex]);
    const mouthExteriorKeys = new Set([cellKey(exteriorA.c, exteriorA.r), cellKey(exteriorB.c, exteriorB.r)]);
    assertBeltChains(corridorFootprint, beltsByCell, label, mouthExteriorKeys);
}
export function assertPathsAreCardinalConnected(paths) {
    for (let pi = 0; pi < paths.length; pi++) {
        const path = paths[pi];
        for (let i = 1; i < path.length; i++) {
            const dc = Math.abs(path[i].c - path[i - 1].c);
            const dr = Math.abs(path[i].r - path[i - 1].r);
            if (dc + dr !== 1) throw new Error(`path ${pi} step ${i} is not cardinal (${path[i - 1].c},${path[i - 1].r}) -> (${path[i].c},${path[i].r})`);
        }
    }
}
export function assertPathsDoNotOverlap(paths, widths) {
    const seen = new Set();
    for (let pi = 0; pi < paths.length; pi++)
        for (const key of footprintKeysForPath(collapsePathRevisits(paths[pi]), widths[pi])) {
            if (seen.has(key)) throw new Error(`paths overlap at ${key}`);
            seen.add(key);
        }
}
export function assertBundleLanes(fixture, bundle, canIntersect) {
    assertPathsAreCardinalConnected(bundle.paths);
    if (!canIntersect) assertPathsDoNotOverlap(bundle.paths, bundle.corridorWidths);
    for (let li = 0; li < bundle.paths.length; li++) assertLaneReachesRoomInteriors(fixture, bundle, li, `lane ${li}`);
}
