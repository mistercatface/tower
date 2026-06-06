export default {
    id: "crate_shard",
    recipe: "extrudedBoxShard",
    physics: {
        hitBehavior: "damage",
        renderMode: "debris",
        radius: 3,
        isPushable: true,
        collisionShape: "box",
        splittable: true,
        laserTargetable: false,
        maxHealth: 1,
        mass: 0.05,
        wallPhysics: { restitution: 0.45, friction: 0.5 },
    },
    visuals: { colors: { side: "#8D6E63", sideShadow: "#6D4C41", top: "#A1887F", bottom: "#5D4037", stroke: "#3E2723" }, world: { height: 10 } },
};
