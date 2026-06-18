export default {
    id: "crate_shard",
    primitive: "box",
    sandbox: { behaviors: ["dragLaunch"], spawnable: false, dragLaunch: { minPower: 15, maxPower: 200 } },
    physics: {
        radius: 3,
        isPushable: true,
        collisionShape: "box",
        splittable: true,
        mass: 0.05,
        pairFriction: 0.5,
        wallPhysics: { restitution: 0.45, friction: 0.5 },
    },
    visuals: { colors: { side: "#8D6E63", sideShadow: "#6D4C41", top: "#A1887F", bottom: "#5D4037", stroke: "#3E2723" }, world: { height: 6 }, lineWidth: 0.8 },
};
