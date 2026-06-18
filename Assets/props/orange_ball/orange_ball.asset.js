export default {
    id: "orange_ball",
    primitive: "sphere",
    sandbox: { dragLaunch: { minPower: 25, maxPower: 500 } },
    physics: {        radius: 4,
        isPushable: true,
        rolls: true,
        collisionShape: "circle",        mass: 0.4,
        friction: 4,
        wallPhysics: { restitution: 0.35, friction: 0.4 },
    },
    visuals: { panelCount: 6, latBands: 5, panels: ["#FF9800", "#F57C00", "#FFB74D", "#E65100", "#FFA726", "#BF360C"], stroke: null },
};
