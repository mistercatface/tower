/** @typedef {import("../../Core/GameUiProfile.js").GameUiProfile} GameUiProfile */

/**
 * @param {string} region
 * @param {boolean} visible
 */
export function setUiRegionVisible(region, visible) {
    const nodes = document.querySelectorAll(`[data-ui-region="${region}"]`);
    const display = visible ? "" : "none";
    for (const node of nodes) {
        node.style.display = display;
    }
}

/**
 * Apply chrome visibility for the active game — called from each game's `uiPort.mount`.
 *
 * @param {GameUiProfile} profile
 */
export function applyChromeProfile(profile) {
    const { chrome, combat } = profile;

    setUiRegionVisible("score", !!chrome.score);
    setUiRegionVisible("perks", !!chrome.perks);
    setUiRegionVisible("map", !!chrome.map);
    setUiRegionVisible("settings", !!chrome.settings);
    setUiRegionVisible("bottom-panel", !!chrome.bottomPanel);

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
        setControlsBarSections({ speed: false, zoom: !!chrome.zoomSlider });
    } else {
        if (bottomArea) {
            bottomArea.style.display = "";
            bottomArea.classList.remove("shell-controls-only");
        }
        if (controlsBar) controlsBar.style.display = "";
        if (abilitiesDock) abilitiesDock.style.display = "";
        setControlsBarSections({ speed: true, zoom: !!chrome.zoomSlider });
    }

    setUiRegionVisible("combat-hud-setting", !!combat.combatHudModes);

    const closeMapBtn = document.getElementById("closeMapBtn");
    if (closeMapBtn) closeMapBtn.style.display = "none";
}

/**
 * @param {{ speed: boolean, zoom: boolean }} sections
 */
function setControlsBarSections({ speed, zoom }) {
    const speedBlock = document.getElementById("speedControls");
    const zoomBlock = document.getElementById("zoomControls");
    const divider = document.getElementById("controlsDivider");
    if (speedBlock) speedBlock.style.display = speed ? "" : "none";
    if (zoomBlock) zoomBlock.style.display = zoom ? "" : "none";
    if (divider) divider.style.display = zoom ? "" : "none";
}
