import { events } from "../../../Core/EventSystem.js";
import { Events } from "../../../Core/EventNames.js";
import { getTowerShellElements } from "./towerShellElements.js";
/** @param {object} state */
export function wireSettingsModal(state) {
    const elements = getTowerShellElements();
    elements.settingsBtn?.addEventListener("click", () => {
        if (elements.combatHudModeSelect) elements.combatHudModeSelect.value = String(state.combatHudMode ?? 0);
        if (elements.settingsModal) elements.settingsModal.style.display = "flex";
    });
    elements.closeSettingsBtn?.addEventListener("click", () => {
        if (elements.settingsModal) elements.settingsModal.style.display = "none";
    });
    elements.hardResetBtn?.addEventListener("click", () => {
        if (confirm("Are you sure you want to completely reset the game? This cannot be undone.")) {
            events.emit(Events.PROGRESS_HARD_RESET);
            if (elements.settingsModal) elements.settingsModal.style.display = "none";
        }
    });
}
