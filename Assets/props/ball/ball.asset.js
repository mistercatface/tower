import { NEUTRAL_SPHERE_VISUALS } from "../shared/neutralCoats.js";
export default {
    id: "ball",
    primitive: "sphere",
    sandbox: { tags: ["shapes", "nav"], dragLaunch: { minPower: 25, maxPower: 500 } },
    physics: { radius: 4, isKinetic: true, rolls: true, density: 0.007958, friction: 4, wallPhysics: { restitution: 0.35, friction: 0.4 } },
    visuals: NEUTRAL_SPHERE_VISUALS,
};
