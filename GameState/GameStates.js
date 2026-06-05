import { FloatingText } from "../Render/FloatingText.js";
import { CombatParticles } from "../Render/CombatParticles.js";
import { RagdollCorpse } from "../Entities/RagdollCorpse.js";
import { ProgressionManager } from "../Progression/ProgressionManager.js";
import { CollisionSystem } from "../Spatial/Collision/CollisionSystem.js";
import { tickAllPushableSleep, wakeAllPushables } from "../Spatial/Collision/PushableSleep.js";
import { combatSpatial } from "../Spatial/World/SpatialFrame.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { Projectile } from "../Entities/Projectile.js";
import { showNodeConfirmModal, requestUiUpdate } from "../Core/EventSystem.js";
import { Explosion } from "../Entities/Explosion/Explosion.js";
import { navigationSettings, NAV_PROFILES, gridSettings, debugStartNodeInspectionImmediate } from "../Config/Config.js";
import { resolveMoveTarget, resolveRepositionTarget } from "../Libraries/Math/pathfinding/PathClearance.js";
import { getStartNodeLayout } from "../Generator/StartNodeBuilding.js";
import { Pools } from "../Core/Pools.js";
import { inspectBridge } from "../Combat/inspect/InspectBridge.js";
import { beginStartNodeIntro, shouldRunStartNodeIntro, updateStartNodeIntro } from "../Combat/StartNodeIntro.js";
import { findStartNodeInspectionPickup, beginStartNodeInspection, shouldEnterStartNodeInspection } from "../Combat/inspect/StartNodeInspection.js";
import { syncSurfaceProfile } from "../Render/game/surfaceProfileResolver.js";

const MAP_TRAVEL_SPEED = 5.0;

function runPushablePhysics(state, dt, spatialFrame) {
    ProgressionManager.updatePickups(state, dt, spatialFrame);
    const events = CollisionSystem.run(state, spatialFrame);
    for (let i = 0; i < state.pickups.length; i++) {
        const pickup = state.pickups[i];
        if (pickup.isDead || !pickup.strategy?.isPushable) continue;
        if (pickup.isSleeping || !pickup.needsWallCollision()) continue;
        PhysicsSystem.resolveWallCollisions(pickup, spatialFrame, state);
    }
    tickAllPushableSleep(state, spatialFrame);
    return events;
}

function runPersistentSectorEnter(state) {
    syncSurfaceProfile(state);
    wakeAllPushables(state);
    const persistentEntities = [...state.getAllies(), ...state.pickups];

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
    state.combatParticles = [];
    state.ragdollCorpses = [];
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
    ctx.state.flowFieldGrid.shiftCenter(ctx.state.player.x, ctx.state.player.y, ctx.state.player.x, ctx.state.player.y, target.x, target.y);
    ctx.state.navigation.steerTo(ctx.state.player, target.x, target.y, NAV_PROFILES.mapTravel, ctx.state.flowFieldGrid, ctx.state);
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
        ctx.viewport.follow(ctx.state.mapPlayerX, ctx.state.mapPlayerY);
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

        if (ctx.state.skipCombatEnterReset) {
            ctx.state.skipCombatEnterReset = false;
            requestUiUpdate();
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
        ctx.state.combatParticles = [];
        ctx.state.ragdollCorpses = [];
        ctx.state.floatingTexts = [];

        const currentNode = ctx.state.getCurrentMapNode();
        const combatCoords = ctx.state.getNodeCombatCoords(currentNode);
        if (currentNode?.id === 0) {
            const layout = getStartNodeLayout(combatCoords.x, combatCoords.y, gridSettings.cellSize);
            ctx.state.player.setSpawnPosition(layout.spawnX, layout.spawnY);
        } else {
            ctx.state.player.setSpawnPosition(combatCoords.x, combatCoords.y);
        }
        ctx.state.player.resetToSpawn();
        ctx.viewport.snapTo(ctx.state.player.x, ctx.state.player.y);

        if (currentNode?.id === 0) {
            ctx.state.spawnRunParty();
        }

        ctx.state.waveManager.startCombat();
        ctx.state.player.resetTurretCombatState();
        runPersistentSectorEnter(ctx.state);

        if (shouldRunStartNodeIntro(ctx.state)) {
            beginStartNodeIntro(ctx.state);
        }

        if (currentNode?.id === 0 && debugStartNodeInspectionImmediate && shouldEnterStartNodeInspection(ctx.state)) {
            beginStartNodeInspection(ctx.state, null);
            requestAnimationFrame(() => {
                if (shouldEnterStartNodeInspection(ctx.state)) {
                    ctx.state.fsm.transition("inspector");
                }
            });
        }

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
        const combatEvents = ctx.state.updateAllCombatants(stepDt, spatialFrame, { externalSpeedMod: abilityState.externalSpeedMod, upgrades: ctx.upgrades });
        ctx.state.navigation.updateFlowField({
            playerX: ctx.state.player.x,
            playerY: ctx.state.player.y,
            playerTargetX: ctx.state.player.isMoving ? ctx.state.player.targetX : null,
            playerTargetY: ctx.state.player.isMoving ? ctx.state.player.targetY : null,
            previousGridPos: oldGridPos,
        });

        if (!isTraveling) {
            updateStartNodeIntro(ctx.state);
        }

        ctx.state.waveManager.manageSpawning(stepDt, ctx.state, ctx.upgrades, ctx.viewport);
        let spawnHitEvents = [];
        if (!isTraveling) {
            Projectile.checkSpawnCollisions(ctx.state, spatialFrame, spawnHitEvents);
            Projectile.updateAll(ctx.state, stepDt);
            CombatParticles.updateAll(ctx.state, stepDt);
            RagdollCorpse.updateAll(ctx.state, stepDt, spatialFrame);
        }

        const collisionEvents = runPushablePhysics(ctx.state, stepDt, spatialFrame);
        const allEvents = [...combatEvents, ...spawnHitEvents, ...collisionEvents];

        if (!isTraveling) {
            Explosion.updateAll(ctx.state, stepDt, allEvents, spatialFrame);
        }

        for (const event of allEvents) {
            if (event.target && event.target.handleHit) {
                event.target.handleHit(event.damage, ctx, event.type, event);
            }
        }

        FloatingText.updateAll(ctx.state, stepDt);
        CombatParticles.updateAll(ctx.state, stepDt);
        ctx.upgrades.forEach((upg) => upg.update(stepDt, ctx.state));
        ProgressionManager.processLevelUps(ctx.state, ctx.upgrades);

        if (isTraveling) {
            completeMapTravel(ctx);
        }

        ctx.state.worldSurfaces.updateFills();
    }

    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
    }

    handleInteraction(worldCoords, isDoubleTap, ctx) {
        if (ctx.state.mapTargetNodeId != null) return;
        if (inspectBridge.isOpen()) return;
        if (ctx.state.player.currentState && ctx.state.player.currentState.blocksInput) return;

        if (ctx.state.abilities["Shoot"]) {
            ctx.state.player.manualFire(ctx.state, worldCoords.x, worldCoords.y);
            return;
        }

        if (!ctx.state.player.canReposition(ctx.state)) return;

        const target = resolveRepositionTarget(ctx.state.obstacleGrid, worldCoords.x, worldCoords.y, ctx.state.player.radius);
        if (!target) return;

        const targetCell = target.col != null ? { col: target.col, row: target.row } : null;

        let isDiving = false;
        ctx.upgrades
            .filter((u) => u.isAbility && u.triggerType === "double_tap_move" && ctx.state.abilities[u.id])
            .forEach((upg) => {
                if (ctx.state.scheduler.getTimeRemaining(ctx.state.abilityTimers[upg.id].activeId) > 0) {
                    isDiving = true;
                }
            });
        if (isDiving) {
            ctx.state.player.queueTarget(target.x, target.y, targetCell);
        } else {
            ctx.state.player.setTarget(target.x, target.y, ctx.state, targetCell);
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

    handlePointerMove(worldCoords, screenCoords, isPrimaryDown, ctx) {
        if (!isPrimaryDown) return;
        if (ctx.state.mapTargetNodeId != null) return;
        if (inspectBridge.isOpen()) return;
        if (ctx.state.player.currentState && ctx.state.player.currentState.blocksInput) return;
        if (ctx.state.abilities["Shoot"]) return;

        if (!ctx.state.player.canReposition(ctx.state)) return;

        const target = resolveRepositionTarget(ctx.state.obstacleGrid, worldCoords.x, worldCoords.y, ctx.state.player.radius);
        if (!target) return;

        const targetCell = target.col != null ? { col: target.col, row: target.row } : null;
        ctx.state.player.setTarget(target.x, target.y, ctx.state, targetCell);
        ctx.state.navigation.rebuildPlayerFlowField(target.x, target.y);
    }
}

export class InspectorState {
    onEnter(ctx) {
        if (ctx.state.projectiles) {
            for (let i = 0; i < ctx.state.projectiles.length; i++) {
                Pools.projectiles.release(ctx.state.projectiles[i]);
            }
        }
        ctx.state.projectiles = [];
        ctx.state.activeLasers = [];
        requestUiUpdate();
    }

    update(dt, ctx) {
        const abilityState = ProgressionManager.updateAbilities(ctx.state, dt, ctx.upgrades);

        if (!abilityState.isDiving && ctx.state.player.applyQueuedTarget(ctx.state)) {
            ctx.state.navigation.rebuildPlayerFlowField(ctx.state.player.targetX, ctx.state.player.targetY);
        }

        const spatialFrame = combatSpatial.begin(ctx.state);
        const oldGridPos = ctx.state.flowFieldGrid.worldToGrid(ctx.state.player.x, ctx.state.player.y);
        const partyOpts = { externalSpeedMod: abilityState.externalSpeedMod, upgrades: ctx.upgrades, blocksTargeting: true };

        for (const actor of ctx.state.getPlayerActors()) {
            actor.updateCombat(dt, ctx.state, spatialFrame, partyOpts);
        }

        ctx.state.navigation.updateFlowField({
            playerX: ctx.state.player.x,
            playerY: ctx.state.player.y,
            playerTargetX: ctx.state.player.isMoving ? ctx.state.player.targetX : null,
            playerTargetY: ctx.state.player.isMoving ? ctx.state.player.targetY : null,
            previousGridPos: oldGridPos,
        });

        const collisionEvents = runPushablePhysics(ctx.state, dt, spatialFrame);
        for (const event of collisionEvents) {
            if (event.target?.handleHit) {
                event.target.handleHit(event.damage, ctx, event.type, event);
            }
        }

        FloatingText.updateAll(ctx.state, dt);
    }

    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
    }

    handleInteraction(worldCoords, isDoubleTap, ctx) {
        if (inspectBridge.isOpen()) return;
        if (ctx.state.player.currentState?.blocksInput) return;

        const inspectTarget = findStartNodeInspectionPickup(ctx.state, worldCoords.x, worldCoords.y);
        if (inspectTarget) {
            inspectBridge.open(inspectTarget, null, ctx.state);
            return;
        }

        if (!ctx.state.player.canReposition(ctx.state)) return;

        const target = resolveRepositionTarget(ctx.state.obstacleGrid, worldCoords.x, worldCoords.y, ctx.state.player.radius);
        if (!target) return;

        const targetCell = target.col != null ? { col: target.col, row: target.row } : null;

        let isDiving = false;
        ctx.upgrades
            .filter((u) => u.isAbility && u.triggerType === "double_tap_move" && ctx.state.abilities[u.id])
            .forEach((upg) => {
                if (ctx.state.scheduler.getTimeRemaining(ctx.state.abilityTimers[upg.id].activeId) > 0) {
                    isDiving = true;
                }
            });
        if (isDiving) {
            ctx.state.player.queueTarget(target.x, target.y, targetCell);
        } else {
            ctx.state.player.setTarget(target.x, target.y, ctx.state, targetCell);
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

    handlePointerMove(worldCoords, screenCoords, isPrimaryDown, ctx) {
        if (!isPrimaryDown) return;
        if (inspectBridge.isOpen()) return;
        if (ctx.state.player.currentState?.blocksInput) return;

        if (!ctx.state.player.canReposition(ctx.state)) return;

        const target = resolveRepositionTarget(ctx.state.obstacleGrid, worldCoords.x, worldCoords.y, ctx.state.player.radius);
        if (!target) return;

        const targetCell = target.col != null ? { col: target.col, row: target.row } : null;
        ctx.state.player.setTarget(target.x, target.y, ctx.state, targetCell);
        ctx.state.navigation.rebuildPlayerFlowField(target.x, target.y);
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
