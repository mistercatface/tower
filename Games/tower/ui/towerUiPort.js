import { perkMilestones, xpForLevel } from "../../../Config/Config.js";
import { buildAbilityTreeLayout } from "../../../Config/content/abilityTreeLayout.js";
import { GamePhase, isSimulation } from "../../../GameState/GamePhase.js";
import { getInspectPort } from "../../../Core/GamePorts.js";
import { getUiProfile } from "../../../Core/GameUiProfile.js";
import { getGunDefinition, playerEquipmentCatalog } from "../../../Config/content/guns.js";
import { getSlotFireIntervalMs, getSlotReloadTimeMs } from "../../../Combat/gunCombat.js";
import { countGunInLoadout, formatHandednessLabel, getEquipmentSlotCount, getGunEquipAction, normalizeWeaponLoadout } from "../../../Combat/equipmentLoadout.js";
import { events, Events, emitPurchaseUpgrade, emitToggleAbility, emitSetUpgradeTab, emitSetStatsSubTab, emitToggleEquipWeapon, emitUnequipWeaponSlot } from "../../../Core/EventSystem.js";
import { applyChromeProfile } from "../../../UI/Core/shellChrome.js";
import { bindShellElements } from "../../../UI/Core/shellElements.js";
import { wireShellControls } from "../../../UI/Core/wireShellControls.js";
import { bindSpeedControl, syncSpeedControlDisplay, wireSpeedControl } from "../../../Libraries/Playback/index.js";
import { getActiveGameDefinition } from "../../../Core/ActiveGameDefinition.js";
import { mountTowerChrome } from "./mountTowerChrome.js";
/** @type {Record<string, HTMLElement | NodeListOf<Element> | null>} */
let elements = {};
/** @type {import("../../../Libraries/Playback/speedControlUi.js").SpeedControlElements | null} */
let towerSpeedControl = null;
const dynamicElements = {};
function createButton(styles, innerHTML, onClick, id = "") {
    const btn = document.createElement("button");
    if (id) btn.id = id;
    btn.style.cssText = styles;
    btn.innerHTML = innerHTML;
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
}
function getUpgradeButtonHTML(leftText, rightText, rightColor, statText) {
    return `
        <div style="font-size: 13px; font-weight: bold; color: #FFF; line-height: 1.2; display: flex; justify-content: space-between;">
            <span>${leftText}</span>
            ${rightText ? `<span style="color: ${rightColor};">${rightText}</span>` : ""}
        </div>
        <div style="font-size: 12px; font-weight: normal; color: #FFF; line-height: 1.2; margin-top: 3px; text-align: left;">${statText}</div>
    `;
}
const hudLabelCache = {};
function setHudLabel(id, text) {
    const next = String(text);
    if (hudLabelCache[id] === next) return;
    hudLabelCache[id] = next;
    const el = elements[id];
    if (el) el.textContent = next;
}
function updateToggleButton(btnId, isUnlocked, isActive, btnText, upgDef) {
    const btn = dynamicElements[btnId];
    if (!btn) return;
    if (isUnlocked) {
        btn.style.display = "block";
        if (upgDef && upgDef.cooldown > 0) {
            btn.style.background = "#222";
            btn.style.color = "white";
        } else {
            btn.style.background = isActive ? "#4CAF50" : "#222";
            btn.style.borderColor = isActive ? "#4CAF50" : "#555";
            btn.style.color = "white";
            if (btn.innerText !== btnText) btn.innerText = btnText;
        }
    } else btn.style.display = "none";
}
function updateMapNavButtons(state) {
    if (!getUiProfile().chrome.map) return;
    const onMap = state.phase === GamePhase.MAP;
    const showOpenMap = !onMap && !state.isGameOver;
    if (elements.mapBtn) elements.mapBtn.style.display = showOpenMap ? "block" : "none";
    if (elements.closeMapBtn) elements.closeMapBtn.style.display = onMap ? "block" : "none";
}
function updateInspectMissionBanner(state) {
    const banner = elements.inspectMissionBanner;
    const textEl = elements.inspectMissionText;
    if (!banner || !textEl) return;
    const bannerInfo = getInspectPort().getMissionBanner(state);
    if (!bannerInfo) {
        if (banner.style.display !== "none") banner.style.display = "none";
        return;
    }
    const display = bannerInfo.show ? "block" : "none";
    if (banner.style.display !== display) banner.style.display = display;
    if (!bannerInfo.show) return;
    if (textEl.innerText !== bannerInfo.text) textEl.innerText = bannerInfo.text;
}
function updateHud(state, upgrades) {
    updateMapNavButtons(state);
    updateInspectMissionBanner(state);
    const chrome = getUiProfile().chrome;
    if (!chrome.bottomPanel && !chrome.score && !chrome.perks) return;
    if (chrome.bottomPanel) {
        setHudLabel("killsDisplay", state.kills);
        setHudLabel("levelDisplay", state.level);
        const xpNeeded = xpForLevel(state.level);
        setHudLabel("xpDisplay", `${state.xp}/${xpNeeded}`);
        const healthRatio = state.player.health / state.player.maxHealth;
        updateProgressBar("healthSegments", "healthText", `HP: ${Math.max(0, state.player.health).toFixed(0)} / ${state.player.maxHealth}`, healthRatio, 10, (r) =>
            r > 0.5 ? "#4CAF50" : r > 0.2 ? "#FFEB3B" : "#F44336",
        );
    }
    if (chrome.score) setHudLabel("scoreDisplay", state.score);
    if (chrome.perks) {
        const nextPerk = perkMilestones.find((m) => m > state.highestLevelReached);
        if (elements.nextPerkDisplay) elements.nextPerkDisplay.innerText = nextPerk ? `Next Perk: Level ${nextPerk}` : "All Perks Claimed";
    }
    if (upgrades && chrome.bottomPanel)
        upgrades
            .filter((u) => u.isAbility && u.cooldown > 0)
            .forEach((upg) => {
                const cdOverlay = dynamicElements["cooldownOverlay_" + upg.id];
                const btn = dynamicElements["btnAbility_" + upg.id];
                if (cdOverlay && btn) {
                    cdOverlay.style.background = "#4CAF50";
                    const timers = state.abilityTimers[upg.id];
                    const cdTimer = state.scheduler.getTimeRemaining(timers.cooldownId);
                    if (cdTimer > 0) {
                        const ratio = cdTimer / upg.cooldown;
                        cdOverlay.style.height = (1 - ratio) * 100 + "%";
                        btn.style.borderColor = "#555";
                    } else {
                        cdOverlay.style.height = "100%";
                        btn.style.borderColor = "#4CAF50";
                    }
                }
            });
}
function updateProgressBar(containerId, textId, textString, ratio, totalSegments, getColorFn) {
    const container = elements[containerId];
    const textEl = elements[textId];
    if (!container || !textEl) return;
    if (textEl.innerText !== textString) textEl.innerText = textString;
    if (container.children.length !== totalSegments) {
        container.innerHTML = "";
        for (let i = 0; i < totalSegments; i++) {
            const seg = document.createElement("div");
            seg.style.flex = "1";
            seg.style.height = "100%";
            container.appendChild(seg);
        }
    }
    const filledSegments = Math.ceil(ratio * totalSegments);
    for (let i = 0; i < totalSegments; i++) {
        const seg = container.children[i];
        const targetColor = i < filledSegments ? getColorFn(ratio) : "#222";
        if (seg.style.background !== targetColor) seg.style.background = targetColor;
    }
}
function mountTowerUi(state, upgrades) {
    mountTowerChrome();
    elements = bindShellElements();
    towerSpeedControl = bindSpeedControl(elements.speedControls);
    applyChromeProfile(getUiProfile());
    elements.passivesContainer.innerHTML = "";
    upgrades
        .filter((u) => u.isAbility && !u.showInHud)
        .forEach((upg) => {
            const styles =
                "padding: 3px 8px; background: #1e293b; color: #cbd5e1; border: 1px solid #475569; font-family: monospace; font-weight: bold; border-radius: 4px; display: none; font-size: 11px; pointer-events: none; user-select: none;";
            const btn = createButton(styles, upg.name, null, "btnPassive_" + upg.id);
            dynamicElements[btn.id] = btn;
            elements.passivesContainer.appendChild(btn);
        });
    elements.abilitiesContainer.innerHTML = "";
    upgrades
        .filter((u) => u.isAbility && u.showInHud)
        .forEach((upg) => {
            const styles =
                "padding: 5px 10px; background: #222; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; font-weight: bold; border-radius: 4px; display: none; position: relative; overflow: hidden;";
            const html =
                upg.cooldown > 0
                    ? `<span style="position: relative; z-index: 2;">${upg.toggleName || upg.name}</span><div id="cooldownOverlay_${upg.id}" style="position: absolute; bottom: 0; left: 0; width: 100%; height: 0%; background: rgba(0, 0, 0, 0.6); z-index: 1;"></div>`
                    : upg.toggleName || upg.name;
            const btn = createButton(
                styles,
                html,
                () => {
                    if (upg.hasToggle) emitToggleAbility(upg.id);
                },
                "btnAbility_" + upg.id,
            );
            if (upg.cooldown > 0) dynamicElements["cooldownOverlay_" + upg.id] = btn.querySelector("div");
            dynamicElements[btn.id] = btn;
            elements.abilitiesContainer.appendChild(btn);
        });
    elements.mainTabButtons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
            emitSetUpgradeTab(e.target.getAttribute("data-tab"));
        });
    });
    elements.statsSubTabButtons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
            emitSetStatsSubTab(e.target.getAttribute("data-stats-tab"));
        });
    });
    initEquipmentUI();
    elements.upgradesContainer.innerHTML = "";
    upgrades.forEach((upg) => {
        const styles =
            "flex: 1; min-width: 45%; padding: 4px; background: #333; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; box-sizing: border-box; font-weight: bold; font-size: 14px;";
        const btn = createButton(styles, "", () => emitPurchaseUpgrade(upg.id), "upg_" + upg.id);
        dynamicElements[btn.id] = btn;
        elements.upgradesContainer.appendChild(btn);
    });
    wireShellControls(state);
    if (towerSpeedControl) wireSpeedControl(towerSpeedControl, getActiveGameDefinition());
    updateUI(state, upgrades);
    updateHud(state, upgrades);
}
function isUpgradeVisibleInTab(state, upg, currentLevelToCheck) {
    if (state.currentUpgradeTab === "stats" && upg.category === state.statsSubTab) return true;
    if (state.currentUpgradeTab === "abilities" && upg.category === "abilities") return true;
    if (state.currentUpgradeTab === "perk" && upg.category === "perk") return currentLevelToCheck > 0;
    return false;
}
function setTabButtonActive(buttons, activeValue, attrName) {
    buttons.forEach((btn) => {
        const isActive = btn.getAttribute(attrName) === activeValue;
        btn.style.background = isActive ? "#555" : "#222";
    });
}
function formatGunSummary(gun, actor) {
    if (gun.kind === "beam") {
        const parts = ["Beam"];
        if (gun.tickDamage != null) parts.push(`${gun.tickDamage} dmg/tick`);
        if (gun.tickIntervalMs != null) parts.push(`${gun.tickIntervalMs}ms`);
        if (gun.reloadTimeMs != null) parts.push(`${Math.round(getSlotReloadTimeMs(gun, actor))}ms reload`);
        return parts.join(" · ");
    }
    const parts = ["Projectile"];
    if (gun.damage != null) parts.push(`${gun.damage} dmg`);
    if (gun.fireIntervalMs != null) parts.push(`${Math.round(getSlotFireIntervalMs(gun, actor))}ms`);
    if (gun.reloadTimeMs != null) parts.push(`${Math.round(getSlotReloadTimeMs(gun, actor))}ms reload`);
    return parts.join(" · ");
}
function initEquipmentUI() {
    if (!elements.equipmentSlots || !elements.equipmentArmory) return;
    elements.equipmentSlots.innerHTML = "";
    dynamicElements.equipmentSlotEls = [];
    for (let i = 0; i < 2; i++) {
        const slot = document.createElement("div");
        slot.className = "equipment-slot equipment-slot-empty";
        const body = document.createElement("div");
        body.className = "equipment-slot-body";
        const label = document.createElement("div");
        label.className = "equipment-slot-label";
        const name = document.createElement("div");
        name.className = "equipment-slot-name";
        const stats = document.createElement("div");
        stats.className = "equipment-slot-stats";
        // Laser Sights Toggle
        const laserLabel = document.createElement("label");
        laserLabel.className = "equipment-laser-toggle";
        laserLabel.style.cssText = "display: none; align-items: center; gap: 6px; font-size: 11px; margin-top: 6px; cursor: pointer; color: #00bcd4; user-select: none; font-weight: bold;";
        const laserCheckbox = document.createElement("input");
        laserCheckbox.type = "checkbox";
        laserCheckbox.style.cssText = "cursor: pointer; margin: 0;";
        laserCheckbox.addEventListener("change", (e) => {
            const state = events.getContext()?.state;
            if (state && state.player) {
                const turret = state.player.getTurrets()[i];
                if (turret && turret.gun?.attachments?.laserSights) {
                    turret.gun.attachments.laserSights.enabled = e.target.checked;
                    state.player.applyWeaponLoadout(state.player.weaponLoadout, { state });
                    events.emit(Events.UI_UPDATE);
                }
            }
        });
        const laserSpan = document.createElement("span");
        laserSpan.textContent = "Laser Sights";
        laserLabel.appendChild(laserCheckbox);
        laserLabel.appendChild(laserSpan);
        body.appendChild(label);
        body.appendChild(name);
        body.appendChild(stats);
        body.appendChild(laserLabel);
        const unequipBtn = createButton("", "Unequip", () => emitUnequipWeaponSlot(i), `equipmentUnequip_${i}`);
        unequipBtn.className = "equipment-btn equipment-btn-unequip";
        unequipBtn.style.display = "none";
        slot.appendChild(body);
        slot.appendChild(unequipBtn);
        elements.equipmentSlots.appendChild(slot);
        dynamicElements[`equipmentUnequip_${i}`] = unequipBtn;
        dynamicElements.equipmentSlotEls.push({ slot, label, name, stats, unequipBtn, laserLabel, laserCheckbox });
    }
    elements.equipmentArmory.innerHTML = "";
    playerEquipmentCatalog.forEach((gunId) => {
        const row = document.createElement("div");
        row.className = "equipment-armory-row";
        row.dataset.gunId = gunId;
        const info = document.createElement("div");
        info.className = "equipment-armory-info";
        const name = document.createElement("div");
        name.className = "equipment-armory-name";
        const meta = document.createElement("div");
        meta.className = "equipment-armory-meta";
        info.appendChild(name);
        info.appendChild(meta);
        const actionBtn = createButton("", "Equip", () => emitToggleEquipWeapon(gunId), `equipmentAction_${gunId}`);
        actionBtn.className = "equipment-btn equipment-btn-equip";
        row.appendChild(info);
        row.appendChild(actionBtn);
        elements.equipmentArmory.appendChild(row);
        dynamicElements[`equipmentArmory_${gunId}`] = { row, name, meta, actionBtn };
    });
}
function drawEquipmentPanel(state) {
    if (!dynamicElements.equipmentSlotEls) return;
    const player = state.player;
    const loadout = normalizeWeaponLoadout(player?.weaponLoadout ?? []);
    const slotCount = getEquipmentSlotCount(loadout);
    const disabled = state.isGameOver;
    dynamicElements.equipmentSlotEls.forEach((el, index) => {
        const visible = index < slotCount;
        el.slot.style.display = visible ? "flex" : "none";
        if (!visible) return;
        const gunId = loadout[index];
        if (gunId) {
            const turret = player.getTurrets()[index];
            const gun = turret?.gun ?? getGunDefinition(gunId);
            el.slot.classList.remove("equipment-slot-empty");
            el.slot.classList.add("equipment-slot-filled");
            el.label.textContent = `Slot ${index + 1} · ${formatHandednessLabel(gunId)}`;
            el.name.textContent = gun.name ?? gun.id;
            el.stats.textContent = formatGunSummary(gun, player);
            el.unequipBtn.style.display = "block";
            el.unequipBtn.disabled = disabled;
            if (gun.attachments?.laserSights) {
                el.laserLabel.style.display = "flex";
                el.laserCheckbox.checked = !!gun.attachments.laserSights.enabled;
                el.laserCheckbox.disabled = disabled;
            } else el.laserLabel.style.display = "none";
        } else {
            el.slot.classList.add("equipment-slot-empty");
            el.slot.classList.remove("equipment-slot-filled");
            el.label.textContent = `Slot ${index + 1} · Empty`;
            el.name.textContent = "—";
            el.stats.textContent = "Select a weapon from the armory";
            el.unequipBtn.style.display = "none";
            el.laserLabel.style.display = "none";
        }
    });
    playerEquipmentCatalog.forEach((gunId) => {
        const el = dynamicElements[`equipmentArmory_${gunId}`];
        if (!el) return;
        const gun = getGunDefinition(gunId);
        const action = getGunEquipAction(loadout, gunId);
        const equippedCount = countGunInLoadout(loadout, gunId);
        el.name.textContent = gun.name ?? gun.id;
        el.meta.textContent = `${formatHandednessLabel(gunId)} · ${formatGunSummary(gun, player)}`;
        el.row.classList.toggle("equipment-armory-equipped", equippedCount > 0);
        el.row.classList.toggle("equipment-armory-blocked", action === "blocked");
        el.actionBtn.disabled = disabled || action === "blocked";
        el.actionBtn.classList.remove("equipment-btn-equip", "equipment-btn-unequip");
        if (action === "unequip") {
            el.actionBtn.textContent = equippedCount > 1 ? `Unequip (${equippedCount})` : "Unequip";
            el.actionBtn.classList.add("equipment-btn-unequip");
        } else if (action === "equip") {
            el.actionBtn.textContent = equippedCount > 0 ? "Equip +1" : "Equip";
            el.actionBtn.classList.add("equipment-btn-equip");
        } else el.actionBtn.textContent = "Full";
    });
}
function drawStat(state, upg, abilityLayoutById) {
    const btn = dynamicElements["upg_" + upg.id];
    if (!btn) return;
    const uState = state.player.upgrades[upg.id];
    const currentLevelToCheck = uState.level;
    const isVisible = isUpgradeVisibleInTab(state, upg, currentLevelToCheck);
    btn.style.display = isVisible ? "block" : "none";
    if (!isVisible) return;
    if (upg.category === "abilities") {
        const isOwned = currentLevelToCheck > 0;
        const isDiscovered = state.disciscoveredAbilities && state.discoveredAbilities.has(upg.id);
        const depth = abilityLayoutById.get(upg.id)?.depth ?? 0;
        const prefix = depth > 0 ? "└── " : "";
        btn.style.marginLeft = `${depth * 20}px`;
        btn.style.width = `calc(100% - ${depth * 20}px)`;
        btn.style.flex = "none";
        btn.style.minWidth = "0";
        let nameText = "";
        let descText = "";
        if (isOwned) {
            nameText = prefix + upg.name;
            descText = upg.description;
            btn.style.background = "#1b3322";
            btn.style.borderColor = "#4CAF50";
            btn.style.opacity = "1";
            btn.style.cursor = "default";
        } else if (isDiscovered) {
            nameText = prefix + upg.name + " (Locked)";
            descText = upg.description;
            btn.style.background = "#222";
            btn.style.borderColor = "#555";
            btn.style.opacity = "0.6";
            btn.style.cursor = "default";
        } else {
            nameText = prefix + "???";
            descText = "???";
            btn.style.background = "#151515";
            btn.style.borderColor = "#333";
            btn.style.opacity = "0.35";
            btn.style.cursor = "default";
        }
        const targetHTML = `
            <div style="font-size: 13px; font-weight: bold; color: #FFF; line-height: 1.2; display: flex; justify-content: space-between;">
                <span>${nameText}</span>
            </div>
            <div style="font-size: 12px; font-weight: normal; color: #CCC; line-height: 1.2; margin-top: 3px; text-align: left;">${descText}</div>
        `;
        if (btn.dataset.lastHtml !== targetHTML) {
            btn.innerHTML = targetHTML;
            btn.dataset.lastHtml = targetHTML;
        }
    } else {
        btn.style.marginLeft = "0px";
        btn.style.width = "";
        btn.style.flex = "1";
        btn.style.minWidth = "45%";
        btn.style.cursor = "pointer";
        const isMaxed = currentLevelToCheck >= upg.maxLevel;
        const statStr = isMaxed ? `${upg.getCurrentStr(state)}` : `${upg.getCurrentStr(state)} &rarr; ${upg.getNextStr(state)}`;
        const costText = isMaxed ? "MAX" : `${uState.ptsCost} Pts`;
        const costColor = isMaxed || state.score >= uState.ptsCost ? "#4CAF50" : "#FFEB3B";
        const maxLevelDisplay = upg.maxLevel === Infinity ? "∞" : upg.maxLevel;
        const targetHTML = getUpgradeButtonHTML(`${upg.name} ${currentLevelToCheck}/${maxLevelDisplay}`, costText, costColor, statStr);
        if (btn.dataset.lastHtml !== targetHTML) {
            btn.innerHTML = targetHTML;
            btn.dataset.lastHtml = targetHTML;
        }
        if (isMaxed) {
            btn.style.opacity = "1";
            btn.style.borderColor = "#4CAF50";
            btn.style.background = "#333";
        } else if (state.isGameOver) {
            btn.style.opacity = "0.5";
            btn.style.borderColor = "#555";
            btn.style.background = "#333";
        } else {
            btn.style.opacity = state.score >= uState.ptsCost ? "1" : "0.5";
            btn.style.borderColor = "#555";
            btn.style.background = "#333";
        }
    }
}
function syncTowerSpeedControl(state) {
    const chrome = getUiProfile().chrome;
    if (chrome.controls === "none" || !towerSpeedControl) return;
    if (chrome.controls === "full" || chrome.bottomPanel) syncSpeedControlDisplay(towerSpeedControl, state, getActiveGameDefinition());
    else if (towerSpeedControl.pauseLabel) towerSpeedControl.pauseLabel.textContent = state.isPaused ? "PLAY" : "PAUSE";
}
function updateUI(state, upgrades) {
    updateInspectMissionBanner(state);
    const chrome = getUiProfile().chrome;
    if (!chrome.bottomPanel) {
        syncTowerSpeedControl(state);
        return;
    }
    const viewport = state.fsm?.context?.viewport;
    if (chrome.zoomSlider && elements.zoomDisplay && viewport) elements.zoomDisplay.innerText = Math.round(viewport.zoom * 100) + "%";
    if (chrome.zoomSlider && elements.zoomSlider && viewport) {
        let sliderVal = 0.5;
        if (isSimulation(state.phase)) sliderVal = viewport.zoomProgress;
        else sliderVal = (viewport.zoom - 0.5) / 1.5;
        elements.zoomSlider.value = Math.round(sliderVal * 100);
    }
    let hasAnyAbilities = false;
    upgrades
        .filter((u) => u.isAbility && u.showInHud)
        .forEach((upg) => {
            const unlocked = state.player.upgrades[upg.id] && state.player.upgrades[upg.id].level > 0 && !state.isGameOver;
            if (unlocked) hasAnyAbilities = true;
            const active = state.abilities[upg.id];
            updateToggleButton("btnAbility_" + upg.id, unlocked, active, upg.toggleName || upg.name, upg);
        });
    upgrades
        .filter((u) => u.isAbility && !u.showInHud)
        .forEach((upg) => {
            const unlocked = state.player.upgrades[upg.id] && state.player.upgrades[upg.id].level > 0 && !state.isGameOver;
            if (unlocked) hasAnyAbilities = true;
            const el = dynamicElements["btnPassive_" + upg.id];
            if (el) el.style.display = unlocked ? "block" : "none";
        });
    const dock = document.getElementById("abilitiesDock");
    if (dock) dock.style.display = hasAnyAbilities ? "flex" : "none";
    syncTowerSpeedControl(state);
    const abilityLayout = buildAbilityTreeLayout(upgrades);
    const abilityLayoutById = new Map(abilityLayout.map((entry) => [entry.id, entry]));
    const onStatsTab = state.currentUpgradeTab === "stats";
    const onEquipmentTab = state.currentUpgradeTab === "equipment";
    if (elements.statsSubTabs) elements.statsSubTabs.style.display = onStatsTab ? "flex" : "none";
    if (elements.equipmentPanel) elements.equipmentPanel.style.display = onEquipmentTab ? "flex" : "none";
    if (elements.upgradesContainer) elements.upgradesContainer.style.display = onEquipmentTab ? "none" : "flex";
    setTabButtonActive(elements.mainTabButtons, state.currentUpgradeTab, "data-tab");
    if (onStatsTab) setTabButtonActive(elements.statsSubTabButtons, state.statsSubTab, "data-stats-tab");
    if (onEquipmentTab) drawEquipmentPanel(state);
    if (state.currentUpgradeTab === "abilities") {
        elements.upgradesContainer.style.flexDirection = "column";
        elements.upgradesContainer.style.flexWrap = "nowrap";
        elements.upgradesContainer.style.alignItems = "stretch";
        abilityLayout.forEach((entry) => {
            const btn = dynamicElements["upg_" + entry.id];
            if (btn) elements.upgradesContainer.appendChild(btn);
        });
    } else {
        elements.upgradesContainer.style.flexDirection = "row";
        elements.upgradesContainer.style.flexWrap = "wrap";
        elements.upgradesContainer.style.alignItems = "initial";
    }
    upgrades.forEach((upg) => drawStat(state, upg, abilityLayoutById));
}
/** @type {import("../../../Core/GameDefinitionTypes.js").UiPort} */
export const towerUiPort = {
    mount(ctx) {
        mountTowerUi(ctx.state, ctx.upgrades);
    },
    updateUI(ctx) {
        updateUI(ctx.state, ctx.upgrades);
    },
    updateHud(ctx) {
        updateHud(ctx.state, ctx.upgrades);
    },
};
