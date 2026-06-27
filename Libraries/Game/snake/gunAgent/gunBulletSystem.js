import { Entity } from "../../../../Entities/Entity.js";
import { CircleShape } from "../../../Spatial/collision/Shapes.js";
import { wakeKineticBody } from "../../../Motion/kineticSleep.js";
import { integratePropMotion } from "../../../Props/propMotion.js";
import { kineticPairBodiesAt } from "../../../Spatial/collision/kineticPairStream.js";
import { canFracturePropSplit } from "../../../Props/propFracture.js";
import { kineticDynamicSlab } from "../../../Spatial/collision/kineticBodySlab.js";
export class Projectile extends Entity {
    constructor() {
        super(0, 0, 0, false);
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;
        this.radius = 0.75;
        this.mass = 0.125;
        this.strategy = { isKinetic: true, rolls: false, mass: 0.125, friction: 0, propPixelSize: 1.5 };
        this._gunBullet = true;
        this._armed = true;
        this._lifetimeMs = 0;
        this.isSleeping = false;
        this._sleepFrames = 0;
        this._neighborsFrameId = -1;
        this._neighbors = [];
        this._activeSlot = -1;
        this.shape = new CircleShape(this.radius);
    }
    getCustomSpriteCacheKey() {
        return this.faction ?? "";
    }
    get angle() {
        return this.facing ?? 0;
    }
    set angle(val) {
        this.facing = val;
    }
    needsWallCollision() {
        return true;
    }
    update(dtMs) {
        this._lifetimeMs = (this._lifetimeMs ?? 0) + dtMs;
        integratePropMotion(this, dtMs);
    }
}
const projectilePool = [];
const MAX_PROJECTILES = 512;
for (let i = 0; i < MAX_PROJECTILES; i++) projectilePool.push(new Projectile());
export function spawnGunBulletProjectile(state, shooterInstance, angle, weapon) {
    const shooter = shooterInstance.head;
    const spawnDist = weapon.spawnDist ?? 4.5;
    const muzzleX = shooter.x + Math.cos(angle) * spawnDist;
    const muzzleY = shooter.y + Math.sin(angle) * spawnDist;
    const bulletSpeed = weapon.bulletSpeed ?? 160;
    const vx = Math.cos(angle) * bulletSpeed;
    const vy = Math.sin(angle) * bulletSpeed;
    let proj = projectilePool.pop();
    if (!proj) throw new Error("Projectile pool exhausted! Bounded pool size: " + MAX_PROJECTILES);
    proj.x = muzzleX;
    proj.y = muzzleY;
    proj.vx = vx;
    proj.vy = vy;
    proj.angularVelocity = 0;
    proj.facing = angle;
    proj.faction = shooter.faction;
    proj._shooterHeadId = shooterInstance.headId;
    proj._armed = true;
    proj._lifetimeMs = 0;
    proj.isDead = false;
    proj.isSleeping = false;
    proj._sleepFrames = 0;
    proj._neighborsFrameId = -1;
    if (proj._neighbors) proj._neighbors.length = 0;
    proj._activeSlot = -1;
    proj._wallResolvedFrame = null;
    proj._wallResolvedCollided = false;
    proj._wallResolveHits = null;
    delete proj._physId;
    if (!state.projectiles) state.projectiles = [];
    state.projectiles.push(proj);
    state.entityRegistry.register("projectile", proj);
    wakeKineticBody(proj);
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame?.activeGunBulletIds) snakeGame.activeGunBulletIds.push(proj.id);
    return proj;
}
export function releaseProjectile(state, proj) {
    state.entityRegistry.unregister(proj);
    if (state.projectiles) {
        const idx = state.projectiles.indexOf(proj);
        if (idx >= 0) state.projectiles.splice(idx, 1);
    }
    if (projectilePool.indexOf(proj) === -1) projectilePool.push(proj);
}
export function tickGunBullets(state, dtMs) {
    const snakeGame = state.sandbox.snakeGame;
    if (!snakeGame || !snakeGame.activeGunBulletIds) return;
    const activeIds = snakeGame.activeGunBulletIds;
    const grid = state.obstacleGrid;
    const minX = grid?.minX ?? 0;
    const maxX = grid?.maxX ?? 2400;
    const minY = grid?.minY ?? 0;
    const maxY = grid?.maxY ?? 2400;
    for (let i = activeIds.length - 1; i >= 0; i--) {
        const id = activeIds[i];
        const bullet = state.entityRegistry.getLive(id);
        if (!bullet) {
            activeIds[i] = activeIds[activeIds.length - 1];
            activeIds.pop();
            continue;
        }
        const speedSq = bullet.vx * bullet.vx + bullet.vy * bullet.vy;
        const maxLifetime = 3000;
        const speedThresholdSq = 50 * 50;
        const outOfBounds = bullet.x < minX || bullet.x > maxX || bullet.y < minY || bullet.y > maxY;
        const hitWall = !!(bullet._wallResolvedCollided || bullet._wallResolveHits?.length);
        if (!bullet._armed || bullet._lifetimeMs > maxLifetime || speedSq < speedThresholdSq || outOfBounds || hitWall) {
            bullet._armed = false;
            activeIds[i] = activeIds[activeIds.length - 1];
            activeIds.pop();
            releaseProjectile(state, bullet);
        }
    }
}
function setBodyVelocity(body, vx, vy, w = null) {
    body.vx = vx;
    body.vy = vy;
    if (w !== null) body.angularVelocity = w;
    const physId = body._physId;
    if (physId !== undefined && physId !== -1) {
        kineticDynamicSlab.vx[physId] = vx;
        kineticDynamicSlab.vy[physId] = vy;
        if (w !== null) kineticDynamicSlab.w[physId] = w;
    }
}
export function resolveGunBulletContacts(state, spatialFrame, contacts) {
    if (contacts.count === 0) return;
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        const isBulletA = !!(bodyA && bodyA._gunBullet && bodyA._armed);
        const isBulletB = !!(bodyB && bodyB._gunBullet && bodyB._armed);
        if (!isBulletA && !isBulletB) continue;
        const bullet = isBulletA ? bodyA : bodyB;
        const victim = isBulletA ? bodyB : bodyA;
        if (!victim) continue;
        const victimInstance = state.sandbox.snakeGame.instancesByMemberId.get(victim.id);
        if (victimInstance?.headId === bullet._shooterHeadId) continue;
        const isDebris = victim.type === "snake_shard" || victim.type === "wall_voxel_chunk" || victim.type === "wall_rail_chunk" || (victim.strategy?.fracture && !canFracturePropSplit(victim));
        if (isDebris) {
            bullet._armed = true;
            const preVx = isBulletA ? contacts.dynamic.preVxA[i] : contacts.dynamic.preVxB[i];
            const preVy = isBulletA ? contacts.dynamic.preVyA[i] : contacts.dynamic.preVyB[i];
            setBodyVelocity(bullet, preVx, preVy);
        } else {
            if (victimInstance?.lifecycle === "alive") {
                const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
                const deathImpact = { worldX: victim.x, worldY: victim.y, impactForce: relSpeed, struckSegmentId: victim.id, spatialFrame };
                victimInstance.die(state, deathImpact);
            }
            bullet._armed = false;
        }
    }
}
