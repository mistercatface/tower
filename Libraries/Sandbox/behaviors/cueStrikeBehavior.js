import { applyCueStrikeCollision } from "../../CueStick/cueStrikeCollision.js";
import { buildCueStrikeAimLineContext, getCueStrikeAimLine } from "../../CueStick/cueStrikeAimPreview.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { createDragLaunchInteraction, DRAG_LAUNCH_DEFAULTS } from "../dragLaunch.js";
import { evaluateInputGates } from "../inputGates.js";
import { resolveWorldPropSandboxBehavior } from "../sandboxBehaviorConfig.js";
export const CUE_STRIKE_BEHAVIOR_ID = "cueStrike";
/** @param {object} state @param {object} prop @param {object} asset */
function getCueStrikeConfig(state, prop, asset) {
    return { ...DRAG_LAUNCH_DEFAULTS, ...resolveWorldPropSandboxBehavior(state, prop, asset, "cueStrike") };
}
/** @param {object} state @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createCueStrikeBehavior(state) {
    return createDragLaunchInteraction({
        id: CUE_STRIKE_BEHAVIOR_ID,
        getConfig: (prop) => getCueStrikeConfig(state, prop, getPropAsset(prop.type)),
        canStart(prop) {
            return evaluateInputGates(CUE_STRIKE_BEHAVIOR_ID, prop, getPropAsset(prop.type), state).allowed;
        },
        onLaunch(prop, shot) {
            applyCueStrikeCollision(prop, shot);
        },
        buildAimLineContext(prop) {
            return buildCueStrikeAimLineContext(prop, state);
        },
        resolveAimLine: getCueStrikeAimLine,
    });
}
