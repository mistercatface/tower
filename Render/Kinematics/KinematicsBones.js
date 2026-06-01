/** Canonical bone ids and rig ↔ physics conversion (live kinematics + ragdoll). */

export const PHYSICS_BONES = [
    "head",
    "spineTop",
    "spineBot",
    "rShoulder",
    "rElbow",
    "rHand",
    "lShoulder",
    "lElbow",
    "lHand",
    "rHip",
    "rKnee",
    "rFoot",
    "lHip",
    "lKnee",
    "lFoot",
];

const BONE_TO_RIG_PATH = {
    head: ["head"],
    spineTop: ["spineTop"],
    spineBot: ["spineBot"],
    rShoulder: ["rArm", "p1"],
    rElbow: ["rArm", "p2"],
    rHand: ["rArm", "p3"],
    lShoulder: ["lArm", "p1"],
    lElbow: ["lArm", "p2"],
    lHand: ["lArm", "p3"],
    rHip: ["rLeg", "p1"],
    rKnee: ["rLeg", "p2"],
    rFoot: ["rLeg", "p3"],
    lHip: ["lLeg", "p1"],
    lKnee: ["lLeg", "p2"],
    lFoot: ["lLeg", "p3"],
};

export const RAGDOLL_CONSTRAINT_EDGES = [
    ["head", "spineTop"],
    ["spineTop", "spineBot"],
    ["spineTop", "rShoulder"],
    ["rShoulder", "rElbow"],
    ["rElbow", "rHand"],
    ["spineTop", "lShoulder"],
    ["lShoulder", "lElbow"],
    ["lElbow", "lHand"],
    ["spineBot", "rHip"],
    ["rHip", "rKnee"],
    ["rKnee", "rFoot"],
    ["spineBot", "lHip"],
    ["lHip", "lKnee"],
    ["lKnee", "lFoot"],
    ["rShoulder", "lShoulder"],
    ["rHip", "lHip"],
];

/** Sever / limb aliases → physics bone id. */
export const PHYSICS_BONE_ALIASES = {
    torso: "spineTop",
    rLeg: "rHip",
    lLeg: "lHip",
    rArm: "rShoulder",
    lArm: "lShoulder",
    rForearm: "rElbow",
    lForearm: "lElbow",
    rShin: "rKnee",
    lShin: "lKnee",
};

export const SEVER_LIMB_DEF = {
    head: { root: "head", type: "simple" },
    rArm: { root: "rShoulder", type: "joint" },
    lArm: { root: "lShoulder", type: "joint" },
    rForearm: { root: "rElbow", type: "joint" },
    lForearm: { root: "lElbow", type: "joint" },
    rLeg: { root: "rHip", type: "joint" },
    lLeg: { root: "lHip", type: "joint" },
    rShin: { root: "rKnee", type: "joint" },
    lShin: { root: "lKnee", type: "joint" },
};

export const SEVER_TORSO_PEER = {
    rArm: "spineTop",
    lArm: "spineTop",
    rLeg: "spineBot",
    lLeg: "spineBot",
    rForearm: "rShoulder",
    lForearm: "lShoulder",
    rShin: "rHip",
    lShin: "lHip",
};

export const SEVER_STUMP_BONES = {
    head: [{ bone: "spineTop", radius: 0.6 }],
    rArm: [{ bone: "rShoulder", radius: 0.5 }, { bone: "spineTop", radius: 0.5 }],
    lArm: [{ bone: "lShoulder", radius: 0.5 }, { bone: "spineTop", radius: 0.5 }],
    rForearm: [{ bone: "rElbow", radius: 0.4 }, { bone: "rShoulder", radius: 0.4 }],
    lForearm: [{ bone: "lElbow", radius: 0.4 }, { bone: "lShoulder", radius: 0.4 }],
    rLeg: [{ bone: "rHip", radius: 0.6 }, { bone: "spineBot", radius: 0.6 }],
    lLeg: [{ bone: "lHip", radius: 0.6 }, { bone: "spineBot", radius: 0.6 }],
    rShin: [{ bone: "rKnee", radius: 0.5 }, { bone: "rHip", radius: 0.5 }],
    lShin: [{ bone: "lKnee", radius: 0.5 }, { bone: "lHip", radius: 0.5 }],
};

export function getRigPoint(rig, boneId) {
    const path = BONE_TO_RIG_PATH[boneId];
    if (!path) return null;
    let node = rig;
    for (const key of path) {
        node = node?.[key];
        if (node == null) return null;
    }
    return node;
}

export function boneMapFromCharacterRig(rigData) {
    const out = {};
    for (const boneId of PHYSICS_BONES) {
        const p = getRigPoint(rigData, boneId);
        if (p) out[boneId] = { x: p.x, y: p.y, z: p.z ?? 0 };
    }
    return out;
}

export function characterRigFromBoneMap(boneMap) {
    return {
        head: boneMap.head,
        spineTop: boneMap.spineTop,
        spineBot: boneMap.spineBot,
        rArm: { p1: boneMap.rShoulder, p2: boneMap.rElbow, p3: boneMap.rHand },
        lArm: { p1: boneMap.lShoulder, p2: boneMap.lElbow, p3: boneMap.lHand },
        rLeg: { p1: boneMap.rHip, p2: boneMap.rKnee, p3: boneMap.rFoot },
        lLeg: { p1: boneMap.lHip, p2: boneMap.lKnee, p3: boneMap.lFoot },
    };
}

/** Resolve hit / sever / capsule ids to a ragdoll.points key. */
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
