import { playerBaseStats } from "../../Config/Config.js";
import { FloatingText } from "../../Render/FloatingText.js";
import { requestUiUpdate, requestUiHudUpdate } from "../../Core/EventSystem.js";
import { inspectBridge } from "./inspect/InspectBridge.js";
import { towerInspectPort } from "./inspectPort.js";
import { getRunScenePort, getSimulationPort } from "../../Core/GamePorts.js";
import { resetSimulationWorld } from "../../Systems/Simulation/index.js";
import { handlePlayerRepositionTap, handlePlayerRepositionDrag } from "./playerReposition.js";
export class MapState {
    onEnter(ctx) {
        requestUiUpdate();
        requestUiHudUpdate();
    }
    update(dt, ctx) {
        FloatingText.updateAll(ctx.state, dt);
    }
    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state, ctx.state.player.weapon.range, playerBaseStats.range);
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
        resetSimulationWorld(ctx.state);
        getRunScenePort().onSimulationEnter(ctx);
        getSimulationPort().onEnter?.(ctx);
        ctx.viewport.snapTo(ctx.state.player.x, ctx.state.player.y);
        requestUiUpdate();
    }
    update(dt, ctx) {
        getSimulationPort().runTick(ctx, dt);
        requestUiHudUpdate();
    }
    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state, ctx.state.player.weapon.range, playerBaseStats.range);
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
        resetSimulationWorld(ctx.state);
        ctx.state.activeLasers = [];
        getSimulationPort().onInspectorEnter?.(ctx);
        requestUiUpdate();
    }
    update(dt, ctx) {
        const port = getSimulationPort();
        if (!port.runInspectorTick) throw new Error("Active game definition simulation port missing runInspectorTick");
        port.runInspectorTick(ctx, dt);
        requestUiHudUpdate();
    }
    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state, ctx.state.player.weapon.range, playerBaseStats.range);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderSimulationScene(ctx.state, ctx.viewport);
    }
    handleInteraction(worldCoords, isDoubleTap, ctx) {
        if (inspectBridge.isOpen()) return;
        if (ctx.state.player.currentState?.blocksInput) return;
        handlePlayerRepositionTap(ctx, worldCoords, isDoubleTap, {
            intercept: (coords) => {
                const inspectTarget = towerInspectPort.findPickup(ctx.state, coords.x, coords.y);
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
