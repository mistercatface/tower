export default {
    id: "humanoid",
    sandbox: { equip: true, behaviors: ["dragLaunch", "rollToCursorDirect", "rollToCursorHpa", "shoot"], dragLaunch: { minPower: 25, maxPower: 120 } },
    physics: {
        radius: 4,
        isPushable: true,
        rolls: false,
        collisionShape: "circle",
        mass: 2,
        shooterKnockbackMultiplier: 2,
        friction: 8,
        kinematics: true,
        locomotion: true,
        renderMode: "none",
        rollToCursor: { maxSpeed: 50, accel: 220 },
        maxHealth: 1,
    },
};
