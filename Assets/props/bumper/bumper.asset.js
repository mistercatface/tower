export default {
    id: "bumper",
    primitive: "cylinder",
    sandbox: { behaviors: ["bumper"], dragLaunch: { minPower: 10, maxPower: 80 } },
    physics: {
        hitBehavior: "none",
        radius: 10,
        isPushable: true,
        rolls: false,
        collisionShape: "circle",
        laserTargetable: false,
        mass: 200,
        friction: 0,
        wallPhysics: { restitution: 0.1, friction: 0 },
    },
    visuals: { world: { height: 14 }, colors: { body: { highlight: "#EF5350", mid: "#E53935", shadow: "#C62828" }, lip: "#B71C1C", top: "#FFCDD2", stroke: "#7F0000" } },
};
