import { centerReachAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { buildVisionCellSet, isPointVisibleFromHeadVision } from "../../Navigation/perception/gridCellVision.js";
import { kineticSpatial } from "../../../Systems/World/KineticSpatialFrame.js";
import { isSnakeFracturableDeadSegment, SNAKE_SHARD_PROP_ID } from "./snakeSegmentFracture.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
const FOOD_QUERY_BOUNDS = createAabb();
const ALL_FOOD_QUERY_BOUNDS = createAabb();
export function isSnakeShardFood(prop) {
    return prop?.type === SNAKE_SHARD_PROP_ID;
}
export function isSnakeFoodTarget(prop) {
    return isSnakeShardFood(prop) || isSnakeFracturableDeadSegment(prop);
}
function snakeWorldBoundsInto(out, state) {
    const grid = state.obstacleGrid;
    out.minX = grid.minX;
    out.minY = grid.minY;
    out.maxX = grid.maxX;
    out.maxY = grid.maxY;
    return out;
}
export function collectSnakeFoodPropsInBounds(state, bounds, spatialFrame = kineticSpatial) {
    return state.entityRegistry.queryView({ bounds, kinds: ["worldProp"], filterId: "snakeFood", hitTest: "circle", match: isSnakeFoodTarget }, spatialFrame);
}
export function collectSnakeFoodProps(state, spatialFrame = kineticSpatial) {
    return collectSnakeFoodPropsInBounds(state, snakeWorldBoundsInto(ALL_FOOD_QUERY_BOUNDS, state), spatialFrame);
}
function collectSnakeFoodCandidates(state, seeker, visionRange, spatialFrame = kineticSpatial) {
    centerReachAabbInto(FOOD_QUERY_BOUNDS, seeker.x, seeker.y, visionRange.range);
    return collectSnakeFoodPropsInBounds(state, FOOD_QUERY_BOUNDS, spatialFrame);
}
export function findNearestVisibleSnakeFoodFromVision(state, seeker, frame, vision, visionRange = frame.visionRange) {
    if (!vision) return null;
    const cellSet = buildVisionCellSet(vision.cells, frame.navTopology.grid.cols);
    const candidates = collectSnakeFoodCandidates(state, seeker, visionRange);
    let nearest = null;
    let bestDist = Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const food = candidates[i];
        if (food === seeker || food.isDead) continue;
        if (!isPointVisibleFromHeadVision(food.x, food.y, seeker.x, seeker.y, vision.originCol, vision.originRow, visionRange.range, cellSet, frame.navTopology, frame.visionSession)) continue;
        const dist = Math.hypot(food.x - seeker.x, food.y - seeker.y);
        if (dist < bestDist) {
            bestDist = dist;
            nearest = food;
        }
    }
    return nearest;
}
export function collectVisibleSnakeFoodFromVision(state, seeker, frame, vision, visionRange = frame.visionRange) {
    if (!vision) return [];
    const cellSet = buildVisionCellSet(vision.cells, frame.navTopology.grid.cols);
    const candidates = collectSnakeFoodCandidates(state, seeker, visionRange);
    const visible = [];
    for (let i = 0; i < candidates.length; i++) {
        const food = candidates[i];
        if (food === seeker || food.isDead) continue;
        if (!isPointVisibleFromHeadVision(food.x, food.y, seeker.x, seeker.y, vision.originCol, vision.originRow, visionRange.range, cellSet, frame.navTopology, frame.visionSession)) continue;
        visible.push(food);
    }
    return visible;
}
export function findNearestVisibleSnakeFood(state, seeker, visionRange) {
    const frame = requireSnakeVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    const vision = frame.readHeadVision(seeker, resolved);
    return findNearestVisibleSnakeFoodFromVision(state, seeker, frame, vision, resolved);
}
export function countLiveSnakeFood(state) {
    return collectSnakeFoodProps(state).length;
}
export function findNearestSnakeFood(state, x, y) {
    const foodProps = collectSnakeFoodProps(state);
    let nearest = null;
    let bestDist = Infinity;
    for (let i = 0; i < foodProps.length; i++) {
        const food = foodProps[i];
        const dist = Math.hypot(food.x - x, food.y - y);
        if (dist < bestDist) {
            bestDist = dist;
            nearest = food;
        }
    }
    return nearest;
}
export function findSnakeFoodProp(state) {
    return collectSnakeFoodProps(state)[0] ?? null;
}
