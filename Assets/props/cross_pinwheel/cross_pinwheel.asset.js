export default {
    id: "cross_pinwheel",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Cross pinwheel" },
    physics: {
        isKinetic: true,
        pinned: true,
        friction: 0.02,
        density: 0.0005,
        wallPhysics: { restitution: 0.5, friction: 0.1 },
        collisionParts: [
            {
                type: "Polygon",
                vertices: [
                    { x: -16, y: -4 },
                    { x: 16, y: -4 },
                    { x: 16, y: 4 },
                    { x: -16, y: 4 },
                ],
            },
            {
                type: "Polygon",
                vertices: [
                    { x: -4, y: -16 },
                    { x: 4, y: -16 },
                    { x: 4, y: 16 },
                    { x: -4, y: 16 },
                ],
            },
        ],
    },
    visuals: { lineWidth: 0.5, colors: { side: "#334155", sideShadow: "#1e293b", top: "#64748b", topHighlight: "#94a3b8", stroke: "#1e293b" }, world: { height: 4 } },
};
