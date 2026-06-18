export default {
    id: "beach_ball",
    primitive: "sphere",
    sandbox: { dragLaunch: { minPower: 25, maxPower: 500 } },
    physics: {        radius: 7,
        isPushable: true,
        rolls: true,
        collisionShape: "circle",        mass: 0.6,
        friction: 4,
        wallPhysics: { restitution: 0.35, friction: 0.4 },
    },
    visuals: { panelCount: 6, latBands: 5, panels: ["#F44336", "#FFEB3B", "#2196F3", "#4CAF50", "#FF9800", "#FFFFFF"], stroke: null },
};
