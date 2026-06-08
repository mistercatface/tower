import { requestUiUpdate } from "../../Core/EventSystem.js";
import { getRunScenePort, getSimulationPort } from "../../Core/GamePorts.js";
import { renderActiveLabView } from "./ui/renderLabView.js";
export class TileLabSimulationState {
    onEnter(ctx) {
        getRunScenePort().onSimulationEnter(ctx);
        requestUiUpdate();
    }
    update(dt, ctx) {
        if (ctx.state.isPaused) return;
        getSimulationPort().runTick(ctx, dt);
    }
    render(ctx) {
        renderActiveLabView(ctx.state);
    }
}
