/** Shared collision + kinematics radius for all combat humanoids (for now). */
export const combatActorRadius = 8;
/** Internal kinematics render resolution (rig + offscreen canvas scale). */
export const kinematicsPixelSize = 32;
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
