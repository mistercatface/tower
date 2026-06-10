import { applyCueStrikeCollision } from "../../CueStick/cueStrikeCollision.js";
import { buildCueStrikeAimLineContext, getCueStrikeAimLine } from "../../CueStick/cueStrikeAimPreview.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
import { createDragLaunchAim, drawDragLaunchPreview, releaseDragLaunch, updateDragLaunchAim, DRAG_LAUNCH_DEFAULTS } from "../dragLaunch.js";
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
    /** @type {import("../dragLaunch.js").DragLaunchAim | null} */
    let aim = null;
    const configFor = (pickup) => getCueStrikeConfig(pickup, getPropAsset(pickup?.type));
    return {
        id: CUE_STRIKE_BEHAVIOR_ID,
        onPointerDown(pickup, world, _e, host) {
            const asset = getPropAsset(pickup?.type);
            if (host && !evaluateInputGates(CUE_STRIKE_BEHAVIOR_ID, pickup, asset, host).allowed) return false;
            wakePushableBody(pickup);
            aim = createDragLaunchAim(pickup.x, pickup.y, world.x, world.y);
            updateDragLaunchAim(aim, world.x, world.y, configFor(pickup));
            return true;
        },
        onPointerMove(_pickup, world) {
            if (!aim?.active) return;
            updateDragLaunchAim(aim, world.x, world.y, configFor(_pickup));
        },
        onPointerUp(pickup) {
            if (!aim?.active) return;
            const shot = releaseDragLaunch(aim, configFor(pickup));
            aim = null;
            if (!shot) return;
            applyCueStrikeCollision(pickup, shot);
        },
        drawOverlay(ctx, pickup, host) {
            if (!aim?.active) return;
            const state = host.getWorldState?.();
            const aimLineContext = state ? buildCueStrikeAimLineContext(pickup, state, cueStrikeTableBounds(pickup, host)) : null;
            drawDragLaunchPreview(ctx, aim, configFor(pickup), aimLineContext, getCueStrikeAimLine);
        },
        reset() {
            aim = null;
        },
    };
}
