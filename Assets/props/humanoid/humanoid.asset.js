export default {
    id: "humanoid",
    sandbox: { dragLaunch: { minPower: 25, maxPower: 120 } },
    physics: {
        radius: 8,
        isPushable: true,
        rolls: false,
        collisionShape: "circle",
        mass: 1.5,
        friction: 8,
        kinematics: true,
        renderMode: "none",
        rollToCursor: { maxSpeed: 50, accel: 220 },
        maxHealth: 1,
    },
};
