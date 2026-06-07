import { requestUiUpdate } from "../../Core/EventSystem.js";
import { getRunScenePort } from "../../Core/GamePorts.js";
import { renderTilelabPreview } from "./ui/preview.js";
import { readControls } from "./ui/toolbar.js";

export class TileLabSimulationState {
    onEnter(ctx) {
        getRunScenePort().onSimulationEnter(ctx);
        requestUiUpdate();
    }
    update(_dt, _ctx) {}
    render(ctx) {
        renderTilelabPreview(ctx.state, readControls(ctx.state));
    }
}
