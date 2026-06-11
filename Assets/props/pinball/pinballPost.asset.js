import { PINBALL_OBSTACLE_LAYOUT } from "./pinballShared.js";
export default {
    id: "pinball_post",
    primitive: "cylinder",
    sandbox: { behaviors: ["pinStatic"] },
    physics: {
        hitBehavior: "none",
        radius: 2.2,
        radiusU: PINBALL_OBSTACLE_LAYOUT.postRadiusU,
        propPixelSize: null,
        isPushable: true,
        gravityImmune: true,
        rolls: false,
        collisionShape: "circle",
        pairRestitution: 0.92,
        laserTargetable: false,
        mass: 99999,
        friction: 0,
        wallPhysics: { restitution: 0.85, friction: 0 },
    },
    visuals: {
        world: { height: 7, bandT0: 0.18, bandT1: 0.58 },
        colors: { body: { shadow: "#455A64", mid: "#90A4AE", highlight: "#ECEFF1" }, lip: "#607D8B", top: "#FFFFFF", bandFill: "rgba(176, 190, 197, 0.65)", tab: "#FFFFFF", stroke: "#37474F" },
        stroke: "#455A64",
    },
};
