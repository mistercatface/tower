export default {
    id: "glass_pane",
    primitive: "polygon",
    sandbox: { resizableBox: true, spawnLabel: "Glass pane", behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 } },
    physics: {
        isKinetic: true,
        localFootprint: [
            { x: -12, y: -8 },
            { x: 12, y: -8 },
            { x: 12, y: 8 },
            { x: -12, y: 8 },
        ],
        density: 0.45 / 256,
        wallPhysics: { restitution: 0.06, friction: 0.25 },
        pairRestitution: 0.06,
        fracture: true,
        fractureMode: "glass",
    },
    visuals: {
        colors: { side: "#B3E5FC", sideShadow: "#81D4FA", top: "#E1F5FE", topHighlight: "#FFFFFF", bottom: "#4FC3F7", bodyInspect: "#81D4FA", stroke: "rgba(1, 87, 155, 0.5)" },
        world: { height: 2 },
        lineWidth: 0.4,
    },
};
