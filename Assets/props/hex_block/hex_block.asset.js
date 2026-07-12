import { PROP_PRIMITIVE_POLYGON } from "../../../Core/engineEnums.js";
import { regularConvexPolygonFootprint } from "../../../Libraries/Math/math.js";
export default { id: "hex_block", primitive: PROP_PRIMITIVE_POLYGON, sandbox: { tags: ["shapes"], spawnLabel: "Hex block" }, physics: { localFootprint: regularConvexPolygonFootprint(6, 8) } };
