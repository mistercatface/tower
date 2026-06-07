/** Remove per-game chrome from the shell before the active uiPort mounts. */
export function clearGameChrome() {
    const uiRoot = document.getElementById("ui-root");
    if (uiRoot) uiRoot.innerHTML = "";
    document.getElementById("upgradeChoiceModal")?.remove();
    document.getElementById("combatHudModeRow")?.remove();
    document.getElementById("gameOverUI")?.remove();
}
/** @returns {HTMLElement | null} */
export function getUiRoot() {
    return document.getElementById("ui-root");
}
