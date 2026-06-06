import {
    toggleGamePause,
    adjustGameSpeed,
    setGameZoomFromSlider,
    emitHardReset,
    emitGameRestart,
    emitMapToggle,
} from "../../Core/EventSystem.js";
import { getShellElements } from "./shellElements.js";

/**
 * Wire pause, settings, restart, and map controls shared across game shells.
 *
 * @param {object} state
 */
export function wireShellControls(state) {
    const elements = getShellElements();

    elements.pauseBtn?.addEventListener("click", () => toggleGamePause());
    elements.speedDownBtn?.addEventListener("click", () => adjustGameSpeed(-0.25));
    elements.speedUpBtn?.addEventListener("click", () => adjustGameSpeed(0.25));
    elements.zoomSlider?.addEventListener("input", (e) => setGameZoomFromSlider(parseFloat(e.target.value)));
    elements.restartBtn?.addEventListener("click", () => emitGameRestart());
    elements.settingsBtn?.addEventListener("click", () => {
        if (elements.combatHudModeSelect) elements.combatHudModeSelect.value = String(state.combatHudMode ?? 0);
        if (elements.settingsModal) elements.settingsModal.style.display = "flex";
    });
    elements.mapBtn?.addEventListener("click", () => emitMapToggle());
    elements.closeMapBtn?.addEventListener("click", () => emitMapToggle());
    elements.combatHudModeSelect?.addEventListener("change", (e) => {
        state.combatHudMode = parseInt(e.target.value, 10) || 0;
    });
    elements.closeSettingsBtn?.addEventListener("click", () => {
        if (elements.settingsModal) elements.settingsModal.style.display = "none";
    });
    elements.hardResetBtn?.addEventListener("click", () => {
        if (confirm("Are you sure you want to completely reset the game? This cannot be undone.")) {
            emitHardReset();
            if (elements.settingsModal) elements.settingsModal.style.display = "none";
        }
    });
}
