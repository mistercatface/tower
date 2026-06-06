/** Physics / ragdoll joint ids (canonical sim bone names). */

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

/** Display rig limb point paths keyed by physics joint id. */
export const JOINT_TO_RIG_PATH = {
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
