import { FloatingText } from "../Render/FloatingText.js";
import { showNodeConfirmModal, requestUiUpdate } from "../Core/EventSystem.js";
import { gridSettings, debugStartNodeInspectionImmediate } from "../Config/Config.js";
import { resolveRepositionTarget } from "../Libraries/Pathfinding/PathClearance.js";
import { getStartNodeLayout } from "../Generator/StartNodeBuilding.js";
import { Pools } from "../Core/Pools.js";
import { inspectBridge } from "../Combat/inspect/InspectBridge.js";
import { beginStartNodeIntro, shouldRunStartNodeIntro } from "../Combat/StartNodeIntro.js";
import { findStartNodeInspectionPickup, beginStartNodeInspection, shouldEnterStartNodeInspection } from "../Combat/inspect/StartNodeInspection.js";
import { beginMapTravel, runPersistentSectorEnterOnNode, runCombatTick, runInspectorTick } from "../Systems/Combat/index.js";

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
        if (currentNode?.id === 0) ctx.state.spawnRunParty();
        ctx.state.waveManager.startCombat();
        ctx.state.player.resetTurretCombatState();
        runPersistentSectorEnterOnNode(ctx.state);
        if (shouldRunStartNodeIntro(ctx.state)) beginStartNodeIntro(ctx.state);
        if (currentNode?.id === 0 && debugStartNodeInspectionImmediate && shouldEnterStartNodeInspection(ctx.state)) {
            beginStartNodeInspection(ctx.state, null);
            requestAnimationFrame(() => {
                if (shouldEnterStartNodeInspection(ctx.state)) ctx.state.fsm.transition("inspector");
            });
        }
        requestUiUpdate();
    }

    update(dt, ctx) {
        runCombatTick(ctx, dt);
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
        runInspectorTick(ctx, dt);
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
