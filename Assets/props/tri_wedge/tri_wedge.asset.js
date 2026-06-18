export default {
    id: "tri_wedge",
    primitive: "polygon",
    sandbox: { behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "tri wedge" },
    physics: {
        isKinetic: true,
        friction: 8,
        wallPhysics: { restitution: 0.2, friction: 0.7 },
        localFootprint: [
            { x: -9, y: -5 },
            { x: 9, y: -5 },
            { x: 0, y: 10 },
        ],
    },
    visuals: { colors: { side: "#78909C", sideShadow: "#546E7A", top: "#90A4AE", stroke: "#37474F" }, world: { height: 12 } },
};
