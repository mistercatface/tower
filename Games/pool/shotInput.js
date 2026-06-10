import { requestUiUpdate } from "../../Core/EventSystem.js";
import { getRunScenePort } from "../../Core/GamePorts.js";
import { applyCueStrikeCollision } from "../../Libraries/CueStick/cueStrikeCollision.js";
import { buildCueStrikeCircleTargets, computeCueStrikeAimLineSegment, resolveCueStrikeMaxRayDist } from "../../Libraries/CueStick/cueStrikeAimPreview.js";
import { normalizeXY } from "../../Libraries/Math/Vec2.js";
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
 * Cue-ball aim line — walls via {@link castSteppedCircleRay}, balls via analytic ray.
 *
 * @param {object} state
 * @returns {{ x1: number, y1: number, x2: number, y2: number } | null}
 */
export function getCueAimLinePreview(state) {
    const preview = getAimPreview(state);
    const cue = getCueBall(state);
    if (!preview || !cue) return null;
    const layout = getRunScenePort().getLayout(state);
    const radius = cue.radius ?? POOL_BALL_RADIUS;
    return computeCueStrikeAimLineSegment({
        originX: cue.x,
        originY: cue.y,
        radius,
        nx: preview.nx,
        ny: preview.ny,
        strikePower: preview.power,
        strategy: cue.strategy ?? {},
        wallCtx: wallContextFromState(state),
        circleTargets: buildCueStrikeCircleTargets(cue, getActiveBalls(state), radius),
        maxRayDist: resolveCueStrikeMaxRayDist({ tableWidth: layout?.tableWidth, tableHeight: layout?.tableHeight }),
    });
}
