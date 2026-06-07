import { requestUiUpdate } from "../../Core/EventSystem.js";
import { getRunScenePort } from "../../Core/GamePorts.js";
import { applyCueStrikeCollision, CUE_BALL_RESTITUTION } from "../../Libraries/CueStick/cueStrikeCollision.js";
import { normalizeXY } from "../../Libraries/Math/Vec2.js";
import { circleLeadingPoint } from "../../Libraries/Spatial/geometry/circleContact.js";
import { rayCircleHitDistance } from "../../Libraries/Spatial/query/circleCast.js";
import { castSteppedCircleRay } from "../../Libraries/Spatial/query/steppedCircleRayCast.js";
import { wallContextFromState } from "../../Libraries/Spatial/query/wallContext.js";
import { MAX_SHOT_POWER, MIN_SHOT_POWER, CUE_GRAB_RADIUS_PAD, POOL_BALL_RADIUS, POOL_CUE_MAX_PULL, POOL_CUE_PULL_SCALE, POOL_CUE_MIN_PULL_DRAG } from "./config/tableLayout.js";
import { getCueBall, ensurePoolState, allBallsStopped, getActiveBalls } from "./balls.js";
const maxPull = POOL_CUE_MAX_PULL;
const pullScale = POOL_CUE_PULL_SCALE;
const minPullDrag = POOL_CUE_MIN_PULL_DRAG;
/** Finger drag at full cue pull-back. */
const MAX_FINGER_DRAG = maxPull / pullScale;
/**
 * @param {object} aim
 */
function computeShotPower(aim) {
    const pullRatio = Math.min(1, (aim.currentDrag ?? 0) / MAX_FINGER_DRAG);
    return Math.min(MAX_SHOT_POWER, Math.max(MIN_SHOT_POWER, pullRatio * MAX_SHOT_POWER));
}
/**
 * @param {object} aim
 * @param {{ drag: number, pullBack: number }} physics
 */
function trackAimDrag(aim, physics) {
    aim.currentDrag = physics.drag;
    aim.currentPullBack = physics.pullBack;
}
/**
 * Press = anchor. Drag offset sets shot angle (opposite drag) and pull-back for power.
 *
 * @param {object} aim
 */
function resolveAimPhysics(aim) {
    const dx = aim.pullX - aim.anchorX;
    const dy = aim.pullY - aim.anchorY;
    const { nx, ny, len: drag } = normalizeXY(dx, dy);
    if (drag < 0.5) {
        if (aim.shotNx == null || aim.shotNy == null) return null;
        return { shotNx: aim.shotNx, shotNy: aim.shotNy, drag: 0, pullBack: 0 };
    }
    aim.shotNx = -nx;
    aim.shotNy = -ny;
    const pullBack = Math.min(maxPull, drag * pullScale);
    return { shotNx: aim.shotNx, shotNy: aim.shotNy, drag, pullBack };
}
/**
 * @param {object} cue
 * @param {number} worldX
 * @param {number} worldY
 */
export function pointerNearCueBall(cue, worldX, worldY) {
    const dx = worldX - cue.x;
    const dy = worldY - cue.y;
    const grab = cue.radius + CUE_GRAB_RADIUS_PAD;
    return dx * dx + dy * dy <= grab * grab;
}
/**
 * @param {object} state
 */
export function canBeginAim(state) {
    const pool = ensurePoolState(state);
    if (pool.phase !== "aiming" || pool.won) return false;
    return allBallsStopped(state);
}
/**
 * Press = anchor (0,0). Drag sets angle and pull-back from that offset.
 *
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 * @returns {boolean}
 */
export function tryBeginAim(state, worldX, worldY) {
    if (!canBeginAim(state)) return false;
    if (!getCueBall(state)) return false;
    const pool = ensurePoolState(state);
    pool.aim = { active: true, anchorX: worldX, anchorY: worldY, pullX: worldX, pullY: worldY, shotNx: null, shotNy: null, currentDrag: 0, currentPullBack: 0 };
    requestUiUpdate();
    return true;
}
/**
 * @param {object} state
 */
export function cancelAim(state) {
    const pool = ensurePoolState(state);
    if (!pool.aim) return;
    pool.aim = null;
    requestUiUpdate();
}
/**
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 */
export function updateAim(state, worldX, worldY) {
    const pool = ensurePoolState(state);
    if (!pool.aim?.active) return;
    pool.aim.pullX = worldX;
    pool.aim.pullY = worldY;
    const cue = getCueBall(state);
    if (!cue) return;
    const physics = resolveAimPhysics(pool.aim);
    if (!physics) return;
    trackAimDrag(pool.aim, physics);
    requestUiUpdate();
}
/**
 * Release finger to shoot. Power from peak pull distance; angle from drag offset.
 *
 * @param {object} state
 * @param {number} worldX
 * @param {number} worldY
 * @returns {boolean}
 */
export function releaseAimShot(state, worldX, worldY) {
    const pool = ensurePoolState(state);
    if (!pool.aim?.active) return false;
    updateAim(state, worldX, worldY);
    const cue = getCueBall(state);
    if (!cue) {
        cancelAim(state);
        return false;
    }
    const aim = pool.aim;
    if (aim.currentDrag < minPullDrag || aim.shotNx == null || aim.shotNy == null) {
        cancelAim(state);
        return false;
    }
    const nx = aim.shotNx;
    const ny = aim.shotNy;
    const power = computeShotPower(aim);
    applyCueStrikeCollision(cue, { nx, ny, power });
    pool.aim = null;
    pool.phase = "rolling";
    requestUiUpdate();
    return true;
}
/**
 * @param {object} state
 */
export function getAimPreview(state) {
    const pool = ensurePoolState(state);
    if (!pool.aim?.active) return null;
    const cue = getCueBall(state);
    if (!cue) return null;
    const physics = resolveAimPhysics(pool.aim);
    if (!physics) return null;
    return { nx: physics.shotNx, ny: physics.shotNy, power: computeShotPower(pool.aim), drag: physics.drag, pullBack: physics.pullBack, currentDrag: pool.aim.currentDrag };
}
/**
 * Estimate the travel distance of a ball with initial velocity v0 under rolling friction.
 *
 * @param {number} v0
 * @param {object} strategy
 * @returns {number}
 */
export function estimateCueBallTravelDistance(v0, strategy) {
    const fBase = strategy.friction ?? 0.5;
    const fLow = strategy.lowSpeedFriction ?? 2.8;
    const vTh = strategy.lowSpeedFrictionThreshold ?? 10;
    const sC = strategy.snapSpeed ?? 1.8;
    if (v0 <= sC) return 0;
    const b = fLow - fBase;
    if (Math.abs(b) < 1e-5) return (v0 - sC) / fBase;
    if (v0 >= vTh) {
        const d1 = (v0 - vTh) / fBase;
        const a = fBase;
        const uMax = 1 - sC / vTh;
        const d2 = (vTh / Math.sqrt(a * b)) * Math.atan(uMax * Math.sqrt(b / a));
        return d1 + d2;
    } else {
        const a = fBase;
        const b = fLow - fBase;
        const uMax = 1 - sC / vTh;
        const uMin = 1 - v0 / vTh;
        const factor = vTh / Math.sqrt(a * b);
        const k = Math.sqrt(b / a);
        return factor * (Math.atan(uMax * k) - Math.atan(uMin * k));
    }
}
/**
 * Cue-ball aim line — walls via {@link castSteppedCircleRay}, balls via analytic ray.
 *
 * @param {object} state
 * @returns {{ x1: number, y1: number, x2: number, y2: number } | null}
 */
export function getCueAimLinePreview(state) {
    const preview = getAimPreview(state);
    const cue = getCueBall(state);
    if (!preview || !cue) return null;
    const { nx, ny } = preview;
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) return null;
    const dx = nx / len;
    const dy = ny / len;
    const angle = Math.atan2(dy, dx);
    const radius = cue.radius ?? POOL_BALL_RADIUS;
    // Estimate travel distance based on strike impulse physics and table friction
    const speed = preview.power;
    const v0 = (speed * (1 + CUE_BALL_RESTITUTION)) / 2;
    const travelDist = estimateCueBallTravelDistance(v0, cue.strategy ?? {});
    const layout = getRunScenePort().getLayout(state);
    const maxDist = layout?.tableWidth && layout?.tableHeight ? Math.hypot(layout.tableWidth, layout.tableHeight) : 2400;
    // Capped by how far the cue ball can actually travel
    let stopDist = Math.min(maxDist, travelDist);
    for (const ball of getActiveBalls(state)) {
        if (ball === cue) continue;
        const otherR = ball.radius ?? radius;
        const t = rayCircleHitDistance(cue.x, cue.y, dx, dy, ball.x, ball.y, radius + otherR);
        if (t != null && t < stopDist) stopDist = t;
    }
    const wallHit = castSteppedCircleRay(cue.x, cue.y, angle, maxDist, radius, { wallCtx: wallContextFromState(state) });
    if (wallHit.dist < stopDist) stopDist = wallHit.dist;
    const lead = circleLeadingPoint(cue.x, cue.y, radius, dx, dy);
    // stopDist is center-path distance at contact; leading cap is one radius further along the shot axis
    return { x1: lead.x, y1: lead.y, x2: cue.x + dx * (stopDist + radius), y2: cue.y + dy * (stopDist + radius) };
}
