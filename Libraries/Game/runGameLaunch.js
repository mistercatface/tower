import { fitTileLabStageZoom, GAME_MODE_ZOOM_MULTIPLIER } from "../Viewport/tileLabViewportLimits.js";
import { focusBlueBallAction, refreshWorldAfterGameLaunch, snapCameraToTargetAction, stampBeltCratePuzzleAction } from "./gameLaunchActions.js";
/** @typedef {import("./gameLaunchActions.js").GameLaunchContext} GameLaunchContext */
/** @type {Record<string, (state: object, ctx: GameLaunchContext) => void | Promise<void>>} */
const GAME_LAUNCH_ACTIONS = {
    stampBeltCratePuzzle: stampBeltCratePuzzleAction,
    focusBlueBall: focusBlueBallAction,
    snapCameraToTarget: snapCameraToTargetAction,
    fitPlayViewport: (state) => {
        fitTileLabStageZoom(state.viewport, GAME_MODE_ZOOM_MULTIPLIER);
    },
};
/** @param {object} state @param {import("./gameLaunchers.js").GameLauncher} launcher */
export async function runGameLaunch(state, launcher) {
    /** @type {GameLaunchContext} */
    const ctx = {};
    if (launcher.setup) {
        state.appLaunch.session = await launcher.setup(state);
        if (state.appLaunch.session?.cameraTarget) ctx.cameraTarget = state.appLaunch.session.cameraTarget;
    }
    const actions = launcher.actions ?? [];
    for (let i = 0; i < actions.length; i++) {
        const actionId = actions[i];
        const action = GAME_LAUNCH_ACTIONS[actionId];
        if (!action) throw new Error(`Unknown game launch action: ${actionId}`);
        await action(state, ctx);
    }
    await refreshWorldAfterGameLaunch(state);
    return ctx;
}
