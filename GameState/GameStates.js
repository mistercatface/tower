import { FloatingText } from "../Render/FloatingText.js";
import { requestUiUpdate } from "../Core/EventSystem.js";
import { gridSettings, debugStartNodeInspectionImmediate } from "../Config/Config.js";
import { getStartNodeLayout } from "../Generator/StartNodeBuilding.js";
import { Pools } from "../Core/Pools.js";
import { inspectBridge } from "../Combat/inspect/InspectBridge.js";
import { beginStartNodeIntro, shouldRunStartNodeIntro } from "../Combat/StartNodeIntro.js";
import { findStartNodeInspectionPickup, beginStartNodeInspection, shouldEnterStartNodeInspection } from "../Combat/inspect/StartNodeInspection.js";
import {
    runPersistentSectorEnterOnNode,
    runCombatTick,
    runInspectorTick,
    handlePlayerRepositionTap,
    handlePlayerRepositionDrag,
} from "../Systems/Combat/index.js";

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
}

export class CombatState {
    onEnter(ctx) {
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
        if (inspectBridge.isOpen()) return;
        if (ctx.state.player.currentState?.blocksInput) return;
        if (ctx.state.abilities["Shoot"]) {
            ctx.state.player.manualFire(ctx.state, worldCoords.x, worldCoords.y);
            return;
        }
        handlePlayerRepositionTap(ctx, worldCoords, isDoubleTap);
    }

    handlePointerMove(worldCoords, screenCoords, isPrimaryDown, ctx) {
        if (!isPrimaryDown) return;
        if (inspectBridge.isOpen()) return;
        if (ctx.state.player.currentState?.blocksInput) return;
        if (ctx.state.abilities["Shoot"]) return;
        handlePlayerRepositionDrag(ctx, worldCoords);
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

        handlePlayerRepositionTap(ctx, worldCoords, isDoubleTap, {
            intercept: (coords) => {
                const inspectTarget = findStartNodeInspectionPickup(ctx.state, coords.x, coords.y);
                if (!inspectTarget) return false;
                inspectBridge.open(inspectTarget, null, ctx.state);
                return true;
            },
        });
    }

    handlePointerMove(worldCoords, screenCoords, isPrimaryDown, ctx) {
        if (!isPrimaryDown) return;
        if (inspectBridge.isOpen()) return;
        if (ctx.state.player.currentState?.blocksInput) return;
        handlePlayerRepositionDrag(ctx, worldCoords);
    }
}

