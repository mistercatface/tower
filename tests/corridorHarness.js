import { corridorPathOccupiedCellIndices } from "../Libraries/Pathfinding/Corridor/corridorFootprint.js";
import { corridorSearchBounds, corridorSearchLayout } from "../Libraries/Pathfinding/Corridor/corridorWalkGrid.js";
import { solveUniformCorridorBundle } from "../Libraries/Pathfinding/Corridor/corridorBundle.js";
import { maxCorridorLanesBetweenNodes } from "../Libraries/Pathfinding/Corridor/corridorWallSlots.js";
import { buildRoomFootprintMaskForLayout, cellInsideAnyRoom } from "../Libraries/Pathfinding/Corridor/corridorWalkGrid.js";
import { createSeededRng } from "../Libraries/Math/SeededRng.js";
import { buildCorridorBeltsFromPaths, collapsePathRevisits, corridorExteriorCellFromWallHole } from "../Libraries/RoomGraph/roomGraphCorridorBelts.js";
import { assertBeltChains, beltMapFromFloorBelts } from "../Libraries/Procedural/Mazes/beltChainValidation.js";
import { DEFAULT_CORRIDOR_EGRESS_CELLS } from "../Libraries/RoomGraph/roomGraphCorridorRails.js";
import { floorBeltEntryExitSides } from "../Libraries/Spatial/grid/FloorCell.js";
import { layoutAbsCellIndex } from "../Libraries/Spatial/grid/GridUtils.js";
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
export function solveTwoRoomBundle(fixture, corridorCount, corridorWidth, seed) {
    const rooms = [fixture.roomA, fixture.roomB];
    const rng = createSeededRng(seed);
    return solveUniformCorridorBundle(corridorCount, corridorWidth, { roomA: fixture.roomA, roomB: fixture.roomB, allRooms: rooms, egressCells: DEFAULT_CORRIDOR_EGRESS_CELLS, rng });
}
export function maxLanesForFixture(fixture, corridorWidth) {
    return maxCorridorLanesBetweenNodes(fixture.roomA, fixture.roomB, corridorWidth);
}
function oppositeSide(side) {
    return (side + 2) % 4;
}
function fixtureLayout(fixture) {
    return corridorSearchLayout(corridorSearchBounds([fixture.roomA, fixture.roomB], 12));
}
export function footprintIndicesForPath(path, width, layout) {
    return corridorPathOccupiedCellIndices(path, width, layout, { interiorOnly: false });
}
function beltMap(belts, layout) {
    return beltMapFromFloorBelts(belts, layout);
}
function corridorOnlyFootprint(path, width, layout) {
    return footprintIndicesForPath(collapsePathRevisits(path, layout), width, layout);
}
export function assertLaneReachesRoomMouths(fixture, bundle, laneIndex, label = "lane") {
    const layout = fixtureLayout(fixture);
    const rooms = [fixture.roomA, fixture.roomB];
    const parentHole = bundle.parentAnchors[laneIndex];
    const childHole = bundle.childAnchors[laneIndex];
    const exteriorA = corridorExteriorCellFromWallHole(parentHole);
    const exteriorB = corridorExteriorCellFromWallHole(childHole);
    const belts = buildCorridorBeltsFromPaths([bundle.paths[laneIndex]], [bundle.corridorWidths[laneIndex]], rooms, [bundle.parentAnchors[laneIndex]], [bundle.childAnchors[laneIndex]], layout);
    const beltsByCell = beltMap(belts, layout);
    const corridorFootprint = corridorOnlyFootprint(bundle.paths[laneIndex], bundle.corridorWidths[laneIndex], layout);
    const mouthExteriorIndices = new Set([layoutAbsCellIndex(layout, exteriorA.c, exteriorA.r), layoutAbsCellIndex(layout, exteriorB.c, exteriorB.r)]);
    const roomFootprintMask = buildRoomFootprintMaskForLayout(layout, rooms);
    for (const idx of mouthExteriorIndices) {
        if (cellInsideAnyRoom(roomFootprintMask, idx)) continue;
        if (!beltsByCell.has(idx) && corridorFootprint.has(idx)) {
            const col = (idx % layout.strideCols) + layout.originCol;
            const row = ((idx / layout.strideCols) | 0) + layout.originRow;
            throw new Error(`${label}: missing belt at room mouth ${col},${row}`);
        }
    }
    assertBeltChains(corridorFootprint, beltsByCell, layout, label, mouthExteriorIndices);
}
function beltIsElbow(kind) {
    return kind === 2 || kind === 3 || kind === 5 || kind === 6;
}
export function assertLaneMouthBeltsEnterRooms(fixture, bundle, laneIndex, label = "lane") {
    const rooms = [fixture.roomA, fixture.roomB];
    const parentHole = bundle.parentAnchors[laneIndex];
    const childHole = bundle.childAnchors[laneIndex];
    const exteriorA = corridorExteriorCellFromWallHole(parentHole);
    const exteriorB = corridorExteriorCellFromWallHole(childHole);
    const layout = fixtureLayout(fixture);
    const belts = buildCorridorBeltsFromPaths([bundle.paths[laneIndex]], [bundle.corridorWidths[laneIndex]], rooms, [parentHole], [childHole], layout);
    const beltsByCell = beltMap(belts, layout);
    const roomFootprintMask = buildRoomFootprintMaskForLayout(layout, rooms);
    const intoRoom = (hole) => oppositeSide(hole.side);
    for (const [hole, exterior, role, check] of [
        [parentHole, exteriorA, "parent", "entry"],
        [childHole, exteriorB, "child", "exit"],
    ]) {
        const idx = layoutAbsCellIndex(layout, exterior.c, exterior.r);
        if (cellInsideAnyRoom(roomFootprintMask, idx)) continue;
        const belt = beltsByCell.get(idx);
        if (!belt) throw new Error(`${label}: missing belt at ${role} mouth ${exterior.c},${exterior.r}`);
        const sides = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
        const wantIntoRoom = intoRoom(hole);
        const actual = check === "entry" ? sides.entrySide : sides.exitSide;
        if (actual !== wantIntoRoom) throw new Error(`${label}: ${role} mouth belt at ${exterior.c},${exterior.r} ${check} side ${actual}, expected ${wantIntoRoom} into room`);
    }
    const childIdx = layoutAbsCellIndex(layout, exteriorB.c, exteriorB.r);
    if (!cellInsideAnyRoom(roomFootprintMask, childIdx)) {
        const childBelt = beltsByCell.get(childIdx);
        const { entrySide, exitSide } = floorBeltEntryExitSides(childBelt.kind, childBelt.facingIndex);
        const straightThrough = (entrySide + 2) % 4 === exitSide;
        if (!straightThrough && !beltIsElbow(childBelt.kind)) throw new Error(`${label}: child mouth belt at ${exteriorB.c},${exteriorB.r} turns ${entrySide}->${exitSide} but is not an elbow`);
    }
}
export function assertManySeparateLinks(fixture, linkCount, seed = 0) {
    const rooms = [fixture.roomA, fixture.roomB];
    const placedPaths = [];
    const placedPathWidths = [];
    for (let link = 0; link < linkCount; link++) {
        const rng = createSeededRng(seed + link * 9973);
        const bundle = solveUniformCorridorBundle(1, 1, {
            roomA: fixture.roomA,
            roomB: fixture.roomB,
            allRooms: rooms,
            egressCells: DEFAULT_CORRIDOR_EGRESS_CELLS,
            rng,
            existingPaths: placedPaths,
            existingPathWidths: placedPathWidths,
        });
        if (!bundle) throw new Error(`link ${link}: solve failed with ${placedPaths.length} prior paths`);
        assertBundleLanes(fixture, bundle);
        placedPaths.push(bundle.paths[0]);
        placedPathWidths.push(1);
    }
}
export function assertPathsAreCardinalConnected(paths, layout) {
    const stride = layout ? layout.strideCols : 0;
    for (let pi = 0; pi < paths.length; pi++) {
        const path = paths[pi];
        for (let i = 1; i < path.length; i++) {
            let c0, r0, c1, r1;
            if (typeof path[i] === "number") {
                const idx0 = path[i - 1];
                const idx1 = path[i];
                c0 = idx0 % stride;
                r0 = (idx0 / stride) | 0;
                c1 = idx1 % stride;
                r1 = (idx1 / stride) | 0;
            } else {
                c0 = path[i - 1].c;
                r0 = path[i - 1].r;
                c1 = path[i].c;
                r1 = path[i].r;
            }
            const dc = Math.abs(c1 - c0);
            const dr = Math.abs(r1 - r0);
            if (dc + dr !== 1) throw new Error(`path ${pi} step ${i} is not cardinal (${c0},${r0}) -> (${c1},${r1})`);
        }
    }
}
export function assertPathsDoNotOverlap(paths, widths, layout) {
    const seen = new Set();
    for (let pi = 0; pi < paths.length; pi++)
        for (const idx of footprintIndicesForPath(collapsePathRevisits(paths[pi], layout), widths[pi], layout)) {
            if (seen.has(idx)) throw new Error(`paths overlap at index ${idx}`);
            seen.add(idx);
        }
}
export function assertBundleLanes(fixture, bundle) {
    const layout = fixtureLayout(fixture);
    assertPathsAreCardinalConnected(bundle.paths, layout);
    assertPathsDoNotOverlap(bundle.paths, bundle.corridorWidths, layout);
    for (let li = 0; li < bundle.paths.length; li++) {
        assertLaneMouthBeltsEnterRooms(fixture, bundle, li, `lane ${li}`);
        if (bundle.corridorWidths[li] === 1) assertLaneReachesRoomMouths(fixture, bundle, li, `lane ${li}`);
    }
}
