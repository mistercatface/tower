export class PickupSinkingState {
    blocksSleep() {
        return true;
    }
    get disablePhysics() {
        return false;
    }
    get disableWallCollision() {
        return false;
    }
    onEnter(pickup) {
        pickup.elevation = 0;
        pickup.elevationVelocity = 0;
    }
    onExit(pickup) {
        pickup.elevation = 0;
        pickup.elevationVelocity = 0;
        pickup.opacity = 1.0;
        delete pickup.sinkingCaptured;
        delete pickup.tableCenterX;
        delete pickup.tableCenterY;
    }
    update(pickup, dt, walls, state) {
        const captured = pickup.sinkingCaptured ?? false;
        const gravity = captured ? -600 : -350;
        pickup.elevationVelocity = (pickup.elevationVelocity ?? 0) + gravity * (dt / 1000);
        pickup.elevation = (pickup.elevation ?? 0) + pickup.elevationVelocity * (dt / 1000);
        const radius = pickup.radius ?? 8;
        const pocketDepth = pickup.pocketDepth ?? 24;
        const fadeStart = -radius;
        const fadeEnd = -pocketDepth;
        if (pickup.elevation > fadeStart) pickup.opacity = 1.0;
        else pickup.opacity = Math.max(0, Math.min(1.0, 1.0 - (pickup.elevation - fadeStart) / (fadeEnd - fadeStart)));
        if (pickup.pocketX != null && pickup.pocketY != null) {
            const dx = pickup.pocketX - pickup.x;
            const dy = pickup.pocketY - pickup.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.001) {
                const pullForce = captured ? 500 : 200;
                pickup.vx += (dx / dist) * pullForce * (dt / 1000);
                pickup.vy += (dy / dist) * pullForce * (dt / 1000);
            }
        }
        if (captured && pickup.pocketX != null && pickup.pocketY != null && pickup.tableCenterX != null && pickup.tableCenterY != null) {
            const dx = pickup.pocketX - pickup.x;
            const dy = pickup.pocketY - pickup.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.001) {
                const pbx = pickup.x - pickup.pocketX;
                const pby = pickup.y - pickup.pocketY;
                const tcX = pickup.tableCenterX - pickup.pocketX;
                const tcY = pickup.tableCenterY - pickup.pocketY;
                const isTableSide = pbx * tcX + pby * tcY > 0;
                const toCenterX = dx / dist;
                const toCenterY = dy / dist;
                const isMovingAway = pickup.vx * toCenterX + pickup.vy * toCenterY < 0;
                if (isTableSide && isMovingAway) {
                    pickup.vx *= 0.05;
                    pickup.vy *= 0.05;
                }
            }
        }
        const friction = captured ? 8.0 : 3.5;
        const dampingFactor = Math.exp(-friction * (dt / 1000));
        pickup.vx *= dampingFactor;
        pickup.vy *= dampingFactor;
    }
}
export const poolPickupStates = { sinking: new PickupSinkingState() };
