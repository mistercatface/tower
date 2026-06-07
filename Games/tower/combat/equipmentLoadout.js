import {
    Handedness,
    defaultGunHandedness,
    dualServiceWeaponStart,
    equipmentLimits,
    randomLoadoutSettings,
} from "../config/content/equipment.js";
import { getGunDefinition } from "../config/content/guns.js";

export function getGunHandedness(gunId) {
    const gun = getGunDefinition(gunId);
    return gun.handedness ?? defaultGunHandedness;
}

export function isTwoHandedGun(gunId) {
    return getGunHandedness(gunId) === Handedness.TWO_HANDED;
}

/** Valid loadout: empty, one two-handed gun, or 1–max one-handed guns (no mixing). */
export function normalizeWeaponLoadout(gunIds) {
    if (!gunIds?.length) return [];

    const ids = gunIds.filter((id) => {
        getGunDefinition(id);
        return true;
    });

    const twoHanded = ids.filter((id) => isTwoHandedGun(id));
    if (twoHanded.length > 0) {
        return [twoHanded[0]];
    }

    const oneHanded = ids.filter((id) => !isTwoHandedGun(id));
    return oneHanded.slice(0, equipmentLimits.maxOneHandedSlots);
}

export function getTurretCountForLoadout(gunIds) {
    return normalizeWeaponLoadout(gunIds).length;
}

export function canEquipGun(loadout, gunId) {
    getGunDefinition(gunId);
    const current = normalizeWeaponLoadout(loadout);

    if (isTwoHandedGun(gunId)) {
        return current.length === 0;
    }

    if (current.some((id) => isTwoHandedGun(id))) {
        return false;
    }

    return current.length < equipmentLimits.maxOneHandedSlots;
}

function pickRandom(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
}

function rollOneHandedLoadout(oneHandedPool) {
    const guns = [pickRandom(oneHandedPool)];
    if (
        oneHandedPool.length > 0 &&
        Math.random() < randomLoadoutSettings.dualWieldOneHandedChance
    ) {
        guns.push(pickRandom(oneHandedPool));
    }
    return normalizeWeaponLoadout(guns);
}

function rollDualServiceWeaponStart(pool) {
    const { gunId, chance } = dualServiceWeaponStart;
    if (!gunId || chance <= 0 || !pool.includes(gunId)) {
        return null;
    }
    if (Math.random() >= chance) {
        return null;
    }
    return normalizeWeaponLoadout([gunId, gunId]);
}

/** Roll one two-handed gun or up to two one-handed guns from a pool. */
export function rollRandomLoadoutFromPool(pool) {
    if (!pool?.length) return [];

    const dualService = rollDualServiceWeaponStart(pool);
    if (dualService) {
        return dualService;
    }

    const oneHandedPool = pool.filter((id) => !isTwoHandedGun(id));
    const twoHandedPool = pool.filter((id) => isTwoHandedGun(id));

    const canRoll1h = oneHandedPool.length > 0;
    const canRoll2h = twoHandedPool.length > 0;

    if (!canRoll1h && !canRoll2h) return [];
    if (!canRoll2h) return rollOneHandedLoadout(oneHandedPool);
    if (!canRoll1h) return [pickRandom(twoHandedPool)];

    if (Math.random() < randomLoadoutSettings.twoHandedRollChance) {
        return [pickRandom(twoHandedPool)];
    }

    return rollOneHandedLoadout(oneHandedPool);
}

export function formatHandednessLabel(gunId) {
    return isTwoHandedGun(gunId) ? "Two-handed" : "One-handed";
}

export function getEquipmentSlotCount(loadout) {
    const normalized = normalizeWeaponLoadout(loadout);
    if (normalized.some((id) => isTwoHandedGun(id))) {
        return 1;
    }
    return equipmentLimits.maxOneHandedSlots;
}

export function countGunInLoadout(loadout, gunId) {
    return normalizeWeaponLoadout(loadout).filter((id) => id === gunId).length;
}

/** @returns {"equip" | "unequip" | "blocked"} */
export function getGunEquipAction(loadout, gunId) {
    getGunDefinition(gunId);
    const normalized = normalizeWeaponLoadout(loadout);
    const equippedCount = countGunInLoadout(normalized, gunId);

    if (equippedCount > 0 && !canEquipGun(normalized, gunId)) {
        return "unequip";
    }
    if (canEquipGun(normalized, gunId)) {
        return "equip";
    }
    if (equippedCount > 0) {
        return "unequip";
    }
    return "blocked";
}

export function equipGunToLoadout(loadout, gunId) {
    if (!canEquipGun(loadout, gunId)) {
        return normalizeWeaponLoadout(loadout);
    }
    return normalizeWeaponLoadout([...normalizeWeaponLoadout(loadout), gunId]);
}

export function unequipGunFromLoadout(loadout, gunId) {
    const normalized = normalizeWeaponLoadout(loadout);
    const index = normalized.indexOf(gunId);
    if (index === -1) return normalized;
    return normalizeWeaponLoadout([
        ...normalized.slice(0, index),
        ...normalized.slice(index + 1),
    ]);
}

export function unequipSlot(loadout, slotIndex) {
    const normalized = normalizeWeaponLoadout(loadout);
    if (slotIndex < 0 || slotIndex >= normalized.length) {
        return normalized;
    }
    return normalizeWeaponLoadout([
        ...normalized.slice(0, slotIndex),
        ...normalized.slice(slotIndex + 1),
    ]);
}

export function toggleGunInLoadout(loadout, gunId) {
    const action = getGunEquipAction(loadout, gunId);
    if (action === "equip") {
        return equipGunToLoadout(loadout, gunId);
    }
    if (action === "unequip") {
        return unequipGunFromLoadout(loadout, gunId);
    }
    return normalizeWeaponLoadout(loadout);
}
