import { clearShellElements } from "./shellElements.js";
/** Remove per-game chrome from the shell before the active uiPort mounts. */
export function clearGameChrome() {
    clearShellElements();
    const uiRoot = document.getElementById("ui-root");
    if (uiRoot) uiRoot.innerHTML = "";
    document.getElementById("inspectMissionBanner")?.remove();
    document.getElementById("upgradeChoiceModal")?.remove();
    document.getElementById("combatHudModeRow")?.remove();
}
/** @returns {HTMLElement | null} */
export function getUiRoot() {
    return document.getElementById("ui-root");
}
