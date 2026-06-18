import { getFlipperSpriteCacheKey, syncFlipperCollisionShape } from "../../../Libraries/Sandbox/behaviors/flipperBehavior.js";
import { FLIPPER_ACTIVE_COLORS, FLIPPER_COLORS, FLIPPER_LAYOUT } from "./flipperShared.js";
const FLIPPER = { side: "right", extendDir: -1, ...FLIPPER_LAYOUT, restAngle: -0.45, activeAngle: 0.55 };
export default {
    id: "flipper_right",
    primitive: "flipper",
    sandbox: { behaviors: ["flipper"] },
    physics: {
        radius: 8,
        halfExtents: { x: 8, y: 2 },
        propPixelSize: null,
        isKinetic: true,
        gravityImmune: true,
        rolls: false,
        collisionShape: "box",
        pairRestitution: 0.85,
        mass: 99999,
        friction: 0,
        wallPhysics: { restitution: 0, friction: 0 },
        getCustomSpriteCacheKey: getFlipperSpriteCacheKey,
        syncCollisionShape: syncFlipperCollisionShape,
    },
    visuals: { world: { restAngle: FLIPPER.restAngle }, colors: FLIPPER_COLORS, activeColors: FLIPPER_ACTIVE_COLORS },
    flipper: FLIPPER,
};
