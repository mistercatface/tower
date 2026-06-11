import { drawPropAttachedButton, drawPropButtonDebugLink, getPropButtonPosition, hasPropButton, hitPropButton } from "../propAttachedButton.js";
export const PROP_BUTTON_BEHAVIOR_ID = "propButton";
/**
 * @typedef {object} PropButtonTrigger
 * @property {(pickup: object) => void} onPress
 * @property {(pickup: object) => boolean} [isPressed]
 */
/**
 * @param {{ triggers?: Record<string, PropButtonTrigger> }} [options]
 * @returns {import("../createSandboxController.js").SandboxBehavior}
 */
export function createPropButtonBehavior({ triggers = {} } = {}) {
    /** @param {object} pickup */
    const resolvePressed = (pickup) => {
        const trigger = pickup.sandboxButton?.trigger;
        const handler = trigger ? triggers[trigger] : null;
        return handler?.isPressed?.(pickup) ?? Boolean(pickup._propButtonHeld);
    };
    /** @param {object} pickup */
    const fireTrigger = (pickup) => {
        const trigger = pickup.sandboxButton?.trigger;
        if (!trigger) return;
        const handler = triggers[trigger];
        if (!handler) {
            console.warn(`prop button trigger "${trigger}" has no handler`);
            return;
        }
        pickup._propButtonHeld = true;
        handler.onPress(pickup);
    };
    return {
        id: PROP_BUTTON_BEHAVIOR_ID,
        supports: () => false,
        tryCanvasInput(world, _e, host) {
            const pickups = host.getPickups();
            for (let i = pickups.length - 1; i >= 0; i--) {
                const pickup = pickups[i];
                if (pickup.isDead || !hasPropButton(pickup)) continue;
                if (!hitPropButton(pickup, world.x, world.y)) continue;
                fireTrigger(pickup);
                return true;
            }
            return false;
        },
        tickWorld(_dt, host) {
            const pickups = host.getPickups();
            for (let i = 0; i < pickups.length; i++) {
                const pickup = pickups[i];
                if (pickup.isDead || !hasPropButton(pickup)) continue;
                if (!resolvePressed(pickup)) pickup._propButtonHeld = false;
            }
        },
        drawWorldOverlay(ctx, host) {
            const pickups = host.getPickups();
            for (let i = 0; i < pickups.length; i++) {
                const pickup = pickups[i];
                if (pickup.isDead || !hasPropButton(pickup)) continue;
                drawPropButtonDebugLink(ctx, pickup);
                const pos = getPropButtonPosition(pickup);
                if (!pos) continue;
                drawPropAttachedButton(ctx, pos.x, pos.y, resolvePressed(pickup), pickup.sandboxButton.radius);
            }
        },
        onPointerDown: () => false,
        onPointerMove() {},
        onPointerUp() {},
        reset() {},
    };
}
