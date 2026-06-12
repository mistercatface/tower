import { normalizeWeaponLoadout } from "./equipmentLoadout.js";
import { cloneGunDefinition, getGunDefinition } from "./gunDefaults.js";
import { Turret } from "./Turret.js";
/** Default laser-sight preview range for sandbox humanoids (no combat weapon stats). */
export const DEFAULT_SIGHT_RANGE = 200;
export function ensureWorldPropWeaponState(prop) {
    if (!prop.weaponSlotState) prop.weaponSlotState = [];
}
/** Clone gun definition for a slot and apply per-prop attachment toggles. */
export function resolveWorldPropSlotGun(prop, slotIndex) {
    const gunId = normalizeWeaponLoadout(prop.weaponLoadout ?? [])[slotIndex];
    if (!gunId) return null;
    const gun = cloneGunDefinition(getGunDefinition(gunId));
    const slotState = prop.weaponSlotState?.[slotIndex];
    if (gun.attachments && slotState?.attachmentEnabled)
        for (const [attachmentId, enabled] of Object.entries(slotState.attachmentEnabled)) if (gun.attachments[attachmentId]) gun.attachments[attachmentId].enabled = !!enabled;
    return gun;
}
/** Keep slot attachment state and stub turrets aligned with the normalized loadout. */
export function syncWorldPropWeaponState(prop) {
    const loadout = normalizeWeaponLoadout(prop.weaponLoadout ?? []);
    ensureWorldPropWeaponState(prop);
    while (prop.weaponSlotState.length > loadout.length) prop.weaponSlotState.pop();
    while (prop.weaponSlotState.length < loadout.length) prop.weaponSlotState.push({});
    const facing = prop.facing ?? prop.angle ?? 0;
    const turnSpeed = prop.stats?.turnSpeed?.value ?? prop.turnSpeed ?? 10;
    const prevTurrets = prop.turrets ?? [];
    prop.turrets = loadout.map((gunId, index) => {
        const existing = prevTurrets[index];
        if (existing && existing.gunId === gunId && existing instanceof Turret) {
            existing.gun = resolveWorldPropSlotGun(prop, index);
            if (existing.angle == null) existing.angle = facing;
            if (existing.turnSpeed == null) existing.turnSpeed = turnSpeed;
            return existing;
        }
        const gun = resolveWorldPropSlotGun(prop, index);
        const turret = new Turret(facing, turnSpeed, gun?.turretLoadout);
        turret.gunId = gunId;
        turret.gun = gun;
        return turret;
    });
}
export function gunSupportsAttachment(gunId, attachmentId) {
    return !!getGunDefinition(gunId).attachments?.[attachmentId];
}
export function isWorldPropAttachmentEnabled(prop, slotIndex, attachmentId) {
    return !!prop.weaponSlotState?.[slotIndex]?.attachmentEnabled?.[attachmentId];
}
export function setWorldPropAttachmentEnabled(prop, slotIndex, attachmentId, enabled) {
    ensureWorldPropWeaponState(prop);
    syncWorldPropWeaponState(prop);
    const slotState = prop.weaponSlotState[slotIndex];
    if (!slotState) return;
    if (!slotState.attachmentEnabled) slotState.attachmentEnabled = {};
    slotState.attachmentEnabled[attachmentId] = enabled;
    syncWorldPropWeaponState(prop);
}
