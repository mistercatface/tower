import { normalizeWeaponLoadout } from "./equipmentLoadout.js";
import { cloneGunDefinition, getGunDefinition } from "./gunDefaults.js";
/** Default laser-sight preview range for sandbox humanoids (no combat weapon stats). */
export const DEFAULT_SIGHT_RANGE = 200;
export function ensurePickupWeaponState(pickup) {
    if (!pickup.weaponSlotState) pickup.weaponSlotState = [];
}
/** Clone gun definition for a slot and apply per-pickup attachment toggles. */
export function resolvePickupSlotGun(pickup, slotIndex) {
    const gunId = normalizeWeaponLoadout(pickup.weaponLoadout ?? [])[slotIndex];
    if (!gunId) return null;
    const gun = cloneGunDefinition(getGunDefinition(gunId));
    const slotState = pickup.weaponSlotState?.[slotIndex];
    if (gun.attachments && slotState?.attachmentEnabled)
        for (const [attachmentId, enabled] of Object.entries(slotState.attachmentEnabled)) if (gun.attachments[attachmentId]) gun.attachments[attachmentId].enabled = !!enabled;
    return gun;
}
/** Keep slot attachment state and stub turrets aligned with the normalized loadout. */
export function syncPickupWeaponState(pickup) {
    const loadout = normalizeWeaponLoadout(pickup.weaponLoadout ?? []);
    ensurePickupWeaponState(pickup);
    while (pickup.weaponSlotState.length > loadout.length) pickup.weaponSlotState.pop();
    while (pickup.weaponSlotState.length < loadout.length) pickup.weaponSlotState.push({});
    const facing = pickup.facing ?? pickup.angle ?? 0;
    const turnSpeed = pickup.stats?.turnSpeed?.value ?? pickup.turnSpeed ?? 10;
    const prevTurrets = pickup.turrets ?? [];
    pickup.turrets = loadout.map((gunId, index) => {
        const existing = prevTurrets[index];
        if (existing?.gunId === gunId) {
            existing.gun = resolvePickupSlotGun(pickup, index);
            if (existing.angle == null) existing.angle = facing;
            if (existing.turnSpeed == null) existing.turnSpeed = turnSpeed;
            return existing;
        }
        return { angle: facing, gunId, gun: resolvePickupSlotGun(pickup, index), charge: 0, swayPhase: 0, turnSpeed };
    });
}
export function gunSupportsAttachment(gunId, attachmentId) {
    return !!getGunDefinition(gunId).attachments?.[attachmentId];
}
export function isPickupAttachmentEnabled(pickup, slotIndex, attachmentId) {
    return !!pickup.weaponSlotState?.[slotIndex]?.attachmentEnabled?.[attachmentId];
}
export function setPickupAttachmentEnabled(pickup, slotIndex, attachmentId, enabled) {
    ensurePickupWeaponState(pickup);
    syncPickupWeaponState(pickup);
    const slotState = pickup.weaponSlotState[slotIndex];
    if (!slotState) return;
    if (!slotState.attachmentEnabled) slotState.attachmentEnabled = {};
    slotState.attachmentEnabled[attachmentId] = enabled;
    syncPickupWeaponState(pickup);
}
