import { getFlipperSpriteCacheKey, syncFlipperCollisionShape } from "../../../Libraries/Sandbox/behaviors/flipperBehavior.js";
import { FLIPPER_ACTIVE_COLORS, FLIPPER_COLORS, FLIPPER_VISUAL } from "./flipperShared.js";
const FLIPPER = { side: "right", extendDir: -1, length: 32, width: 8, restAngle: -0.45, activeAngle: 0.55, buttonOutside: 1, buttonGap: 14, buttonYOffset: 0 };
export default {
    id: "flipper_right",
    primitive: "flipper",
    sandbox: { behaviors: ["flipper"] },
    physics: {
        hitBehavior: "none",
        radius: 16,
        halfExtents: { x: FLIPPER.length / 2, y: FLIPPER.width / 2 },
        propPixelSize: 56,
        isPushable: true,
        rolls: false,
        collisionShape: "box",
        pairRestitution: 0.85,
        laserTargetable: false,
        mass: 99999,
        friction: 0,
        wallPhysics: { restitution: 0, friction: 0 },
        getCustomSpriteCacheKey: getFlipperSpriteCacheKey,
        syncCollisionShape: syncFlipperCollisionShape,
    },
    visuals: { world: { ...FLIPPER_VISUAL, restAngle: FLIPPER.restAngle }, colors: FLIPPER_COLORS, activeColors: FLIPPER_ACTIVE_COLORS },
    flipper: FLIPPER,
};
