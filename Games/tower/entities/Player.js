import { Actor } from "./Actor.js";
import { endRun, spawnFloatingText } from "../../../Core/EventSystem.js";
import { playerBaseStats, NAV_PROFILES, navigationSettings } from "../config/towerConfig.js";
import { createEntityBars } from "./EntityBars.js";
import { entityIntersectsCellBounds } from "../../../Libraries/Spatial/grid/GridCoords.js";
import { renderActorKinematicsBody } from "../../../Libraries/Render/Characters/actorKinematicsRenderer.js";
import { clampSelectedSpeed } from "../../../Libraries/Playback/index.js";
import { getActiveGameDefinition } from "../../../Core/ActiveGameDefinition.js";
const playerBars = createEntityBars({ healthWidth: 48, healthHeight: 4, healthBorderRadius: 2 });
export class Player extends Actor {
    static healthBar = playerBars.healthBar;
    constructor(x, y, radius) {
        super(x, y, radius, playerBaseStats.speed, playerBaseStats.maxHealth, "#4E342E", "player", 3.0, true);
        this.setupCombatant(playerBaseStats);
        this.initCombatWeapon();
        this.healthBar = Player.healthBar;
        this.spawnX = x;
        this.spawnY = y;
        this.healAccumulator = 0;
        this.targetX = null;
        this.targetY = null;
        this.targetGridCol = null;
        this.targetGridRow = null;
        this.targetCellBounds = null;
        this.queuedTargetX = null;
        this.queuedTargetY = null;
        this.queuedTargetCol = null;
        this.queuedTargetRow = null;
        this.isMoving = false;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.mass = 50.0;
        this.canDamageWalls = true;
        this.startingAbilities = playerBaseStats.startingAbilities || [];
        this.alwaysRunsTurretCombat = true;
        this.usesKinematicsBody = true;
        this.teamId = 0;
    }
    recalculate(state, upgradeDefs, shouldApply = () => true) {
        this.recalculateFromRun(state, upgradeDefs, shouldApply);
        clampSelectedSpeed(state, getActiveGameDefinition());
    }
    onDamageFloatingText(damage, hitType) {
        super.onDamageFloatingText(damage, hitType);
        if (hitType !== "blast") spawnFloatingText({ variant: "standardDamage", x: this.x, y: this.y, damage });
    }
    onHitAfterDamage(damage, ctx, hitType, died, event) {
        super.onHitAfterDamage(damage, ctx, hitType, died, event);
        if (died) endRun(ctx?.state);
    }
    setSpawnPosition(x, y) {
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
    }
    resetToSpawn() {
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.stopMovement();
        this.vx = 0;
        this.vy = 0;
    }
    hasReachedTarget(state) {
        if (this.targetCellBounds) return entityIntersectsCellBounds(this.x, this.y, this.radius, this.targetCellBounds);
        if (this.targetX === null || this.targetY === null) return false;
        return Math.hypot(this.x - this.targetX, this.y - this.targetY) < navigationSettings.arrivalDistance;
    }
    setTarget(x, y, state = null, targetCell = null) {
        this.targetX = x;
        this.targetY = y;
        this.targetGridCol = targetCell?.col ?? null;
        this.targetGridRow = targetCell?.row ?? null;
        this.targetCellBounds = targetCell && state?.obstacleGrid ? state.obstacleGrid.getCellBounds(targetCell.col, targetCell.row) : null;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.isMoving = true;
        state?.navigation?.clear(this);
    }
    queueTarget(x, y, targetCell = null) {
        this.queuedTargetX = x;
        this.queuedTargetY = y;
        this.queuedTargetCol = targetCell?.col ?? null;
        this.queuedTargetRow = targetCell?.row ?? null;
    }
    applyQueuedTarget(state = null) {
        if (this.queuedTargetX !== null && this.queuedTargetY !== null) {
            const targetCell = this.queuedTargetCol !== null && this.queuedTargetRow !== null ? { col: this.queuedTargetCol, row: this.queuedTargetRow } : null;
            this.setTarget(this.queuedTargetX, this.queuedTargetY, state, targetCell);
            this.queuedTargetX = null;
            this.queuedTargetY = null;
            this.queuedTargetCol = null;
            this.queuedTargetRow = null;
            return true;
        }
        return false;
    }
    stopMovement(state = null) {
        this.targetX = null;
        this.targetY = null;
        this.targetGridCol = null;
        this.targetGridRow = null;
        this.targetCellBounds = null;
        this.targetNodeX = null;
        this.targetNodeY = null;
        this.isMoving = false;
        this.desiredX = 0;
        this.desiredY = 0;
        state?.navigation?.clear(this);
    }
    addHealAccumulator(amount) {
        this.healAccumulator += amount;
        if (this.healAccumulator >= 1) {
            const healAmount = Math.floor(this.healAccumulator);
            this.heal(healAmount);
            this.healAccumulator -= healAmount;
        }
    }
    clearHealAccumulator() {
        this.healAccumulator = 0;
    }
    canReposition(state) {
        return this.upgrades["Reposition"] && this.upgrades["Reposition"].level > 0;
    }
    updateLocomotion(dt, state, spatialFrame, options = {}) {
        const flowFieldGrid = state.flowFieldGrid;
        const walls = state.walls;
        if (this.currentState?.customMovement) {
            this.currentState.update(this, dt, null, flowFieldGrid, walls, null, spatialFrame, null, null);
            return;
        }
        if (this.isMoving && this.targetX !== null && this.targetY !== null)
            if (this.hasReachedTarget(state)) this.stopMovement(state);
            else state.navigation.steerTo(this, this.targetX, this.targetY, NAV_PROFILES.playerClick, flowFieldGrid, state);
        else {
            this.desiredX = 0;
            this.desiredY = 0;
        }
        this.applyLocomotion(dt, spatialFrame, { externalSpeedMod: options.externalSpeedMod ?? 1.0, state });
    }
    renderBody(ctx, _renderer) {
        renderActorKinematicsBody(ctx, this, { x: this.x, y: this.y });
    }
    render(ctx, renderer, state) {
        this.renderBody(ctx, renderer);
    }
}
