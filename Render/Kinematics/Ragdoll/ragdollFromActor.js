import { normalizeAngle } from "../../../Libraries/Math/Angle.js";
import { normalizeVector } from "../../../Libraries/Math/Vec2.js";
import { createImpactProfile } from "./RagdollConfig.js";
import { initializeRagdoll } from "./RagdollPhysics.js";
import { applyDeathSevers } from "./RagdollGore.js";

export function createObstacleWallChecker(state) {
    const grid = state?.flowFieldGrid;
    if (!grid) return null;
    return (worldX, worldY) => {
        const { col, row } = grid.worldToGrid(worldX, worldY);
        if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return true;
        return grid.grid[row * grid.cols + col] !== 0;
    };
}

export function resolveDeathImpact(actor, event) {
    let dirX = Math.cos(actor.angle ?? 0);
    let dirY = Math.sin(actor.angle ?? 0);
    let power = 10;

    if (event?.projectile) {
        dirX = Math.cos(event.projectile.angle);
        dirY = Math.sin(event.projectile.angle);
        power = Math.max(8, (event.projectile.speed ?? 100) * 0.04);
    } else if (event?.type === "blast" && event.explosion) {
        const dx = actor.x - event.explosion.x;
        const dy = actor.y - event.explosion.y;
        const blastDir = normalizeVector(dx, dy);
        if (blastDir.len > 0) {
            dirX = blastDir.x;
            dirY = blastDir.y;
        }
        power = 14;
    }

    return createImpactProfile(dirX, dirY, power);
}

/**
 * @param {object} rigData - from captureActorRigForRagdoll
 * @param {number} rotation
 * @param {object} impactProfile
 * @param {object} config
 * @param {object} rig
 */
export function createRagdollState(rigData, rotation, impactProfile, config, rig) {
    const bodyOffset = config.BODY_OFFSET ?? Math.PI;
    const bRot = rotation + bodyOffset;
    const cos = Math.cos(-bRot);
    const sin = Math.sin(-bRot);
    const localForceX = impactProfile.force.x * cos - impactProfile.force.z * sin;
    const localForceZ = impactProfile.force.x * sin + impactProfile.force.z * cos;
    const localImpact = { ...impactProfile, force: { x: localForceX, y: impactProfile.force.y, z: localForceZ } };
    const ragdoll = initializeRagdoll(rigData, normalizeAngle(rotation), localImpact, config, rig);
    ragdoll.rotation = normalizeAngle(rotation);
    applyDeathSevers(ragdoll, impactProfile.sever, rig, impactProfile.hitBone);
    return ragdoll;
}
