import { SURFACE_PROFILE_ID } from "../../../Config/procedural/profileIds.js";
import { initTileLabWorld } from "../world/mapWorld.js";
import { mountGameSandbox } from "../world/gameSandbox.js";
import { fitTileLabStageZoom, GAME_MODE_ZOOM_MULTIPLIER } from "../../../Libraries/Viewport/tileLabViewportLimits.js";
import { runGameLaunch } from "../../../Libraries/Game/runGameLaunch.js";
import { drawLabFrame, mountLabFrameRefresh, pushEditorProfile, repaintUntilBakesDone, applyLabWorldRenderMode, setLabVignetteEnabled, markLabViewDirty } from "./preview.js";
import { seedRuntimeLabProfile } from "./profile/ProfileEditor.js";
import { fitGameCanvasToStage, mountGameViewport } from "./gameViewport.js";
import { WORLD_RENDER_CONTROLS_HTML } from "./shellHtml.js";
import { bindVectorPropsToolbar, bindWorldRenderModeToolbar, syncWorldRenderModeUi } from "./toolbar.js";
const GAME_SHELL_HTML = `
<div class="game-shell">
    <div class="game-toolbar toolbar">${WORLD_RENDER_CONTROLS_HTML}</div>
    <div id="gameStage" class="game-stage">
        <div class="game-stage-inner"></div>
    </div>
</div>
`;
function tryLockPortraitOrientation(enabled) {
    if (!enabled) return;
    const lock = screen.orientation?.lock;
    if (typeof lock !== "function") return;
    lock.call(screen.orientation, "portrait-primary").catch(() => {});
}
/** @param {import("../state.js").TileLabGameState} state @param {import("../../../Libraries/Game/gameLaunchers.js").GameLauncher} launcher */
export async function mountGameShell(state, launcher) {
    const uiRoot = document.getElementById("ui-root");
    uiRoot.innerHTML = GAME_SHELL_HTML;
    const stageInner = document.querySelector("#gameStage .game-stage-inner");
    const canvas = document.getElementById("gameCanvas");
    stageInner.appendChild(canvas);
    state.editor.canvas = canvas;
    state.editor.ctx = canvas.getContext("2d");
    state.editor.ctx.imageSmoothingEnabled = false;
    state.editor.showMapOverview = false;
    state.editor.showAnimationPreview = false;
    applyLabWorldRenderMode(state);
    setLabVignetteEnabled(true);
    bindVectorPropsToolbar(state, markLabViewDirty);
    bindWorldRenderModeToolbar(state, () => applyLabWorldRenderMode(state));
    syncWorldRenderModeUi(state);
    mountLabFrameRefresh(canvas);
    seedRuntimeLabProfile(SURFACE_PROFILE_ID.poolTableFelt);
    await pushEditorProfile(state);
    mountGameViewport(state, () => resizeGameShell(state));
    tryLockPortraitOrientation(launcher.lockPortraitOrientation);
    const syncCanvas = () => {
        fitGameCanvasToStage(state);
        fitTileLabStageZoom(state.viewport, GAME_MODE_ZOOM_MULTIPLIER);
        drawLabFrame(state);
    };
    syncCanvas();
    await initTileLabWorld(state);
    mountGameSandbox(state);
    await runGameLaunch(state, launcher);
    syncCanvas();
    repaintUntilBakesDone(state);
}
/** @param {import("../state.js").TileLabGameState} state */
export function resizeGameShell(state) {
    if (!fitGameCanvasToStage(state)) return;
    fitTileLabStageZoom(state.viewport, GAME_MODE_ZOOM_MULTIPLIER);
}
