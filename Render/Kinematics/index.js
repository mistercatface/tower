/**
 * Pseudo-3D humanoid rendering (ported from cw803 kinematics, ES-module encapsulated).
 *
 * - CharacterAppearance: procedural skin/outfit
 * - createKinematicsBundle: rig, poses, animation, sprite cache, perspective
 * - PlayerKinematicsRenderer: player-facing facade
 */
export { getCharacterForActor, generateCharacter, clearCharacterAppearanceCache } from "./CharacterAppearance.js";
export { computeFinalRenderRotation, resolveCombatFacing } from "./KinematicsFacing.js";
export { createKinematicsBundle } from "./createKinematicsBundle.js";
export {
    resolveWeaponDrawSlots,
    resolveWeaponStaticPoseName,
    getWeaponVisualForGunId,
} from "./KinematicsWeaponVisuals.js";
export {
    PlayerKinematicsRenderer,
    getKinematicsRenderer,
    getPlayerKinematicsRenderer,
    advanceActorKinematics,
    renderActorKinematicsBody,
    kinematicsPixelSizeForRadius,
} from "./PlayerKinematicsRenderer.js";
