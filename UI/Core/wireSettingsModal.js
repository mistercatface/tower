import { emitHardReset } from "../../Core/EventSystem.js";
import { getShellElements } from "./shellElements.js";
/**
 * Settings gear + modal — shared by games that expose `#settingsBtn` in chrome.
 *
 * @param {object} state
 */
export function wireSettingsModal(state) {
    const elements = getShellElements();
    elements.settingsBtn?.addEventListener("click", () => {
        if (elements.combatHudModeSelect) elements.combatHudModeSelect.value = String(state.combatHudMode ?? 0);
        if (elements.settingsModal) elements.settingsModal.style.display = "flex";
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
