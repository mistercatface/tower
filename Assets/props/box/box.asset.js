import { PROP_PRIMITIVE_POLYGON } from "../../../Core/engineEnums.js";
import { boxLocalFootprint } from "../../../Libraries/Math/math.js";
export default { id: "box", primitive: PROP_PRIMITIVE_POLYGON, sandbox: { tags: ["shapes"], resizableBox: true, spawnLabel: "Box" }, physics: { localFootprint: boxLocalFootprint(8, 8) } };
