export default {
    id: "box_2x4",
    primitive: "polygon",
    sandbox: { behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "2×4 box" },
    physics: {
        isKinetic: true,
        localFootprint: [
            { x: -8, y: -4 },
            { x: 8, y: -4 },
            { x: 8, y: 4 },
            { x: -8, y: 4 },
        ],
        wallPhysics: { restitution: 0.15, friction: 0.8 },
    },
    visuals: {
        colors: { side: "#78909C", sideShadow: "#546E7A", top: "#90A4AE", bottom: "#455A64", bodyInspect: "#78909C", stroke: "#37474F" },
        world: { height: 10 },
        plankTs: { values: [0.33, 0.66], stroke: "rgba(55, 71, 79, 0.55)" },
        topCross: { stroke: "rgba(55, 71, 79, 0.6)" },
    },
};
