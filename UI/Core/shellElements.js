/** Shared DOM refs for engine shell overlays, control bar, and tower HUD chrome. */
/** @type {Record<string, HTMLElement | NodeListOf<Element> | null> | null} */
let cache = null;
/** @returns {Record<string, HTMLElement | NodeListOf<Element> | null>} */
function queryShellElements() {
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
        killsDisplay: document.getElementById("killsDisplay"),
        scoreDisplay: document.getElementById("scoreDisplay"),
        levelDisplay: document.getElementById("levelDisplay"),
        nextPerkDisplay: document.getElementById("nextPerkDisplay"),
        xpDisplay: document.getElementById("xpDisplay"),
        healthSegments: document.getElementById("healthSegments"),
        healthText: document.getElementById("healthText"),
        passivesContainer: document.getElementById("passivesContainer"),
        abilitiesContainer: document.getElementById("abilitiesContainer"),
        upgradesContainer: document.getElementById("upgradesContainer"),
        speedControls: document.getElementById("speedControls"),
        mainTabButtons: document.querySelectorAll(".mainTabBtn"),
        statsSubTabButtons: document.querySelectorAll(".statsSubTabBtn"),
        statsSubTabs: document.getElementById("statsSubTabs"),
        equipmentPanel: document.getElementById("equipmentPanel"),
        equipmentSlots: document.getElementById("equipmentSlots"),
        equipmentArmory: document.getElementById("equipmentArmory"),
    };
}
/** Query shell DOM once after chrome mount; reused by tower UI and shared shell wiring. */
export function bindShellElements() {
    cache = queryShellElements();
    return cache;
}
/** @returns {Record<string, HTMLElement | NodeListOf<Element> | null>} */
export function getShellElements() {
    return cache ?? queryShellElements();
}
export function clearShellElements() {
    cache = null;
}
