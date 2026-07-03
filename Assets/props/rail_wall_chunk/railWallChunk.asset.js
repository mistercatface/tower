import { boxLocalFootprint } from "../../../Libraries/Math/Poly2D.js";
import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
import { getWallChunkSpriteCacheKey } from "../../../Libraries/Props/propStrategy.js";
export default {
    id: "wall_rail_chunk",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], spawnLabel: "Wall Rail Chunk" },
    physics: {
        isKinetic: true,
        density: 0.01,
        localFootprint: boxLocalFootprint(8, 2),
        wallPhysics: { restitution: 0.15, friction: 0.8 },
        quantizeSteps: { view: 6, facing: 64 },
        fracture: true,
        fractureMode: "glass",
        fadeOutMs: 5000,
        fadeOutDurationMs: 1000,
        spawn: { minRadius: 150, maxRadius: 1000, minCount: 4, randomRange: 12 },
        getCustomSpriteCacheKey: getWallChunkSpriteCacheKey,
    },
    visuals: { colors: NEUTRAL_BOX_COLORS, world: { height: 12 } },
};
