import { regularConvexPolygonFootprint } from "../../../Libraries/Math/math.js";
import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
export default { id: "hex_block", primitive: "polygon", sandbox: { tags: ["shapes"], dragInteract: true, dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Hex block" }, physics: { localFootprint: regularConvexPolygonFootprint(6, 8), wallPhysics: { restitution: 0.18, friction: 0.75 } }, visuals: { colors: { ...NEUTRAL_BOX_COLORS }, world: { height: 11 } } };
