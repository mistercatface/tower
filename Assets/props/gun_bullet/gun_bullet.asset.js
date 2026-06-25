export default {
    id: "gun_bullet",
    primitive: "sphere",
    shape: { type: "Circle", radius: 1.5 },
    physics: { radius: 1.5, isKinetic: true, rolls: true, fracture: false, mass: 0.5, friction: 0.5 },
    sandbox: { spawnable: false, tags: ["debris"] },
    visuals: { panelCount: 4, latBands: 3, panels: ["#444444", "#222222", "#555555", "#333333"], stroke: null },
};
