import { generateLabRailMaze } from "../../Apps/Editor/world/mapWorld.js";
import { spawnPlacedSandboxProp } from "../Sandbox/sandboxPlacedSpawn.js";
import { setSandboxCameraTarget } from "../Sandbox/sandboxCameraTarget.js";
import { syncLabViewportZoomUi } from "../../Apps/Editor/ui/labViewport.js";
import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { pickNavWalkableCell } from "../Procedural/Mazes/walkableCells.js";
export const GAME_LAUNCHERS = { snake: { title: "Snake", hideEditor: false } };
export function parseGameLaunchQuery(search = window.location.search) {
    const game = new URLSearchParams(search).get("game");
    return game || null;
}
async function runSnakeLaunch(state, ctx) {
    // 1. Generate Maze with Pool Table Felt
    state.editor.railMazeConfig.edgeThickness = 4;
    state.editor.railMazeConfig.wallHeightLevel = 1;
    state.editor.railMazeConfig.surfaceProfileId = "poolTableFelt";
    await generateLabRailMaze(state);
    // Sync navigation topology so it matches the generated rail maze
    await state.nav.commitEdit(null, { fullNavSync: true });
    // 2. Spawn and Select Boid Triangle
    const x = state.viewport.x;
    const y = state.viewport.y;
    const boid = spawnPlacedSandboxProp(state, x, y, "boid_triangle", "alpha");
    ctx.boid = boid;
    if (state.sandbox?.controller?.session) {
        state.sandbox.controller.session.select({ kind: "prop", ids: [boid.id] });
        state.sandbox.controller.session.sync();
    }
    // Spawn 30 Red Boids set to always be in explore mode
    const count = 30;
    const boundsConfig = state.editor.railMazeConfig;
    const entityMeta = getSandboxEntityMeta(state);
    for (let i = 0; i < count; i++) {
        const redCell = pickNavWalkableCell(state, Math.random, boundsConfig);
        const pos = redCell ? state.obstacleGrid.gridToWorld(redCell.col, redCell.row) : { x: x + (Math.random() - 0.5) * 128, y: y + (Math.random() - 0.5) * 128 };
        const redBoid = spawnPlacedSandboxProp(state, pos.x, pos.y, "boid_triangle", "bravo", 0, undefined, { tint: "#ff3366" });
        redBoid.alwaysExplore = true;
        entityMeta.setActiveBehaviorId(redBoid.id, "explore");
    }
    // 3. Focus Camera and Zoom to 2.0
    setSandboxCameraTarget(state, boid, true);
    state.viewport.zoom = 2.0;
    syncLabViewportZoomUi(state);
    state.viewport.snapTo(boid.x, boid.y);
    // 4. Set Shadows to Full
    state.losShadowStrength = 1.0;
    if (typeof document !== "undefined") {
        const shadowSlider = document.getElementById("editorShadowSlider");
        const shadowValue = document.getElementById("editorShadowValue");
        if (shadowSlider && shadowValue) {
            shadowSlider.value = "100";
            shadowValue.textContent = "100%";
        }
    }
    // 5. Lock Selection
    state.editor.lockSelection = true;
}
/** @param {object} state @param {object} launcher @param {{ playbackHandlers?: import("../Playback/speedControl.js").PlaybackHandlers }} [launchOptions] */
export async function runGameLaunch(state, launcher, launchOptions = {}) {
    const ctx = {};
    if (launcher.setup) state.appLaunch.session = await launcher.setup(state, launchOptions);
    if (state.appLaunch?.id === "snake") await runSnakeLaunch(state, ctx);
    // Refresh world caches
    await state.nav.commitEdit(null, { fullNavSync: true });
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
    return ctx;
}
