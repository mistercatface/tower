import { LIBRARY_COLLISION_DEFAULTS } from "../../Libraries/Collision/collisionDefaults.js";
import { mergePartial } from "../../Libraries/Config/mergePartial.js";

/** Library defaults + optional project overrides passed as the second argument when needed. */
export const engineCollisionSettings = mergePartial(LIBRARY_COLLISION_DEFAULTS);
