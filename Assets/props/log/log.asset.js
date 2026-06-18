export default {
    id: "log",
    primitive: "rollingBox",
    physics: {
        radius: 32,
        halfExtents: { x: 32, y: 2 },
        collisionShape: "box",
        isKinetic: true,
        rolls: true,
        rollAxis: "long",
        rollHeight: 3,
        mass: 1.1,
        friction: 5,
        wallPhysics: { restitution: 0.3, friction: 0.45 },
        quantizeSteps: { facing: 64, roll: 32 },
    },
    visuals: { halfExtents: { x: 32, y: 2 }, height: 3, stroke: null, colors: { side: "#9B7B28", sideAlt: "#8A6A20", end: "#6B4F10", endAlt: "#7A5A14", top: "#A88B30", bottom: "#5D4610" } },
};
