import { getFlipperSpriteCacheKey, syncFlipperCollisionShape } from "../../../Libraries/Sandbox/behaviors/flipperBehavior.js";
import { FLIPPER_ACTIVE_COLORS, FLIPPER_COLORS, FLIPPER_LAYOUT } from "./flipperShared.js";
const FLIPPER = { side: "left", extendDir: 1, ...FLIPPER_LAYOUT, restAngle: 0.45, activeAngle: -0.55 };
export default {
    id: "flipper_left",
    primitive: "flipper",
    sandbox: { behaviors: ["flipper"] },
    physics: {
        propPixelSize: null,
        isKinetic: true,
        rolls: false,
        pinned: true,
        pairRestitution: 0.85,
        friction: 0,
        wallPhysics: { restitution: 0, friction: 0 },
        getCustomSpriteCacheKey: getFlipperSpriteCacheKey,
        syncCollisionShape: syncFlipperCollisionShape,
    },
    visuals: { world: { restAngle: FLIPPER.restAngle }, colors: FLIPPER_COLORS, activeColors: FLIPPER_ACTIVE_COLORS },
    flipper: FLIPPER,
};
