import { wakePushableBody } from "../Libraries/Motion/pushableSleep.js";
import { isInsideVoidMouth, voidMouthReach } from "../Libraries/Spatial/zones/voidZone.js";
const DEFAULT_PULL = 200;
const DEFAULT_CAPTURED_PULL = 500;
const DEFAULT_DURATION_MS = 1500;
export class PickupVoidSinkState {
    blocksSleep() {
        return true;
    }
    onEnter(pickup) {
        wakePushableBody(pickup);
        pickup.elevation = 0;
        pickup.elevationVelocity = 0;
        pickup.opacity = 1;
    }
    onExit(pickup) {
        pickup.elevation = 0;
        pickup.elevationVelocity = 0;
        pickup.opacity = 1;
        delete pickup.voidCaptured;
        delete pickup.voidX;
        delete pickup.voidY;
        delete pickup.voidRadius;
        delete pickup.voidDepth;
        delete pickup.voidSinkTimer;
    }
    update(pickup, dt, _walls, state) {
        const voidX = pickup.voidX;
        const voidY = pickup.voidY;
        if (voidX == null || voidY == null) {
            pickup.changeState("normal");
            return;
        }
        const dtSec = dt / 1000;
        pickup.voidSinkTimer = (pickup.voidSinkTimer ?? DEFAULT_DURATION_MS) - dt;
        const voidRadius = pickup.voidRadius;
        const voidDepth = pickup.voidDepth;
        const dx = voidX - pickup.x;
        const dy = voidY - pickup.y;
        const dist = Math.hypot(dx, dy);
        const mouthReach = voidMouthReach(voidRadius, pickup);
        const captureThreshold = mouthReach * 0.65;
        if (dist <= captureThreshold) pickup.voidCaptured = true;
        if (!pickup.voidCaptured && pickup.elevation > -6 && !isInsideVoidMouth(voidX, voidY, voidRadius, pickup)) {
            pickup.changeState("normal");
            return;
        }
        const gravity = pickup.voidCaptured ? -600 : -350;
        pickup.elevationVelocity = (pickup.elevationVelocity ?? 0) + gravity * dtSec;
        pickup.elevation = (pickup.elevation ?? 0) + pickup.elevationVelocity * dtSec;
        const radius = pickup.radius;
        const fadeStart = -radius;
        const fadeEnd = -voidDepth;
        if (pickup.elevation > fadeStart) pickup.opacity = 1;
        else pickup.opacity = Math.max(0, Math.min(1, 1 - (pickup.elevation - fadeStart) / (fadeEnd - fadeStart)));
        if (dist > 0.001) {
            const pull = pickup.voidCaptured ? DEFAULT_CAPTURED_PULL : DEFAULT_PULL;
            pickup.vx += (dx / dist) * pull * dtSec;
            pickup.vy += (dy / dist) * pull * dtSec;
        }
        const friction = pickup.voidCaptured ? 8 : 3.5;
        const damping = Math.exp(-friction * dtSec);
        pickup.vx *= damping;
        pickup.vy *= damping;
        if (pickup.elevation <= -voidDepth || pickup.voidSinkTimer <= 0) {
            pickup.changeState("normal");
            pickup.isDead = true;
            const idx = state.pickups.indexOf(pickup);
            if (idx >= 0) state.pickups.splice(idx, 1);
        }
    }
}
export const voidSinkPickupStates = { voidSink: new PickupVoidSinkState() };
