/** Distance constraints between physics joints during ragdoll simulation. */
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
