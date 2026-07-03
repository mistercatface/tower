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
    const boid = spawnPlacedSandboxProp(state, x, y, "boid_triangle", "neutral");
    ctx.boid = boid;
    if (state.sandbox?.controller?.session) {
        state.sandbox.controller.session.select({ kind: "prop", ids: [boid.id] });
        state.sandbox.controller.session.sync();
    }
    // Spawn 2 Red Boids set to always be in explore mode
    const boundsConfig = state.editor.railMazeConfig;
    const redCell1 = pickNavWalkableCell(state, Math.random, boundsConfig);
    const redCell2 = pickNavWalkableCell(state, Math.random, boundsConfig);
    const pos1 = redCell1 ? state.obstacleGrid.gridToWorld(redCell1.col, redCell1.row) : { x: x - 64, y: y - 64 };
    const pos2 = redCell2 ? state.obstacleGrid.gridToWorld(redCell2.col, redCell2.row) : { x: x + 64, y: y + 64 };
    const redBoid1 = spawnPlacedSandboxProp(state, pos1.x, pos1.y, "boid_triangle", "neutral", 0, undefined, { tint: "#ff3366" });
    const redBoid2 = spawnPlacedSandboxProp(state, pos2.x, pos2.y, "boid_triangle", "neutral", 0, undefined, { tint: "#ff3366" });
    redBoid1.alwaysExplore = true;
    redBoid2.alwaysExplore = true;
    const entityMeta = getSandboxEntityMeta(state);
    entityMeta.setActiveBehaviorId(redBoid1.id, "explore");
    entityMeta.setActiveBehaviorId(redBoid2.id, "explore");
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
