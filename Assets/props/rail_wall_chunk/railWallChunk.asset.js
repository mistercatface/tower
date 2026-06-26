import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
export default {
    id: "wall_rail_chunk",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], spawnLabel: "Wall Rail Chunk" },
    physics: {
        isKinetic: true,
        density: 0.08,
        localFootprint: [
            { x: -8, y: -2 },
            { x: 8, y: -2 },
            { x: 8, y: 2 },
            { x: -8, y: 2 },
        ],
        wallPhysics: { restitution: 0.15, friction: 0.8 },
        quantizeSteps: { facing: 64 },
        fracture: true,
        fractureMode: "glass",
        spawn: { minRadius: 150, maxRadius: 1000, minCount: 4, randomRange: 12 },
    },
    visuals: { colors: NEUTRAL_BOX_COLORS, world: { height: 12 } },
};
