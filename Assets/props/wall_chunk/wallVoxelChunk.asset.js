import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
export default {
    id: "wall_voxel_chunk",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], spawnLabel: "Wall Voxel Chunk" },
    physics: {
        isKinetic: true,
        localFootprint: [
            { x: -8, y: -8 },
            { x: 8, y: -8 },
            { x: 8, y: 8 },
            { x: -8, y: 8 },
        ],
        wallPhysics: { restitution: 0.1, friction: 0.8 },
        fracture: true,
        fractureMode: "glass",
        spawn: { minRadius: 150, maxRadius: 1000, minCount: 6, randomRange: 17 },
    },
    visuals: { colors: NEUTRAL_BOX_COLORS, world: { height: 12 } },
};
