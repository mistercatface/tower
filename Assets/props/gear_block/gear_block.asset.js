import { regularGearOutlineInto } from "../../../Libraries/Math/math.js";
import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
const GEAR_TEETH = 12;
const gearVerts = new Float32Array(GEAR_TEETH * 8);
regularGearOutlineInto(gearVerts, GEAR_TEETH, 14, 10);
export default { id: "gear_block", primitive: "polygon", sandbox: { tags: ["shapes"], dragInteract: true, dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Gear block" }, physics: { localFootprint: gearVerts, drawOutline: true, wallPhysics: { restitution: 0.2, friction: 0.7 } }, visuals: { colors: { ...NEUTRAL_BOX_COLORS }, world: { height: 10 } } };
