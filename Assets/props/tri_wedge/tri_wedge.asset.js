import { PROP_PRIMITIVE_POLYGON } from "../../../Core/engineEnums.js";
import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
export default { id: "tri_wedge", primitive: PROP_PRIMITIVE_POLYGON, sandbox: { tags: ["shapes"], spawnLabel: "Tri wedge" }, physics: { friction: 8, wallPhysics: { restitution: 0.2, friction: 0.7 }, localFootprint: new Float32Array([-9, -5, 9, -5, 0, 10]) }, visuals: { colors: { side: NEUTRAL_BOX_COLORS.side, sideShadow: NEUTRAL_BOX_COLORS.sideShadow, top: NEUTRAL_BOX_COLORS.top }, world: { height: 12 } } };
