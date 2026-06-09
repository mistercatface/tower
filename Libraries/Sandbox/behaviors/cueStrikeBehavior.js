import { applyCueStrikeCollision } from "../../CueStick/cueStrikeCollision.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
import {
    buildDragLaunchAimLineContext,
    createDragLaunchAim,
    drawDragLaunchPreview,
    releaseDragLaunch,
    updateDragLaunchAim,
} from "../dragLaunch.js";

export const CUE_STRIKE_BEHAVIOR_ID = "cueStrike";

const CUE_STRIKE_DEFAULTS = { minDrag: 2, maxPull: 38, pullScale: 0.5, minPower: 8, maxPower: 600 };

/** @param {object | null | undefined} asset */
function getCueStrikeConfig(asset) {
    const entry = asset?.sandbox?.cueStrike;
    const overrides = entry === true ? {} : entry && typeof entry === "object" ? entry : {};
    return { ...CUE_STRIKE_DEFAULTS, ...overrides };
}

/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createCueStrikeBehavior() {
    /** @type {import("../dragLaunch.js").DragLaunchAim | null} */
    let aim = null;
    const configFor = (pickup) => getCueStrikeConfig(getPropAsset(pickup?.type));
    return {
        id: CUE_STRIKE_BEHAVIOR_ID,
        onPointerDown(pickup, world) {
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
            drawDragLaunchPreview(ctx, aim, configFor(pickup), buildDragLaunchAimLineContext(pickup, host));
        },
        reset() {
            aim = null;
        },
    };
}
