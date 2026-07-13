import { PROP_PRIMITIVE_POLYGON, PROP_DRAW_WALL_CHUNK } from "../../../Core/engineEnums.js";
import { boxLocalFootprint } from "../../../Libraries/Math/math.js";
export default { id: "wall_rail_chunk", primitive: PROP_PRIMITIVE_POLYGON, sandbox: { tags: ["shapes"], spawnLabel: "Wall Rail Chunk" }, physics: { localFootprint: boxLocalFootprint(8, 2), quantizeSteps: { view: 6, facing: 64 }, fracture: true, fadeOutMs: 5000, fadeOutDurationMs: 1000 }, draw: PROP_DRAW_WALL_CHUNK };
