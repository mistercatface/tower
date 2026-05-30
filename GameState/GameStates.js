import { FloatingText } from "../Render/FloatingText.js";
import { ProgressionManager } from "../Progression/ProgressionManager.js";
import { CollisionSystem } from "../Spatial/Collision/CollisionSystem.js";
import { SpatialHash } from "../Spatial/World/SpatialHash.js";
import { Projectile } from "../Entities/Projectile.js";
import { showNodeConfirmModal, requestUiUpdate } from "../Core/EventSystem.js";
import { Explosion } from "../Entities/Explosion/Explosion.js";
import { navigationSettings } from "../Config/Config.js";
import { resolveMoveTarget } from "../Spatial/Navigation/PathClearance.js";
import { Pools } from "../Core/Pools.js";
import { DeathPiece } from "../Entities/DeathPiece.js";

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

export class MapTransitionState {
    onEnter(ctx) {
        const targetNode = ctx.state.getMapTargetNode();
        
        ctx.state.player.stopMovement(ctx.state);
        ctx.state.player.vx = 0;
        ctx.state.player.vy = 0;

        const targetCoords = ctx.state.getNodeCombatCoords(targetNode);
        ctx.state.player.setTarget(targetCoords.x, targetCoords.y, ctx.state);

        ctx.state.flowFieldGrid.shiftCenter(
            ctx.state.player.x,
            ctx.state.player.y,
            ctx.state.player.x,
            ctx.state.player.y,
            targetCoords.x,
            targetCoords.y
        );
        
        ctx.viewport.snapTo(ctx.state.player.x, ctx.state.player.y);
        requestUiUpdate();
    }

    update(dt, ctx) {
        const speedUpDt = dt * 5.0;
        
        const oldGridPos = ctx.state.flowFieldGrid.worldToGrid(ctx.state.player.x, ctx.state.player.y);
        ctx.state.updateAllCombatants(speedUpDt, null, {
            blocksTargeting: true,
            upgrades: ctx.upgrades,
        });
        ctx.state.navigation.updateFlowField({
            playerX: ctx.state.player.x,
            playerY: ctx.state.player.y,
            playerTargetX: ctx.state.player.targetX,
            playerTargetY: ctx.state.player.targetY,
            previousGridPos: oldGridPos,
        });

        const targetNode = ctx.state.getMapTargetNode();
        if (targetNode) {
            const targetCoords = ctx.state.getNodeCombatCoords(targetNode);
            const dist = Math.hypot(ctx.state.player.x - targetCoords.x, ctx.state.player.y - targetCoords.y);
            if (dist < 9.0) {
                ctx.state.currentNodeId = targetNode.id;
                ctx.state.mapPlayerX = targetNode.x;
                ctx.state.mapPlayerY = targetNode.y;
                ctx.state.isTransitioningFromTravel = true;
                ctx.fsm.transition("combat");
                return;
            }
        }

        FloatingText.updateAll(ctx.state, speedUpDt);
    }

    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
    }

    handleInteraction(worldCoords, isDoubleTap, ctx) {

    }
}

export class CombatState {
    constructor() {
        this.spatialHash = new SpatialHash(50);
    }

    onEnter(ctx) {
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
        
        if (ctx.state.isTransitioningFromTravel) {
            ctx.state.isTransitioningFromTravel = false;
            ctx.state.player.stopMovement(ctx.state);
        } else {
            ctx.state.player.setSpawnPosition(combatCoords.x, combatCoords.y);
            ctx.state.player.resetToSpawn();
        }
        
        ctx.state.waveManager.startCombat();
        ctx.state.player.resetTurretCombatState();

        const persistentEntities = [];
        if (ctx.state.sidekick) {
            persistentEntities.push(ctx.state.sidekick);
        }
        persistentEntities.push(...ctx.state.pickups);

        for (const entity of persistentEntities) {
            if (typeof entity.onSectorEnter === "function") {
                entity.onSectorEnter(ctx.state);
            }
        }
        
        requestUiUpdate();
    }

    update(dt, ctx) {
        const abilityState = ProgressionManager.updateAbilities(ctx.state, dt, ctx.upgrades);
        if (!abilityState.isDiving && ctx.state.player.applyQueuedTarget(ctx.state)) {
            ctx.state.flowFieldGrid.buildPlayerFlowField(ctx.state.player.targetX, ctx.state.player.targetY);
        }

        const spatialHash = this.spatialHash;
        this.spatialHash.clear();
        for (const actor of ctx.state.getCombatants()) {
            spatialHash.insert(actor);
        }

        const oldGridPos = ctx.state.flowFieldGrid.worldToGrid(ctx.state.player.x, ctx.state.player.y);
        const combatEvents = ctx.state.updateAllCombatants(dt, spatialHash, {
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

        ctx.state.waveManager.manageSpawning(dt, ctx.state, ctx.upgrades, ctx.viewport);
        Projectile.updateAll(ctx.state, dt);
        DeathPiece.updateAll(ctx.state, dt);
        ProgressionManager.updatePickups(ctx.state, dt);

        const collisionEvents = CollisionSystem.run(ctx.state);
        const allEvents = [...combatEvents, ...collisionEvents];

        Explosion.updateAll(ctx.state, dt, allEvents);

        for (const event of allEvents) {
            if (event.target && event.target.handleHit) {
                event.target.handleHit(event.damage, ctx, event.type, event);
            }
        }

        FloatingText.updateAll(ctx.state, dt);
        ctx.upgrades.forEach((upg) => upg.update(dt, ctx.state));
        ProgressionManager.processLevelUps(ctx.state, ctx.upgrades);
    }

    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
    }

    handleInteraction(worldCoords, isDoubleTap, ctx) {
        if (ctx.state.player.currentState && ctx.state.player.currentState.blocksInput) return;
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
                    ctx.state.flowFieldGrid.buildPlayerFlowField(target.x, target.y);
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