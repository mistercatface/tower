import { events } from "../../../Core/EventSystem.js";
import { Events } from "../../../Core/EventNames.js";
export function requestProgressDirty() {
    events.emit(Events.PROGRESS_DIRTY);
}
export function requestProgressSave() {
    events.emit(Events.PROGRESS_SAVE);
}
export function emitPurchaseUpgrade(upgradeId) {
    events.emit(Events.PROGRESS_PURCHASE_UPGRADE, { upgradeId });
}
export function emitToggleAbility(abilityId) {
    events.emit(Events.PROGRESS_TOGGLE_ABILITY, { abilityId });
}
export function emitToggleEquipWeapon(gunId) {
    events.emit(Events.PROGRESS_EQUIP_WEAPON, { gunId });
}
export function emitUnequipWeaponSlot(slotIndex) {
    events.emit(Events.PROGRESS_UNEQUIP_WEAPON_SLOT, { slotIndex });
}
export function emitSetUpgradeTab(tab) {
    events.emit(Events.UI_SET_UPGRADE_TAB, { tab });
}
export function emitSetStatsSubTab(subTab) {
    events.emit(Events.UI_SET_STATS_SUB_TAB, { subTab });
}
export function emitHardReset() {
    events.emit(Events.PROGRESS_HARD_RESET);
}
