import { saveProgress, hardResetProgress } from "./Storage.js";
import { perkMilestones } from "./Config.js";

const elements = {
    sectorClearedModal: document.getElementById("sectorClearedModal"),
    clearedNodeDisplay: document.getElementById("clearedNodeDisplay"),
    clearedRewardDisplay: document.getElementById("clearedRewardDisplay"),
    continueSectorBtn: document.getElementById("continueSectorBtn"),
    upgradeChoiceModal: document.getElementById("upgradeChoiceModal"),
    upgradeChoicesContainer: document.getElementById("upgradeChoicesContainer"),
    upgradeChoiceTitle: document.getElementById("upgradeChoiceTitle"),
    upgradeChoiceDesc: document.getElementById("upgradeChoiceDesc"),
    categoryModal: document.getElementById("categoryModal"),
    catAttackBtn: document.getElementById("catAttackBtn"),
    catDefenseBtn: document.getElementById("catDefenseBtn"),
    categoryModalTitle: document.getElementById("categoryModalTitle"),
    categoryModalDesc: document.getElementById("categoryModalDesc"),
    unlockModal: document.getElementById("unlockModal"),
    unlockDisplay: document.getElementById("unlockDisplay"),
    continueUnlockBtn: document.getElementById("continueUnlockBtn"),
    nodeConfirmModal: document.getElementById("nodeConfirmModal"),
    nodeNameDisplay: document.getElementById("nodeNameDisplay"),
    nodeStatusDisplay: document.getElementById("nodeStatusDisplay"),
    nodeWavesDisplay: document.getElementById("nodeWavesDisplay"),
    nodeRewardDisplay: document.getElementById("nodeRewardDisplay"),
    confirmNodeBtn: document.getElementById("confirmNodeBtn"),
    cancelNodeBtn: document.getElementById("cancelNodeBtn"),
    waveDisplay: document.getElementById("waveDisplay"),
    killsDisplay: document.getElementById("killsDisplay"),
    scoreDisplay: document.getElementById("scoreDisplay"),
    levelDisplay: document.getElementById("levelDisplay"),
    nextPerkDisplay: document.getElementById("nextPerkDisplay"),
    xpSegments: document.getElementById("xpSegments"),
    xpText: document.getElementById("xpText"),
    healthSegments: document.getElementById("healthSegments"),
    healthText: document.getElementById("healthText"),
    waveSegments: document.getElementById("waveSegments"),
    waveText: document.getElementById("waveText"),
    missionDisplay: document.getElementById("missionDisplay"),
    passivesContainer: document.getElementById("passivesContainer"),
    abilitiesContainer: document.getElementById("abilitiesContainer"),
    upgradesContainer: document.getElementById("upgradesContainer"),
    pauseBtn: document.getElementById("pauseBtn"),
    pauseText: document.getElementById("pauseText"),
    speedDisplay: document.getElementById("speedDisplay"),
    speedDownBtn: document.getElementById("speedDownBtn"),
    speedUpBtn: document.getElementById("speedUpBtn"),
    restartBtn: document.getElementById("restartBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    closeSettingsBtn: document.getElementById("closeSettingsBtn"),
    hardResetBtn: document.getElementById("hardResetBtn"),
    settingsModal: document.getElementById("settingsModal"),
    tabButtons: document.querySelectorAll(".tabBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomDisplay: document.getElementById("zoomDisplay"),
};

let viewportInstance = null;

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

function setTextIfDifferent(id, text) {
    const el = elements[id];
    if (el && el.innerText != text) {
        el.innerText = text;
    }
}

export function showSectorCleared(node, rewardText, onContinue) {
    elements.clearedNodeDisplay.innerText = `Sector [${Math.round(node.x)}, ${Math.round(node.y)}]`;
    elements.clearedRewardDisplay.innerText = rewardText;
    elements.sectorClearedModal.style.display = "flex";
    elements.continueSectorBtn.onclick = () => {
        elements.sectorClearedModal.style.display = "none";
        onContinue();
    };
}

export function showUpgradeChoice(title, description, choices, upgrades, onPick) {
    if (elements.upgradeChoiceTitle) elements.upgradeChoiceTitle.innerText = title;
    if (elements.upgradeChoiceDesc) elements.upgradeChoiceDesc.innerText = description;
    elements.upgradeChoicesContainer.innerHTML = "";

    choices.forEach((choiceId) => {
        const upg = upgrades.find((u) => u.id === choiceId);
        if (!upg) return;
        const styles =
            "padding: 10px; background: #333; color: white; border: 1px solid #FFEB3B; cursor: pointer; font-family: monospace; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px;";
        const html = `<span style="font-weight: bold; color: #FFEB3B;">${upg.name}</span><span style="font-size: 12px; color: #CCC; line-height: 1.2;">${upg.description}</span>`;
        const btn = createButton(styles, html, () => {
            elements.upgradeChoiceModal.style.display = "none";
            onPick(choiceId);
        });
        elements.upgradeChoicesContainer.appendChild(btn);
    });

    elements.upgradeChoiceModal.style.display = "flex";
}

export function showCategoryChoice(title, description, attackText, defenseText, onPick) {
    if (elements.categoryModalTitle) elements.categoryModalTitle.innerText = title;
    if (elements.categoryModalDesc) elements.categoryModalDesc.innerText = description;
    elements.catAttackBtn.innerText = attackText;
    elements.catDefenseBtn.innerText = defenseText;
    elements.catAttackBtn.onclick = () => {
        elements.categoryModal.style.display = "none";
        onPick("attack");
    };
    elements.catDefenseBtn.onclick = () => {
        elements.categoryModal.style.display = "none";
        onPick("defense");
    };
    elements.categoryModal.style.display = "flex";
}

export function showUnlockResult(upgradeName, onContinue) {
    elements.unlockDisplay.innerText = upgradeName;
    elements.continueUnlockBtn.onclick = () => {
        elements.unlockModal.style.display = "none";
        onContinue();
    };
    elements.unlockModal.style.display = "flex";
}

export function showNodeConfirm(node, onConfirm) {
    elements.nodeNameDisplay.innerText = `Sector [${Math.round(node.x)}, ${Math.round(node.y)}]`;

    if (node.completed) {
        elements.nodeStatusDisplay.innerText = "STATUS: CLEARED";
        elements.nodeStatusDisplay.style.color = "#4CAF50";
    } else {
        elements.nodeStatusDisplay.innerText = "STATUS: OCCUPIED";
        elements.nodeStatusDisplay.style.color = "#F44336";
    }

    if (elements.nodeWavesDisplay) {
        elements.nodeWavesDisplay.innerText = `Waves to clear: ${node.wavesTotal}`;
    }

    if (elements.nodeRewardDisplay) {
        if (node.completed) {
            elements.nodeRewardDisplay.innerText = "";
        } else if (node.reward && node.reward.type === "random_permanent_upgrade") {
            elements.nodeRewardDisplay.innerText = "Reward: Random Permanent Upgrade";
        } else {
            elements.nodeRewardDisplay.innerText = "Reward: None";
        }
    }

    elements.nodeConfirmModal.style.display = "flex";

    elements.confirmNodeBtn.onclick = () => {
        elements.nodeConfirmModal.style.display = "none";
        onConfirm();
    };

    elements.cancelNodeBtn.onclick = () => {
        elements.nodeConfirmModal.style.display = "none";
    };
}

export function updateToggleButton(btnId, isUnlocked, isActive, btnText, upgDef) {
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
            if (btn.innerText !== btnText) {
                btn.innerText = btnText;
            }
        }
    } else {
        btn.style.display = "none";
    }
}

export function updateHud(state, upgrades) {
    setTextIfDifferent("waveDisplay", state.waveManager.wave);
    setTextIfDifferent("killsDisplay", state.kills);
    setTextIfDifferent("scoreDisplay", state.score);
    setTextIfDifferent("levelDisplay", state.level);

    const nextPerk = perkMilestones.find((m) => m > state.highestLevelReached);
    if (elements.nextPerkDisplay) elements.nextPerkDisplay.innerText = nextPerk ? `Next Perk: Level ${nextPerk}` : "All Perks Claimed";

    const xpNeeded = Math.floor(25 * Math.pow(1.5, state.level));
    const xpRatio = Math.min(1, state.xp / xpNeeded);

    updateProgressBar("xpSegments", "xpText", `XP: ${state.xp} / ${xpNeeded}`, xpRatio, 10, () => "#00BCD4");

    const healthRatio = state.planet.health / state.planet.maxHealth;

    updateProgressBar("healthSegments", "healthText", `HEALTH: ${Math.max(0, state.planet.health).toFixed(0)} / ${state.planet.maxHealth}`, healthRatio, 10, (r) =>
        r > 0.5 ? "#4CAF50" : r > 0.2 ? "#FFEB3B" : "#F44336",
    );

    const aliveEnemies = state.enemies.filter((e) => !e.isDead).length;
    let progress = Math.max(0, (state.waveManager.enemiesSpawned - aliveEnemies) / state.waveManager.enemiesToSpawn);
    let waveColor = "#FFEB3B";
    let waveTextStr = `WAVE PROGRESS: ${Math.floor(progress * 100)}%`;

    if (state.isTransitioning) {
        progress = 1.0;
        waveColor = "#4CAF50";
        waveTextStr = "WAVE CLEARED";
    } else if (state.isGameOver) {
        progress = 0.0;
        waveTextStr = "";
    }

    updateProgressBar("waveSegments", "waveText", waveTextStr, progress, 10, () => waveColor);

    if (elements.missionDisplay) {
        const currentNode = state.mapNodes.find((n) => n.id === state.currentNodeId);

        if (state.isGameOver) {
            setTextIfDifferent("missionDisplay", "Game Over");
            if (elements.missionDisplay.style.color !== "rgb(244, 67, 54)" && elements.missionDisplay.style.color !== "#F44336") elements.missionDisplay.style.color = "#F44336";
        } else {
            let text = "";
            if (state.phase === "combat" && currentNode) {
                text = `Sector Wave: ${state.waveManager.sectorWave} / ${currentNode.wavesTotal}`;
                if (elements.missionDisplay.style.color !== "rgb(255, 255, 255)" && elements.missionDisplay.style.color !== "#FFF") elements.missionDisplay.style.color = "#FFF";
            }
            setTextIfDifferent("missionDisplay", text);
        }
    }

    if (upgrades) {
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
}

export function updateProgressBar(containerId, textId, textString, ratio, totalSegments, getColorFn) {
    const container = elements[containerId];
    const textEl = elements[textId];
    if (!container || !textEl) return;

    if (textEl.innerText !== textString) {
        textEl.innerText = textString;
    }

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
        if (seg.style.background !== targetColor) {
            seg.style.background = targetColor;
        }
    }
}

export function initUI(state, upgrades, viewport, resetGameCallback) {
    viewportInstance = viewport;
    elements.passivesContainer.innerHTML = "";
    upgrades
        .filter((u) => u.isAbility && !u.showInHud)
        .forEach((upg) => {
            const styles =
                "padding: 3px 8px; background: #1e293b; color: #cbd5e1; border: 1px solid #475569; font-family: monospace; font-weight: bold; border-radius: 4px; display: none; font-size: 11px; pointer-events: none; user-select: none;";
            const btn = createButton(
                styles,
                upg.name,
                null,
                "btnPassive_" + upg.id,
            );
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
                    : (upg.toggleName || upg.name);

            const btn = createButton(
                styles,
                html,
                () => {
                    if (upg.hasToggle) {
                        state.abilities[upg.id] = !state.abilities[upg.id];
                        state.recalculateStats(upgrades);
                        updateUI(state, upgrades);
                    }
                },
                "btnAbility_" + upg.id,
            );

            if (upg.cooldown > 0) dynamicElements["cooldownOverlay_" + upg.id] = btn.querySelector("div");
            dynamicElements[btn.id] = btn;
            elements.abilitiesContainer.appendChild(btn);
        });

    elements.tabButtons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
            elements.tabButtons.forEach((b) => (b.style.background = "#222"));
            e.target.style.background = "#555";
            state.currentUpgradeTab = e.target.getAttribute("data-tab");
            updateUI(state, upgrades);
        });
    });

    elements.upgradesContainer.innerHTML = "";
    upgrades.forEach((upg) => {
        const styles =
            "flex: 1; min-width: 45%; padding: 4px; background: #333; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; box-sizing: border-box; font-weight: bold; font-size: 14px;";
        const btn = createButton(
            styles,
            "",
            () => {
                if (state.isGameOver) return;
                if (upg.category === "abilities" || upg.category === "perk") return;
                const uState = state.upgrades[upg.id];
                const cost = uState.ptsCost;
                if (state.score >= cost) {
                    if (uState.level >= upg.maxLevel) return;
                    state.score -= cost;
                    uState.ptsCost = Math.floor(uState.ptsCost * 1.5);
                    uState.level++;
                    state.recalculateStats(upgrades);
                    if (upg.onPurchase) upg.onPurchase(state);
                    updateUI(state, upgrades);
                }
            },
            "upg_" + upg.id,
        );

        dynamicElements[btn.id] = btn;
        elements.upgradesContainer.appendChild(btn);
    });

    elements.pauseBtn.addEventListener("click", () => {
        state.isPaused = !state.isPaused;
        updateUI(state, upgrades);
    });

    elements.speedDownBtn.addEventListener("click", () => {
        state.selectedSpeed = Math.max(0.5, state.selectedSpeed - 0.25);
        updateUI(state, upgrades);
    });

    elements.speedUpBtn.addEventListener("click", () => {
        state.selectedSpeed = Math.min(state.gameSpeed, state.selectedSpeed + 0.25);
        updateUI(state, upgrades);
    });

    elements.zoomOutBtn.addEventListener("click", () => {
        if (!viewportInstance) return;
        if (state.phase === "combat" || state.phase === "reward") {
            viewportInstance.zoomProgress = Math.max(0.0, viewportInstance.zoomProgress - 0.1);
            viewportInstance.updateZoomLimits(state);
            updateUI(state, upgrades);
        } else {
            viewportInstance.setZoom(viewportInstance.zoom - 0.1, state);
            updateUI(state, upgrades);
        }
    });

    elements.zoomInBtn.addEventListener("click", () => {
        if (!viewportInstance) return;
        if (state.phase === "combat" || state.phase === "reward") {
            viewportInstance.zoomProgress = Math.min(1.0, viewportInstance.zoomProgress + 0.1);
            viewportInstance.updateZoomLimits(state);
            updateUI(state, upgrades);
        } else {
            viewportInstance.setZoom(viewportInstance.zoom + 0.1, state);
            updateUI(state, upgrades);
        }
    });

    elements.restartBtn.addEventListener("click", resetGameCallback);

    elements.settingsBtn.addEventListener("click", () => {
        elements.settingsModal.style.display = "flex";
    });

    elements.closeSettingsBtn.addEventListener("click", () => {
        elements.settingsModal.style.display = "none";
    });

    elements.hardResetBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to completely reset the game? This cannot be undone.")) {
            hardResetProgress(state, resetGameCallback);
            elements.settingsModal.style.display = "none";
        }
    });

    updateUI(state, upgrades);
    updateHud(state);
}

const abilityTree = [
    { id: "Reposition", depth: 0 },
    { id: "Dive", depth: 1 },
    { id: "Laser", depth: 0 },
    { id: "TargetVerification", depth: 1 },
    { id: "TwoGuns", depth: 0 },
    { id: "ThreeGuns", depth: 1 },
    { id: "TwinStrike", depth: 0 },
    { id: "TripleStrike", depth: 1 },
    { id: "SteadyWeapon", depth: 0 },
    { id: "Eraser", depth: 0 }
];

function drawStat(state, upg) {
    const btn = dynamicElements["upg_" + upg.id];
    if (!btn) return;

    const uState = state.upgrades[upg.id];
    const currentLevelToCheck = uState.level;

    let isVisible = false;
    if (upg.category === state.currentUpgradeTab) {
        if (upg.category === "abilities") {
            isVisible = true;
        } else if (upg.category === "perk") {
            isVisible = currentLevelToCheck > 0;
        } else {
            isVisible = true;
        }
    }

    btn.style.display = isVisible ? "block" : "none";
    if (!isVisible) return;

    if (upg.category === "abilities") {
        const isOwned = currentLevelToCheck > 0;
        const isDiscovered = state.discoveredAbilities && state.discoveredAbilities.has(upg.id);
        const entry = abilityTree.find((e) => e.id === upg.id) || { depth: 0 };
        const prefix = entry.depth > 0 ? "└── " : "";

        btn.style.marginLeft = `${entry.depth * 20}px`;
        btn.style.width = `calc(100% - ${entry.depth * 20}px)`;
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

export function updateUI(state, upgrades) {
    if (elements.zoomDisplay && viewportInstance) {
        elements.zoomDisplay.innerText = Math.round(viewportInstance.zoom * 100) + "%";
    }

    upgrades
        .filter((u) => u.isAbility && u.showInHud)
        .forEach((upg) => {
            const unlocked = state.upgrades[upg.id] && state.upgrades[upg.id].level > 0 && !state.isGameOver;
            const active = state.abilities[upg.id];
            updateToggleButton("btnAbility_" + upg.id, unlocked, active, upg.toggleName || upg.name, upg);
        });

    upgrades
        .filter((u) => u.isAbility && !u.showInHud)
        .forEach((upg) => {
            const unlocked = state.upgrades[upg.id] && state.upgrades[upg.id].level > 0 && !state.isGameOver;
            const el = dynamicElements["btnPassive_" + upg.id];
            if (el) {
                el.style.display = unlocked ? "block" : "none";
            }
        });

    if (elements.pauseText) {
        elements.pauseText.innerText = state.isPaused ? "PLAY" : "PAUSE";
    }

    if (elements.speedDisplay) {
        state.selectedSpeed = Math.min(state.selectedSpeed, state.gameSpeed);
        elements.speedDisplay.innerText = state.selectedSpeed.toFixed(2) + "x";
        elements.speedDownBtn.style.opacity = state.selectedSpeed <= 0.5 ? "0.5" : "1";
        elements.speedUpBtn.style.opacity = state.selectedSpeed >= state.gameSpeed ? "0.5" : "1";
    }

    if (state.currentUpgradeTab === "abilities") {
        elements.upgradesContainer.style.flexDirection = "column";
        elements.upgradesContainer.style.flexWrap = "nowrap";
        elements.upgradesContainer.style.alignItems = "stretch";
        elements.upgradesContainer.style.maxHeight = "180px";
        elements.upgradesContainer.style.overflowY = "auto";
        elements.upgradesContainer.style.paddingRight = "4px";

        abilityTree.forEach((entry) => {
            const btn = dynamicElements["upg_" + entry.id];
            if (btn) {
                elements.upgradesContainer.appendChild(btn);
            }
        });
    } else {
        elements.upgradesContainer.style.flexDirection = "row";
        elements.upgradesContainer.style.flexWrap = "wrap";
        elements.upgradesContainer.style.alignItems = "initial";
        elements.upgradesContainer.style.maxHeight = "";
        elements.upgradesContainer.style.overflowY = "";
        elements.upgradesContainer.style.paddingRight = "";
    }

    upgrades.forEach((upg) => drawStat(state, upg));
}