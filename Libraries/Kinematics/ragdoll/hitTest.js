/** Bone hit tests for ragdoll corpses (2D gameplay, rig-local space). */
import { closestPointOnLineSegment } from "../../Math/Segment2D.js";
import { distance } from "../../Math/Vec3.js";
import { getRagdollCollisionPoints, absRagdollPoint } from "./physics.js";
function distToSegmentXZ(p, v, w) {
    const closest = closestPointOnLineSegment(p.x, p.z, v.x, v.z, w.x, w.z);
    return { dist: Math.hypot(p.x - closest.x, p.z - closest.y), t: closest.t };
}
function buildRagdollBones(points, constraints, rig) {
    const bones = [];
    if (points.head) bones.push({ id: "head", type: "sphere", p1: points.head, radius: rig.headR });
    for (const c of constraints) {
        const p1 = points[c.a];
        const p2 = points[c.b];
        if (!p1 || !p2) continue;
        let r = rig.armL1 * 0.25;
        const nameCheck = `${c.a}${c.b}`;
        if (nameCheck.includes("spine")) r = rig.torsoHalfWidth;
        else if (/hip|knee|foot|leg/i.test(nameCheck)) r = rig.legL1 * 0.3;
        else if (/arm|shoulder|elbow|hand/i.test(nameCheck)) r = rig.armL1 * 0.3;
        r *= 2.2;
        bones.push({ id: `${c.a}_${c.b}`, type: "capsule", aName: c.a, bName: c.b, p1, p2, radius: r });
    }
    return bones;
}
function worldToRigLocal(corpse, worldX, worldY) {
    const { config, rig, displayDiameter } = corpse.kinematicsCtx;
    const bodyOffset = config.BODY_OFFSET ?? Math.PI;
    const rotation = -(corpse.ragdoll.rotation + bodyOffset);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const dx = worldX - corpse.x;
    const dy = worldY - corpse.y;
    const rigToWorld = (displayDiameter * 0.5) / rig.size;
    const scale = 1 / rigToWorld;
    return { x: (dx * cos - dy * sin) * scale, z: (dx * sin + dy * cos) * scale, y: rig.groundY * 0.55, rigToWorld };
}
/**
 * @returns {{ part: string, offsetT: number } | null}
 */
export function checkRagdollHit(corpse, worldX, worldY, projectileRadius = 2) {
    if (!corpse?.ragdoll?.points) return null;
    const broad = corpse.radius + projectileRadius + 6;
    if (Math.hypot(worldX - corpse.x, worldY - corpse.y) > broad) return null;
    const { rig } = corpse.kinematicsCtx;
    const local = worldToRigLocal(corpse, worldX, worldY);
    const hitRadiusScale = projectileRadius * (rig.size / corpse.radius) * 0.35;
    const bones = buildRagdollBones(getRagdollCollisionPoints(corpse.ragdoll), corpse.ragdoll.constraints, rig);
    for (const bone of bones) {
        const effectiveRadius = bone.radius + hitRadiusScale;
        if (bone.type === "sphere") {
            const dist = distance(local, bone.p1);
            if (dist < effectiveRadius) return { part: bone.id, offsetT: 0 };
            continue;
        }
        const { dist, t } = distToSegmentXZ(local, bone.p1, bone.p2);
        if (dist < effectiveRadius) {
            const part = t < 0.5 ? bone.aName : bone.bName;
            return { part, offsetT: t };
        }
    }
    return null;
}
export function ragdollPartToWorld(corpse, partName) {
    const p = absRagdollPoint(corpse.ragdoll, partName);
    if (!p) return { x: corpse.x, y: corpse.y };
    const { config, rig, displayDiameter } = corpse.kinematicsCtx;
    const rot = corpse.ragdoll.rotation + (config.BODY_OFFSET ?? Math.PI);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const rigToWorld = (displayDiameter * 0.5) / rig.size;
    return { x: corpse.x + (p.x * cos - p.z * sin) * rigToWorld, y: corpse.y + (p.x * sin + p.z * cos) * rigToWorld };
}
