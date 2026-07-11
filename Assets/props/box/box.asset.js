import { boxLocalFootprint } from "../../../Libraries/Math/math.js";
import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
export default { id: "box", primitive: "polygon", sandbox: { tags: ["shapes"], resizableBox: true, spawnLabel: "Box", dragInteract: true, dragLaunch: { minPower: 20, maxPower: 260 } }, physics: { localFootprint: boxLocalFootprint(8, 8), wallPhysics: { restitution: 0.15, friction: 0.8 }, spawn: { minRadius: 150, maxRadius: 1000, minCount: 8, randomRange: 17 } }, visuals: { colors: { ...NEUTRAL_BOX_COLORS }, world: { height: 7 } } };
