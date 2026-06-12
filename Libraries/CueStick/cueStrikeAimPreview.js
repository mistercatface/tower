import { computeCircleAimLineSegment, estimateRollingTravelDistance } from "../Spatial/query/circleAimLinePreview.js";
import { wallContextFromState } from "../Spatial/query/wallContext.js";
import { CUE_BALL_RESTITUTION } from "./cueStrikeCollision.js";
/** Post-strike cue-ball speed from striker approach speed (equal-mass impulse + restitution). */
export function postCueStrikeSpeed(strikePower) {
    return (strikePower * (1 + CUE_BALL_RESTITUTION)) / 2;
}
/** Rolling travel distance after a cue strike at the given pull power. */
export function estimateCueStrikeTravelDistance(strikePower, strategy = {}) {
    return estimateRollingTravelDistance(postCueStrikeSpeed(strikePower), strategy);
}
/** @param {object} body */
function isCueStrikeAimTarget(body) {
    if (!body || body.isDead) return false;
    const state = body.currentStateName;
    return state !== "voidSink" && state !== "sinking";
}
/**
 * Circle targets for cue-ball aim preview — skips dead and pocket-sinking bodies.
 *
 * @param {object} shooter
 * @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry
 * @param {number} [defaultRadius]
 */
export function buildCueStrikeCircleTargets(shooter, registry, defaultRadius = 8) {
    const shooterRadius = shooter?.radius ?? defaultRadius;
    const targets = [];
    registry.forEachOfKind("worldProp", (body) => {
        if (body === shooter || !isCueStrikeAimTarget(body)) return;
        targets.push({ x: body.x, y: body.y, radius: body.radius ?? shooterRadius });
    });
    return targets;
}
/**
 * @param {{ obstacleGrid?: import("../Math/Aabb2D.js").Aabb2D | null, tableWidth?: number, tableHeight?: number, fallback?: number }} options
 */
export function resolveCueStrikeMaxRayDist({ obstacleGrid, tableWidth, tableHeight, fallback = 2400 } = {}) {
    if (tableWidth && tableHeight) return Math.hypot(tableWidth, tableHeight);
    if (obstacleGrid?.minX != null) return Math.hypot(obstacleGrid.maxX - obstacleGrid.minX, obstacleGrid.maxY - obstacleGrid.minY) * 1.25;
    return fallback;
}
/**
 * Aim arrow for a cue strike — walls via stepped circle ray, balls via analytic ray.
 *
 * @param {{
 *   originX: number,
 *   originY: number,
 *   radius: number,
 *   nx: number,
 *   ny: number,
 *   strikePower: number,
 *   strategy?: object,
 *   wallCtx?: import("../Spatial/query/wallContext.js").WallContext | null,
 *   circleTargets?: import("../Spatial/query/circleAimLinePreview.js").CircleAimLineTarget[],
 *   maxRayDist?: number,
 * }} options
 */
export function computeCueStrikeAimLineSegment({ originX, originY, radius, nx, ny, strikePower, strategy = {}, wallCtx = null, circleTargets = [], maxRayDist = 2400 }) {
    if (strikePower <= 0) return null;
    return computeCircleAimLineSegment({ originX, originY, radius, nx, ny, maxTravelDist: estimateCueStrikeTravelDistance(strikePower, strategy), maxRayDist, wallCtx, circleTargets });
}
/**
 * @param {object} cueBall
 * @param {object} state
 * @param {{ tableWidth?: number, tableHeight?: number }} [bounds]
 */
export function buildCueStrikeAimLineContext(cueBall, state, { tableWidth, tableHeight } = {}) {
    if (!cueBall || !state) return null;
    const radius = cueBall.radius;
    return {
        prop: cueBall,
        radius,
        circleTargets: buildCueStrikeCircleTargets(cueBall, state.entityRegistry, radius),
        wallCtx: wallContextFromState(state),
        maxRayDist: resolveCueStrikeMaxRayDist({ obstacleGrid: state.obstacleGrid, tableWidth, tableHeight }),
    };
}
/**
 * @param {{ nx: number, ny: number, power: number, anchorX?: number, anchorY?: number } | null} preview
 * @param {ReturnType<typeof buildCueStrikeAimLineContext>} aimLineContext
 */
export function getCueStrikeAimLine(preview, aimLineContext) {
    if (!preview || preview.power <= 0 || !aimLineContext) return null;
    const prop = aimLineContext.prop;
    return computeCueStrikeAimLineSegment({
        originX: prop?.x ?? preview.anchorX,
        originY: prop?.y ?? preview.anchorY,
        radius: aimLineContext.radius,
        nx: preview.nx,
        ny: preview.ny,
        strikePower: preview.power,
        strategy: prop?.strategy ?? {},
        wallCtx: aimLineContext.wallCtx,
        circleTargets: aimLineContext.circleTargets,
        maxRayDist: aimLineContext.maxRayDist,
    });
}
