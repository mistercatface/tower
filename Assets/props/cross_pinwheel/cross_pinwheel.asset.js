import { PROP_PRIMITIVE_POLYGON } from "../../../Core/engineEnums.js";
import { crossPinwheelOutlineInto } from "../../../Libraries/Math/math.js";
const verts = new Float32Array(24);
crossPinwheelOutlineInto(verts, 32, 8);
export default {
    id: "cross_pinwheel",
    primitive: PROP_PRIMITIVE_POLYGON,
    sandbox: { tags: ["shapes"], spawnLabel: "Cross pinwheel" },
    physics: { localFootprint: verts },
};
