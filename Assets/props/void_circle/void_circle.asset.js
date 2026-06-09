export default {
    id: "void_circle",
    recipe: "voidCircle",
    sandbox: { behaviors: [], spawnable: true },
    physics: {
        hitBehavior: "none",
        radius: 16,
        isPushable: false,
        collisionShape: "circle",
        laserTargetable: false,
    },
    zone: {
        kind: "void",
        radius: 16,
        depth: 24,
        pull: 200,
        capturedPull: 500,
        durationMs: 1500,
    },
    visuals: { mouthRadius: 16, pocketDepth: 24, stroke: "rgba(0, 0, 0, 0.45)", lineWidth: 2 },
};
