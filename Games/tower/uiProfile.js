/** @type {import("../../Core/GameUiProfile.js").GameUiProfile} */
export const TOWER_UI_PROFILE = {
    shell: "tower",
    chrome: { score: true, perks: true, map: true, settings: true, bottomPanel: true, controls: "full", zoomSlider: true },
    combat: { entityBars: true, targetMarkers: true, combatHudModes: true, visibilityMask: true, hostileActors: true, playerActors: true, offScreenIndicators: true, globeOverlay: true },
    lifecycle: "player-health",
};
