import { PROP_PRIMITIVE_SPHERE } from "../../../Core/engineEnums.js";
import { NEUTRAL_SPHERE_VISUALS } from "../shared/neutralCoats.js";
export default { id: "ball", primitive: PROP_PRIMITIVE_SPHERE, sandbox: { tags: ["shapes", "nav"], spawnLabel: "Ball" }, physics: { radius: 4, rolls: true, density: 0.007958, friction: 4, wallPhysics: { restitution: 0.35, friction: 0.4 } }, visuals: NEUTRAL_SPHERE_VISUALS };
