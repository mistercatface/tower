import { applyCueStrikeCollision } from "../../CueStick/cueStrikeCollision.js";
import { buildCueStrikeAimLineContext, getCueStrikeAimLine } from "../../CueStick/cueStrikeAimPreview.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { createDragLaunchInteraction, DRAG_LAUNCH_DEFAULTS } from "../dragLaunch.js";
import { evaluateInputGates } from "../inputGates.js";
import { resolveWorldPropSandboxBehavior } from "../sandboxBehaviorConfig.js";
export const CUE_STRIKE_BEHAVIOR_ID = "cueStrike";
/** @param {object} prop @param {object} asset */
function getCueStrikeConfig(prop, asset) {
    return { ...DRAG_LAUNCH_DEFAULTS, ...resolveWorldPropSandboxBehavior(prop, asset, "cueStrike") };
}
/** @param {object} prop @param {import("../SandboxHostPort.js").SandboxHostPort} host */
function cueStrikeTableBounds(prop, host) {
    const state = host.getWorldState();
    const instance = state.sandboxAssemblyInstances.find((entry) => entry.id === prop.sandboxGroupId);
    if (!instance) throw new Error(`Cue strike prop has no assembly instance (${prop.sandboxGroupId})`);
    return { tableWidth: instance.arenaWidth, tableHeight: instance.arenaHeight };
}
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createCueStrikeBehavior() {
    return createDragLaunchInteraction({
        id: CUE_STRIKE_BEHAVIOR_ID,
        getConfig: (prop) => getCueStrikeConfig(prop, getPropAsset(prop.type)),
        canStart(prop, _world, host) {
            return evaluateInputGates(CUE_STRIKE_BEHAVIOR_ID, prop, getPropAsset(prop.type), host).allowed;
        },
        onLaunch(prop, shot) {
            applyCueStrikeCollision(prop, shot);
        },
        buildAimLineContext(prop, host) {
            return buildCueStrikeAimLineContext(prop, host.getWorldState(), cueStrikeTableBounds(prop, host));
        },
        resolveAimLine: getCueStrikeAimLine,
    });
}
