import { PROP_PRIMITIVE_SPHERE } from "../../../Core/engineEnums.js";
export default { id: "snake", primitive: PROP_PRIMITIVE_SPHERE, sandbox: { tags: ["shapes", "nav"], spawnLabel: "Snake Chain" }, physics: { radius: 4, rolls: true, orientToMotion: true, canChain: true, quantizeSteps: { facing: 64 } } };
