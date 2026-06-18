import { getPipeElbowOutletWorld, getPipeElbowSpriteCacheKey, syncPipeElbowCollisionShape } from "../../../Libraries/Props/pipeElbowGeometry.js";
import { PIPE_SPAWNER_BALL_TINT } from "../../../Libraries/Color/tintPresets.js";
export default {
    id: "pipe_elbow",
    primitive: "pipeElbow",
    sandbox: {
        behaviors: ["spawner"],
        spawner: {
            defaultPropId: "ball",
            defaultVisualOverride: { tint: PIPE_SPAWNER_BALL_TINT },
            dragLaunch: { minPower: 20, maxPower: 750 },
            getOutletWorld: getPipeElbowOutletWorld,
        },
    },
    physics: {
        isKinetic: true,
        rolls: false,
        density: 0.007851,
        friction: 7,
        wallPhysics: { restitution: 0.12, friction: 0.85 },
        syncCollisionShape: syncPipeElbowCollisionShape,
        getCustomSpriteCacheKey: getPipeElbowSpriteCacheKey,
    },
    visuals: {
        world: { outletLength: 6, bendRadius: 6, pipeRadius: 6, riserHeight: 6, flangeRadius: 6, flangeHeight: 1 },
        colors: { stroke: "#3E2723", side: { mid: "#9E7A3C", shadow: "#6D4C2C", highlight: "#C4A055" }, top: { mid: "#B8924A" }, bottom: { mid: "#5C4033" } },
    },
};
