import { PROP_PRIMITIVE_POLYGON } from "../../../Core/engineEnums.js";
import { boxLocalFootprint } from "../../../Libraries/Math/math.js";
import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
export default { id: "box", primitive: PROP_PRIMITIVE_POLYGON, sandbox: { tags: ["shapes"], resizableBox: true, spawnLabel: "Box" }, physics: { localFootprint: boxLocalFootprint(8, 8), wallPhysics: { restitution: 0.15, friction: 0.8 }, spawn: { minRadius: 150, maxRadius: 1000, minCount: 8, randomRange: 17 } }, visuals: { colors: { ...NEUTRAL_BOX_COLORS }, world: { height: 7 } } };
