import { speedControlHtml } from "../../../Libraries/Playback/index.js";
import { getUiRoot } from "../../../UI/Core/uiRoot.js";
const TOWER_SPEED_CONTROL_HTML = speedControlHtml({
    rootId: "speedControls",
    buttonClass: "control-btn",
    pauseButtonClass: "control-btn control-btn-large",
    ids: { down: "speedDownBtn", pause: "pauseBtn", pauseLabel: "pauseText", speedLabel: "speedDisplay", up: "speedUpBtn" },
});
const INSPECT_OVERLAY_HTML = `
<div id="inspectOverlay" class="inspect-overlay">
    <div class="inspect-panel">
        <button id="inspectCloseBtn" class="inspect-close" type="button" aria-label="Close">✕</button>
        <div id="inspectTitle" class="inspect-title">INSPECT</div>
        <canvas id="inspectCanvas"></canvas>
    </div>
</div>`;
const INSPECT_BANNER_HTML = `
<div id="inspectMissionBanner" class="inspect-mission-banner" style="display: none;">
    <span id="inspectMissionText"></span>
</div>`;
const COMBAT_HUD_SETTING_HTML = `
<label id="combatHudModeRow">
    <span>Combat HUD mode (H to cycle)</span>
    <select id="combatHudModeSelect">
        <option value="0">Off</option>
        <option value="1">Overlay</option>
        <option value="2">Classic only</option>
    </select>
</label>`;
const UPGRADE_MODAL_HTML = `
<div id="upgradeChoiceModal" class="ui-overlay ui-overlay--dim">
    <div class="upgrade-choice-card">
        <h2 id="upgradeChoiceTitle"></h2>
        <p id="upgradeChoiceDesc"></p>
        <div id="upgradeChoicesContainer"></div>
    </div>
</div>`;
const GAME_OVER_HTML = `
<div id="gameOverUI" class="ui-overlay ui-overlay--run-result">
    <h1 id="gameOverTitle">GAME OVER</h1>
    <button id="restartBtn" type="button">NEW RUN</button>
</div>`;
const TOWER_UI_HTML = `
<div id="topUI">
    <div class="top-hud-stats">
        <div class="top-hud-label top-hud-label--score">
            Points: <span id="scoreDisplay">0</span>
        </div>
        <div id="nextPerkDisplay" class="top-hud-label top-hud-label--perk">
            Next Perk: Level 1
        </div>
    </div>
    <div id="topRightControls" class="top-right-controls">
        <button id="mapBtn" class="map-nav-btn" type="button" title="Open map">Map</button>
        <button id="closeMapBtn" class="map-nav-btn" type="button" title="Close map">Close</button>
        <button id="settingsBtn" class="settings-gear-btn" type="button" title="Settings">⚙️</button>
    </div>
</div>
<div id="bottomArea">
    <div id="abilitiesDock">
        <div id="passivesContainer"></div>
        <div id="abilitiesContainer"></div>
    </div>
    <div id="controlsBar" class="chrome-control-panel">
        ${TOWER_SPEED_CONTROL_HTML}
        <div id="controlsDivider"></div>
        <div id="zoomControls">
            <span class="zoom-controls-label">ZOOM</span>
            <input type="range" id="zoomSlider" min="0" max="100" value="0" class="premium-slider">
            <span id="zoomDisplay">100%</span>
        </div>
    </div>
    <div id="healthBarContainer">
        <div class="health-bar-track">
            <div id="healthSegments"></div>
            <div id="healthText"></div>
        </div>
    </div>
    <div id="uiContainer">
        <div class="ui-panel-summary">
            <span>Level: <span id="levelDisplay">0</span></span>
            <span>XP: <span id="xpDisplay">0/25</span></span>
            <span>Kills: <span id="killsDisplay">0</span></span>
        </div>
        <div id="upgradeTabs">
            <button class="mainTabBtn tabBtn" data-tab="stats" type="button">Stats</button>
            <button class="mainTabBtn tabBtn" data-tab="equipment" type="button">Equipment</button>
            <button class="mainTabBtn tabBtn" data-tab="abilities" type="button">Abilities</button>
            <button class="mainTabBtn tabBtn" data-tab="perk" type="button">Perks</button>
        </div>
        <div id="statsSubTabs">
            <button class="statsSubTabBtn tabBtn" data-stats-tab="attack" type="button">Attack</button>
            <button class="statsSubTabBtn tabBtn" data-stats-tab="defense" type="button">Defense</button>
            <button class="statsSubTabBtn tabBtn" data-stats-tab="meta" type="button">Meta</button>
        </div>
        <div id="equipmentPanel" class="equipment-panel" style="display: none;">
            <div class="equipment-section">
                <div class="equipment-section-title">Equipped</div>
                <div id="equipmentSlots" class="equipment-slots"></div>
            </div>
            <div class="equipment-section">
                <div class="equipment-section-title">Armory</div>
                <div id="equipmentArmory" class="equipment-armory"></div>
            </div>
        </div>
        <div id="upgradesContainer"></div>
    </div>
</div>`;
/** Inject tower-only DOM into the shell (not loaded for pool). */
export function mountTowerChrome() {
    const wrapper = document.getElementById("gameWrapper");
    const uiRoot = getUiRoot();
    if (!wrapper || !uiRoot) throw new Error("mountTowerChrome: game shell missing");
    document.getElementById("inspectOverlay")?.remove();
    document.getElementById("inspectMissionBanner")?.remove();
    document.getElementById("gameOverUI")?.remove();
    wrapper.insertAdjacentHTML("beforeend", INSPECT_OVERLAY_HTML);
    const canvas = document.getElementById("gameCanvas");
    if (canvas) canvas.insertAdjacentHTML("afterend", INSPECT_BANNER_HTML);
    else wrapper.insertAdjacentHTML("afterbegin", INSPECT_BANNER_HTML);
    uiRoot.innerHTML = TOWER_UI_HTML;
    wrapper.insertAdjacentHTML("beforeend", UPGRADE_MODAL_HTML);
    wrapper.insertAdjacentHTML("beforeend", GAME_OVER_HTML);
    const settingsTitle = document.querySelector("#settingsModal .settings-title");
    settingsTitle?.insertAdjacentHTML("afterend", COMBAT_HUD_SETTING_HTML);
}
