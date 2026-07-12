import { PROP_PRIMITIVE_POLYGON } from "../../../Core/engineEnums.js";
import { crossPinwheelOutlineInto } from "../../../Libraries/Math/math.js";
const verts = new Float32Array(24);
crossPinwheelOutlineInto(verts, 32, 8);
export default {
    id: "cross_pinwheel",
    primitive: PROP_PRIMITIVE_POLYGON,
    sandbox: { tags: ["shapes"], dragInteract: true, dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Cross pinwheel" },
    physics: {
        density: 0.0005,
        wallPhysics: { restitution: 0.5, friction: 0.1 },
        localFootprint: verts,
    },
    visuals: { colors: { side: "#334155", sideShadow: "#1e293b", top: "#64748b" }, world: { height: 4 } },
};
