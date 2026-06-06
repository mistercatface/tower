/** Limb severing, hit aliases, and gore stump placement. */

/** Hit / sever ids → physics joint id. */
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
