import { boxLocalFootprint } from "../../../Libraries/Math/math.js";
import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
import { getWallChunkSpriteCacheKey } from "../../../Libraries/Render/render.js";
export default { id: "wall_rail_chunk", primitive: "polygon", sandbox: { tags: ["shapes"], spawnLabel: "Wall Rail Chunk" }, physics: { density: 0.01, localFootprint: boxLocalFootprint(8, 2), wallPhysics: { restitution: 0.15, friction: 0.8 }, quantizeSteps: { view: 6, facing: 64 }, fracture: { mode: "glass" }, fadeOutMs: 5000, fadeOutDurationMs: 1000, spawn: { minRadius: 150, maxRadius: 1000, minCount: 4, randomRange: 12 }, getCustomSpriteCacheKey: getWallChunkSpriteCacheKey }, visuals: { colors: NEUTRAL_BOX_COLORS, world: { height: 12 } }, draw: "wallChunk" };
