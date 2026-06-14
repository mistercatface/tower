import { generateCellularAutomataGrid } from "../CA/cellularAutomata.js";
import { FLOOR_CELL_KIND } from "../Spatial/grid/FloorCell.js";
import { SANDBOX_SCENE_SCHEMA_VERSION } from "./sandboxSceneSnapshot.js";
/** @param {number} seed */
function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}
/** @param {number} cols @param {number} rows @param {number} c @param {number} r */
function idx(cols, c, r) {
    return r * cols + c;
}
/** @param {number} c0 @param {number} r0 @param {number} c1 @param {number} r1 */
function manhattan(c0, r0, c1, r1) {
    return Math.abs(c0 - c1) + Math.abs(r0 - r1);
}
/**
 * @param {() => number} rng
 * @param {number} cols
 * @param {number} rows
 * @param {number} count
 */
function placeRooms(rng, cols, rows, count) {
    /** @type {{ id: number, c0: number, r0: number, c1: number, r1: number, centerC: number, centerR: number }[]} */
    const rooms = [];
    for (let attempt = 0; attempt < 800 && rooms.length < count; attempt++) {
        const w = 7 + ((rng() * 5) | 0);
        const h = 7 + ((rng() * 5) | 0);
        const c0 = 3 + ((rng() * (cols - w - 6)) | 0);
        const r0 = 3 + ((rng() * (rows - h - 6)) | 0);
        const c1 = c0 + w - 1;
        const r1 = r0 + h - 1;
        const pad = 4;
        let ok = true;
        for (let i = 0; i < rooms.length; i++) {
            const o = rooms[i];
            if (c0 - pad <= o.c1 && c1 + pad >= o.c0 && r0 - pad <= o.r1 && r1 + pad >= o.r0) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;
        rooms.push({ id: rooms.length, c0, r0, c1, r1, centerC: ((c0 + c1) / 2) | 0, centerR: ((r0 + r1) / 2) | 0 });
    }
    return rooms;
}
/**
 * @param {typeof placeRooms extends (...args: any[]) => infer R ? R : never} rooms
 * @param {() => number} rng
 */
function buildRoomGraph(rooms, rng) {
    const n = rooms.length;
    /** @type {{ a: number, b: number, bidirectional: boolean }[]} */
    const edges = [];
    const inTree = new Uint8Array(n);
    inTree[0] = 1;
    for (let k = 1; k < n; k++) {
        let bestI = 0;
        let bestJ = 0;
        let bestDist = Infinity;
        for (let i = 0; i < n; i++) {
            if (!inTree[i]) continue;
            for (let j = 0; j < n; j++) {
                if (inTree[j]) continue;
                const d = manhattan(rooms[i].centerC, rooms[i].centerR, rooms[j].centerC, rooms[j].centerR);
                if (d < bestDist) {
                    bestDist = d;
                    bestI = i;
                    bestJ = j;
                }
            }
        }
        inTree[bestJ] = 1;
        edges.push({ a: bestI, b: bestJ, bidirectional: rng() < 0.42 });
    }
    const edgeKey = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;
    const seen = new Set(edges.map((e) => edgeKey(e.a, e.b)));
    const extra = Math.max(2, (n * 0.35) | 0);
    for (let t = 0; t < extra * 20 && seen.size < edges.length + extra; t++) {
        const a = (rng() * n) | 0;
        const b = (rng() * n) | 0;
        if (a === b) continue;
        const key = edgeKey(a, b);
        if (seen.has(key)) continue;
        const d = manhattan(rooms[a].centerC, rooms[a].centerR, rooms[b].centerC, rooms[b].centerR);
        if (d > 36) continue;
        seen.add(key);
        edges.push({ a, b, bidirectional: rng() < 0.42 });
    }
    return edges;
}
/** @param {{ c0: number, r0: number, c1: number, r1: number, centerC: number, centerR: number }} room @param {{ centerC: number, centerR: number }} target */
function roomPortal(room, target) {
    const dx = target.centerC - room.centerC;
    const dy = target.centerR - room.centerR;
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx > 0) return { c: room.c1 + 1, r: room.centerR, side: 1 };
        return { c: room.c0 - 1, r: room.centerR, side: 3 };
    }
    if (dy > 0) return { c: room.centerC, r: room.r1 + 1, side: 2 };
    return { c: room.centerC, r: room.r0 - 1, side: 0 };
}
/** @param {{ c0: number, r0: number, c1: number, r1: number }} room @param {{ c: number, r: number, side: number }} portal */
function portalIntoRoomStep(portal) {
    if (portal.side === 1) return { dc: -1, dr: 0, facing: 2 };
    if (portal.side === 3) return { dc: 1, dr: 0, facing: 0 };
    if (portal.side === 2) return { dc: 0, dr: -1, facing: 3 };
    return { dc: 0, dr: 1, facing: 1 };
}
/**
 * @param {Uint8Array} floor
 * @param {number} cols
 * @param {number} rows
 * @param {{ c0: number, r0: number, c1: number, r1: number }} room
 * @param {{ c: number, r: number, side: number }} portal
 * @param {number} steps
 * @param {Map<string, { kind: "walk" | "belt", facing?: number, rails?: boolean, elbow?: "left" | "right", exitFacing?: number }>} tubeCells
 */
function spurBeltIntoRoom(floor, cols, rows, room, portal, steps, tubeCells) {
    const { dc, dr, facing } = portalIntoRoomStep(portal);
    let c = portal.c;
    let r = portal.r;
    for (let i = 0; i < steps; i++) {
        c += dc;
        r += dr;
        if (c < room.c0 || c > room.c1 || r < room.r0 || r > room.r1) break;
        if (c < 0 || r < 0 || c >= cols || r >= rows) break;
        floor[idx(cols, c, r)] = 1;
        tubeCells.set(`${c},${r}`, { kind: "belt", facing, rails: true });
    }
}
/** @param {{ c: number, r: number }} from @param {{ c: number, r: number }} to */
function manhattanPath(from, to) {
    /** @type {{ c: number, r: number }[]} */
    const path = [];
    let c = from.c;
    let r = from.r;
    path.push({ c, r });
    while (c !== to.c) {
        c += c < to.c ? 1 : -1;
        path.push({ c, r });
    }
    while (r !== to.r) {
        r += r < to.r ? 1 : -1;
        path.push({ c, r });
    }
    return path;
}
/** @param {{ c: number, r: number }} a @param {{ c: number, r: number }} b */
function segmentFacing(a, b) {
    if (b.c > a.c) return 0;
    if (b.c < a.c) return 2;
    if (b.r > a.r) return 1;
    return 3;
}
/** @param {number} facing @param {"left" | "right"} turn @param {boolean} rails */
function elbowKind(facing, turn, rails) {
    const left = turn === "left";
    if (rails) return left ? FLOOR_CELL_KIND.BeltElbowLeftRails : FLOOR_CELL_KIND.BeltElbowRightRails;
    return left ? FLOOR_CELL_KIND.BeltElbowLeft : FLOOR_CELL_KIND.BeltElbowRight;
}
/** @param {number} fromF @param {number} toF @returns {"left" | "right"} */
function turnDirection(fromF, toF) {
    const delta = (toF - fromF + 4) % 4;
    return delta === 1 ? "left" : "right";
}
/**
 * @param {Uint8Array} floor
 * @param {number} cols
 * @param {number} rows
 * @param {{ c: number, r: number }[]} path
 * @param {boolean} bidirectional
 * @param {Map<string, { kind: "walk" | "belt", facing?: number, rails?: boolean }>} tubeCells
 */
function carveTube(floor, cols, rows, path, bidirectional, tubeCells) {
    /** @param {number} c @param {number} r @param {"walk" | "belt"} kind @param {number} [facing] @param {boolean} [rails] */
    const mark = (c, r, kind, facing, rails = false) => {
        if (c < 0 || r < 0 || c >= cols || r >= rows) return;
        floor[idx(cols, c, r)] = 1;
        tubeCells.set(`${c},${r}`, { kind, facing, rails });
    };
    for (let i = 0; i < path.length; i++) {
        const prev = path[i - 1] ?? path[i];
        const curr = path[i];
        const next = path[i + 1] ?? path[i];
        const fIn = segmentFacing(prev, curr);
        const fOut = segmentFacing(curr, next);
        const axis = fIn === 0 || fIn === 2 ? "ew" : "ns";
        if (axis === "ew")
            if (bidirectional) {
                mark(curr.c, curr.r - 1, "belt", 0, true);
                mark(curr.c, curr.r, "walk");
                mark(curr.c, curr.r + 1, "belt", 2, true);
            } else {
                mark(curr.c, curr.r, "belt", 0, true);
                mark(curr.c, curr.r + 1, "walk");
            }
        else if (bidirectional) {
            mark(curr.c - 1, curr.r, "belt", 1, true);
            mark(curr.c, curr.r, "walk");
            mark(curr.c + 1, curr.r, "belt", 3, true);
        } else {
            mark(curr.c, curr.r, "belt", 1, true);
            mark(curr.c + 1, curr.r, "walk");
        }
        if (i > 0 && i < path.length - 1 && fIn !== fOut) {
            const turn = turnDirection(fIn, fOut);
            if (axis === "ew")
                if (bidirectional) {
                    tubeCells.set(`${curr.c},${curr.r - 1}`, { kind: "belt", facing: fIn, rails: true, elbow: turn, exitFacing: fOut });
                    const revIn = (fIn + 2) % 4;
                    const revOut = (fOut + 2) % 4;
                    tubeCells.set(`${curr.c},${curr.r + 1}`, { kind: "belt", facing: revIn, rails: true, elbow: turnDirection(revOut, revIn), exitFacing: revOut });
                } else tubeCells.set(`${curr.c},${curr.r}`, { kind: "belt", facing: fIn, rails: true, elbow: turn, exitFacing: fOut });
            else if (bidirectional) {
                tubeCells.set(`${curr.c - 1},${curr.r}`, { kind: "belt", facing: fIn, rails: true, elbow: turn, exitFacing: fOut });
                const revIn = (fIn + 2) % 4;
                const revOut = (fOut + 2) % 4;
                tubeCells.set(`${curr.c + 1},${curr.r}`, { kind: "belt", facing: revIn, rails: true, elbow: turnDirection(revOut, revIn), exitFacing: revOut });
            } else tubeCells.set(`${curr.c},${curr.r}`, { kind: "belt", facing: fIn, rails: true, elbow: turn, exitFacing: fOut });
        }
    }
}
/**
 * @param {Uint8Array} floor
 * @param {number} cols
 * @param {number} rows
 * @param {number} originCol
 * @param {number} originRow
 */
function railsFromFloorMask(floor, cols, rows, originCol, originRow) {
    /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }[]} */
    const rails = [];
    /** @param {number} c @param {number} r @param {number} side */
    const push = (c, r, side) => rails.push({ col: c + originCol, row: r + originRow, side, heightLevel: 1, thicknessLevel: 1 });
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (floor[idx(cols, c, r)] !== 1) continue;
            if (r === 0 || floor[idx(cols, c, r - 1)] === 0) push(c, r, 0);
            if (c + 1 >= cols || floor[idx(cols, c + 1, r)] === 0) push(c, r, 1);
            if (r + 1 >= rows || floor[idx(cols, c, r + 1)] === 0) push(c, r, 2);
            if (c === 0 || floor[idx(cols, c - 1, r)] === 0) push(c, r, 3);
        }
    return rails;
}
/**
 * @param {Map<string, { kind: string, facing?: number, rails?: boolean, elbow?: "left" | "right", exitFacing?: number }>} tubeCells
 * @param {number} originCol
 * @param {number} originRow
 */
function beltsFromTubeCells(tubeCells, originCol, originRow) {
    /** @type {{ col: number, row: number, kind: number, facingIndex: number }[]} */
    const belts = [];
    for (const [key, cell] of tubeCells) {
        if (cell.kind !== "belt" || cell.facing === undefined) continue;
        const [c, r] = key.split(",").map(Number);
        const col = c + originCol;
        const row = r + originRow;
        if (cell.elbow && cell.exitFacing !== undefined) belts.push({ col, row, kind: elbowKind(cell.facing, cell.elbow, cell.rails === true), facingIndex: cell.facing });
        else belts.push({ col, row, kind: cell.rails ? FLOOR_CELL_KIND.BeltRails : FLOOR_CELL_KIND.Belt, facingIndex: cell.facing });
    }
    return belts;
}
/**
 * Procedural hamster-network: CA cave mass + room graph + belt tubes (one-way / two-way).
 *
 * @param {{ seed?: number, roomCount?: number, gridCols?: number, gridRows?: number }} [options]
 */
export function buildSandboxBeltNetworkSceneDoc(options = {}) {
    const seed = options.seed ?? (Date.now() * 2654435761) >>> 0;
    const rng = seededRandom(seed);
    const cols = options.gridCols ?? 88;
    const rows = options.gridRows ?? 64;
    const roomCount = options.roomCount ?? 10;
    const cell = 16;
    const half = cell * 0.5;
    const originCol = -((cols / 2) | 0);
    const originRow = -((rows / 2) | 0);
    const rooms = placeRooms(rng, cols, rows, roomCount);
    if (rooms.length < 4) throw new Error("Belt network gen failed to place enough rooms");
    const edges = buildRoomGraph(rooms, rng);
    /** 0 = wall, 1 = floor */
    const ca = generateCellularAutomataGrid(cols, rows, { fillChance: 0.43, iterations: 4 });
    const floor = new Uint8Array(cols * rows);
    for (let i = 0; i < floor.length; i++) floor[i] = ca[i] === 0 ? 1 : 0;
    for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        for (let r = room.r0; r <= room.r1; r++) for (let c = room.c0; c <= room.c1; c++) floor[idx(cols, c, r)] = 1;
    }
    /** @type {Map<string, { kind: "walk" | "belt", facing?: number, rails?: boolean, elbow?: "left" | "right", exitFacing?: number }>} */
    const tubeCells = new Map();
    for (let i = 0; i < edges.length; i++) {
        const { a, b, bidirectional } = edges[i];
        const from = roomPortal(rooms[a], rooms[b]);
        const to = roomPortal(rooms[b], rooms[a]);
        const path = manhattanPath(from, to);
        carveTube(floor, cols, rows, path, bidirectional, tubeCells);
        spurBeltIntoRoom(floor, cols, rows, rooms[a], from, a === 0 ? 5 : 3, tubeCells);
        spurBeltIntoRoom(floor, cols, rows, rooms[b], to, b === 0 ? 5 : 3, tubeCells);
    }
    const railWalls = railsFromFloorMask(floor, cols, rows, originCol, originRow);
    const floorBelts = beltsFromTubeCells(tubeCells, originCol, originRow);
    const start = rooms[0];
    /** @param {number} c @param {number} r */
    const at = (c, r) => ({ x: (c + originCol) * cell + half, y: (r + originRow) * cell + half });
    /** @type {{ type: string, x: number, y: number, facing: number, faction: string }[]} */
    const props = [{ type: "blue_ball", ...at(start.centerC, start.centerR), facing: 0, faction: "alpha" }];
    for (let i = 1; i < Math.min(rooms.length, 4); i++) {
        const room = rooms[i];
        const types = ["beach_ball", "barrel", "blue_ball"];
        props.push({ type: types[(i - 1) % types.length], ...at(room.centerC, room.centerR), facing: 0, faction: "alpha" });
    }
    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize: cell,
        origin: { minX: -1200, minY: -1200 },
        cols: 150,
        rows: 150,
        voxels: [],
        railWalls,
        forcefields: [],
        portals: [],
        floorBelts,
        powerSources: [],
        props,
        meta: { generator: "beltNetwork", seed, roomCount: rooms.length, edgeCount: edges.length },
    };
}
