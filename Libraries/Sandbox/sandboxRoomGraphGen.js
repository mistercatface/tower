const SANDBOX_SCENE_SCHEMA_VERSION = 7;
const MIN_ROOMS = 4;
/** @param {number} seed */
function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
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
    for (let attempt = 0; attempt < 1200 && rooms.length < count; attempt++) {
        const w = 8 + ((rng() * 6) | 0);
        const h = 8 + ((rng() * 6) | 0);
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
/** @param {{ centerC: number, centerR: number }[]} rooms @param {() => number} rng */
function buildBranchingRoomTree(rooms, rng) {
    const n = rooms.length;
    /** @type {{ a: number, b: number }[]} */
    const edges = [];
    const inTree = new Uint8Array(n);
    inTree[0] = 1;
    for (let k = 1; k < n; k++) {
        /** @type {number[]} */
        const outside = [];
        for (let j = 0; j < n; j++) if (!inTree[j]) outside.push(j);
        const j = outside[(rng() * outside.length) | 0];
        /** @type {{ i: number, d: number }[]} */
        const parents = [];
        for (let i = 0; i < n; i++) {
            if (!inTree[i]) continue;
            parents.push({ i, d: manhattan(rooms[i].centerC, rooms[i].centerR, rooms[j].centerC, rooms[j].centerR) });
        }
        parents.sort((a, b) => a.d - b.d);
        const pick = parents[Math.min((rng() * Math.min(3, parents.length)) | 0, parents.length - 1)];
        inTree[j] = 1;
        edges.push({ a: pick.i, b: j });
    }
    return edges;
}
/** Travel 0=E,1=S,2=W,3=N — which side of `room` faces `target`. */
function socketSideToward(room, target) {
    const dx = target.centerC - room.centerC;
    const dy = target.centerR - room.centerR;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
    return dy > 0 ? 2 : 0;
}
/**
 * Directed tree edge: parent `a` → child `b`.
 *
 * @param {{ centerC: number, centerR: number, c0: number, r0: number, c1: number, r1: number }[]} rooms
 * @param {number} a
 * @param {number} b
 */
function directedEdge(rooms, a, b) {
    const parent = rooms[a];
    const child = rooms[b];
    const parentSide = socketSideToward(parent, child);
    const childSide = socketSideToward(child, parent);
    const travel = parentSide === 1 ? 0 : parentSide === 3 ? 2 : parentSide === 2 ? 1 : 3;
    return { a, b, travel, parentSocket: parentSide, childSocket: childSide, parentPortal: portalCell(parent, child), childPortal: portalCell(child, parent) };
}
/** @param {{ c0: number, r0: number, c1: number, r1: number, centerC: number, centerR: number }} room @param {{ centerC: number, centerR: number }} target */
function portalCell(room, target) {
    const side = socketSideToward(room, target);
    if (side === 1) return { c: room.c1, r: room.centerR };
    if (side === 3) return { c: room.c0, r: room.centerR };
    if (side === 2) return { c: room.centerC, r: room.r1 };
    return { c: room.centerC, r: room.r0 };
}
/**
 * Room box outlines. Door gaps at graph portals (3 cells wide).
 *
 * @param {{ c0: number, r0: number, c1: number, r1: number }[]} rooms
 * @param {{ parentPortal: { c: number, r: number }, childPortal: { c: number, r: number } }[]} graphEdges
 * @param {number} originCol
 * @param {number} originRow
 */
function roomOutlineWalls(rooms, graphEdges, originCol, originRow) {
    /** @type {Set<string>} */
    const open = new Set();
    for (let i = 0; i < graphEdges.length; i++) {
        const e = graphEdges[i];
        stampPortalGap(open, e.parentPortal, socketSideToward(rooms[e.a], rooms[e.b]));
        stampPortalGap(open, e.childPortal, socketSideToward(rooms[e.b], rooms[e.a]));
    }
    /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }[]} */
    const walls = [];
    /** @param {number} c @param {number} r @param {number} side */
    const push = (c, r, side) => {
        const key = `${c},${r},${side}`;
        if (open.has(key)) return;
        walls.push({ col: c + originCol, row: r + originRow, side, heightLevel: 1, thicknessLevel: 1 });
    };
    for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        for (let c = room.c0; c <= room.c1; c++) {
            push(c, room.r0, 0);
            push(c, room.r1, 2);
        }
        for (let r = room.r0; r <= room.r1; r++) {
            push(room.c0, r, 3);
            push(room.c1, r, 1);
        }
    }
    return walls;
}
/** @param {Set<string>} open @param {{ c: number, r: number }} portal @param {number} outwardSide 0=N,1=E,2=S,3=W */
function stampPortalGap(open, portal, outwardSide) {
    const half = 1;
    if (outwardSide === 1 || outwardSide === 3) {
        for (let dr = -half; dr <= half; dr++) open.add(`${portal.c},${portal.r + dr},${outwardSide}`);
        return;
    }
    for (let dc = -half; dc <= half; dc++) open.add(`${portal.c + dc},${portal.r},${outwardSide}`);
}
const ROOM_PROP_TYPES = ["blue_ball", "beach_ball", "barrel"];
/**
 * Step 1 — non-overlapping rooms + branching directed tree. No belts yet.
 *
 * @param {{ seed?: number, roomCount?: number, gridCols?: number, gridRows?: number }} [options]
 */
export function buildSandboxRoomGraphSceneDoc(options = {}) {
    let seed = options.seed ?? (Date.now() * 2654435761) >>> 0;
    const gridCols = options.gridCols ?? 88;
    const gridRows = options.gridRows ?? 64;
    const roomCount = options.roomCount ?? 8;
    const cell = 16;
    const half = cell * 0.5;
    const originCol = -((gridCols / 2) | 0);
    const originRow = -((gridRows / 2) | 0);
    /** @type {{ id: number, c0: number, r0: number, c1: number, r1: number, centerC: number, centerR: number }[]} */
    let rooms = [];
    /** @type {{ a: number, b: number }[]} */
    let treeEdges = [];
    for (let attempt = 0; attempt < 60; attempt++) {
        const rng = seededRandom(seed + attempt);
        rooms = placeRooms(rng, gridCols, gridRows, roomCount);
        if (rooms.length < MIN_ROOMS) continue;
        treeEdges = buildBranchingRoomTree(rooms, rng);
        seed = seed + attempt;
        break;
    }
    if (rooms.length < MIN_ROOMS) throw new Error("Room graph gen failed — could not place enough rooms");
    const graphEdges = treeEdges.map(({ a, b }) => directedEdge(rooms, a, b));
    const railWalls = roomOutlineWalls(rooms, graphEdges, originCol, originRow);
    /** @param {number} c @param {number} r */
    const at = (c, r) => ({ x: (c + originCol) * cell + half, y: (r + originRow) * cell + half });
    /** @type {{ type: string, x: number, y: number, facing: number, faction: string }[]} */
    const props = [];
    for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        props.push({ type: ROOM_PROP_TYPES[i % ROOM_PROP_TYPES.length], ...at(room.centerC, room.centerR), facing: 0, faction: "alpha" });
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
        floorBelts: [],
        powerSources: [],
        props,
        meta: { generator: "roomGraph", seed, rooms: rooms.map((r) => ({ id: r.id, c0: r.c0, c1: r.c1, r0: r.r0, r1: r.c1, centerC: r.centerC, centerR: r.centerR })), edges: graphEdges },
    };
}
