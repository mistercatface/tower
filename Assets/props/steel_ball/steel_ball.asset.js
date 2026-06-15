export default {
    id: "steel_ball",
    primitive: "sphere",
    sandbox: { dragLaunch: { minPower: 35, maxPower: 750 } },
    physics: {
        hitBehavior: "none",
        radius: 7,
        isPushable: true,
        rolls: true,
        collisionShape: "circle",
        laserTargetable: false,
        mass: 2.4,
        friction: 2,
        wallPhysics: { restitution: 0.55, friction: 0.22 },
    },
    visuals: { panelCount: 12, latBands: 6, panels: ["#B0BEC5", "#78909C", "#CFD8DC", "#607D8B", "#90A4AE", "#ECEFF1", "#546E7A", "#B0BEC5"], stroke: "#37474F" },
};
