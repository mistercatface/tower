import { requestUiUpdate } from "../../Core/EventSystem.js";
import { getRunScenePort } from "../../Core/GamePorts.js";
import { renderActiveLabView } from "./ui/renderLabView.js";
export class TileLabSimulationState {
    onEnter(ctx) {
        getRunScenePort().onSimulationEnter(ctx);
        requestUiUpdate();
    }
    update(_dt, _ctx) {}
    render(ctx) {
        renderActiveLabView(ctx.state);
    }
}
