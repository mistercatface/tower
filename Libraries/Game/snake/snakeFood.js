import { centerReachAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { hasGridCellLineOfSightCached } from "../../Navigation/perception/gridCellVision.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
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

export function canAgentEatSnakeFood(seeker, food) {
    if (!seeker || !food || food.isDead || !isSnakeFoodTarget(food)) return false;
    const seekerFaction = seeker.faction ?? null;
    const foodFaction = food.faction ?? null;
    if (!foodFaction) return true;
    if (!seekerFaction) return true;
    return seekerFaction !== foodFaction;
}

function isEdibleSnakeFoodForSeeker(seeker, food) {
    return food !== seeker && canAgentEatSnakeFood(seeker, food);
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

/** Per-target grid LOS — same path as classifyAgentVision, no cell-flood blob. */
export function findNearestVisibleSnakeFoodForFrame(state, seeker, frame, visionRange = frame.visionRange) {
    const navTopology = frame.navTopology;
    const grid = navTopology.grid;
    const originCol = grid.worldCol(seeker.x);
    const originRow = grid.worldRow(seeker.y);
    const range = visionRange.range;
    const rangeSq = range * range;
    const candidates = collectSnakeFoodCandidates(state, seeker, visionRange);
    let nearest = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const food = candidates[i];
        if (!isEdibleSnakeFoodForSeeker(seeker, food)) continue;
        const dx = food.x - seeker.x;
        const dy = food.y - seeker.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > rangeSq) continue;
        const foodCol = grid.worldCol(food.x);
        const foodRow = grid.worldRow(food.y);
        if (!hasGridCellLineOfSightCached(frame.visionSession, navTopology, originCol, originRow, foodCol, foodRow)) continue;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            nearest = food;
        }
    }
    return nearest;
}

export function findNearestVisibleSnakeFood(state, seeker, visionRange) {
    const frame = getObserverVisionFrame(state) ?? requireSnakeVisionFrame(state);
    const resolved = visionRange ?? frame.visionRange;
    return findNearestVisibleSnakeFoodForFrame(state, seeker, frame, resolved);
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
