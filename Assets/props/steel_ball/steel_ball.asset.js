export default {
    id: "steel_ball",
    primitive: "sphere",
    sandbox: { dragLaunch: { minPower: 35, maxPower: 750 } },
    physics: { radius: 7, isKinetic: true, rolls: true, density: 0.015591, friction: 2, wallPhysics: { restitution: 0.55, friction: 0.22 } },
    visuals: { panelCount: 12, latBands: 6, panels: ["#B0BEC5", "#78909C", "#CFD8DC", "#607D8B", "#90A4AE", "#ECEFF1", "#546E7A", "#B0BEC5"], stroke: "#37474F" },
};
