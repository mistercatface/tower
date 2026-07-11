import { PROP_PRIMITIVE_POLYGON } from "../../../Core/engineEnums.js";
import { regularStarFootprint } from "../../../Libraries/Math/math.js";
import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
export default { id: "star_block", primitive: PROP_PRIMITIVE_POLYGON, sandbox: { tags: ["shapes"], dragInteract: true, dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Star block" }, physics: { localFootprint: regularStarFootprint(5, 14, 6), wallPhysics: { restitution: 0.18, friction: 0.75 } }, visuals: { colors: { ...NEUTRAL_BOX_COLORS }, world: { height: 11 } } };
