import { PINBALL_OBSTACLE_LAYOUT } from "./pinballShared.js";
export default {
    id: "pinball_bumper",
    primitive: "cylinder",
    sandbox: { behaviors: ["pinStatic"] },
    physics: {
        hitBehavior: "none",
        radius: 5.5,
        radiusU: PINBALL_OBSTACLE_LAYOUT.bumperRadiusU,
        propPixelSize: null,
        isPushable: true,
        gravityImmune: true,
        rolls: false,
        collisionShape: "circle",
        pairRestitution: 1.45,
        laserTargetable: false,
        mass: 99999,
        friction: 0,
        wallPhysics: { restitution: 1.1, friction: 0 },
    },
    visuals: {
        world: { height: 8, bandT0: 0.22, bandT1: 0.66 },
        colors: { body: { shadow: "#7F0000", mid: "#D50000", highlight: "#FF5252" }, lip: "#B71C1C", top: "#FFCDD2", bandFill: "rgba(255, 235, 59, 0.75)", tab: "#FFFFFF", stroke: "#5D1010" },
        stroke: "#B71C1C",
    },
};
