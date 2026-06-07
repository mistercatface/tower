import { WeaponSystem } from "../../Combat/WeaponSystem.js";
import { getRunScenePort } from "../../Core/GamePorts.js";
import { beginCueStickStrike, hideCueStick } from "../../Libraries/CueStick/cueStickController.js";
import { CUE_STICK_DEFAULTS } from "../../Libraries/CueStick/cueStickDefaults.js";
import { resolveCueStickFromAnchorDrag } from "../../Libraries/CueStick/cueStickPhysics.js";
import { circleLeadingPoint } from "../../Libraries/Spatial/geometry/circleContact.js";
import { rayCircleHitDistance } from "../../Libraries/Spatial/query/circleCast.js";
import { MAX_SHOT_POWER, MIN_SHOT_POWER, CUE_GRAB_RADIUS_PAD, POOL_BALL_RADIUS, POOL_CUE_HX, POOL_CUE_MAX_PULL, POOL_CUE_MIN_PULL_DRAG } from "./config/tableLayout.js";
import { getCueBall, ensurePoolState, allBallsStopped, getActiveBalls } from "./balls.js";
const { hy, height, rollAngle, pullScale } = CUE_STICK_DEFAULTS;
const hx = POOL_CUE_HX;
const maxPull = POOL_CUE_MAX_PULL;
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
 * @param {ReturnType<typeof resolveCueStickFromAnchorDrag>} physics
 */
function trackAimDrag(aim, physics) {
    aim.currentDrag = physics.drag;
    aim.currentPullBack = physics.pullBack;
}
/**
 * @param {object} cueBall
 * @param {object} aim
 */
function resolveAimPhysics(cueBall, aim) {
    const resolved = resolveCueStickFromAnchorDrag({
        ballX: cueBall.x,
        ballY: cueBall.y,
        ballRadius: cueBall.radius,
        anchorX: aim.anchorX,
        anchorY: aim.anchorY,
        gripX: aim.pullX,
        gripY: aim.pullY,
        pullScale,
        maxPull,
        hx,
        hy,
        height,
        rollAngle,
        lastShotNx: aim.shotNx,
        lastShotNy: aim.shotNy,
    });
    if (!resolved) return null;
    aim.shotNx = resolved.shotNx;
    aim.shotNy = resolved.shotNy;
    return resolved;
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
    return true;
}
/**
 * @param {object} state
 */
export function cancelAim(state) {
    const pool = ensurePoolState(state);
    pool.aim = null;
    hideCueStick(pool);
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
    const physics = resolveAimPhysics(cue, pool.aim);
    if (!physics) return;
    trackAimDrag(pool.aim, physics);
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
    const pullBack = aim.currentPullBack ?? 0;
    if (!beginCueStickStrike(pool, cue, { nx, ny, power, pullBack, maxPower: MAX_SHOT_POWER })) {
        cancelAim(state);
        return false;
    }
    pool.aim = null;
    pool.phase = "striking";
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
    const physics = resolveAimPhysics(cue, pool.aim);
    if (!physics) return null;
    return { nx: physics.shotNx, ny: physics.shotNy, power: computeShotPower(pool.aim), drag: physics.drag, pullBack: physics.pullBack, currentDrag: pool.aim.currentDrag };
}
/**
 * Cue-ball aim line — walls via {@link WeaponSystem.castLaser} (same as tower sights), balls via analytic ray.
 *
 * @param {object} state
 * @returns {import("../../Libraries/Spatial/query/contactPreview.js").BodyContactPreview | null}
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
    const layout = getRunScenePort().getLayout(state);
    const maxDist = layout?.tableWidth && layout?.tableHeight ? Math.hypot(layout.tableWidth, layout.tableHeight) : 2400;
    let stopDist = maxDist;
    for (const ball of getActiveBalls(state)) {
        if (ball === cue) continue;
        const otherR = ball.radius ?? radius;
        const t = rayCircleHitDistance(cue.x, cue.y, dx, dy, ball.x, ball.y, radius + otherR);
        if (t != null && t < stopDist) stopDist = t;
    }
    const wallHit = WeaponSystem.castLaser(cue.x, cue.y, angle, maxDist, state, radius);
    if (wallHit.dist < stopDist) stopDist = wallHit.dist;
    const lead = circleLeadingPoint(cue.x, cue.y, radius, dx, dy);
    // stopDist is center-path distance at contact; leading cap is one radius further along the shot axis
    const tail = { x: cue.x + dx * (stopDist + radius), y: cue.y + dy * (stopDist + radius) };
    return { primary: { x1: lead.x, y1: lead.y, x2: tail.x, y2: tail.y }, secondary: null, hit: null };
}
