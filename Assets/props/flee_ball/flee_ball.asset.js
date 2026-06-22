import { createFleeBallDraw, getFleeBallSpriteCacheKey } from "../../../Libraries/Render/createFleeBallDraw.js";
import { NEUTRAL_BOX_COLORS, NEUTRAL_POLYGON_STROKE, NEUTRAL_SPHERE_VISUALS } from "../shared/neutralCoats.js";

const fleeBallWedgeVisuals = {
    colors: { side: NEUTRAL_BOX_COLORS.side, sideShadow: NEUTRAL_BOX_COLORS.sideShadow, top: NEUTRAL_BOX_COLORS.top, stroke: NEUTRAL_POLYGON_STROKE },
    world: { height: 2.33 },
    lineWidth: 0.4,
};

export default {
    id: "flee_ball",
    draw: createFleeBallDraw(NEUTRAL_SPHERE_VISUALS, fleeBallWedgeVisuals),
    sandbox: { tags: ["shapes", "nav"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 25, maxPower: 500 }, spawnLabel: "Flee ball" },
    physics: {
        radius: 4,
        isKinetic: true,
        rolls: true,
        canChain: true,
        density: 0.007958,
        friction: 4,
        wallPhysics: { restitution: 0.35, friction: 0.4 },
        getCustomSpriteCacheKey: getFleeBallSpriteCacheKey,
    },
    visuals: NEUTRAL_SPHERE_VISUALS,
};
