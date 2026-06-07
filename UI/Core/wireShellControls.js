import { setGameZoomFromSlider, emitGameRestart, emitMapToggle } from "../../Core/EventSystem.js";
import { getShellElements } from "./shellElements.js";
import { wireSettingsModal } from "./wireSettingsModal.js";
/**
 * Wire tower shell chrome (zoom, map, restart, settings). Speed/pause use `Libraries/Playback`.
 *
 * @param {object} state
 */
export function wireShellControls(state) {
    const elements = getShellElements();
    elements.zoomSlider?.addEventListener("input", (e) => setGameZoomFromSlider(parseFloat(e.target.value)));
    elements.restartBtn?.addEventListener("click", () => emitGameRestart());
    wireSettingsModal(state);
    elements.mapBtn?.addEventListener("click", () => emitMapToggle());
    elements.closeMapBtn?.addEventListener("click", () => emitMapToggle());
    elements.combatHudModeSelect?.addEventListener("change", (e) => {
        state.combatHudMode = parseInt(e.target.value, 10) || 0;
    });
}
