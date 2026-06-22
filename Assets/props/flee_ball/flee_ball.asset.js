import { NEUTRAL_SPHERE_VISUALS } from "../shared/neutralCoats.js";
export default {
    id: "flee_ball",
    primitive: "sphere",
    sandbox: { tags: ["shapes", "nav"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 25, maxPower: 500 }, spawnLabel: "Flee ball" },
    physics: { radius: 4, isKinetic: true, rolls: true, canChain: true, density: 0.007958, friction: 4, wallPhysics: { restitution: 0.35, friction: 0.4 } },
    visuals: NEUTRAL_SPHERE_VISUALS,
};
