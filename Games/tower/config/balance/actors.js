export { LIBRARY_COMBAT_ACTOR_RADIUS as combatActorRadius, LIBRARY_KINEMATICS_PIXEL_SIZE as kinematicsPixelSize } from "../../../../Libraries/Motion/bodyDefaults.js";
export const sidekickBaseStats = { turnSpeed: Math.PI * 2.5, range: 150, maxHealth: 10, accuracy: 0.7, penetration: 0, speed: 55 };
export const playerBaseStats = {
    turnSpeed: Math.PI * 3,
    range: 150,
    maxHealth: 10,
    accuracy: 0.75,
    penetration: 0,
    moveSpeedMultiplier: 1.0,
    fireIntervalMultiplier: 1.0,
    reloadSpeedMultiplier: 1.0,
    speed: 50,
    startingAbilities: ["Reposition"],
};
export const enemyBaseStats = { turnSpeed: 10, range: 112, accuracy: 0.9, penetration: 0, moveSpeedMultiplier: 1.0, fireIntervalMultiplier: 1.0, reloadSpeedMultiplier: 1.0, speed: 75 };
