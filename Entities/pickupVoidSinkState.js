import { wakePushableBody } from "../Libraries/Motion/pushableSleep.js";
import { resolveVoidSinkDrawModifier } from "../Libraries/Render/voidSinkVisual.js";
import { isInsideVoidMouth, isVoidSinkCaptured } from "../Libraries/Spatial/zones/pit.js";
const DEFAULT_PULL = 200;
const DEFAULT_CAPTURED_PULL = 500;
/** Backup despawn timer — only runs after capture, while the fall animation plays. */
export const CAPTURED_SINK_DURATION_MS = 800;
const SINK_ANIMATION_SEC = 0.45;
export class PickupVoidSinkState {
    blocksSleep() {
        return true;
    }
    onEnter(pickup) {
        wakePushableBody(pickup);
        pickup.voidSinkZ = 0;
        if (pickup.voidCaptured) pickup.voidSinkTimer = pickup.voidSinkTimer ?? CAPTURED_SINK_DURATION_MS;
        else delete pickup.voidSinkTimer;
    }
    onExit(pickup) {
        delete pickup.voidCaptured;
        delete pickup.voidX;
        delete pickup.voidY;
        delete pickup.voidRadius;
        delete pickup.voidDepth;
        delete pickup.voidSinkTimer;
        delete pickup.voidSinkZ;
        delete pickup.voidCaptureTolerance;
    }
    /** @param {object} pickup @param {object} viewport @returns {import("../Libraries/Render/spriteDrawModifier.js").SpriteDrawModifier | null} */
    resolveSpriteDrawModifier(pickup, viewport) {
        return resolveVoidSinkDrawModifier(pickup, viewport);
    }
    update(pickup, dt, _walls, state) {
        const voidX = pickup.voidX;
        const voidY = pickup.voidY;
        if (voidX == null || voidY == null) {
            pickup.changeState("normal");
            return;
        }
        const dtSec = dt / 1000;
        const voidRadius = pickup.voidRadius;
        const voidDepth = pickup.voidDepth;
        const dx = voidX - pickup.x;
        const dy = voidY - pickup.y;
        const dist = Math.hypot(dx, dy);
        if (isVoidSinkCaptured(voidX, voidY, voidRadius, pickup, pickup.voidCaptureTolerance))
            if (!pickup.voidCaptured) {
                pickup.voidCaptured = true;
                pickup.voidSinkTimer = CAPTURED_SINK_DURATION_MS;
                pickup.voidSinkZ = 0;
            }
        if (!pickup.voidCaptured && !isInsideVoidMouth(voidX, voidY, voidRadius, pickup)) {
            pickup.changeState("normal");
            return;
        }
        if (pickup.voidCaptured) {
            const sinkSpeed = voidDepth / SINK_ANIMATION_SEC;
            pickup.voidSinkZ = Math.min(voidDepth, (pickup.voidSinkZ ?? 0) + sinkSpeed * dtSec);
            pickup.voidSinkTimer = (pickup.voidSinkTimer ?? CAPTURED_SINK_DURATION_MS) - dt;
            if (pickup.voidSinkZ >= voidDepth || pickup.voidSinkTimer <= 0) {
                pickup.changeState("normal");
                pickup.isDead = true;
                return;
            }
        }
        if (dist > 0.001) {
            const pull = pickup.voidCaptured ? DEFAULT_CAPTURED_PULL : DEFAULT_PULL;
            pickup.vx += (dx / dist) * pull * dtSec;
            pickup.vy += (dy / dist) * pull * dtSec;
        }
        const friction = pickup.voidCaptured ? 14 : 3.5;
        const damping = Math.exp(-friction * dtSec);
        pickup.vx *= damping;
        pickup.vy *= damping;
    }
}
export const voidSinkPickupStates = { voidSink: new PickupVoidSinkState() };
