import { JOINT_TO_RIG_PATH, PHYSICS_BONES } from "./joints.js";
import { PHYSICS_BONE_ALIASES } from "./severing.js";

export function getRigPoint(rig, boneId) {
    const path = JOINT_TO_RIG_PATH[boneId];
    if (!path) return null;
    let node = rig;
    for (const key of path) {
        node = node?.[key];
        if (node == null) return null;
    }
    return node;
}

export function applyRigDeltas(rigData, deltas) {
    const point = (boneId) => {
        const base = getRigPoint(rigData, boneId);
        if (!base) return null;
        const d = deltas?.[boneId];
        return {
            x: base.x + (d?.x ?? 0),
            y: base.y + (d?.y ?? 0),
            z: base.z ?? 0,
        };
    };
    const limb = (a, b, c) => ({
        p1: point(a),
        p2: point(b),
        p3: point(c),
    });
    return {
        head: point("head"),
        spineTop: point("spineTop"),
        spineBot: point("spineBot"),
        rArm: limb("rShoulder", "rElbow", "rHand"),
        lArm: limb("lShoulder", "lElbow", "lHand"),
        rLeg: limb("rHip", "rKnee", "rFoot"),
        lLeg: limb("lHip", "lKnee", "lFoot"),
    };
}

export function boneMapFromCharacterRig(rigData) {
    const out = {};
    for (const boneId of PHYSICS_BONES) {
        const p = getRigPoint(rigData, boneId);
        if (p) out[boneId] = { x: p.x, y: p.y, z: p.z ?? 0 };
    }
    return out;
}

/** Resolve hit / sever / capsule ids to a sim bone key. */
export function resolvePhysicsBoneId(rawId, points) {
    if (!rawId) return points?.spineTop ? "spineTop" : null;
    if (points?.[rawId]) return rawId;

    const clean = rawId.split("_fr_")[0].split("_fracture_")[0];
    const head = clean.split("_")[0];
    const aliased = PHYSICS_BONE_ALIASES[head] ?? head;
    if (points?.[aliased]) return aliased;

    if (rawId.includes("_")) {
        const segments = rawId.split("_");
        for (let i = segments.length - 1; i >= 0; i--) {
            const candidate = segments.slice(0, i + 1).join("_");
            if (points?.[candidate]) return candidate;
            const aliasCandidate = PHYSICS_BONE_ALIASES[candidate];
            if (aliasCandidate && points?.[aliasCandidate]) return aliasCandidate;
        }
    }

    return points?.spineTop ? "spineTop" : null;
}
