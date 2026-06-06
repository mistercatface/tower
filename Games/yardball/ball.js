import { wakePushableBody } from "../../Libraries/Motion/pushableSleep.js";

export const HERO_BALL_TAG = "_yardballHero";
export const GOAL_RADIUS = 32;

/**
 * @param {object} state
 * @returns {object | null}
 */
export function getHeroBall(state) {
    if (!state?.pickups) return null;
    for (let i = 0; i < state.pickups.length; i++) {
        const pickup = state.pickups[i];
        if (!pickup.isDead && pickup[HERO_BALL_TAG]) return pickup;
    }
    return null;
}

/**
 * @param {object | null | undefined} layout
 * @returns {{ x: number, y: number } | null}
 */
export function getGoalPosition(layout) {
    return layout?.spawnSlots?.foyer ?? null;
}

/**
 * @param {object} ball
 * @param {{ x: number, y: number }} goal
 */
export function isBallInGoal(ball, goal) {
    if (!ball || !goal) return false;
    const dx = ball.x - goal.x;
    const dy = ball.y - goal.y;
    const speedSq = (ball.vx ?? 0) ** 2 + (ball.vy ?? 0) ** 2;
    return dx * dx + dy * dy <= GOAL_RADIUS * GOAL_RADIUS && speedSq < 18 * 18;
}

/**
 * Tap anywhere to shove the hero ball toward that point.
 *
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 */
export function nudgeHeroBall(state, worldX, worldY) {
    const ball = getHeroBall(state);
    if (!ball) return;

    const dx = worldX - ball.x;
    const dy = worldY - ball.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return;

    const impulse = Math.min(155, 48 + dist * 0.42);
    ball.vx = (ball.vx ?? 0) + (dx / dist) * impulse;
    ball.vy = (ball.vy ?? 0) + (dy / dist) * impulse;
    wakePushableBody(ball);
}
