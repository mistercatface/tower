import { SURFACE_PROFILE_ID } from "../../../Config/procedural/profileIds.js";
import { initTileLabWorld } from "../world/mapWorld.js";
import { mountGameSandbox } from "../world/gameSandbox.js";
import { runGameLaunch } from "../../../Libraries/Game/runGameLaunch.js";
import { drawLabFrame, mountLabFrameRefresh, pushEditorProfile, repaintUntilBakesDone, applyLabWorldRenderMode, setLabVignetteEnabled } from "./preview.js";
import { seedRuntimeLabProfile } from "./profile/ProfileEditor.js";
import { fitGameCanvasToStage, fitGameStageToView, mountGameViewport } from "./gameViewport.js";
const GAME_SHELL_HTML = `
<div id="gameStage" class="game-stage">
    <div class="game-stage-inner"></div>
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
    state.editor.showMapOverview = false;
    state.editor.showAnimationPreview = false;
    applyLabWorldRenderMode(state);
    setLabVignetteEnabled(true);
    mountLabFrameRefresh(canvas);
    seedRuntimeLabProfile(SURFACE_PROFILE_ID.tomatoGarden);
    await pushEditorProfile(state);
    mountGameViewport(state);
    tryLockPortraitOrientation(launcher.lockPortraitOrientation);
    const syncCanvas = () => {
        fitGameCanvasToStage(state);
        fitGameStageToView(state);
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
    fitGameCanvasToStage(state);
    fitGameStageToView(state);
}
