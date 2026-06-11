import { applyCueStrikeCollision } from "../../CueStick/cueStrikeCollision.js";
import { buildCueStrikeAimLineContext, getCueStrikeAimLine } from "../../CueStick/cueStrikeAimPreview.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { createDragLaunchInteraction, DRAG_LAUNCH_DEFAULTS } from "../dragLaunch.js";
import { evaluateInputGates } from "../inputGates.js";
import { resolvePickupSandboxBehavior } from "../sandboxBehaviorConfig.js";
export const CUE_STRIKE_BEHAVIOR_ID = "cueStrike";
/** @param {object} pickup @param {object | null | undefined} asset */
function getCueStrikeConfig(pickup, asset) {
    return { ...DRAG_LAUNCH_DEFAULTS, ...resolvePickupSandboxBehavior(pickup, asset, "cueStrike") };
}
/** @param {object} pickup @param {import("../SandboxHostPort.js").SandboxHostPort} host */
function cueStrikeTableBounds(pickup, host) {
    const groupId = pickup?.sandboxGroupId;
    if (!groupId) return {};
    const state = host.getWorldState();
    const instance = state.sandboxAssemblyInstances.find((entry) => entry.id === groupId);
    if (!instance) return {};
    return { tableWidth: instance.arenaWidth, tableHeight: instance.arenaHeight };
}
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createCueStrikeBehavior() {
    return createDragLaunchInteraction({
        id: CUE_STRIKE_BEHAVIOR_ID,
        getConfig: (pickup) => getCueStrikeConfig(pickup, getPropAsset(pickup?.type)),
        canStart(pickup, _world, host) {
            return evaluateInputGates(CUE_STRIKE_BEHAVIOR_ID, pickup, getPropAsset(pickup?.type), host).allowed;
        },
        onLaunch(pickup, shot) {
            applyCueStrikeCollision(pickup, shot);
        },
        buildAimLineContext(pickup, host) {
            const state = host.getWorldState?.();
            return state ? buildCueStrikeAimLineContext(pickup, state, cueStrikeTableBounds(pickup, host)) : null;
        },
        resolveAimLine: getCueStrikeAimLine,
    });
}
