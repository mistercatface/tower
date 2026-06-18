export default {
    id: "snake_head",
    primitive: "sphere",
    sandbox: { tags: ["shapes", "nav"], dragLaunch: { minPower: 25, maxPower: 500 } },
    physics: { radius: 4, isKinetic: true, rolls: true, density: 0.007958, friction: 4, wallPhysics: { restitution: 0.35, friction: 0.4 } },
    visuals: { panelCount: 6, latBands: 5, panels: ["#66BB6A", "#43A047", "#A5D6A7", "#2E7D32", "#81C784", "#1B5E20"], stroke: null },
};
