/** Shared DOM refs for engine shell overlays and control bar. */
/** @returns {Record<string, HTMLElement | NodeListOf<Element> | null>} */
export function getShellElements() {
    return {
        zoomSlider: document.getElementById("zoomSlider"),
        zoomDisplay: document.getElementById("zoomDisplay"),
        restartBtn: document.getElementById("restartBtn"),
        gameOverUI: document.getElementById("gameOverUI"),
        gameOverTitle: document.getElementById("gameOverTitle"),
        settingsBtn: document.getElementById("settingsBtn"),
        mapBtn: document.getElementById("mapBtn"),
        closeMapBtn: document.getElementById("closeMapBtn"),
        closeSettingsBtn: document.getElementById("closeSettingsBtn"),
        hardResetBtn: document.getElementById("hardResetBtn"),
        settingsModal: document.getElementById("settingsModal"),
        combatHudModeSelect: document.getElementById("combatHudModeSelect"),
        upgradeChoiceModal: document.getElementById("upgradeChoiceModal"),
        upgradeChoicesContainer: document.getElementById("upgradeChoicesContainer"),
        upgradeChoiceTitle: document.getElementById("upgradeChoiceTitle"),
        upgradeChoiceDesc: document.getElementById("upgradeChoiceDesc"),
        inspectMissionBanner: document.getElementById("inspectMissionBanner"),
        inspectMissionText: document.getElementById("inspectMissionText"),
    };
}
