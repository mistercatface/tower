import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "./sandboxSceneSnapshot.js";
/** Preconfigured sandbox start scene (copy/paste snapshot). */
export function buildSandboxStartSceneDoc() {
    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize: 16,
        origin: { minX: -1200, minY: -1200 },
        cols: 150,
        rows: 150,
        voxels: [],
        railWalls: [],
        forcefields: [
            { col: 4, row: -1, side: 1, mode: "solid" },
            { col: 3, row: 0, side: 0, mode: "solid" },
            { col: 4, row: 0, side: 0, mode: "solid" },
            { col: 5, row: 0, side: 0, mode: "solid" },
            { col: 6, row: 0, side: 0, mode: "solid" },
            { col: 7, row: 0, side: 0, mode: "solid" },
            { col: 8, row: 0, side: 0, mode: "solid" },
            { col: 8, row: 0, side: 1, mode: "solid" },
            { col: 9, row: 0, side: 0, mode: "solid" },
            { col: 10, row: 0, side: 0, mode: "solid" },
            { col: 11, row: 0, side: 0, mode: "solid" },
            { col: 8, row: 1, side: 1, mode: "solid" },
            { col: 8, row: 2, side: 0, mode: "solid" },
            { col: 8, row: 2, side: 1, mode: "solid" },
            { col: 1, row: 3, side: 0, mode: "solid" },
            { col: 1, row: 3, side: 1, mode: "solid" },
            { col: 2, row: 3, side: 0, mode: "solid" },
            { col: 3, row: 3, side: 0, mode: "solid" },
            { col: 4, row: 3, side: 0, mode: "solid" },
            { col: 5, row: 3, side: 0, mode: "solid" },
            { col: 6, row: 3, side: 0, mode: "solid" },
            { col: 7, row: 3, side: 0, mode: "solid" },
            { col: 8, row: 3, side: 0, mode: "solid" },
        ],
        portals: [
            { col: 4, row: -2, side: 1, accessMode: "both", partnerKey: 4294967308 },
            { col: 12, row: 0, side: 0, accessMode: "both", partnerKey: 8589803524 },
        ],
        floorBelts: [],
        powerSources: [{ col: 0, row: 3, defaultPowered: true }],
        props: [{ type: "blue_ball", x: 0, y: 0, facing: 0, faction: "alpha" }],
    };
}
/** Replace the current sandbox with the preconfigured start scene. */
export function spawnSandboxStartScene(state) {
    applySandboxSceneSnapshot(state, buildSandboxStartSceneDoc());
}
