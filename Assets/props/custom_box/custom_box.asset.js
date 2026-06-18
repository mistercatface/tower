export default {
    id: "custom_box",
    primitive: "polygon",
    sandbox: { resizableBox: true, spawnLabel: "Custom box", behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 } },
    physics: {
        isKinetic: true,
        localFootprint: [
            { x: -8, y: -8 },
            { x: 8, y: -8 },
            { x: 8, y: 8 },
            { x: -8, y: 8 },
        ],
        wallPhysics: { restitution: 0.15, friction: 0.8 },
    },
    visuals: {
        colors: { side: "#9575CD", sideShadow: "#7E57C2", top: "#B39DDB", bottom: "#512DA8", bodyInspect: "#9575CD", stroke: "#311B92" },
        world: { height: 10 },
        plankTs: { values: [0.33, 0.66], stroke: "rgba(49, 27, 146, 0.55)" },
    },
};
