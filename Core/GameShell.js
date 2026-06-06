import { getUiProfile } from "./GameUiProfile.js";

export { applyGameShell, getUiProfile, resolveUiProfile, getCombatFeatures } from "./GameUiProfile.js";

/**
 * Show or hide game DOM chrome according to the active UI profile.
 */
export function applyChromeVisibility() {
    const profile = getUiProfile();
    const { chrome } = profile;

    const topScore = document.getElementById("scoreDisplay")?.parentElement;
    if (topScore) {
        topScore.style.display = chrome.score ? "" : "none";
    }

    const perks = document.getElementById("nextPerkDisplay");
    if (perks) perks.style.display = chrome.perks ? "" : "none";

    const mapBtn = document.getElementById("mapBtn");
    const closeMapBtn = document.getElementById("closeMapBtn");
    if (mapBtn) mapBtn.style.display = chrome.map ? "" : "none";
    if (closeMapBtn) closeMapBtn.style.display = "none";

    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) settingsBtn.style.display = chrome.settings ? "" : "none";

    const uiContainer = document.getElementById("uiContainer");
    if (uiContainer) uiContainer.style.display = chrome.bottomPanel ? "" : "none";

    const bottomArea = document.getElementById("bottomArea");
    const controlsBar = document.getElementById("controlsBar");
    const abilitiesDock = document.getElementById("abilitiesDock");

    if (chrome.controls === "none") {
        if (bottomArea) bottomArea.style.display = "none";
    } else if (chrome.controls === "pause-only") {
        if (bottomArea) {
            bottomArea.style.display = "flex";
            bottomArea.classList.add("shell-controls-only");
        }
        if (abilitiesDock) abilitiesDock.style.display = "none";
        if (controlsBar) controlsBar.style.display = "flex";
        hideControlsBarSections(chrome);
    } else {
        if (bottomArea) {
            bottomArea.style.display = "";
            bottomArea.classList.remove("shell-controls-only");
        }
        if (controlsBar) controlsBar.style.display = "";
        restoreControlsBarSections();
    }

    const hudModeRow = document.getElementById("combatHudModeRow");
    if (hudModeRow) {
        hudModeRow.style.display = profile.combat.combatHudModes ? "" : "none";
    }
}

/** @param {import("./GameUiProfile.js").GameUiChrome} chrome */
function hideControlsBarSections(chrome) {
    const speedBlock = document.getElementById("speedControls");
    const zoomBlock = document.getElementById("zoomControls");
    const divider = document.getElementById("controlsDivider");
    if (speedBlock) speedBlock.style.display = "none";
    if (zoomBlock) zoomBlock.style.display = chrome.zoomSlider ? "" : "none";
    if (divider) divider.style.display = chrome.zoomSlider ? "" : "none";
}

function restoreControlsBarSections() {
    const speedBlock = document.getElementById("speedControls");
    const zoomBlock = document.getElementById("zoomControls");
    const divider = document.getElementById("controlsDivider");
    if (speedBlock) speedBlock.style.display = "";
    if (zoomBlock) zoomBlock.style.display = "";
    if (divider) divider.style.display = "";
}
