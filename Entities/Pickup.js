import { Entity } from "./Entity.js";
import { applyVelocityDamping } from "../Libraries/Motion/index.js";
import { IDENTITY_ROLL_QUAT } from "../Libraries/Props/rollingMotion.js";
import { integratePropMotion } from "../Libraries/Props/propMotion.js";
import { HIT_BEHAVIOR_HANDLERS } from "../Libraries/Props/hitBehaviors.js";
import { initStandTipState, isStandTipActive } from "../Libraries/Props/standTipMotion.js";
import { withPropStrategyDefaults } from "../Libraries/Props/propStrategy.js";
import { getPropAsset, getWorldPropDefinitions } from "../Libraries/Content/PropCatalog.js";
import { transitionEntity } from "../Libraries/FSM/transition.js";
import { pickupStates } from "./PickupStates.js";
import { CircleShape, PolygonShape } from "../Libraries/Spatial/collision/Shapes.js";
import { syncLongAxisCollisionShape } from "../Libraries/Props/longAxisCollision.js";
import { isStandTipProp } from "../Libraries/Spatial/transforms/longAxisBox3d.js";
import { getWorldGen } from "../Core/GamePorts.js";
import { placeAtWallClearance } from "../Libraries/Pathfinding/PathClearance.js";
import { distanceToSegment } from "../Libraries/Spatial/geometry/WallGeometry.js";
import { MOVING_SPEED_SQ } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { speedSqXY } from "../Libraries/Math/Vec2.js";
import { resolveBodyRadius } from "../Libraries/Motion/bodyDefaults.js";
import { wakePushableBody } from "../Libraries/Motion/pushableSleep.js";
function buildWorldPropStrategy(type) {
    const def = getWorldPropDefinitions()[type];
    if (!def) return withPropStrategyDefaults({});
    const { hitBehavior, spawn, ...strategyFields } = def;
    return withPropStrategyDefaults({ ...strategyFields, isExplosive: hitBehavior === "explosive", onHit: HIT_BEHAVIOR_HANDLERS[hitBehavior] ?? HIT_BEHAVIOR_HANDLERS.none });
}
export class Pickup extends Entity {
    constructor(x, y, type, facing = null) {
        super(x, y, 0, false);
        this.type = type;
        this.strategy = buildWorldPropStrategy(type);
        if (this.strategy.halfExtents) {
            this.halfExtents = { ...this.strategy.halfExtents };
            if (!this.strategy.standTip) this.radius = Math.max(this.halfExtents.x, this.halfExtents.y);
            else this.radius = this.strategy.radius ?? this.halfExtents.x;
        } else this.radius = this.strategy.radius;
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;
        this.mass = this.strategy.mass;
        this.zIndex = 10;
        this.facing = facing ?? Math.random() * Math.PI * 2;
        if (this.strategy.standTip) {
            this._baseRadius = this.radius;
            initStandTipState(this);
        } else if (this.strategy.rolls) {
            this.rollQuat = { ...IDENTITY_ROLL_QUAT };
            if (this.strategy.rollAxis === "long") this.rollAngle = 0;
        }
        if (this.strategy.randomFaceLabels) {
            const crateVisuals = getPropAsset("crate")?.visuals;
            const faces = crateVisuals?.labelFaces ?? [];
            const variants = crateVisuals?.labelVariants ?? [];
            this.faceLabelVariants = Object.fromEntries(faces.map((face) => [face, Math.floor(Math.random() * Math.max(1, variants.length))]));
        }
        if (this.strategy.collisionShape === "box") {
            const hx = this.halfExtents?.x ?? this.radius;
            const hy = this.halfExtents?.y ?? this.radius;
            this.shape = new PolygonShape([
                { x: -hx, y: -hy },
                { x: hx, y: -hy },
                { x: hx, y: hy },
                { x: -hx, y: hy },
            ]);
        }
        if (this.strategy.maxHealth != null) {
            this.maxHealth = this.strategy.maxHealth;
            this.health = this.strategy.maxHealth;
        }
        this.ageMs = 0;
        this._sleepFrames = 0;
        this.isSleeping = false;
        this.stateTimer = 0;
        this.stateData = {};
        this.changeState("normal");
    }
    get momentOfInertia() {
        const m = this.mass || 1.0;
        if (isStandTipProp(this) && !this.isFallen) {
            const r = resolveBodyRadius(this);
            const h = this.strategy.rollHeight ?? this.strategy.uprightHeight ?? r * 2.5;
            return m * (r * r * 0.25 + (h * h) / 3);
        }
        if (isStandTipProp(this) && this.isFallen && this.halfExtents) {
            const w = this.halfExtents.x * 2;
            const h = this.halfExtents.y * 2;
            return (m * (w * w + h * h)) / 12;
        }
        if (this.shape && this.shape.type === "Polygon") {
            if (this.strategy.rollAxis === "long" && this.halfExtents) {
                const crossW = this.halfExtents.y * 2;
                const crossH = this.strategy.rollHeight ?? 3;
                return (m * (crossW * crossW + crossH * crossH)) / 12;
            }
            const w = this.halfExtents ? this.halfExtents.x * 2 : this.radius * 2;
            const h = this.halfExtents ? this.halfExtents.y * 2 : this.radius * 2;
            return (m * (w * w + h * h)) / 12;
        }
        return (m * this.radius * this.radius) / 2;
    }
    changeState(stateName, stateDataInit = null) {
        if (this.strategy?.isPushable) wakePushableBody(this);
        transitionEntity(this, pickupStates, stateName, stateDataInit);
    }
    getShape() {
        if (isStandTipProp(this)) return syncLongAxisCollisionShape(this);
        if (this.shape) return this.shape;
        if (this.strategy.collisionShape === "box" && this.halfExtents) {
            const hx = this.halfExtents.x;
            const hy = this.halfExtents.y;
            this.shape = new PolygonShape([
                { x: -hx, y: -hy },
                { x: hx, y: -hy },
                { x: hx, y: hy },
                { x: -hx, y: hy },
            ]);
            return this.shape;
        }
        this.shape = new CircleShape(this.radius || 0);
        return this.shape;
    }
    getRender3DKey() {
        if (this.currentState?.getRender3DKey) return this.currentState.getRender3DKey(this);
        return this.strategy.render3DKey;
    }
    takeDamage(amount, gameState) {
        if (this.maxHealth == null || this.isDead) return false;
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            if (this.currentStateName === "normal" && this.strategy.onFire) this.changeState("on_fire");
            else {
                this.changeState("exploded", { gameState });
                return true;
            }
        }
        return false;
    }
    explode(gameState) {
        if (this.isDead || this.currentStateName === "exploded") return;
        this.changeState("exploded", { gameState });
    }
    needsWallCollision() {
        if (this.currentState?.disableWallCollision) return false;
        return speedSqXY(this.vx, this.vy) > MOVING_SPEED_SQ;
    }
    update(dt, state, spatialFrame, { resolveWalls = false } = {}) {
        this.ageMs += dt;
        if (this.currentState?.disablePhysics) {
            if (this.currentState?.update) this.currentState.update(this, dt, state.walls, state);
            return;
        }
        if (this.isSleeping && (!this.strategy?.standTip || !isStandTipActive(this))) return;
        if (this.strategy.rolls || this.strategy.standTip) integratePropMotion(this, dt);
        else applyVelocityDamping(this, dt, { friction: this.strategy.friction });
        if (resolveWalls && this.strategy.isPushable && this.needsWallCollision()) state.wallResolver.resolve(this, spatialFrame);
        if (this.currentState?.update) this.currentState.update(this, dt, state.walls, state);
    }
    spawnShards(gameState) {
        if (!gameState || !gameState.pickups) return;
        const width = this.halfExtents ? this.halfExtents.x * 2 : this.radius * 2;
        const height = this.halfExtents ? this.halfExtents.y * 2 : this.radius * 2;
        const minSize = 3;
        const localRects = partitionCrateLocal(width, height, minSize, 1);
        const cos = Math.cos(this.facing);
        const sin = Math.sin(this.facing);
        for (const rect of localRects) {
            const localCx = (rect.minX + rect.maxX) / 2;
            const localCy = (rect.minY + rect.maxY) / 2;
            const hx = (rect.maxX - rect.minX) / 2;
            const hy = (rect.maxY - rect.minY) / 2;
            const worldX = this.x + localCx * cos - localCy * sin;
            const worldY = this.y + localCx * sin + localCy * cos;
            const shard = new Pickup(worldX, worldY, "crate_shard", this.facing);
            shard.halfExtents = { x: hx, y: hy };
            shard.radius = Math.hypot(hx, hy);
            shard.shape = new PolygonShape([
                { x: -hx, y: -hy },
                { x: hx, y: -hy },
                { x: hx, y: hy },
                { x: -hx, y: hy },
            ]);
            let dx = worldX - this.x;
            let dy = worldY - this.y;
            let dist = Math.hypot(dx, dy);
            if (dist > 0) {
                dx /= dist;
                dy /= dist;
            } else {
                const angle = Math.random() * Math.PI * 2;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
            }
            const speed = 40 + Math.random() * 60;
            shard.vx = this.vx + dx * speed + (Math.random() - 0.5) * 15;
            shard.vy = this.vy + dy * speed + (Math.random() - 0.5) * 15;
            wakePushableBody(shard);
            shard.changeState("shard_flying");
            gameState.pickups.push(shard);
        }
    }
}
function partitionCrateLocal(width, height, minSize, maxDepth = 2) {
    const results = [];
    function recurse(rect, depth) {
        const w = rect.maxX - rect.minX;
        const h = rect.maxY - rect.minY;
        const canSplitH = h >= minSize * 2;
        const canSplitV = w >= minSize * 2;
        if (depth >= maxDepth || (!canSplitH && !canSplitV)) {
            results.push(rect);
            return;
        }
        let splitVertical = false;
        if (canSplitH && canSplitV)
            if (w > h * 1.3) splitVertical = true;
            else if (h > w * 1.3) splitVertical = false;
            else splitVertical = Math.random() < 0.5;
        else if (canSplitV) splitVertical = true;
        else splitVertical = false;
        if (splitVertical) {
            const minT = rect.minX + minSize;
            const maxT = rect.maxX - minSize;
            const t = minT + Math.random() * (maxT - minT);
            recurse({ minX: rect.minX, minY: rect.minY, maxX: t, maxY: rect.maxY }, depth + 1);
            recurse({ minX: t, minY: rect.minY, maxX: rect.maxX, maxY: rect.maxY }, depth + 1);
        } else {
            const minT = rect.minY + minSize;
            const maxT = rect.maxY - minSize;
            const t = minT + Math.random() * (maxT - minT);
            recurse({ minX: rect.minX, minY: rect.minY, maxX: rect.maxX, maxY: t }, depth + 1);
            recurse({ minX: rect.minX, minY: t, maxX: rect.maxX, maxY: rect.maxY }, depth + 1);
        }
    }
    recurse({ minX: -width / 2, minY: -height / 2, maxX: width / 2, maxY: height / 2 }, 0);
    return results;
}
export function spawnPickup(state, playerX, playerY, minRadius, maxRadius, type) {
    const grid = state.obstacleGrid;
    let spawned = false;
    let attempts = 0;
    while (!spawned && attempts < 100) {
        attempts++;
        const angle = Math.random() * Math.PI * 2;
        const dist = minRadius + Math.random() * (maxRadius - minRadius);
        const testX = playerX + Math.cos(angle) * dist;
        const testY = playerY + Math.sin(angle) * dist;
        if (trySpawnPickupAt(state, testX, testY, type)) spawned = true;
    }
}
function trySpawnPickupAt(state, x, y, type) {
    const grid = state.obstacleGrid;
    const gridPos = grid.worldToGrid(x, y);
    if (gridPos.col < 0 || gridPos.col >= grid.cols || gridPos.row < 0 || gridPos.row >= grid.rows) return false;
    const idx = gridPos.row * grid.cols + gridPos.col;
    if (grid.grid[idx] === 1) return false;
    if (isOneCellWideCorridor(grid.grid, grid.cols, grid.rows, gridPos.col, gridPos.row)) return false;
    const { x: centerX, y: centerY } = grid.gridToWorld(gridPos.col, gridPos.row);
    state.pickups.push(new Pickup(centerX, centerY, type));
    return true;
}
function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
}
function isGridCellBlocked(grid, cols, rows, col, row) {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return true;
    return grid[row * cols + col] === 1;
}
/** True when the cell sits in a corridor only one tile wide (horizontal or vertical). */
function isOneCellWideCorridor(grid, cols, rows, col, row) {
    const blockedN = isGridCellBlocked(grid, cols, rows, col, row - 1);
    const blockedS = isGridCellBlocked(grid, cols, rows, col, row + 1);
    const blockedW = isGridCellBlocked(grid, cols, rows, col - 1, row);
    const blockedE = isGridCellBlocked(grid, cols, rows, col + 1, row);
    return (blockedN && blockedS) || (blockedW && blockedE);
}
function touchesWallCell(grid, cols, rows, col, row) {
    for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ]) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        if (grid[nr * cols + nc] === 1) return true;
    }
    return false;
}
function isValidWallPropSpot(obstacleGrid, x, y, radius, layout) {
    if (Math.hypot(x - layout.spawnX, y - layout.spawnY) < layout.spawnClearRadius) return false;
    if (obstacleGrid.isBlockedWorld(x, y)) return false;
    const walls = obstacleGrid.getNearbySegments({ x, y, radius: radius + 48 });
    for (const wall of walls) {
        if (wall.isDead) continue;
        if (distanceToSegment(wall, x, y) < radius - 0.5) return false;
    }
    return true;
}
function collectWallAdjacentCells(state, layout, propRadius) {
    const grid = state.obstacleGrid;
    const minGrid = grid.worldToGrid(layout.minX, layout.minY);
    const maxGrid = grid.worldToGrid(layout.maxX, layout.maxY);
    const startCol = Math.max(0, minGrid.col);
    const endCol = Math.min(grid.cols - 1, maxGrid.col);
    const startRow = Math.max(0, minGrid.row);
    const endRow = Math.min(grid.rows - 1, maxGrid.row);
    const cells = [];
    const seen = new Set();
    for (let row = startRow; row <= endRow; row++)
        for (let col = startCol; col <= endCol; col++) {
            const idx = row * grid.cols + col;
            if (grid.grid[idx] !== 0) continue;
            if (isOneCellWideCorridor(grid.grid, grid.cols, grid.rows, col, row)) continue;
            if (!touchesWallCell(grid.grid, grid.cols, grid.rows, col, row)) continue;
            const seed = grid.gridToWorld(col, row);
            const spot = placeAtWallClearance(grid, seed.x, seed.y, propRadius);
            if (!isValidWallPropSpot(grid, spot.x, spot.y, propRadius, layout)) continue;
            const resolvedGrid = grid.worldToGrid(spot.x, spot.y);
            if (isOneCellWideCorridor(grid.grid, grid.cols, grid.rows, resolvedGrid.col, resolvedGrid.row)) continue;
            const key = `${resolvedGrid.col},${resolvedGrid.row}`;
            if (seen.has(key)) continue;
            seen.add(key);
            cells.push({ col: resolvedGrid.col, row: resolvedGrid.row, x: spot.x, y: spot.y, facing: spot.facing });
        }
    return cells;
}
export function spawnStartGamePickups(state, playerX, playerY) {
    const layout = getWorldGen().getStartLayout(playerX, playerY, state.obstacleGrid.cellSize);
    const propRadius = getWorldPropDefinitions().crate.radius;
    const wallCells = collectWallAdjacentCells(state, layout, propRadius);
    shuffleInPlace(wallCells);
    const crateCount = Math.min(50 + Math.floor(Math.random() * 26), wallCells.length);
    for (let i = 0; i < crateCount; i++) {
        const cell = wallCells[i];
        state.pickups.push(new Pickup(cell.x, cell.y, "crate", cell.facing));
    }
    const barrelCount = 4 + Math.floor(Math.random() * 5);
    const barrelsToPlace = Math.min(barrelCount, wallCells.length - crateCount);
    for (let i = 0; i < barrelsToPlace; i++) {
        const cell = wallCells[crateCount + i];
        state.pickups.push(new Pickup(cell.x, cell.y, "barrel"));
    }
}
export function spawnInitialPickups(state, playerX, playerY) {
    for (const [type, def] of Object.entries(getWorldPropDefinitions())) {
        const spawn = def.spawn;
        if (!spawn) continue;
        const count = spawn.minCount + Math.floor(Math.random() * spawn.randomRange);
        for (let i = 0; i < count; i++) spawnPickup(state, playerX, playerY, spawn.minRadius, spawn.maxRadius, type);
    }
}
