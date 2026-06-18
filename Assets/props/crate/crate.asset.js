export default {
    id: "crate",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 } },
    physics: {
        isKinetic: true,
        localFootprint: [
            { x: -8, y: -8 },
            { x: 8, y: -8 },
            { x: 8, y: 8 },
            { x: -8, y: 8 },
        ],
        wallPhysics: { restitution: 0.15, friction: 0.8 },
        fracture: true,
        fractureMode: "chunk",
        spawn: { minRadius: 150, maxRadius: 1000, minCount: 8, randomRange: 17 },
    },
    visuals: {
        colors: { side: "#8D6E63", sideShadow: "#6D4C41", top: "#A1887F", topHighlight: "#BCAAA4", bottom: "#5D4037", bodyInspect: "#8D6E63", stroke: "#3E2723" },
        world: { height: 7 },
        plankTs: { values: [0.33, 0.66], stroke: "rgba(62, 39, 35, 0.55)" },
        topCross: { stroke: "rgba(62, 39, 35, 0.6)" },
    },
};
