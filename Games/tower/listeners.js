import { toggleGunInLoadout, unequipSlot } from "../../Combat/equipmentLoadout.js";
import { nextUpgradeCost, playerBaseStats } from "../../Config/Config.js";
import { Events, requestUiUpdate, requestUiHudUpdate, requestGamePause, requestGameResume } from "../../Core/EventSystem.js";
import { requestProgressDirty } from "./progression/events.js";
import { getRunScenePort } from "../../Core/GamePorts.js";
import { registerPersistentTriggers } from "../../Core/PersistentTriggerSetup.js";
import { isSimulation } from "../../GameState/GamePhase.js";
import { ProgressionManager } from "./progression/ProgressionManager.js";
import { StatsManager } from "./progression/StatsManager.js";
import { towerRadio } from "./radio.js";
import { inspectBridge } from "./inspect/InspectBridge.js";
import { towerInspectPort } from "./inspectPort.js";
import { preloadAllInspectAssets } from "../../Libraries/Inspect/InspectCatalog.js";
import { progressionBootstrap } from "./progression/bootstrap.js";
/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus @param {{ state: object, upgrades: object[], fsm: object, resetGame: () => void } | undefined} boot */
export function registerTowerListeners(eventBus, boot) {
    if (boot) progressionBootstrap({ state: boot.state, upgrades: boot.upgrades, events: eventBus });
    towerRadio.wire(eventBus, { requestPause: requestGamePause, requestResume: requestGameResume });
    inspectBridge.mount();
    towerInspectPort.registerEntries();
    preloadAllInspectAssets();
    registerPersistentTriggers(eventBus);
    eventBus.on(Events.COMBAT_ENEMY_KILLED, ({ enemy, state, upgrades, fsm }) => {
        ProgressionManager.processEnemyKillRewards(enemy, state, upgrades);
        getRunScenePort().onEnemyKilled?.({ enemy, state, upgrades, fsm });
        requestProgressDirty();
        requestUiUpdate();
    });
    eventBus.on(Events.PROGRESS_PURCHASE_UPGRADE, ({ state, upgrades, upgradeId }) => {
        if (state.isGameOver) return;
        const upg = upgrades.find((u) => u.id === upgradeId);
        if (!upg || upg.category === "abilities" || upg.category === "perk") return;
        const uState = state.player.upgrades[upgradeId];
        if (!uState) return;
        const cost = uState.ptsCost;
        if (state.score < cost || uState.level >= upg.maxLevel) return;
        state.score -= cost;
        uState.ptsCost = nextUpgradeCost(uState.ptsCost);
        uState.level++;
        StatsManager.recalculateStats(state, upgrades);
        if (upg.onPurchase) upg.onPurchase(state);
        requestUiUpdate();
    });
    eventBus.on(Events.PROGRESS_TOGGLE_ABILITY, ({ state, upgrades, abilityId }) => {
        const upg = upgrades.find((u) => u.id === abilityId);
        if (!upg?.hasToggle) return;
        state.abilities[abilityId] = !state.abilities[abilityId];
        StatsManager.recalculateStats(state, upgrades);
        requestUiUpdate();
    });
    eventBus.on(Events.PROGRESS_EQUIP_WEAPON, ({ state, gunId }) => {
        if (state.isGameOver || !state.player) return;
        const loadout = toggleGunInLoadout(state.player.weaponLoadout, gunId);
        state.player.applyWeaponLoadout(loadout, { state, upgradeDefs: state.upgradeDefs });
        requestUiUpdate();
    });
    eventBus.on(Events.PROGRESS_UNEQUIP_WEAPON_SLOT, ({ state, slotIndex }) => {
        if (state.isGameOver || !state.player) return;
        const loadout = unequipSlot(state.player.weaponLoadout, slotIndex);
        state.player.applyWeaponLoadout(loadout, { state, upgradeDefs: state.upgradeDefs });
        requestUiUpdate();
    });
    eventBus.on(Events.UI_SET_UPGRADE_TAB, ({ state, tab }) => {
        state.currentUpgradeTab = tab;
        requestUiUpdate();
    });
    eventBus.on(Events.UI_SET_STATS_SUB_TAB, ({ state, subTab }) => {
        state.statsSubTab = subTab;
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_SET_ZOOM, ({ state, viewport, sliderValue }) => {
        if (!viewport || !state.player) return;
        const sliderVal = sliderValue / 100;
        if (isSimulation(state.phase)) {
            viewport.zoomProgress = sliderVal;
            viewport.updateZoomLimits(state, state.player.weapon.range, playerBaseStats.range);
        } else viewport.setZoom(0.5 + sliderVal * 1.5, state);
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_ADJUST_ZOOM, ({ state, viewport, delta }) => {
        if (!viewport || !state.player) return;
        if (isSimulation(state.phase)) viewport.setZoom(viewport.zoom + delta, state, state.player.weapon.range, playerBaseStats.range);
        else viewport.setZoom(viewport.zoom + delta, state);
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_SET_ZOOM_ABSOLUTE, ({ state, viewport, zoom }) => {
        if (!viewport || !state.player) return;
        if (isSimulation(state.phase)) viewport.setZoom(zoom, state, state.player.weapon.range, playerBaseStats.range);
        else viewport.setZoom(zoom, state);
        requestUiUpdate();
    });
    eventBus.on(Events.MAP_TOGGLE, ({ state, fsm }) => {
        if (!fsm) return;
        if (fsm.currentStateName === "map") {
            const targetState = state.previousStateBeforeMap || "simulation";
            if (targetState === "simulation" || targetState === "inspector") state.skipSimulationEnterReset = true;
            fsm.transition(targetState);
        } else if (fsm.currentStateName === "simulation" || fsm.currentStateName === "inspector") {
            state.previousStateBeforeMap = fsm.currentStateName;
            fsm.transition("map");
        }
        requestUiUpdate();
        requestUiHudUpdate();
    });
}
