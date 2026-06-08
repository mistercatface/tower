import { getPropAsset } from "../Props/PropCatalog.js";
import { getGunDefinition, playerEquipmentCatalog } from "../Combat/gunDefaults.js";
import { applyPickupWeaponLoadout } from "../Combat/pickupWeaponLoadout.js";
import { gunSupportsAttachment, isPickupAttachmentEnabled, resolvePickupSlotGun, setPickupAttachmentEnabled } from "../Combat/pickupWeaponState.js";
import { countGunInLoadout, formatHandednessLabel, getEquipmentSlotCount, getGunEquipAction, normalizeWeaponLoadout, toggleGunInLoadout, unequipSlot } from "../Combat/equipmentLoadout.js";
import { isSandboxEquippable } from "./sandboxCapabilities.js";
/**
 * @param {HTMLElement} container
 * @param {object | null} pickup
 * @param {() => void} onChange
 */
export function renderSandboxEquipPanel(container, pickup, onChange) {
    container.innerHTML = "";
    if (!pickup || !isSandboxEquippable(getPropAsset(pickup.type))) return;
    const head = document.createElement("div");
    head.className = "editor-subhead";
    head.textContent = "Equipment";
    container.appendChild(head);
    const slotWrap = document.createElement("div");
    slotWrap.className = "sandbox-equip-slots";
    const slotCount = getEquipmentSlotCount(pickup.weaponLoadout ?? []);
    const loadout = normalizeWeaponLoadout(pickup.weaponLoadout ?? []);
    for (let index = 0; index < slotCount; index++) {
        const gunId = loadout[index];
        const slot = document.createElement("div");
        slot.className = `sandbox-equip-slot${gunId ? " filled" : " empty"}`;
        const label = document.createElement("div");
        label.className = "sandbox-equip-slot-label";
        label.textContent = gunId ? `Slot ${index + 1} · ${formatHandednessLabel(gunId)}` : `Slot ${index + 1} · Empty`;
        const name = document.createElement("div");
        name.className = "sandbox-equip-slot-name";
        name.textContent = gunId ? (getGunDefinition(gunId).name ?? gunId) : "—";
        slot.append(label, name);
        if (gunId) {
            const gun = resolvePickupSlotGun(pickup, index) ?? getGunDefinition(gunId);
            if (gun.attachments?.laserSights) {
                const laserLabel = document.createElement("label");
                laserLabel.className = "sandbox-equip-laser-toggle";
                const laserCheckbox = document.createElement("input");
                laserCheckbox.type = "checkbox";
                laserCheckbox.checked = isPickupAttachmentEnabled(pickup, index, "laserSights");
                laserCheckbox.addEventListener("change", () => {
                    setPickupAttachmentEnabled(pickup, index, "laserSights", laserCheckbox.checked);
                    onChange();
                });
                const laserSpan = document.createElement("span");
                laserSpan.textContent = gun.attachments.laserSights.name ?? "Laser Sights";
                laserLabel.append(laserCheckbox, laserSpan);
                slot.appendChild(laserLabel);
            }
            const unequipBtn = document.createElement("button");
            unequipBtn.type = "button";
            unequipBtn.className = "secondary sandbox-equip-unequip";
            unequipBtn.textContent = "Unequip";
            unequipBtn.addEventListener("click", () => {
                applyPickupWeaponLoadout(pickup, unequipSlot(pickup.weaponLoadout ?? [], index));
                onChange();
            });
            slot.appendChild(unequipBtn);
        }
        slotWrap.appendChild(slot);
    }
    container.appendChild(slotWrap);
    const armoryHead = document.createElement("div");
    armoryHead.className = "editor-subhead";
    armoryHead.style.marginTop = "8px";
    armoryHead.textContent = "Armory";
    container.appendChild(armoryHead);
    const armory = document.createElement("div");
    armory.className = "sandbox-equip-armory";
    for (const gunId of playerEquipmentCatalog) {
        const gun = getGunDefinition(gunId);
        const action = getGunEquipAction(loadout, gunId);
        const equippedCount = countGunInLoadout(loadout, gunId);
        const row = document.createElement("div");
        row.className = "sandbox-equip-armory-row";
        if (equippedCount > 0) row.classList.add("equipped");
        if (action === "blocked") row.classList.add("blocked");
        const info = document.createElement("div");
        info.className = "sandbox-equip-armory-info";
        const gunName = document.createElement("div");
        gunName.className = "sandbox-equip-armory-name";
        gunName.textContent = gun.name ?? gun.id;
        const meta = document.createElement("div");
        meta.className = "sandbox-equip-armory-meta";
        meta.textContent = gunSupportsAttachment(gunId, "laserSights") ? `${formatHandednessLabel(gunId)} · Laser sights` : formatHandednessLabel(gunId);
        info.append(gunName, meta);
        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "sandbox-equip-btn";
        actionBtn.disabled = action === "blocked";
        if (action === "unequip") {
            actionBtn.textContent = equippedCount > 1 ? `Unequip (${equippedCount})` : "Unequip";
            actionBtn.classList.add("unequip");
        } else if (action === "equip") {
            actionBtn.textContent = equippedCount > 0 ? "Equip +1" : "Equip";
            actionBtn.classList.add("equip");
        } else actionBtn.textContent = "Full";
        actionBtn.addEventListener("click", () => {
            applyPickupWeaponLoadout(pickup, toggleGunInLoadout(pickup.weaponLoadout ?? [], gunId));
            onChange();
        });
        row.append(info, actionBtn);
        armory.appendChild(row);
    }
    container.appendChild(armory);
}
