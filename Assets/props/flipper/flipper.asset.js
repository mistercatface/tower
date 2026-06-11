export default {
    id: "flipper",
    sandbox: { behaviors: ["flipper"] },
    physics: {
        hitBehavior: "none",
        renderMode: "none",
        radius: 8,
        isPushable: true,
        rolls: false,
        collisionShape: "circle",
        laserTargetable: false,
        mass: 99999,
        friction: 0,
        wallPhysics: { restitution: 0, friction: 0 },
    },
    flipper: { length: 32, width: 8, restAngle: 0.45, activeAngle: -0.55, buttonGap: 14, buttonYOffset: 0 },
};
