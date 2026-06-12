import { wakePushableBody } from "../Libraries/Motion/pushableSleep.js";
import { resolveVoidSinkDrawModifier } from "../Libraries/Render/voidSinkVisual.js";
import { canEntityFitVoidPit, isInsideVoidMouth, isVoidSinkCaptured } from "../Libraries/Spatial/zones/pit.js";
const DEFAULT_PULL = 200;
const DEFAULT_CAPTURED_PULL = 500;
/** Backup despawn timer — only runs after capture, while the fall animation plays. */
export const CAPTURED_SINK_DURATION_MS = 800;
const SINK_ANIMATION_SEC = 0.45;
export class WorldPropVoidSinkState {
    blocksSleep() {
        return true;
    }
    onEnter(prop) {
        wakePushableBody(prop);
        prop.voidSinkZ = 0;
        if (prop.voidCaptured) prop.voidSinkTimer = prop.voidSinkTimer ?? CAPTURED_SINK_DURATION_MS;
        else delete prop.voidSinkTimer;
    }
    onExit(prop) {
        delete prop.voidCaptured;
        delete prop.voidX;
        delete prop.voidY;
        delete prop.voidRadius;
        delete prop.voidDepth;
        delete prop.voidSinkTimer;
        delete prop.voidSinkZ;
        delete prop.voidCaptureTolerance;
    }
    /** @param {object} prop @param {object} viewport @returns {import("../Libraries/Render/spriteDrawModifier.js").SpriteDrawModifier | null} */
    resolveSpriteDrawModifier(prop, viewport) {
        return resolveVoidSinkDrawModifier(prop, viewport);
    }
    update(prop, dt, _walls, state) {
        const voidX = prop.voidX;
        const voidY = prop.voidY;
        if (voidX == null || voidY == null) {
            prop.changeState("normal");
            return;
        }
        const dtSec = dt / 1000;
        const voidRadius = prop.voidRadius;
        const voidDepth = prop.voidDepth;
        const dx = voidX - prop.x;
        const dy = voidY - prop.y;
        const dist = Math.hypot(dx, dy);
        if (!canEntityFitVoidPit(voidRadius, prop)) {
            prop.changeState("normal");
            return;
        }
        if (isVoidSinkCaptured(voidX, voidY, voidRadius, prop, prop.voidCaptureTolerance))
            if (!prop.voidCaptured) {
                prop.voidCaptured = true;
                prop.voidSinkTimer = CAPTURED_SINK_DURATION_MS;
                prop.voidSinkZ = 0;
            }
        if (!prop.voidCaptured && !isInsideVoidMouth(voidX, voidY, voidRadius, prop)) {
            prop.changeState("normal");
            return;
        }
        if (prop.voidCaptured) {
            const sinkSpeed = voidDepth / SINK_ANIMATION_SEC;
            prop.voidSinkZ = Math.min(voidDepth, (prop.voidSinkZ ?? 0) + sinkSpeed * dtSec);
            prop.voidSinkTimer = (prop.voidSinkTimer ?? CAPTURED_SINK_DURATION_MS) - dt;
            if (prop.voidSinkZ >= voidDepth || prop.voidSinkTimer <= 0) {
                prop.changeState("normal");
                prop.isDead = true;
                return;
            }
        }
        if (dist > 0.001) {
            const pull = prop.voidCaptured ? DEFAULT_CAPTURED_PULL : DEFAULT_PULL;
            prop.vx += (dx / dist) * pull * dtSec;
            prop.vy += (dy / dist) * pull * dtSec;
        }
        const friction = prop.voidCaptured ? 14 : 3.5;
        const damping = Math.exp(-friction * dtSec);
        prop.vx *= damping;
        prop.vy *= damping;
    }
}
export const voidSinkWorldPropStates = { voidSink: new WorldPropVoidSinkState() };
