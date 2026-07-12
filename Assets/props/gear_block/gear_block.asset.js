import { PROP_PRIMITIVE_POLYGON } from "../../../Core/engineEnums.js";
import { regularGearOutlineInto } from "../../../Libraries/Math/math.js";
const GEAR_TEETH = 12;
const gearVerts = new Float32Array(GEAR_TEETH * 8);
regularGearOutlineInto(gearVerts, GEAR_TEETH, 14, 10);
export default { id: "gear_block", primitive: PROP_PRIMITIVE_POLYGON, sandbox: { tags: ["shapes"], spawnLabel: "Gear block" }, physics: { localFootprint: gearVerts } };
