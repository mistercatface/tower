import { getUiRoot } from "../../../UI/Core/uiRoot.js";
import { clearTowerShellElements } from "./towerShellElements.js";
const TOWER_CHROME_ROOT_ID = "tower-chrome";
const TOWER_SPEED_CONTROL_HTML = `<div id="speedControls" class="speed-control">
<button type="button" data-speed-down class="speed-control-down control-btn" id="speedDownBtn">–</button>
<button type="button" data-speed-pause class="speed-control-pause control-btn control-btn-large" id="pauseBtn">
<span data-pause-label id="pauseText">PAUSE</span>
<span data-speed-label class="speed-control-speed-label" id="speedDisplay">1.00x</span>
</button>
<button type="button" data-speed-up class="speed-control-up control-btn" id="speedUpBtn">+</button>
</div>`;
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
const SETTINGS_MODAL_HTML = `
<div id="settingsModal" class="ui-overlay ui-overlay--settings">
    <h2 class="settings-title">Settings</h2>
    ${COMBAT_HUD_SETTING_HTML}
    <button id="hardResetBtn" class="settings-btn settings-btn--danger" type="button">Reset Game</button>
    <button id="closeSettingsBtn" class="settings-btn settings-btn--neutral" type="button">Close</button>
</div>`;
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
        <div id="zoomControls" class="viewport-zoom-control">
            <span class="zoom-controls-label">ZOOM</span>
            <input type="range" id="zoomSlider" min="0" max="100" value="0" class="viewport-zoom-control-slider premium-slider">
            <span id="zoomDisplay" class="viewport-zoom-control-display">100%</span>
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
const TOWER_CHROME_HTML = `${INSPECT_BANNER_HTML}${INSPECT_OVERLAY_HTML}${UPGRADE_MODAL_HTML}${GAME_OVER_HTML}${SETTINGS_MODAL_HTML}`;
/** Remove all tower-injected DOM. */
export function unmountTowerChrome() {
    document.getElementById(TOWER_CHROME_ROOT_ID)?.remove();
    getUiRoot()?.replaceChildren();
    clearTowerShellElements();
}
/** Inject tower-only DOM into the shell (not loaded for pool). */
export function mountTowerChrome() {
    const canvas = document.getElementById("gameCanvas");
    const uiRoot = getUiRoot();
    if (!canvas || !uiRoot) throw new Error("mountTowerChrome: game shell missing");
    unmountTowerChrome();
    canvas.insertAdjacentHTML("afterend", `<div id="${TOWER_CHROME_ROOT_ID}">${TOWER_CHROME_HTML}</div>`);
    uiRoot.innerHTML = TOWER_UI_HTML;
}
