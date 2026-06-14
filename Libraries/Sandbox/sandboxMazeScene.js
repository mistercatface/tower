import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "./sandboxSceneSnapshot.js";
const BELT = 1;
const ELBOW_L = 2;
const ELBOW_R = 3;
/** @param {number} col @param {number} row @param {number} facingIndex */
function belt(col, row, facingIndex) {
    return { col, row, kind: BELT, facingIndex: ((facingIndex % 4) + 4) % 4 };
}
/** @param {number} col @param {number} row @param {"left" | "right"} turn @param {number} facingIndex */
function elbow(col, row, turn, facingIndex) {
    return { col, row, kind: turn === "left" ? ELBOW_L : ELBOW_R, facingIndex: ((facingIndex % 4) + 4) % 4 };
}
/** @param {{ col: number, row: number, kind: number, facingIndex: number }[]} out @param {number} col @param {number} row @param {number} facing @param {number} length */
function straight(out, col, row, facing, length) {
    const dc = facing === 0 ? 1 : facing === 2 ? -1 : 0;
    const dr = facing === 1 ? 1 : facing === 3 ? -1 : 0;
    for (let i = 0; i < length; i++) out.push(belt(col + dc * i, row + dr * i, facing));
}
/** @param {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }[]} out */
function rail(out, col, row, side) {
    out.push({ col, row, side, heightLevel: 1, thicknessLevel: 1 });
}
/** @param {Set<string>} skip `"col,row,side"` */
function perimeter(out, c0, r0, c1, r1, skip = new Set()) {
    for (let c = c0; c <= c1; c++) {
        if (!skip.has(`${c},${r0},0`)) rail(out, c, r0, 0);
        if (!skip.has(`${c},${r1},2`)) rail(out, c, r1, 2);
    }
    for (let r = r0; r <= r1; r++) {
        if (!skip.has(`${c0},${r},3`)) rail(out, c0, r, 3);
        if (!skip.has(`${c1},${r},1`)) rail(out, c1, r, 1);
    }
}
/** @param {number} c @param {number} r0 @param {number} r1 @param {Set<number>} [skipRows] */
function vSegment(out, c, r0, r1, skipRows = new Set()) {
    for (let r = r0; r <= r1; r++) if (!skipRows.has(r)) rail(out, c, r, 1);
}
/** @param {number} r @param {number} c0 @param {number} c1 @param {Set<number>} [skipCols] */
function hSegment(out, r, c0, c1, skipCols = new Set()) {
    for (let c = c0; c <= c1; c++) if (!skipCols.has(c)) rail(out, c, r, 2);
}
const DOOR = new Set([-1, 0, 1]);
/**
 * Belt test floor — open hub, four wings, real conveyor networks.
 * Belt rows are dedicated; rows ±1 (and more) stay open for pathing.
 */
export function buildSandboxMazeSceneDoc() {
    const cell = 16;
    const half = cell * 0.5;
    const W0 = -26;
    const W1 = 26;
    const H0 = -18;
    const H1 = 18;
    /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }[]} */
    const railWalls = [];
    /** @type {{ col: number, row: number, kind: number, facingIndex: number }[]} */
    const floorBelts = [];
    perimeter(railWalls, W0, H0, W1, H1, new Set([`${W0},0,3`, `${W1},0,1`]));
    // Hub ring — 15×15 open center with four 3-wide gates.
    for (let c = -7; c <= 7; c++)
        if (!DOOR.has(c)) {
            rail(railWalls, c, -7, 0);
            rail(railWalls, c, 7, 2);
        }
    for (let r = -7; r <= 7; r++)
        if (!DOOR.has(r)) {
            rail(railWalls, -7, r, 3);
            rail(railWalls, 7, r, 1);
        }
    // Wing bulkheads — leave the trunk corridor (row ±3) and hub gates open.
    vSegment(railWalls, -9, -17, -4);
    vSegment(railWalls, -9, 4, 17);
    vSegment(railWalls, 9, -17, -4);
    vSegment(railWalls, 9, 4, 17);
    hSegment(railWalls, -9, -25, -10);
    hSegment(railWalls, -9, 10, 25);
    hSegment(railWalls, 9, -25, -10);
    hSegment(railWalls, 9, 10, 25);
    // NE loop pen — three sides; south side open to feed belts through.
    hSegment(railWalls, -11, 11, 24);
    vSegment(railWalls, 24, -16, -11);
    for (let r = -16; r <= -12; r++) rail(railWalls, 11, r, 3);
    // ── Main trunk (eastbound row 0). Walk rows ±1 and ±2. ──
    straight(floorBelts, W0 + 1, 0, 0, W1 - W0 - 1);
    // ── West intake: upper merge + return loop ──
    straight(floorBelts, -24, -4, 0, 14);
    floorBelts.push(elbow(-10, -4, "left", 0));
    straight(floorBelts, -10, -5, 1, 6);
    floorBelts.push(elbow(-10, 1, "right", 1));
    straight(floorBelts, -9, 1, 0, 8);
    straight(floorBelts, -9, 4, 2, 15);
    floorBelts.push(elbow(-24, 4, "right", 2));
    straight(floorBelts, -24, 5, 1, 4);
    floorBelts.push(elbow(-24, 9, "left", 1));
    straight(floorBelts, -23, 9, 0, 5);
    // ── East: fork north to loop + south to counterflow ──
    straight(floorBelts, 10, -4, 0, 12);
    floorBelts.push(elbow(22, -4, "left", 0));
    straight(floorBelts, 22, -5, 1, 3);
    floorBelts.push(elbow(22, -2, "right", 1));
    straight(floorBelts, 23, -2, 0, 2);
    straight(floorBelts, 12, 4, 0, 10);
    floorBelts.push(elbow(22, 4, "right", 0));
    straight(floorBelts, 22, 5, 1, 4);
    // ── NE circulation loop ──
    straight(floorBelts, 12, -16, 0, 10);
    floorBelts.push(elbow(22, -16, "right", 0));
    straight(floorBelts, 22, -15, 1, 5);
    floorBelts.push(elbow(22, -10, "left", 1));
    straight(floorBelts, 21, -10, 2, 9);
    floorBelts.push(elbow(12, -10, "left", 2));
    straight(floorBelts, 12, -11, 3, 4);
    floorBelts.push(elbow(12, -15, "right", 3));
    // ── North spurs (walk on cols ±11 / ±13) ──
    straight(floorBelts, -12, -16, 1, 8);
    floorBelts.push(elbow(-12, -8, "right", 1));
    straight(floorBelts, -11, -8, 0, 4);
    straight(floorBelts, 14, -16, 1, 6);
    floorBelts.push(elbow(14, -10, "left", 1));
    straight(floorBelts, 15, -10, 0, 3);
    // ── SE counterflow bench ──
    straight(floorBelts, 11, 11, 0, 12);
    straight(floorBelts, 11, 12, 2, 12);
    straight(floorBelts, 11, 13, 0, 12);
    floorBelts.push(elbow(23, 13, "right", 0));
    straight(floorBelts, 23, 14, 1, 2);
    floorBelts.push(elbow(23, 16, "left", 1));
    straight(floorBelts, 22, 16, 2, 10);
    // ── SW pocket line ──
    straight(floorBelts, -24, 12, 0, 8);
    floorBelts.push(elbow(-16, 12, "left", 0));
    straight(floorBelts, -16, 13, 1, 3);
    floorBelts.push(elbow(-16, 16, "right", 1));
    straight(floorBelts, -15, 16, 0, 6);
    /** @param {number} c @param {number} r */
    const at = (c, r) => ({ x: c * cell + half, y: r * cell + half });
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
        props: [
            { type: "blue_ball", x: at(-25, 0).x, y: at(-25, 0).y, facing: 0, faction: "alpha" },
            { type: "beach_ball", x: at(0, 0).x, y: at(0, 0).y, facing: 0, faction: "alpha" },
            { type: "barrel", x: at(20, -14).x, y: at(20, -14).y, facing: 0, faction: "alpha" },
            { type: "blue_ball", x: at(-20, 12).x, y: at(-20, 12).y, facing: 0, faction: "alpha" },
            { type: "beach_ball", x: at(18, 12).x, y: at(18, 12).y, facing: 0, faction: "alpha" },
        ],
    };
}
/** Replace the current sandbox with the belt test floor. */
export function spawnSandboxMazeScene(state) {
    applySandboxSceneSnapshot(state, buildSandboxMazeSceneDoc());
}
