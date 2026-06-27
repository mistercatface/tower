import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
import { getWallChunkSpriteCacheKey } from "../../../Libraries/Props/propStrategy.js";
export default {
    id: "wall_voxel_chunk",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], spawnLabel: "Wall Voxel Chunk" },
    physics: {
        isKinetic: true,
        density: 0.01,
        localFootprint: [
            { x: -8, y: -8 },
            { x: 8, y: -8 },
            { x: 8, y: 8 },
            { x: -8, y: 8 },
        ],
        wallPhysics: { restitution: 0.15, friction: 0.8 },
        quantizeSteps: { view: 6, facing: 64 },
        fracture: true,
        fractureMode: "glass",
        spawn: { minRadius: 150, maxRadius: 1000, minCount: 6, randomRange: 17 },
        getCustomSpriteCacheKey: getWallChunkSpriteCacheKey,
    },
    visuals: { colors: NEUTRAL_BOX_COLORS, world: { height: 12 } },
};
