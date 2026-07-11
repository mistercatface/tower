import { SURFACE_PROFILE_ID } from "../../../Config/procedural/profileIds.js";
import { initTileLabWorld } from "../../../Libraries/Spatial/spatial.js";
import { mountGameSandbox } from "../world/gameSandbox.js";
import { fitPlayStageZoom } from "../../../Libraries/Viewport/tileLabViewportLimits.js";
import { runGameLaunch } from "../../../Libraries/Game/gameLaunch.js";
import { drawLabFrame, mountLabFrameRefresh, pushEditorProfile, repaintUntilBakesDone, applyLabWorldRenderMode, setLabVignetteEnabled } from "./preview.js";
import { seedRuntimeLabProfile } from "./profile/ProfileEditor.js";
import { fitGameCanvasToStage, mountGameViewport } from "./gameViewport.js";
import { WORLD_RENDER_MODE_FLAT2D } from "../../../Core/engineEnums.js";
const GAME_SHELL_HTML = `
<div class="game-shell">
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
/** @param {import("../state.js").TileLabGameState} state @param {import("../../../Libraries/Game/gameLaunchers.js").GameLauncher} launcher @param {{ playbackHandlers?: import("../../../Libraries/Playback/speedControl.js").PlaybackHandlers }} [options] */
export async function mountGameShell(state, launcher, { playbackHandlers } = {}) {
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
    state.worldRenderMode = WORLD_RENDER_MODE_FLAT2D;
    applyLabWorldRenderMode(state);
    setLabVignetteEnabled(true);
    mountLabFrameRefresh(canvas);
    seedRuntimeLabProfile(SURFACE_PROFILE_ID.poolTableFelt);
    await pushEditorProfile(state);
    mountGameViewport(state, () => resizeGameShell(state));
    tryLockPortraitOrientation(launcher.lockPortraitOrientation);
    const syncCanvas = () => {
        fitGameCanvasToStage(state);
        fitPlayStageZoom(state.viewport, state.appLaunch?.session);
        drawLabFrame(state);
    };
    syncCanvas();
    await initTileLabWorld(state);
    mountGameSandbox(state);
    await runGameLaunch(state, launcher, { playbackHandlers });
    syncCanvas();
    repaintUntilBakesDone(state);
}
/** @param {import("../state.js").TileLabGameState} state */
export function resizeGameShell(state) {
    if (!fitGameCanvasToStage(state)) return;
    fitPlayStageZoom(state.viewport, state.appLaunch?.session);
}
