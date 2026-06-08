/** Drag-launch toy — pull back and release to spawn and throw this ball. */
export default {
    id: "beach_ball",
    recipe: "lofiSphere",
    spawn: {
        dragLaunch: {
            minDrag: 10,
            maxPull: 110,
            pullScale: 1.25,
            minPower: 55,
            maxPower: 340,
        },
    },
    physics: {
        hitBehavior: "none",
        radius: 7,
        isPushable: true,
        rolls: true,
        collisionShape: "circle",
        laserTargetable: false,
        mass: 0.6,
        friction: 4,
        wallPhysics: { restitution: 0.35, friction: 0.4 },
    },
    visuals: {
        panelCount: 6,
        latBands: 5,
        panels: ["#F44336", "#FFEB3B", "#2196F3", "#4CAF50", "#FF9800", "#FFFFFF"],
        stroke: null,
    },
};
