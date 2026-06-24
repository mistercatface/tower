export default {
    id: "cross_pinwheel",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Cross pinwheel" },
    physics: {
        isKinetic: true,
        pinned: true,
        friction: 0.05,
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
    visuals: { colors: { side: "#4a044e", sideShadow: "#2e0232", top: "#d946ef", topHighlight: "#f472b6", stroke: "#fbcfe8" }, world: { height: 16 } },
};
