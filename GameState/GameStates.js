import { FloatingText } from "../Render/FloatingText.js";
import { ProgressionManager } from "../Progression/ProgressionManager.js";
import { CollisionSystem } from "../Spatial/Collision/CollisionSystem.js";
import { combatSpatial } from "../Spatial/World/SpatialFrame.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { Projectile } from "../Entities/Projectile.js";
import { showNodeConfirmModal, requestUiUpdate } from "../Core/EventSystem.js";
import { Explosion } from "../Entities/Explosion/Explosion.js";
import { navigationSettings, NAV_PROFILES } from "../Config/Config.js";
import { resolveMoveTarget } from "../Spatial/Navigation/PathClearance.js";
import { Pools } from "../Core/Pools.js";
import { DeathPiece } from "../Entities/DeathPiece.js";
import { findInspectablePickup } from "../Render/Inspector/InspectRegistry.js";
import { propInspector } from "../Render/Inspector/PropInspector.js";

const MAP_TRAVEL_SPEED = 5.0;

function runPushablePhysics(state, dt, spatialFrame) {
    ProgressionManager.updatePickups(state, dt, spatialFrame);
    const events = CollisionSystem.run(state, spatialFrame);
    for (let i = 0; i < state.pickups.length; i++) {
        const pickup = state.pickups[i];
        if (pickup.isDead || !pickup.strategy?.isPushable) continue;
        if (pickup.needsWallCollision()) {
            PhysicsSystem.resolveWallCollisions(pickup, spatialFrame, state);
        }
    }
    return events;
}

function runPersistentSectorEnter(state) {
    const persistentEntities = [];
    if (state.sidekick) persistentEntities.push(state.sidekick);
    persistentEntities.push(...state.pickups);

    for (const entity of persistentEntities) {
        if (typeof entity.onSectorEnter === "function") {
            entity.onSectorEnter(state);
        }
    }
}

function clearTravelCombatDebris(state) {
    if (state.projectiles) {
        for (let i = 0; i < state.projectiles.length; i++) {
            Pools.projectiles.release(state.projectiles[i]);
        }
    }
    state.projectiles = [];
    state.explosions = [];
    state.activeLasers = [];
    state.deathPieces = [];
    state.enemies = [];
    state.floatingTexts = [];

    for (const pickup of state.pickups) {
        if (pickup.currentStateName === "on_fire") {
            pickup.changeState("normal");
            if (pickup.maxHealth != null) {
                pickup.health = pickup.maxHealth;
            }
        }
    }
}

function beginMapTravel(ctx) {
    const targetNode = ctx.state.getMapTargetNode();
    if (!targetNode) return;

    ctx.state.waveManager.waveClearScheduled = false;
    ctx.state.isTransitioning = false;
    if (ctx.state.waveManager.spawnIntervalId) {
        ctx.state.scheduler.cancel(ctx.state.waveManager.spawnIntervalId);
        ctx.state.waveManager.spawnIntervalId = null;
    }

    clearTravelCombatDebris(ctx.state);

    const targetCoords = ctx.state.getNodeCombatCoords(targetNode);
    const clearance = ctx.state.player.radius + navigationSettings.pathClearanceMargin;
    const target = resolveMoveTarget(ctx.state.obstacleGrid, targetCoords.x, targetCoords.y, clearance);

    ctx.state.player.setTarget(target.x, target.y, ctx.state);
    ctx.state.flowFieldGrid.shiftCenter(
        ctx.state.player.x,
        ctx.state.player.y,
        ctx.state.player.x,
        ctx.state.player.y,
        target.x,
        target.y,
    );
    ctx.state.navigation.steerTo(
        ctx.state.player,
        target.x,
        target.y,
        NAV_PROFILES.mapTravel,
        ctx.state.flowFieldGrid,
    );
    requestUiUpdate();
}

function completeMapTravel(ctx) {
    const targetNode = ctx.state.getMapTargetNode();
    if (!targetNode) return false;

    const targetCoords = ctx.state.getNodeCombatCoords(targetNode);
    const clearance = ctx.state.player.radius + navigationSettings.pathClearanceMargin;
    const target = resolveMoveTarget(ctx.state.obstacleGrid, targetCoords.x, targetCoords.y, clearance);
    const dist = Math.hypot(ctx.state.player.x - target.x, ctx.state.player.y - target.y);
    if (dist >= 9.0) return false;

    ctx.state.currentNodeId = targetNode.id;
    ctx.state.mapPlayerX = targetNode.x;
    ctx.state.mapPlayerY = targetNode.y;
    ctx.state.mapTargetNodeId = null;
    ctx.state.player.stopMovement(ctx.state);
    ctx.state.waveManager.startCombat();
    ctx.state.player.resetTurretCombatState();
    runPersistentSectorEnter(ctx.state);
    requestUiUpdate();
    return true;
}

export class MapState {
    onEnter(ctx) {
        requestUiUpdate();
    }
    update(dt, ctx) {
        FloatingText.updateAll(ctx.state, dt);
    }
    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.mapPlayerX, ctx.state.mapPlayerY - 200);
        ctx.renderer.renderMapScene(ctx.state, ctx.viewport);
    }
    handleInteraction(worldCoords, isDoubleTap, ctx) {
        const currentNode = ctx.state.getCurrentMapNode();
        if (!currentNode) return;
        for (const neighborId of currentNode.connections) {
            const neighbor = ctx.state.getMapNode(neighborId);
            if (!neighbor) continue;
            const dist = Math.hypot(neighbor.x - worldCoords.x, neighbor.y - worldCoords.y);
            if (dist < 20) {
                showNodeConfirmModal(neighbor);
                break;
            }
        }
    }
}

export class CombatState {
    onEnter(ctx) {
        if (ctx.state.mapTargetNodeId != null) {
            beginMapTravel(ctx);
            return;
        }

        if (ctx.state.projectiles) {
            for (let i = 0; i < ctx.state.projectiles.length; i++) {
                Pools.projectiles.release(ctx.state.projectiles[i]);
            }
        }
        ctx.state.projectiles = [];
        ctx.state.explosions = [];
        ctx.state.enemies = [];
        ctx.state.activeLasers = [];
        ctx.state.deathPieces = [];
        ctx.state.floatingTexts = [];

        const currentNode = ctx.state.getCurrentMapNode();
        const combatCoords = ctx.state.getNodeCombatCoords(currentNode);

        ctx.state.player.setSpawnPosition(combatCoords.x, combatCoords.y);
        ctx.state.player.resetToSpawn();

        ctx.state.waveManager.startCombat();
        ctx.state.player.resetTurretCombatState();
        runPersistentSectorEnter(ctx.state);

        requestUiUpdate();
    }

    update(dt, ctx) {
        const isTraveling = ctx.state.mapTargetNodeId != null;
        const stepDt = isTraveling ? dt * MAP_TRAVEL_SPEED : dt;

        const abilityState = ProgressionManager.updateAbilities(ctx.state, stepDt, ctx.upgrades);

        if (!isTraveling && !abilityState.isDiving && ctx.state.player.applyQueuedTarget(ctx.state)) {
            ctx.state.navigation.rebuildPlayerFlowField(ctx.state.player.targetX, ctx.state.player.targetY);
        }

        const spatialFrame = combatSpatial.begin(ctx.state);

        const oldGridPos = ctx.state.flowFieldGrid.worldToGrid(ctx.state.player.x, ctx.state.player.y);
        const combatEvents = ctx.state.updateAllCombatants(stepDt, spatialFrame, {
            externalSpeedMod: abilityState.externalSpeedMod,
            upgrades: ctx.upgrades,
        });
        ctx.state.navigation.updateFlowField({
            playerX: ctx.state.player.x,
            playerY: ctx.state.player.y,
            playerTargetX: ctx.state.player.isMoving ? ctx.state.player.targetX : null,
            playerTargetY: ctx.state.player.isMoving ? ctx.state.player.targetY : null,
            previousGridPos: oldGridPos,
        });

        ctx.state.waveManager.manageSpawning(stepDt, ctx.state, ctx.upgrades, ctx.viewport);
        if (!isTraveling) {
            Projectile.updateAll(ctx.state, stepDt);
            DeathPiece.updateAll(ctx.state, stepDt, spatialFrame);
        }
        const collisionEvents = isTraveling ? [] : runPushablePhysics(ctx.state, stepDt, spatialFrame);
        const allEvents = [...combatEvents, ...collisionEvents];

        if (!isTraveling) {
            Explosion.updateAll(ctx.state, stepDt, allEvents, spatialFrame);
        }

        for (const event of allEvents) {
            if (event.target && event.target.handleHit) {
                event.target.handleHit(event.damage, ctx, event.type, event);
            }
        }

        FloatingText.updateAll(ctx.state, stepDt);
        ctx.upgrades.forEach((upg) => upg.update(stepDt, ctx.state));
        ProgressionManager.processLevelUps(ctx.state, ctx.upgrades);

        if (isTraveling) {
            completeMapTravel(ctx);
        }
    }

    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
    }

    handleInteraction(worldCoords, isDoubleTap, ctx) {
        if (ctx.state.mapTargetNodeId != null) return;
        if (propInspector.isOpen()) return;
        if (ctx.state.player.currentState && ctx.state.player.currentState.blocksInput) return;

        const inspectTarget = findInspectablePickup(ctx.state, worldCoords.x, worldCoords.y);
        if (inspectTarget) {
            propInspector.open(inspectTarget);
            return;
        }

        if (!ctx.state.player.canReposition(ctx.state)) return;
        const gridPos = ctx.state.flowFieldGrid.worldToGrid(worldCoords.x, worldCoords.y);
        if (gridPos.col >= 0 && gridPos.col < ctx.state.flowFieldGrid.cols && gridPos.row >= 0 && gridPos.row < ctx.state.flowFieldGrid.rows) {
            if (ctx.state.flowFieldGrid.grid[gridPos.row * ctx.state.flowFieldGrid.cols + gridPos.col] !== 1) {
                const cellCenter = ctx.state.flowFieldGrid.gridToWorld(gridPos.col, gridPos.row);
                const clearance = ctx.state.player.radius + navigationSettings.pathClearanceMargin;
                const target = resolveMoveTarget(ctx.state.obstacleGrid, cellCenter.x, cellCenter.y, clearance);
                let isDiving = false;
                ctx.upgrades
                    .filter((u) => u.isAbility && u.triggerType === "double_tap_move" && ctx.state.abilities[u.id])
                    .forEach((upg) => {
                        if (ctx.state.scheduler.getTimeRemaining(ctx.state.abilityTimers[upg.id].activeId) > 0) {
                            isDiving = true;
                        }
                    });
                if (isDiving) {
                    ctx.state.player.queueTarget(target.x, target.y, gridPos);
                } else {
                    ctx.state.player.setTarget(target.x, target.y, ctx.state, gridPos);
                    ctx.state.navigation.rebuildPlayerFlowField(target.x, target.y);
                    if (isDoubleTap) {
                        ctx.upgrades
                            .filter((u) => u.isAbility && u.triggerType === "double_tap_move" && ctx.state.abilities[u.id])
                            .forEach((upg) => {
                                if (ctx.state.scheduler.getTimeRemaining(ctx.state.abilityTimers[upg.id].cooldownId) <= 0) {
                                    ctx.state.abilityTimers[upg.id].activeId = ctx.state.scheduler.schedule(upg.activeDuration);
                                    ctx.state.abilityTimers[upg.id].cooldownId = ctx.state.scheduler.schedule(upg.cooldown);
                                    if (upg.onTrigger) upg.onTrigger(ctx.state);
                                }
                            });
                    }
                }
            }
        }
    }
}

export class RewardState {
    onEnter(ctx) {
        requestUiUpdate();
    }
    update(dt, ctx) {
        FloatingText.updateAll(ctx.state, dt);
    }
    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
    }
}
