import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/SurfaceProfileRevision.js";
export default {
    id: "wall_rail_chunk",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], spawnLabel: "Wall Rail Chunk" },
    physics: {
        isKinetic: true,
        density: 0.04,
        localFootprint: [
            { x: -8, y: -2 },
            { x: 8, y: -2 },
            { x: 8, y: 2 },
            { x: -8, y: 2 },
        ],
        wallPhysics: { restitution: 0.15, friction: 0.8 },
        quantizeSteps: { view: 6 },
        fracture: true,
        fractureMode: "glass",
        spawn: { minRadius: 150, maxRadius: 1000, minCount: 4, randomRange: 12 },
        getCustomSpriteCacheKey(prop, state) {
            if (!prop.wallChunkProfileId) return "";
            const profileId = prop.wallChunkProfileId;
            const rev = getSurfaceProfileRevision(profileId);
            let readyBucket = "pending";
            if (state?.worldSurfaces) {
                const textures = state.worldSurfaces.ensureWallChunkProfileTextures(state, profileId, prop.wallChunkHeightPx);
                if (textures.ready) readyBucket = "ready";
            }
            return `wallchunk:${profileId}:${prop.wallChunkHeightPx}:${rev}:${readyBucket}`;
        },
    },
    visuals: { colors: NEUTRAL_BOX_COLORS, world: { height: 12 } },
};
