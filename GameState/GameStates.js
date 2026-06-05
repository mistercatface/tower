import { FloatingText } from "../Render/FloatingText.js";
import { requestUiUpdate } from "../Core/EventSystem.js";
import { gridSettings, debugSkipToClueSearch } from "../Config/Config.js";
import { getStartGameLayout } from "../Games/tower/tutorial/StartGameBuilding.js";
import { Pools } from "../Core/Pools.js";
import { inspectBridge } from "../Combat/inspect/InspectBridge.js";
import { beginStartGameIntro, shouldRunStartGameIntro } from "../Games/tower/tutorial/StartGameIntro.js";
import { findClueSearchPickup, beginClueSearch, shouldRunClueSearch } from "../Games/tower/tutorial/ClueSearch.js";
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
        const { x, y } = ctx.state.getMapPlayerGraphCoords();
        ctx.viewport.follow(x, y);
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
        const startNode = ctx.state.getStartMapNode();
        const combatCoords = ctx.state.getNodeCombatCoords(startNode);
        const layout = getStartGameLayout(combatCoords.x, combatCoords.y, gridSettings.cellSize);
        ctx.state.player.setSpawnPosition(layout.spawnX, layout.spawnY);
        ctx.state.player.resetToSpawn();
        ctx.viewport.snapTo(ctx.state.player.x, ctx.state.player.y);
        if (startNode) ctx.state.spawnRunParty();
        ctx.state.hordeSpawner.beginHorde();
        ctx.state.player.resetTurretCombatState();
        runPersistentSectorEnterOnNode(ctx.state);
        if (shouldRunStartGameIntro(ctx.state)) beginStartGameIntro(ctx.state);
        if (startNode && debugSkipToClueSearch && shouldRunClueSearch(ctx.state)) {
            beginClueSearch(ctx.state, null);
            requestAnimationFrame(() => {
                if (shouldRunClueSearch(ctx.state)) ctx.state.fsm.transition("inspector");
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
                const inspectTarget = findClueSearchPickup(ctx.state, coords.x, coords.y);
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

