import { wakePushableBody } from "../../../Motion/pushableSleep.js";

const DEFAULT_DEPTH = 24;
const DEFAULT_PULL = 200;
const DEFAULT_CAPTURED_PULL = 500;
const DEFAULT_DURATION_MS = 1500;

/** @type {import("../zoneHandlers.js").ZoneHandler} */
export const voidZoneHandler = {
    onEnter(victim, emitter, zone, _state) {
        wakePushableBody(victim);
        victim.changeState("zoneAffected", {
            zoneKind: "void",
            emitterId: emitter.id,
            zoneRadius: zone.radius ?? emitter.radius ?? 8,
            depth: zone.depth ?? DEFAULT_DEPTH,
            pull: zone.pull ?? DEFAULT_PULL,
            capturedPull: zone.capturedPull ?? DEFAULT_CAPTURED_PULL,
            captured: false,
            effectTimer: zone.durationMs ?? DEFAULT_DURATION_MS,
        });
        victim.elevation = 0;
        victim.elevationVelocity = 0;
        victim.opacity = 1;
    },
    tick(victim, emitter, effect, dt, state) {
        if (!emitter || emitter.isDead) {
            voidZoneHandler.onComplete(victim, emitter, effect, state);
            return;
        }
        const dtSec = dt / 1000;
        effect.effectTimer -= dt;
        const captured = effect.captured ?? false;
        const depth = effect.depth ?? DEFAULT_DEPTH;
        const zoneRadius = effect.zoneRadius ?? emitter.radius ?? 8;
        const dx = emitter.x - victim.x;
        const dy = emitter.y - victim.y;
        const dist = Math.hypot(dx, dy);
        const captureThreshold = zoneRadius * 0.65;
        if (dist <= captureThreshold) effect.captured = true;
        if (!effect.captured && victim.elevation > -6 && dist > zoneRadius) {
            voidZoneHandler.onExit(victim, emitter, effect, state);
            return;
        }
        const gravity = captured ? -600 : -350;
        victim.elevationVelocity = (victim.elevationVelocity ?? 0) + gravity * dtSec;
        victim.elevation = (victim.elevation ?? 0) + victim.elevationVelocity * dtSec;
        const radius = victim.radius ?? 8;
        const fadeStart = -radius;
        const fadeEnd = -depth;
        if (victim.elevation > fadeStart) victim.opacity = 1;
        else victim.opacity = Math.max(0, Math.min(1, 1 - (victim.elevation - fadeStart) / (fadeEnd - fadeStart)));
        if (dist > 0.001) {
            const pull = captured ? (effect.capturedPull ?? DEFAULT_CAPTURED_PULL) : (effect.pull ?? DEFAULT_PULL);
            victim.vx += (dx / dist) * pull * dtSec;
            victim.vy += (dy / dist) * pull * dtSec;
        }
        const friction = captured ? 8 : 3.5;
        const damping = Math.exp(-friction * dtSec);
        victim.vx *= damping;
        victim.vy *= damping;
        if (victim.elevation <= -depth || effect.effectTimer <= 0) voidZoneHandler.onComplete(victim, emitter, effect, state);
    },
    onExit(victim, _emitter, _effect, _state) {
        victim.changeState("normal");
    },
    onComplete(victim, _emitter, _effect, _state) {
        victim.changeState("normal");
        victim.isDead = true;
    },
};
