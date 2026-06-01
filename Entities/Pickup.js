import { Entity } from "./Entity.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { worldPropDefinitions } from "../Config/PropDefinitions.js";
import { CRATE_LABEL_VARIANTS, CRATE_LABEL_FACES } from "../Config/props/Crate.js";
import { transitionEntity } from "./EntityFsm.js";
import { pickupStates } from "./PickupStates.js";
import { PolygonShape } from "../Spatial/Geometry/Shapes.js";
import { getProjectileDamage } from "../Combat/impactDamage.js";
import { resolvePickupInspect } from "../Render/Inspector/InspectRegistry.js";
import { getStartNodeLayout } from "../Generator/StartNodeBuilding.js";
import { placeAtWallClearance } from "../Spatial/Navigation/PathClearance.js";
import { distanceToSegment } from "../Spatial/Geometry/WallGeometry.js";

const PICKUP_STRATEGY_DEFAULTS = {
    isPushable: false,
    renderMode: "3d",
    render3DKey: null,
    inspectKey: null,
    isExplosive: false,
    laserTargetable: false,
    mass: 1,
    friction: 8,
    wallPhysics: null,
    maxHealth: null,
};

function withPickupDefaults(strategy) {
    return { ...PICKUP_STRATEGY_DEFAULTS, ...strategy };
}

function explosiveOnHit(state, pickup, projectile, events) {
    if (projectile?.isExplosion) {
        pickup.explode(state);
        return true;
    }
    const dmg = projectile ? getProjectileDamage(projectile) : 0;
    pickup.takeDamage(dmg, state);
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return true;
}

function damageOnHit(state, pickup, projectile, events) {
    if (projectile?.isExplosion) {
        pickup.explode(state);
        return true;
    }
    const dmg = projectile?.damage ?? 0;
    pickup.takeDamage(dmg, state);
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return true;
}

const HIT_BEHAVIORS = { none: () => false, explosive: explosiveOnHit, damage: damageOnHit };

const worldPropStrategies = Object.fromEntries(
    Object.entries(worldPropDefinitions).map(([type, def]) => {
        const { hitBehavior, spawn, ...strategyFields } = def;
        return [type, withPickupDefaults({ ...strategyFields, isExplosive: hitBehavior === "explosive", onHit: HIT_BEHAVIORS[hitBehavior] ?? HIT_BEHAVIORS.none })];
    }),
);

export class Pickup extends Entity {
    constructor(x, y, type, facing = null) {
        super(x, y, 0, false);
        this.type = type;
        this.strategy = worldPropStrategies[type];
        this.radius = this.strategy.radius;
        this.vx = 0;
        this.vy = 0;
        this.mass = this.strategy.mass;
        this.zIndex = 10;
        this.facing = facing ?? Math.random() * Math.PI * 2;
        if (type === "crate") {
            this.faceLabelVariants = Object.fromEntries(CRATE_LABEL_FACES.map((face) => [face, Math.floor(Math.random() * CRATE_LABEL_VARIANTS.length)]));
            const r = this.radius;
            this.shape = new PolygonShape([
                { x: -r, y: -r },
                { x: r, y: -r },
                { x: r, y: r },
                { x: -r, y: r }
            ]);
        }
        if (this.strategy.maxHealth != null) {
            this.maxHealth = this.strategy.maxHealth;
            this.health = this.strategy.maxHealth;
        }
        this.stateTimer = 0;
        this.stateData = {};
        this.changeState("normal");
    }

    changeState(stateName, stateDataInit = null) {
        transitionEntity(this, pickupStates, stateName, stateDataInit);
    }

    getRender3DKey() {
        if (this.currentState?.getRender3DKey) return this.currentState.getRender3DKey(this);
        return this.strategy.render3DKey;
    }

    resolveInspect() {
        return resolvePickupInspect(this);
    }

    takeDamage(amount, gameState) {
        if (this.maxHealth == null || this.isDead) return false;

        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            if (this.currentStateName === "normal" && this.type === "barrel") {
                this.changeState("on_fire");
            } else {
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
        return this.vx * this.vx + this.vy * this.vy > 0.25;
    }

    update(dt, state, spatialFrame, { resolveWalls = false } = {}) {
        PhysicsSystem.applyFrictionAndDrag(this, dt, this.strategy.friction);
        if (resolveWalls && this.strategy.isPushable && this.needsWallCollision()) PhysicsSystem.resolveWallCollisions(this, spatialFrame, state);
        if (this.currentState?.update) this.currentState.update(this, dt, state.walls, state);
    }
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
        if (trySpawnPickupAt(state, testX, testY, type)) {
            spawned = true;
        }
    }
}

function trySpawnPickupAt(state, x, y, type) {
    const grid = state.obstacleGrid;
    const gridPos = grid.worldToGrid(x, y);
    if (gridPos.col < 0 || gridPos.col >= grid.cols || gridPos.row < 0 || gridPos.row >= grid.rows) {
        return false;
    }
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
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
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

    for (let row = startRow; row <= endRow; row++) {
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
            cells.push({
                col: resolvedGrid.col,
                row: resolvedGrid.row,
                x: spot.x,
                y: spot.y,
                facing: spot.facing,
            });
        }
    }

    return cells;
}

export function spawnStartNodePickups(state, playerX, playerY) {
    const layout = getStartNodeLayout(playerX, playerY, state.obstacleGrid.cellSize);
    const propRadius = worldPropDefinitions.crate.radius;
    const wallCells = collectWallAdjacentCells(state, layout, propRadius);
    shuffleInPlace(wallCells);

    const crateCount = Math.min(50 + Math.floor(Math.random() * 26), wallCells.length);

    for (let i = 0; i < crateCount; i++) {
        const cell = wallCells[i];
        state.pickups.push(new Pickup(cell.x, cell.y, "crate", cell.facing));
    }

    const barrelCount = 20 + Math.floor(Math.random() * 11);
    const barrelsToPlace = Math.min(barrelCount, wallCells.length - crateCount);

    for (let i = 0; i < barrelsToPlace; i++) {
        const cell = wallCells[crateCount + i];
        state.pickups.push(new Pickup(cell.x, cell.y, "barrel"));
    }
}

export function spawnInitialPickups(state, playerX, playerY) {
    for (const [type, def] of Object.entries(worldPropDefinitions)) {
        const spawn = def.spawn;
        if (!spawn) continue;
        const count = spawn.minCount + Math.floor(Math.random() * spawn.randomRange);
        for (let i = 0; i < count; i++) {
            spawnPickup(state, playerX, playerY, spawn.minRadius, spawn.maxRadius, type);
        }
    }
}
