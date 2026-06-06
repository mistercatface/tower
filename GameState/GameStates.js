import { FloatingText } from "../Render/FloatingText.js";
import { requestUiUpdate } from "../Core/EventSystem.js";
import { Pools } from "../Core/Pools.js";
import { inspectBridge } from "../Combat/inspect/InspectBridge.js";
import {
    runSimulationEnterPersistence,
    runSimulationTick,
    runInspectorTick,
    handlePlayerRepositionTap,
    handlePlayerRepositionDrag,
} from "../Systems/Simulation/index.js";

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

export class SimulationState {
    onEnter(ctx) {
        if (ctx.state.skipSimulationEnterReset) {
            ctx.state.skipSimulationEnterReset = false;
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
        ctx.game?.onSimulationEnter?.(ctx);
        ctx.viewport.snapTo(ctx.state.player.x, ctx.state.player.y);
        ctx.state.hordeSpawner.beginHorde();
        ctx.state.player.resetTurretCombatState();
        runSimulationEnterPersistence(ctx.state);
        requestUiUpdate();
    }

    update(dt, ctx) {
        runSimulationTick(ctx, dt);
    }

    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderSimulationScene(ctx.state, ctx.viewport);
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
        ctx.renderer.renderSimulationScene(ctx.state, ctx.viewport);
    }

    handleInteraction(worldCoords, isDoubleTap, ctx) {
        if (inspectBridge.isOpen()) return;
        if (ctx.state.player.currentState?.blocksInput) return;

        handlePlayerRepositionTap(ctx, worldCoords, isDoubleTap, {
            intercept: (coords) => {
                const inspectTarget = ctx.game?.findInspectorInspectPickup?.(ctx.state, coords.x, coords.y);
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
