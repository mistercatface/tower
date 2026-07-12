import { PROP_PRIMITIVE_POLYGON } from "../../../Core/engineEnums.js";
import { regularStarFootprint } from "../../../Libraries/Math/math.js";
export default { id: "star_block", primitive: PROP_PRIMITIVE_POLYGON, sandbox: { tags: ["shapes"], spawnLabel: "Star block" }, physics: { localFootprint: regularStarFootprint(5, 14, 6) } };
