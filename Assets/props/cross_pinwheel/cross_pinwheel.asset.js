export default {
    id: "cross_pinwheel",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], dragInteract: true, dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Cross pinwheel" },
    physics: {
        isKinetic: true,
        pinned: true,
        friction: 0.02,
        density: 0.0005,
        wallPhysics: { restitution: 0.5, friction: 0.1 },
        collisionParts: [
            { type: "Polygon", vertices: new Float32Array([-16, -4, 16, -4, 16, 4, -16, 4]) },
            { type: "Polygon", vertices: new Float32Array([-4, -16, 4, -16, 4, 16, -4, 16]) },
        ],
    },
    visuals: { lineWidth: 0.5, colors: { side: "#334155", sideShadow: "#1e293b", top: "#64748b", topHighlight: "#94a3b8", stroke: "#1e293b" }, world: { height: 4 } },
};
