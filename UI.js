import { saveProgress, hardResetProgress } from './Storage.js';
import { perkMilestones } from './Config.js';

export function showSectorCleared(node, rewardText, onContinue) {
    const modal = document.getElementById("sectorClearedModal");
    const nodeDisplay = document.getElementById("clearedNodeDisplay");
    const rewardDisplay = document.getElementById("clearedRewardDisplay");
    const continueBtn = document.getElementById("continueSectorBtn");

    nodeDisplay.innerText = `Sector [${Math.round(node.x)}, ${Math.round(node.y)}]`;
    rewardDisplay.innerText = rewardText;

    modal.style.display = "flex";

    continueBtn.onclick = () => {
        modal.style.display = "none";
        onContinue();
    };
}

export function showUpgradeChoice(title, description, choices, upgrades, onPick) {
    const modal = document.getElementById("upgradeChoiceModal");
    const container = document.getElementById("upgradeChoicesContainer");
    
    const titleEl = modal.querySelector("h2");
    const descEl = modal.querySelector("p");
    
    if (titleEl) titleEl.innerText = title;
    if (descEl) descEl.innerText = description;

    container.innerHTML = "";
    
    choices.forEach(choiceId => {
        const upg = upgrades.find(u => u.id === choiceId);
        if (!upg) return;

        const btn = document.createElement("button");
        btn.style.cssText = "padding: 10px; background: #333; color: white; border: 1px solid #FFEB3B; cursor: pointer; font-family: monospace; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px;";
        btn.innerHTML = `
            <span style="font-weight: bold; color: #FFEB3B;">${upg.name}</span>
            <span style="font-size: 12px; color: #CCC; line-height: 1.2;">${upg.description}</span>
        `;
        btn.onclick = () => {
            modal.style.display = "none";
            onPick(choiceId);
        };
        container.appendChild(btn);
    });

    modal.style.display = "flex";
}

export function showCategoryChoice(title, description, attackText, defenseText, onPick) {
    const modal = document.getElementById("categoryModal");
    const atkBtn = document.getElementById("catAttackBtn");
    const defBtn = document.getElementById("catDefenseBtn");

    const titleEl = modal.querySelector("h2");
    const descEl = modal.querySelector("p");
    
    if (titleEl) titleEl.innerText = title;
    if (descEl) descEl.innerText = description;

    atkBtn.innerText = attackText;
    defBtn.innerText = defenseText;

    atkBtn.onclick = () => {
        modal.style.display = "none";
        onPick("attack");
    };
    defBtn.onclick = () => {
        modal.style.display = "none";
        onPick("defense");
    };
    modal.style.display = "flex";
}

export function showUnlockResult(upgradeName, onContinue) {
    const modal = document.getElementById("unlockModal");
    document.getElementById("unlockDisplay").innerText = upgradeName;
    document.getElementById("continueUnlockBtn").onclick = () => {
        modal.style.display = "none";
        onContinue();
    };
    modal.style.display = "flex";
}

export function showNodeConfirm(node, onConfirm) {
    const modal = document.getElementById("nodeConfirmModal");
    const nameDisplay = document.getElementById("nodeNameDisplay");
    const statusDisplay = document.getElementById("nodeStatusDisplay");
    const wavesDisplay = document.getElementById("nodeWavesDisplay");
    const rewardDisplay = document.getElementById("nodeRewardDisplay");
    const confirmBtn = document.getElementById("confirmNodeBtn");
    const cancelBtn = document.getElementById("cancelNodeBtn");

    nameDisplay.innerText = `Sector [${Math.round(node.x)}, ${Math.round(node.y)}]`;
    
    if (node.completed) {
        statusDisplay.innerText = "STATUS: CLEARED";
        statusDisplay.style.color = "#4CAF50";
    } else {
        statusDisplay.innerText = "STATUS: OCCUPIED";
        statusDisplay.style.color = "#F44336";
    }

    if (wavesDisplay) {
        wavesDisplay.innerText = `Waves to clear: ${node.wavesTotal}`;
    }

    if (rewardDisplay) {
        if (node.completed) {
            rewardDisplay.innerText = "";
        } else if (node.reward && node.reward.type === 'random_permanent_upgrade') {
            rewardDisplay.innerText = "Reward: Random Permanent Upgrade";
        } else {
            rewardDisplay.innerText = "Reward: None";
        }
    }

    modal.style.display = "flex";

    confirmBtn.onclick = () => {
        modal.style.display = "none";
        onConfirm();
    };

    cancelBtn.onclick = () => {
        modal.style.display = "none";
    };
}

export function updateToggleButton(btnId, isUnlocked, isActive, btnText, upgDef) {
    const btn = document.getElementById(btnId);
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
            btn.innerText = btnText;
        }
    } else {
        btn.style.display = "none";
    }
}

export function updateHud(state, upgrades) {
    setTextIfDifferent("waveDisplay", state.wave);
    setTextIfDifferent("killsDisplay", state.kills);
    setTextIfDifferent("scoreDisplay", state.score);
    setTextIfDifferent("levelDisplay", state.level);
    
    const nextPerk = perkMilestones.find(m => m > state.highestLevelReached);
    const nextPerkEl = document.getElementById("nextPerkDisplay");
    if (nextPerkEl) nextPerkEl.innerText = nextPerk ? `Next Perk: Level ${nextPerk}` : "All Perks Claimed";
    
    const xpNeeded = Math.floor(25 * Math.pow(1.5, state.level));
    const xpRatio = Math.min(1, state.xp / xpNeeded);
    
    updateProgressBar(
        "xpSegments",
        "xpText",
        `XP: ${state.xp} / ${xpNeeded}`,
        xpRatio,
        10,
        () => "#00BCD4"
    );

    const healthRatio = state.planet.health / state.planet.maxHealth;
    
    updateProgressBar(
        "healthSegments",
        "healthText",
        `HEALTH: ${Math.max(0, state.planet.health).toFixed(0)} / ${state.planet.maxHealth}`,
        healthRatio,
        10,
        (r) => r > 0.5 ? "#4CAF50" : (r > 0.2 ? "#FFEB3B" : "#F44336")
    );

    const aliveEnemies = state.enemies.filter(e => !e.isDead).length;
    let progress = Math.max(0, (state.enemiesSpawned - aliveEnemies) / state.enemiesToSpawn);
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

    updateProgressBar(
        "waveSegments",
        "waveText",
        waveTextStr,
        progress,
        10,
        () => waveColor
    );

    const missionDisplay = document.getElementById("missionDisplay");
    if (missionDisplay) {
        const currentNode = state.mapNodes.find(n => n.id === state.currentNodeId);
        
        if (state.isGameOver) {
            setTextIfDifferent("missionDisplay", "Game Over");
            if (missionDisplay.style.color !== "rgb(244, 67, 54)" && missionDisplay.style.color !== "#F44336") missionDisplay.style.color = "#F44336";
        } else {
            let text = "";
            if (state.phase === "combat" && currentNode) {
                text = `Sector Wave: ${state.sectorWave} / ${currentNode.wavesTotal}`;
                if (missionDisplay.style.color !== "rgb(255, 255, 255)" && missionDisplay.style.color !== "#FFF") missionDisplay.style.color = "#FFF";
            }
            setTextIfDifferent("missionDisplay", text);
        }
    }

    if (upgrades) {
        upgrades.filter(u => u.isAbility && u.cooldown > 0).forEach(upg => {
            const cdOverlay = document.getElementById("cooldownOverlay_" + upg.id);
            const btn = document.getElementById("btnAbility_" + upg.id);
            if (cdOverlay && btn) {
                cdOverlay.style.background = "#4CAF50";
                const timers = state.abilityTimers ? state.abilityTimers[upg.id] : null;
                const cdTimer = timers ? timers.cooldown : 0;
                if (cdTimer > 0) {
                    const ratio = cdTimer / upg.cooldown;
                    cdOverlay.style.height = ((1 - ratio) * 100) + "%";
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
    const container = document.getElementById(containerId);
    const textEl = document.getElementById(textId);
    if (!container || !textEl) return;

    if (textEl.innerText !== textString) {
        textEl.innerText = textString;
    }

    if (container.children.length !== totalSegments) {
        container.innerHTML = '';
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

function setTextIfDifferent(id, text) {
    const el = document.getElementById(id);
    if (el && el.innerText != text) {
        el.innerText = text;
    }
}

export function initUI(state, upgrades, resetGameCallback) {
    const uiContainer = document.createElement("div");
    uiContainer.id = "uiContainer";
    uiContainer.style.zIndex = "30";
    uiContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 12px; pointer-events: auto;">
            <button id="speedDownBtn" style="background: linear-gradient(to bottom, #3a3a3a, #1e1e1e); color: #FFF; border: 2px solid #555; border-radius: 6px; padding: 10px 16px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 3px 5px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1); text-shadow: 1px 1px 2px black;">-</button>
            <button id="pauseBtn" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 100px; background: linear-gradient(to bottom, #3a3a3a, #1e1e1e); color: #FFF; border: 2px solid #555; border-radius: 6px; padding: 2px 16px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 3px 5px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1); text-shadow: 1px 1px 2px black; line-height: 1.2;">
                <span id="pauseText">PAUSE</span>
                <span id="speedDisplay" style="font-size: 11px; font-weight: normal; opacity: 0.8; margin-top: 2px;">1.00x</span>
            </button>
            <button id="speedUpBtn" style="background: linear-gradient(to bottom, #3a3a3a, #1e1e1e); color: #FFF; border: 2px solid #555; border-radius: 6px; padding: 10px 16px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 3px 5px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1); text-shadow: 1px 1px 2px black;">+</button>
        </div>
        <div id="missionDisplay" style="text-align: center; color: #00BCD4; font-weight: bold; margin-bottom: 8px; font-size: 14px;"></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>Level: <span id="levelDisplay">0</span></span>
            <span>Wave: <span id="waveDisplay">1</span></span>
            <span>Kills: <span id="killsDisplay">0</span></span>
        </div>
        <div id="waveBarContainer" style="width: 100%; height: 18px; display: flex; gap: 2px; margin-bottom: 4px; border: 1px solid #555; background: #000; padding: 2px; box-sizing: border-box; position: relative;">
            <div id="waveSegments" style="display: flex; gap: 1px; flex: 1; height: 100%;"></div>
            <div id="waveText" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: white; font-weight: bold; text-shadow: 1px 1px 1px #000; pointer-events: none; font-family: monospace;"></div>
        </div>
        <div id="xpBarContainer" style="width: 100%; height: 18px; display: flex; gap: 2px; margin-bottom: 4px; border: 1px solid #555; background: #000; padding: 2px; box-sizing: border-box; position: relative;">
            <div id="xpSegments" style="display: flex; gap: 1px; flex: 1; height: 100%;"></div>
            <div id="xpText" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: white; font-weight: bold; text-shadow: 1px 1px 1px #000; pointer-events: none; font-family: monospace;"></div>
        </div>
        <div id="healthBarContainer" style="width: 100%; height: 18px; display: flex; gap: 2px; margin-bottom: 8px; border: 1px solid #555; background: #000; padding: 2px; box-sizing: border-box; position: relative;">
            <div id="healthSegments" style="display: flex; gap: 1px; flex: 1; height: 100%;"></div>
            <div id="healthText" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: white; font-weight: bold; text-shadow: 1px 1px 1px #000; pointer-events: none; font-family: monospace;"></div>
        </div>
        <div id="abilitiesContainer" style="display: flex; gap: 8px; margin-bottom: 8px; justify-content: center;">
        </div>
        <div id="upgradeTabs" style="display: flex; margin-bottom: 8px; gap: 4px;">
            <button class="tabBtn" data-tab="attack" style="flex: 1; padding: 5px; background: #555; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; font-weight: bold;">Attack</button>
            <button class="tabBtn" data-tab="defense" style="flex: 1; padding: 5px; background: #222; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; font-weight: bold;">Defense</button>
            <button class="tabBtn" data-tab="meta" style="flex: 1; padding: 5px; background: #222; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; font-weight: bold;">Meta</button>
            <button class="tabBtn" data-tab="abilities" style="flex: 1; padding: 5px; background: #222; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; font-weight: bold;">Abilities</button>
            <button class="tabBtn" data-tab="perk" style="flex: 1; padding: 5px; background: #222; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; font-weight: bold;">Perks</button>
        </div>
        <div id="upgradesContainer" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
    `;
    document.body.appendChild(uiContainer);

    const upgradeChoiceModal = document.createElement("div");
    upgradeChoiceModal.id = "upgradeChoiceModal";
    upgradeChoiceModal.style.cssText = "display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: monospace; pointer-events: auto;";
    upgradeChoiceModal.innerHTML = `
        <div style="background: #222; padding: 20px; border: 2px solid #00BCD4; text-align: center; pointer-events: auto; width: 280px; box-shadow: 0 0 15px rgba(0,188,212,0.5);">
            <h2 style="margin-top: 0; color: #00BCD4; font-size: 22px;"></h2>
            <p style="margin-bottom: 20px; font-size: 14px;"></p>
            <div id="upgradeChoicesContainer" style="display: flex; flex-direction: column; gap: 10px;">
            </div>
        </div>
    `;
    document.body.appendChild(upgradeChoiceModal);

    const categoryModal = document.createElement("div");
    categoryModal.id = "categoryModal";
    categoryModal.style.cssText = "display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: monospace; pointer-events: auto;";
    categoryModal.innerHTML = `
        <div style="background: #222; padding: 20px; border: 2px solid #00BCD4; text-align: center; pointer-events: auto; width: 280px; box-shadow: 0 0 15px rgba(0,188,212,0.5);">
            <h2 style="margin-top: 0; color: #00BCD4; font-size: 22px;">WAVE 5 CLEARED</h2>
            <p style="margin-bottom: 20px; font-size: 14px;">Choose an Upgrade Path.</p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="catAttackBtn" style="padding: 10px; flex: 1; background: #F44336; color: white; border: 1px solid #FFF; cursor: pointer; font-family: monospace; font-weight: bold; font-size: 16px;">Attack</button>
                <button id="catDefenseBtn" style="padding: 10px; flex: 1; background: #4CAF50; color: white; border: 1px solid #FFF; cursor: pointer; font-family: monospace; font-weight: bold; font-size: 16px;">Defense</button>
            </div>
        </div>
    `;
    document.body.appendChild(categoryModal);

    const unlockModal = document.createElement("div");
    unlockModal.id = "unlockModal";
    unlockModal.style.cssText = "display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: monospace; pointer-events: auto;";
    unlockModal.innerHTML = `
        <div style="background: #222; padding: 20px; border: 2px solid #FFEB3B; text-align: center; pointer-events: auto; width: 280px; box-shadow: 0 0 15px rgba(255,235,59,0.5);">
            <h2 style="margin-top: 0; color: #FFEB3B; font-size: 22px;">UPGRADE UNLOCKED</h2>
            <div id="unlockDisplay" style="margin-bottom: 20px; font-size: 16px; font-weight: bold;"></div>
            <button id="continueUnlockBtn" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; cursor: pointer; font-weight: bold; font-family: monospace; font-size: 14px;">Continue</button>
        </div>
    `;
    document.body.appendChild(unlockModal);

    const nodeModal = document.createElement("div");
    nodeModal.id = "nodeConfirmModal";
    nodeModal.style.cssText = "display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: monospace; pointer-events: auto;";
    nodeModal.innerHTML = `
        <div style="background: #222; padding: 20px; border: 2px solid #555; text-align: center; pointer-events: auto; width: 280px;">
            <h2 id="nodeNameDisplay" style="margin-top: 0; color: #FFEB3B; font-size: 18px;"></h2>
            <div id="nodeStatusDisplay" style="margin-bottom: 5px; font-weight: bold; font-size: 14px;"></div>
            <div id="nodeWavesDisplay" style="margin-bottom: 10px; font-size: 14px; color: #00BCD4; font-weight: bold;"></div>
            <div id="nodeRewardDisplay" style="margin-bottom: 10px; font-size: 14px; color: #FFEB3B; font-weight: bold;"></div>
            <p style="margin: 10px 0;">Travel to this sector?</p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                <button id="confirmNodeBtn" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; cursor: pointer; font-weight: bold; font-family: monospace;">Confirm</button>
                <button id="cancelNodeBtn" style="padding: 10px 20px; background: #F44336; color: white; border: none; cursor: pointer; font-weight: bold; font-family: monospace;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(nodeModal);

    const clearedModal = document.createElement("div");
    clearedModal.id = "sectorClearedModal";
    clearedModal.style.cssText = "display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: monospace; pointer-events: auto;";
    clearedModal.innerHTML = `
        <div style="background: #222; padding: 20px; border: 2px solid #4CAF50; text-align: center; pointer-events: auto; width: 280px; box-shadow: 0 0 15px rgba(76,175,80,0.5);">
            <h2 style="margin-top: 0; color: #4CAF50; font-size: 22px;">SECTOR CLEARED</h2>
            <div id="clearedNodeDisplay" style="margin-bottom: 5px; font-weight: bold; font-size: 14px;"></div>
            <div id="clearedRewardDisplay" style="margin-bottom: 20px; font-size: 14px; color: #FFEB3B; font-weight: bold;"></div>
            <button id="continueSectorBtn" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; cursor: pointer; font-weight: bold; font-family: monospace; font-size: 14px;">Continue</button>
        </div>
    `;
    document.body.appendChild(clearedModal);

    const abilitiesContainer = document.getElementById("abilitiesContainer");
    upgrades.filter(u => u.isAbility).forEach(upg => {
        const btn = document.createElement("button");
        btn.id = "btnAbility_" + upg.id;
        btn.style.cssText = "padding: 5px 10px; background: #222; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; font-weight: bold; border-radius: 4px; display: none; position: relative; overflow: hidden;";
        
        if (upg.cooldown > 0) {
            btn.innerHTML = `<span style="position: relative; z-index: 2;">${upg.name}</span><div id="cooldownOverlay_${upg.id}" style="position: absolute; bottom: 0; left: 0; width: 100%; height: 0%; background: rgba(0, 0, 0, 0.6); z-index: 1;"></div>`;
        } else {
            btn.innerText = upg.name;
        }

        btn.addEventListener("click", () => {
            state.abilities[upg.id] = !state.abilities[upg.id];
            state.recalculateStats(upgrades);
            updateUI(state, upgrades);
        });
        abilitiesContainer.appendChild(btn);
    });

    document.querySelectorAll('.tabBtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tabBtn').forEach(b => b.style.background = '#222');
            e.target.style.background = '#555';
            state.currentUpgradeTab = e.target.getAttribute('data-tab');
            updateUI(state, upgrades);
        });
    });

    const upgContainer = document.getElementById("upgradesContainer");
    upgrades.forEach((upg) => {
        const btn = document.createElement("button");
        btn.id = "upg_" + upg.id;
        btn.style.cssText = "flex: 1; min-width: 45%; padding: 4px; background: #333; color: white; border: 1px solid #555; cursor: pointer; font-family: monospace; box-sizing: border-box; font-weight: bold; font-size: 14px;";
        btn.addEventListener("click", () => {
            if (state.isGameOver) return;
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
        });
        upgContainer.appendChild(btn);
    });

    const gameOverUI = document.createElement("div");
    gameOverUI.id = "gameOverUI";
    gameOverUI.style.cssText = "display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); flex-direction: column; align-items: center; justify-content: center; color: white; z-index: 20; font-family: monospace; text-align: center; padding-bottom: 150px; box-sizing: border-box; pointer-events: none;";
    gameOverUI.innerHTML = `
        <h1 style="font-size: 36px; margin-bottom: 10px; color: #F44336; pointer-events: auto;">GAME OVER</h1>
        <button id="restartBtn" style="padding: 15px 30px; background: #4CAF50; color: white; border: none; font-weight: bold; cursor: pointer; font-family: monospace; font-size: 18px; pointer-events: auto;">NEW RUN</button>
    `;
    document.body.appendChild(gameOverUI);

    const topUI = document.createElement("div");
    topUI.style.cssText = "position: absolute; top: 0; left: 0; right: 0; margin: 0 auto; width: 100%; max-width: 450px; display: flex; justify-content: space-between; align-items: flex-start; padding: 15px; box-sizing: border-box; z-index: 40; pointer-events: none;";
    
    const leftCol = document.createElement("div");
    leftCol.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

    const pointsContainer = document.createElement("div");
    pointsContainer.style.cssText = "background: rgba(0, 0, 0, 0.75); color: #FFEB3B; font-weight: bold; font-size: 18px; text-shadow: 1px 1px 2px #000; box-shadow: 0 2px 4px rgba(0,0,0,0.5); pointer-events: auto; font-family: monospace;";
    pointsContainer.innerHTML = `Points: <span id="scoreDisplay">0</span>`;
    
    const perkContainer = document.createElement("div");
    perkContainer.id = "nextPerkDisplay";
    perkContainer.style.cssText = "background: rgba(0, 0, 0, 0.75); color: #00BCD4; font-weight: bold; font-size: 18px; text-shadow: 1px 1px 2px #000; box-shadow: 0 2px 4px rgba(0,0,0,0.5); pointer-events: auto; font-family: monospace;";
    perkContainer.innerText = "Next Perk: Level 1";

    leftCol.appendChild(pointsContainer);
    leftCol.appendChild(perkContainer);

    const settingsBtn = document.createElement("button");
    settingsBtn.id = "settingsBtn";
    settingsBtn.innerHTML = "⚙️";
    settingsBtn.style.cssText = "background: none; border: none; font-size: 28px; cursor: pointer; opacity: 0.8; padding: 0; pointer-events: auto;";
    
    topUI.appendChild(leftCol);
    topUI.appendChild(settingsBtn);
    document.body.appendChild(topUI);

    const settingsModal = document.createElement("div");
    settingsModal.id = "settingsModal";
    settingsModal.style.cssText = "display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 50; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: monospace;";
    settingsModal.innerHTML = `
        <h2 style="font-size: 24px; margin-bottom: 30px;">Settings</h2>
        <button id="hardResetBtn" style="padding: 12px 24px; background: #F44336; color: white; border: none; font-weight: bold; cursor: pointer; font-family: monospace; font-size: 16px; margin-bottom: 20px;">Reset Game</button>
        <button id="closeSettingsBtn" style="padding: 12px 24px; background: #555; color: white; border: none; font-weight: bold; cursor: pointer; font-family: monospace; font-size: 16px;">Close</button>
    `;
    document.body.appendChild(settingsModal);

    document.getElementById("pauseBtn").addEventListener("click", () => {
        state.isPaused = !state.isPaused;
        updateUI(state, upgrades);
    });

    document.getElementById("speedDownBtn").addEventListener("click", () => {
        state.selectedSpeed = Math.max(0.5, state.selectedSpeed - 0.25);
        updateUI(state, upgrades);
    });

    document.getElementById("speedUpBtn").addEventListener("click", () => {
        state.selectedSpeed = Math.min(state.gameSpeed, state.selectedSpeed + 0.25);
        updateUI(state, upgrades);
    });

    document.getElementById("restartBtn").addEventListener("click", resetGameCallback);

    document.getElementById("settingsBtn").addEventListener("click", () => {
        document.getElementById("settingsModal").style.display = "flex";
    });

    document.getElementById("closeSettingsBtn").addEventListener("click", () => {
        document.getElementById("settingsModal").style.display = "none";
    });

    document.getElementById("hardResetBtn").addEventListener("click", () => {
        if (confirm("Are you sure you want to completely reset the game? This cannot be undone.")) {
            hardResetProgress(state, resetGameCallback);
            document.getElementById("settingsModal").style.display = "none";
        }
    });

    updateUI(state, upgrades);
    updateHud(state);
}

function drawStat(state, upg) {
    const btn = document.getElementById("upg_" + upg.id);
    if (!btn) return;

    const uState = state.upgrades[upg.id];
    const currentLevelToCheck = uState.level;
    
    const isVisible = (upg.category === state.currentUpgradeTab) && !((upg.category === 'abilities' || upg.category === 'perk') && currentLevelToCheck === 0);
    btn.style.display = isVisible ? "block" : "none";

    if(isVisible === false) return;

    const isMaxed = currentLevelToCheck >= upg.maxLevel;
    const costStr = isMaxed ? "MAX" : `${uState.ptsCost} Pts`;
    const statColor = "#FFF";
    const statStr = isMaxed 
        ? `${upg.getCurrentStr(state)}` 
        : `${upg.getCurrentStr(state)} &rarr; ${upg.getNextStr(state)}`;

    const costText = isMaxed ? "MAX" : costStr;
    const costColor = (isMaxed || state.score >= uState.ptsCost) ? "#4CAF50" : "#FFEB3B";
    const maxLevelDisplay = upg.maxLevel === Infinity ? "∞" : upg.maxLevel;

    if(upg.category === "abilities") { 
        btn.innerHTML = `
            <div style="font-size: 13px; font-weight: bold; color: #FFF; line-height: 1.2; display: flex; justify-content: space-between;">
                <span>${upg.name}</span>
            </div>
            <div style="font-size: 12px; font-weight: normal; color: ${statColor}; line-height: 1.2; margin-top: 3px; text-align: left;">${statStr}</div>
        `;
        btn.style.opacity = "1";
        btn.style.borderColor = "#4CAF50";
    } else if(upg.category === "perk") { 
        btn.innerHTML = `
            <div style="font-size: 13px; font-weight: bold; color: #FFF; line-height: 1.2; display: flex; justify-content: space-between;">
                <span>${upg.name}</span>
            </div>
            <div style="font-size: 12px; font-weight: normal; color: ${statColor}; line-height: 1.2; margin-top: 3px; text-align: left;">${statStr}</div>
        `;
        btn.style.opacity = "1";
        btn.style.borderColor = "#4CAF50";        
    } else {
        btn.innerHTML = `
            <div style="font-size: 13px; font-weight: bold; color: #FFF; line-height: 1.2; display: flex; justify-content: space-between;">
                <span>${upg.name} ${currentLevelToCheck}/${maxLevelDisplay}</span>
                <span style="color: ${costColor};">${costText}</span>
            </div>
            <div style="font-size: 12px; font-weight: normal; color: ${statColor}; line-height: 1.2; margin-top: 3px; text-align: left;">${statStr}</div>
        `;
        if (isMaxed) {
            btn.style.opacity = "1";
            btn.style.borderColor = "#4CAF50";
        } else if (state.isGameOver) {
            btn.style.opacity = "0.5";
            btn.style.borderColor = "#555";
        } else {
            btn.style.opacity = state.score >= uState.ptsCost ? "1" : "0.5";
            btn.style.borderColor = "#555";
        }
    }
}

export function updateUI(state, upgrades) {
    upgrades.filter(u => u.isAbility).forEach(upg => {
        const unlocked = state.upgrades[upg.id] && state.upgrades[upg.id].level > 0 && !state.isGameOver;
        const active = state.abilities[upg.id];
        updateToggleButton("btnAbility_" + upg.id, unlocked, active, upg.name, upg);
    });

    const pauseText = document.getElementById("pauseText");
    if (pauseText) {
        pauseText.innerText = state.isPaused ? "PLAY" : "PAUSE";
    }

    const speedDisplay = document.getElementById("speedDisplay");
    if (speedDisplay) {
        state.selectedSpeed = Math.min(state.selectedSpeed, state.gameSpeed);
        speedDisplay.innerText = state.selectedSpeed.toFixed(2) + "x";
        document.getElementById("speedDownBtn").style.opacity = state.selectedSpeed <= 0.5 ? "0.5" : "1";
        document.getElementById("speedUpBtn").style.opacity = state.selectedSpeed >= state.gameSpeed ? "0.5" : "1";
    }

    upgrades.forEach((upg) => {
        drawStat(state, upg);
    });
}