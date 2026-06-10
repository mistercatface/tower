import { applyCueStrikeCollision } from "../../CueStick/cueStrikeCollision.js";
import { buildCueStrikeAimLineContext, getCueStrikeAimLine } from "../../CueStick/cueStrikeAimPreview.js";
import { getPoolCellSize, POOL_CUE_STRIKE, POOL_TABLE_COLS, POOL_TABLE_ROWS } from "../poolConfig.js";
import { getPropAsset } from "../../Props/PropCatalog.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
import { createDragLaunchAim, drawDragLaunchPreview, releaseDragLaunch, updateDragLaunchAim } from "../dragLaunch.js";
import { evaluateInputGates } from "../inputGates.js";
export const CUE_STRIKE_BEHAVIOR_ID = "cueStrike";
const CUE_STRIKE_DEFAULTS = POOL_CUE_STRIKE;
/** @param {object | null | undefined} asset */
function getCueStrikeConfig(asset) {
    const entry = asset?.sandbox?.cueStrike;
    const overrides = entry === true ? {} : entry && typeof entry === "object" ? entry : {};
    return { ...CUE_STRIKE_DEFAULTS, ...overrides };
}
/** @param {object} pickup */
function cueStrikeTableBounds(pickup) {
    if (!pickup?.sandboxPoolTableId) return {};
    const cellSize = getPoolCellSize();
    return { tableWidth: POOL_TABLE_COLS * cellSize, tableHeight: POOL_TABLE_ROWS * cellSize };
}
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createCueStrikeBehavior() {
    /** @type {import("../dragLaunch.js").DragLaunchAim | null} */
    let aim = null;
    const configFor = (pickup) => getCueStrikeConfig(getPropAsset(pickup?.type));
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
            const aimLineContext = state ? buildCueStrikeAimLineContext(pickup, state, cueStrikeTableBounds(pickup)) : null;
            drawDragLaunchPreview(ctx, aim, configFor(pickup), aimLineContext, getCueStrikeAimLine);
        },
        reset() {
            aim = null;
        },
    };
}
