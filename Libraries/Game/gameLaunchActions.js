import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { setSandboxCameraTarget } from "../Sandbox/sandboxCameraTarget.js";
import { spawnPlacedSandboxProp } from "../Sandbox/sandboxPlacedSpawn.js";
import { generateLabRailMaze } from "../../Apps/Editor/world/mapWorld.js";
import { syncLabViewportZoomUi } from "../../Apps/Editor/ui/labViewport.js";
/** @typedef {{ cameraTarget?: object, boid?: object }} GameLaunchContext */
export function lockSelectionAction(state) {
    state.editor.lockSelection = true;
}
/** @param {object} state */
export async function refreshWorldAfterGameLaunch(state) {
    await state.nav.commitEdit(null, { fullNavSync: true });
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}
export async function generateRailMazeAction(state) {
    state.editor.railMazeConfig.edgeThickness = 4;
    state.editor.railMazeConfig.wallHeightLevel = 1;
    state.editor.railMazeConfig.surfaceProfileId = "poolTableFelt";
    await generateLabRailMaze(state);
}
export function spawnBoidTriangleAction(state, ctx) {
    const x = state.viewport.x;
    const y = state.viewport.y;
    const boid = spawnPlacedSandboxProp(state, x, y, "boid_triangle", "neutral");
    ctx.boid = boid;
    if (state.sandbox?.controller?.session) {
        state.sandbox.controller.session.select({ kind: "prop", ids: [boid.id] });
        state.sandbox.controller.session.sync();
    }
}
export function focusBoidTriangleAction(state, ctx) {
    const boid = ctx.boid;
    if (boid) {
        setSandboxCameraTarget(state, boid, true);
        state.viewport.zoom = 2.0;
        syncLabViewportZoomUi(state);
        state.viewport.snapTo(boid.x, boid.y);
    }
}
export function setShadowsFullAction(state) {
    state.losShadowStrength = 1.0;
    if (typeof document !== "undefined") {
        const shadowSlider = document.getElementById("editorShadowSlider");
        const shadowValue = document.getElementById("editorShadowValue");
        if (shadowSlider && shadowValue) {
            shadowSlider.value = "100";
            shadowValue.textContent = "100%";
        }
    }
}
