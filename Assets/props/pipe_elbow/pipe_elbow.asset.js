import { NEUTRAL_SPHERE_VISUALS } from "../shared/neutralCoats.js";
export default { id: "pipe_elbow", primitive: "sphere", sandbox: { spawner: { defaultPropId: "ball", dragLaunch: { minPower: 20, maxPower: 750 } } }, physics: { radius: 8, friction: 7, density: 0.007851, wallPhysics: { restitution: 0.12, friction: 0.85 } }, visuals: NEUTRAL_SPHERE_VISUALS };
