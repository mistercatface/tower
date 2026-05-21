import { state } from "./GameState.js";
import { enemyTypes, difficultyCurve, perkMilestones } from "./Config.js";
import { Enemy, Missile, EnemyMissile, FloatingText, Wall, Coin } from "./Entities.js";
import { createUpgrades } from "./Upgrades.js";
import { loadProgress, saveProgress } from "./Storage.js";
import { initUI, updateUI, updateHud, showNodeConfirm, showSectorCleared, showUpgradeChoice, showCategoryChoice, showUnlockResult } from "./UI.js";
import { Renderer } from "./Renderer.js";
import { CollisionSystem, SpatialHash } from "./CollisionSystem.js";
import { Viewport } from "./Viewport.js";

const canvas = document.getElementById("towerCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const renderer = new Renderer(canvas, ctx);
const upgrades = createUpgrades();
const viewport = new Viewport(0, 0);

let lastPlanetHealth = -1;
let lastIsMoving = false;

function applyUpgradeChoice(choice, pointsAmount, setBaseLevel) {
    if (choice === "take_points") {
        state.score += pointsAmount;
        spawnFloatingText(state.planet.x, state.planet.y - 60, `+${pointsAmount} Pts`, "#FFEB3B");
    } else {
        const upg = upgrades.find(u => u.id === choice);
        if (upg.replaces && upg.replaces.length > 0) {
            upg.replaces.forEach(repId => {
                if (state.upgrades[repId]) {
                    state.upgrades[repId].level = 0;
                    state.upgrades[repId].baseLevel = 0;
                }
                state.abilities[repId] = false;
            });
        }
        state.upgrades[choice].level = 1;
        if (setBaseLevel) {
            state.upgrades[choice].baseLevel = 1;
        }
        state.abilities[choice] = true;
        if (upg.onPurchase) upg.onPurchase(state);
    }
}

function getValidAbilities(state, upgrades) {
    return upgrades.filter(u => {
        if (u.id === "Laser") return false;
        const uState = state.upgrades[u.id];
        if (u.category !== 'abilities' || uState.level > 0) return false;
        if (u.requires && u.requires.some(req => !state.upgrades[req] || state.upgrades[req].level === 0)) return false;
        if (u.minPlayerLevel && state.level < u.minPlayerLevel) return false;
        if (upgrades.some(activeUpg => state.upgrades[activeUpg.id].level > 0 && activeUpg.replaces && activeUpg.replaces.includes(u.id))) return false;
        return true;
    });
}

function promptAbilitySelection(title, description, choices, isNewRun) {
    const pointsAmount = 100 + (100 * state.level);
    choices.push("take_points");

    const customUpgrades = [
        ...upgrades,
        { id: "take_points", name: "Take Points", description: `Gain ${pointsAmount} Points` },
    ];

    const previousPauseState = state.isPaused;
    state.isPaused = true;

    showUpgradeChoice(title, description, choices, customUpgrades, (pickedId) => {
        applyUpgradeChoice(pickedId, pointsAmount, !isNewRun);
        if (isNewRun) saveProgress(state);
        state.recalculateStats(upgrades);
        state.isPaused = previousPauseState;
        updateUI(state, upgrades);
    });
}

function getValidPerks(state, upgrades) {
    return upgrades.filter(u => {
        if (!u.isPerk) return false;
        if (u.minPlayerLevel && state.level < u.minPlayerLevel) return false;
        const uState = state.upgrades[u.id];
        if (uState && uState.baseLevel >= u.maxLevel) return false;
        return true;
    });
}

function promptPerkSelection(title, description, choices) {
    const customUpgrades = [ ...upgrades ];
    const previousPauseState = state.isPaused;
    state.isPaused = true;

    showUpgradeChoice(title, description, choices, customUpgrades, (pickedId) => {
        const upg = upgrades.find(u => u.id === pickedId);
        state.upgrades[pickedId].baseLevel = 1;
        state.upgrades[pickedId].level = 1;
        saveProgress(state);
        state.recalculateStats(upgrades);
        if (upg.onPurchase) upg.onPurchase(state);
        state.isPaused = previousPauseState;
        updateUI(state, upgrades);
    });
}

function handleEnemyHit(enemy, baseDamage) {
    enemy.health -= baseDamage;

    if (enemy.health <= 0 && !enemy.isDead) {
        enemy.isDead = true;
        const pointsReward = enemy.reward * 10 + state.pointBonus;
        
        let xpGain = 5;

        upgrades.forEach(upg => {
            if (state.upgrades[upg.id] && state.upgrades[upg.id].level > 0 && upg.onEnemyKilled) {
                xpGain = upg.onEnemyKilled(state, enemy, xpGain);
            }
        });

        state.kills++;
        state.score += pointsReward;
        state.xp += xpGain;

        let xpNeeded = Math.floor(25 * Math.pow(1.5, state.level));
        while (state.xp >= xpNeeded) {
            state.xp -= xpNeeded;
            state.level++;
            state.pendingLevelUps++;

            if (perkMilestones.includes(state.level) && !state.claimedPerkMilestones.includes(state.level)) {
                state.pendingPerkPicks.push(state.level);
                state.claimedPerkMilestones.push(state.level);
            }

            if (state.level > state.highestLevelReached) {
                state.highestLevelReached = state.level;
            }
            saveProgress(state);

            xpNeeded = Math.floor(25 * Math.pow(1.5, state.level));
            spawnFloatingText(state.planet.x, state.planet.y - 40, "LEVEL UP", "#FFEB3B");
        }

        spawnFloatingText(enemy.x, enemy.y, `+${pointsReward} Points`, "#FFF");
        spawnFloatingText(enemy.x, enemy.y - 30, `+${xpGain} XP`, "#4CAF50");

        saveProgress(state);
        updateUI(state, upgrades);
    }
}

function processLevelUps() {
    if (state.isPaused) return;

    if (state.pendingPerkPicks && state.pendingPerkPicks.length > 0) {
        const milestone = state.pendingPerkPicks.shift();
        const validPerks = getValidPerks(state, upgrades);

        const choices = [];
        const numChoices = Math.min(3, validPerks.length);
        const availablePool = [...validPerks];
        
        for (let i = 0; i < numChoices; i++) {
            const randIdx = Math.floor(Math.random() * availablePool.length);
            choices.push(availablePool[randIdx].id);
            availablePool.splice(randIdx, 1);
        }

        if (choices.length > 0) {
            promptPerkSelection("MILESTONE REACHED", `Choose a Perk`, choices);
        }
        return;
    }

    if (state.pendingLevelUps > 0) {
        state.pendingLevelUps--;

        const validUpgrades = getValidAbilities(state, upgrades);

        const choices = [];
        const numChoices = Math.min(3, validUpgrades.length);
        const availablePool = [...validUpgrades];
        
        for (let i = 0; i < numChoices; i++) {
            const randIdx = Math.floor(Math.random() * availablePool.length);
            choices.push(availablePool[randIdx].id);
            availablePool.splice(randIdx, 1);
        }

        promptAbilitySelection("LEVEL UP", "Choose a new ability.", choices, false);
    }
}

function resetGame() {
    state.resetRun(upgrades);

    upgrades.forEach(upg => {
        if (upg.onRunStart && state.upgrades[upg.id] && state.upgrades[upg.id].baseLevel > 0) {
            upg.onRunStart(state);
        }
    });

    state.isTransitioning = false;
    state.waveTransitionTimer = 0;
    document.getElementById("gameOverUI").style.display = "none";
    upgrades.forEach((upg) => {
        upg.level = upg.baseLevel;
        upg.ptsCost = state.stats.baseUpgradeCost.value;
    });
    state.recalculateStats(upgrades);

    viewport.x = 0;
    viewport.y = 0;

    state.mapTargetNodeId = 0;
    state.phase = "map_transition";

    const validAbilities = getValidAbilities(state, upgrades);
    
    const choices = [];
    const availablePool = [...validAbilities];
    
    const steadyWeaponIdx = availablePool.findIndex(u => u.id === "SteadyWeapon");
    if (steadyWeaponIdx !== -1) {
        choices.push("SteadyWeapon");
        availablePool.splice(steadyWeaponIdx, 1);
    }

    const numRemainingChoices = Math.max(0, Math.min(3 - choices.length, availablePool.length));
    
    for (let i = 0; i < numRemainingChoices; i++) {
        const randIdx = Math.floor(Math.random() * availablePool.length);
        choices.push(availablePool[randIdx].id);
        availablePool.splice(randIdx, 1);
    }

    promptAbilitySelection("New Run", "Choose a starting Ability.", choices, true);

    updateUI(state, upgrades);
    requestAnimationFrame(loop);
}

function updateCoins(dt) {
    for (let i = state.coins.length - 1; i >= 0; i--) {
        const c = state.coins[i];
        c.update(dt);
        const dist = Math.hypot(c.x - state.planet.x, c.y - state.planet.y);
        if (dist < state.planet.radius + c.radius) {        

            if (state.upgrades["Laser"].level === 0) {
                state.upgrades["Laser"].baseLevel = 1;
                state.upgrades["Laser"].level = 1;
                state.abilities["Laser"] = true;

                state.recalculateStats(upgrades);
                updateUI(state, upgrades);
                spawnFloatingText(c.x, c.y - 20, "LASER UNLOCKED", "#00BCD4");
            }

            spawnFloatingText(c.x, c.y, `+${c.value}`, "#FFEB3B");
            state.coins.splice(i, 1);
            saveProgress(state);
        }
    }
}

function setupInput() {
    let lastTapTime = 0;

    canvas.addEventListener(
        "wheel",
        (e) => {
            e.preventDefault();
            const zoomAmount = e.deltaY * -0.001;
            viewport.zoom = Math.min(Math.max(viewport.zoom + zoomAmount, 0.2), 3.0);
        },
        { passive: false },
    );

    let initialPinchDistance = null;
    let initialZoom = 1;

    canvas.addEventListener(
        "touchstart",
        (e) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                initialPinchDistance = Math.hypot(dx, dy);
                initialZoom = viewport.zoom;
            }
        },
        { passive: false },
    );

    canvas.addEventListener(
        "touchmove",
        (e) => {
            if (e.touches.length === 2 && initialPinchDistance) {
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const currentDistance = Math.hypot(dx, dy);
                const ratio = currentDistance / initialPinchDistance;
                viewport.zoom = Math.min(Math.max(initialZoom * ratio, 0.2), 3.0);
            }
        },
        { passive: false },
    );

    canvas.addEventListener("touchend", (e) => {
        if (e.touches.length < 2) {
            initialPinchDistance = null;
        }
    });

    canvas.addEventListener("pointerdown", (e) => {
        const currentTime = Date.now();
        const isDoubleTap = (currentTime - lastTapTime) < 300;
        lastTapTime = currentTime;

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldCoords = viewport.screenToWorld(screenX, screenY);

        if (state.phase === "map") {
            const currentNode = state.mapNodes.find(n => n.id === state.currentNodeId);
            if (!currentNode) return;

            for (const neighborId of currentNode.connections) {
                const neighbor = state.mapNodes.find(n => n.id === neighborId);
                const dist = Math.hypot(neighbor.x - worldCoords.x, neighbor.y - worldCoords.y);
                
                if (dist < 20) {
                    showNodeConfirm(neighbor, () => {
                        state.mapTargetNodeId = neighbor.id;
                        state.phase = "map_transition";
                    });
                    break;
                }
            }
        } else if (state.phase === "combat") {
            if (!state.upgrades["Reposition"] || state.upgrades["Reposition"].level === 0) return;
            
            const distFromSpawn = Math.hypot(worldCoords.x - state.planet.spawnX, worldCoords.y - state.planet.spawnY);
            if (distFromSpawn <= state.weapon.range) {
                const gridPos = state.gridSystem.worldToGrid(worldCoords.x, worldCoords.y);
                if (gridPos.col >= 0 && gridPos.col < state.gridSystem.cols && gridPos.row >= 0 && gridPos.row < state.gridSystem.rows) {
                    if (state.gridSystem.grid[gridPos.row * state.gridSystem.cols + gridPos.col] !== 1) {
                        const targetX = gridPos.col * state.gridSystem.cellSize + state.gridSystem.centerX - state.gridSystem.offsetX + (state.gridSystem.cellSize / 2);
                        const targetY = gridPos.row * state.gridSystem.cellSize + state.gridSystem.centerY - state.gridSystem.offsetY + (state.gridSystem.cellSize / 2);
                        
                        let isDiving = false;

                        upgrades.filter(u => u.isAbility && u.triggerType === 'double_tap_move' && state.abilities[u.id]).forEach(upg => {
                            if (state.abilityTimers[upg.id] && state.abilityTimers[upg.id].active > 0) {
                                isDiving = true;
                            }
                        });

                        if (isDiving) {
                            state.planet.queuedTargetX = targetX;
                            state.planet.queuedTargetY = targetY;
                        } else {
                            state.planet.targetX = targetX;
                            state.planet.targetY = targetY;
                            state.planet.targetNodeX = null;
                            state.planet.targetNodeY = null;
                            state.planet.isMoving = true;
                            state.gridSystem.buildPlayerFlowField(targetX, targetY);
                            
                            if (isDoubleTap) {
                                upgrades.filter(u => u.isAbility && u.triggerType === 'double_tap_move' && state.abilities[u.id]).forEach(upg => {
                                    if (!state.abilityTimers) state.abilityTimers = {};
                                    if (!state.abilityTimers[upg.id]) state.abilityTimers[upg.id] = { cooldown: 0, active: 0 };
                                    
                                    if (state.abilityTimers[upg.id].cooldown <= 0) {
                                        state.abilityTimers[upg.id].active = upg.activeDuration;
                                        state.abilityTimers[upg.id].cooldown = upg.cooldown;
                                        if (upg.onTrigger) upg.onTrigger(state);
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
    });
}

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    state.canvasBounds = { width: canvas.width, height: canvas.height };

    const uiContainer = document.getElementById("uiContainer");
    const uiHeight = uiContainer ? uiContainer.offsetHeight : 0;

    state.planet.x = Math.floor(canvas.width / 2);
    state.planet.y = Math.floor((canvas.height - uiHeight) / 2);
    state.planet.spawnX = state.planet.x;
    state.planet.spawnY = state.planet.y;

    viewport.cx = Math.floor(canvas.width / 2);
    viewport.cy = Math.floor((canvas.height - uiHeight) / 2);
}

function rebuildGrid() {
    state.gridSystem.clear();
    for (const w of state.walls) {
        state.gridSystem.addWall(w);
    }
    state.gridSystem.buildFlowField(state.planet.x, state.planet.y);
}

function spawnFloatingText(x, y, text, color) {
    const offsetX = (Math.random() - 0.5) * 16;
    const offsetY = (Math.random() - 0.5) * 16;
    state.floatingTexts.push(new FloatingText(x + offsetX, y + offsetY, text, color));
}

function spawnEnemy() {
    const dist = state.spawnRadius;
    let x, y;
    
    const side = Math.floor(Math.random() * 4);
    const pos = (Math.random() * 2 - 1) * dist;

    if (side === 0) {
        x = state.planet.x + pos;
        y = state.planet.y - dist;
    } else if (side === 1) {
        x = state.planet.x + dist;
        y = state.planet.y + pos;
    } else if (side === 2) {
        x = state.planet.x + pos;
        y = state.planet.y + dist;
    } else {
        x = state.planet.x - dist;
        y = state.planet.y + pos;
    }

    if (state.gridSystem) {
        const grid = state.gridSystem;
        const gridPos = grid.worldToGrid(x, y);
        let targetCol = Math.max(0, Math.min(grid.cols - 1, gridPos.col));
        let targetRow = Math.max(0, Math.min(grid.rows - 1, gridPos.row));

        x = targetCol * grid.cellSize + grid.centerX - grid.offsetX + (grid.cellSize / 2);
        y = targetRow * grid.cellSize + grid.centerY - grid.offsetY + (grid.cellSize / 2);
    }

    let selectedType;

    if (state.wave % 10 === 0) {
        selectedType = enemyTypes.find((e) => e.type === "boss");
    } else {
        let availableTypes = enemyTypes.filter(e => e.type !== "boss" && (e.minLevel === undefined || state.level >= e.minLevel));
        
        if (availableTypes.length === 0) {
            availableTypes.push(enemyTypes.find(e => e.type === "standard"));
        }

        const totalWeight = availableTypes.reduce((sum, e) => sum + e.weight, 0);
        let rand = Math.random() * totalWeight;
        selectedType = availableTypes[0];

        for (const type of availableTypes) {
            if (rand < type.weight) {
                selectedType = type;
                break;
            }
            rand -= type.weight;
        }
    }

    const scaledHealth = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.healthMultiplier, state.wave - 1)));
    const scaledSpeed = selectedType.baseSpeed * Math.pow(difficultyCurve.speedMultiplier, state.wave - 1);
    const scaledReward = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.rewardMultiplier, state.wave - 1)));

    state.enemies.push(new Enemy(x, y, selectedType.radius, scaledSpeed, scaledHealth, selectedType.color, scaledReward, selectedType.type));
}

function updateEnemies(dt) {
    const spatialHash = new SpatialHash(50);
    
    for (const e of state.enemies) {
        spatialHash.insert(e);
    }

    for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        const wantsToShoot = e.update(dt, state.planet, state.gridSystem, state.walls, state.missiles, spatialHash);

        if (wantsToShoot) {
            state.enemyMissiles.push(new EnemyMissile(e.x, e.y, e.radius * 0.333, 150, state.planet, 10));
        }

        if (e.isDead) state.enemies.splice(i, 1);
    }
}

function handlePlanetHit(damage) {
    const mitigatedAmount = damage * state.mitigation;
    const finalDamage = damage - mitigatedAmount;

    state.planet.health -= finalDamage;
    spawnFloatingText(state.planet.x, state.planet.y - 20, `-${finalDamage.toFixed(1)}`, "#F44336");

    if (mitigatedAmount > 0) {
        spawnFloatingText(state.planet.x, state.planet.y + 20, `Mitigated ${mitigatedAmount.toFixed(1)}`, "#03A9F4");
    }
}

function castLaser(startX, startY, angle, maxDist, state) {
    const step = 8;
    let dist = 0;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let cx = startX;
    let cy = startY;
    const rayCircle = { x: cx, y: cy, radius: 1 };
    
    while (dist < maxDist) {
        cx += dx * step;
        cy += dy * step;
        dist += step;
        rayCircle.x = cx;
        rayCircle.y = cy;
        
        let hitWall = false;
        for (const w of state.walls) {
            for (const seg of w.segments) {
                if (seg.isDead) continue;
                if (CollisionSystem.checkCircleRect(rayCircle, seg)) {
                    hitWall = true;
                    break;
                }
            }
            if (hitWall) break;
        }
        
        if (hitWall) {
            while (hitWall && dist > 0) {
                cx -= dx;
                cy -= dy;
                dist -= 1;
                rayCircle.x = cx;
                rayCircle.y = cy;
                hitWall = false;
                for (const w of state.walls) {
                    for (const seg of w.segments) {
                        if (seg.isDead) continue;
                        if (CollisionSystem.checkCircleRect(rayCircle, seg)) {
                            hitWall = true;
                            break;
                        }
                    }
                    if (hitWall) break;
                }
            }
            return { hit: 'wall', x: cx, y: cy, dist: dist };
        }
        
        for (const e of state.enemies) {
            if (e.isDead) continue;
            if (CollisionSystem.checkCircle(rayCircle, e)) {
                const distToEnemy = Math.hypot(e.x - startX, e.y - startY);
                const exactDist = distToEnemy - e.radius;
                const finalX = startX + dx * exactDist;
                const finalY = startY + dy * exactDist;
                return { hit: 'enemy', entity: e, x: finalX, y: finalY, dist: exactDist };
            }
        }
    }
    return { hit: 'none', x: cx, y: cy, dist: dist };
}

function updateTurretAndWeapon(dt, blocksTargeting) {
    function fireTurret(turretAngle) {
        const turretDist = state.planet.radius + 12;
        const tx = state.planet.x + Math.cos(turretAngle) * turretDist;
        const ty = state.planet.y + Math.sin(turretAngle) * turretDist;

        const accuracySpread = (1 - state.weapon.accuracy) * Math.PI / 2;
        const spreadAngle = (Math.random() - 0.5) * accuracySpread;
        const finalAngle = turretAngle + spreadAngle;

        let shotOverridden = false;

        for (const upg of upgrades) {
            if (upg.isAbility && state.abilities[upg.id] && upg.abilityShootFn) {
                if (upg.abilityShootFn(state, tx, ty, finalAngle, Missile)) {
                    shotOverridden = true;
                    break;
                }
            }
        }

        if (!shotOverridden) {
            let m = new Missile(tx, ty, state.planet.radius * 0.25, 250, null, finalAngle);
            m.penetration = state.weapon.penetration;
            state.missiles.push(m);
        }
    }

    if (state.currentTarget) {
        const dist = Math.hypot(state.currentTarget.x - state.planet.x, state.currentTarget.y - state.planet.y);
        if (state.currentTarget.isDead || dist > state.weapon.range || !hasLineOfSight(state.planet.x, state.planet.y, state.currentTarget.x, state.currentTarget.y, state.walls) || blocksTargeting) {
            state.currentTarget = null;
        }
    }
    if (!state.currentTarget && !blocksTargeting) {
        state.currentTarget = getNearestEnemy();
    }

    const twoGuns = state.abilities["TwoGuns"];
    if (twoGuns) {
        if (state.currentTarget2) {
            const dist2 = Math.hypot(state.currentTarget2.x - state.planet.x, state.currentTarget2.y - state.planet.y);
            if (state.currentTarget2.isDead || dist2 > state.weapon.range || !hasLineOfSight(state.planet.x, state.planet.y, state.currentTarget2.x, state.currentTarget2.y, state.walls) || blocksTargeting) {
                state.currentTarget2 = null;
            } else if (state.currentTarget2 === state.currentTarget && getNearestEnemy(state.planet, state.weapon.range, state.currentTarget) !== null) {
                state.currentTarget2 = null;
            }
        }
        if (!state.currentTarget2 && !blocksTargeting) {
            state.currentTarget2 = getNearestEnemy(state.planet, state.weapon.range, state.currentTarget);
            if (!state.currentTarget2) state.currentTarget2 = state.currentTarget;
        }
    }

    state.activeLasers = [];
    const isLaser = state.abilities["Laser"];
    let laserCanDamage = false;
    if (isLaser) {
        state.weapon.laserTimer = (state.weapon.laserTimer || 0) + dt;
        if (state.weapon.laserTimer >= 200) {
            laserCanDamage = true;
            state.weapon.laserTimer = 0;
        }
    }

    function processTurretRotation(turret, target, chargeKey) {
        if (target && !blocksTargeting) {
            const targetAngle = Math.atan2(target.y - state.planet.y, target.x - state.planet.x);
            let diff = targetAngle - turret.angle;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));

            if (Math.abs(diff) < 0.05) {
                turret.angle = targetAngle;
                if (!isLaser) {
                    state.weapon[chargeKey] += dt;
                    if (state.weapon[chargeKey] >= state.weapon.chargeTime) {
                        fireTurret(turret.angle);
                        state.weapon[chargeKey] = 0;
                    }
                }
            } else {
                turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turret.turnSpeed * (dt / 1000));
                if (!isLaser) state.weapon[chargeKey] = 0;
            }
        } else if (state.planet.isMoving) {
            let tx = state.planet.targetNodeX !== null ? state.planet.targetNodeX : state.planet.targetX;
            let ty = state.planet.targetNodeY !== null ? state.planet.targetNodeY : state.planet.targetY;
            if (tx !== null && ty !== null) {
                const moveAngle = Math.atan2(ty - state.planet.y, tx - state.planet.x);
                let diff = moveAngle - turret.angle;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turret.turnSpeed * (dt / 1000));
            }
            if (!isLaser) state.weapon[chargeKey] = 0;
        } else {
            if (!isLaser) state.weapon[chargeKey] = 0;
        }

        if (isLaser) {
            const turretDist = state.planet.radius + 4 + 4 * (state.planet.radius / 8);
            
            const time = state.lastTime || Date.now();
            const phaseOffset = chargeKey === 'charge2' ? Math.PI : 0;
            const accuracySpread = (1 - state.weapon.accuracy) * (Math.PI / 12);
            const laserAngle = turret.angle + Math.sin(time / 150 + phaseOffset) * accuracySpread;
            
            const tx = state.planet.x + Math.cos(turret.angle) * turretDist;
            const ty = state.planet.y + Math.sin(turret.angle) * turretDist;
            const hit = castLaser(tx, ty, laserAngle, 2000, state);
            
            state.activeLasers.push({ x1: tx, y1: ty, x2: hit.x, y2: hit.y });
            
            if (laserCanDamage && hit.hit === 'enemy') {
                const damage = state.weapon.damage * (200 / state.weapon.chargeTime);
                handleEnemyHit(hit.entity, damage);
            }
        }
    }

    processTurretRotation(state.turret, state.currentTarget, 'charge');

    if (twoGuns) {
        if (state.weapon.charge2 === undefined) state.weapon.charge2 = 0;
        processTurretRotation(state.turret2, state.currentTarget2, 'charge2');
    }
}

function updateEnemyMissiles(dt) {
    for (let i = state.enemyMissiles.length - 1; i >= 0; i--) {
        const m = state.enemyMissiles[i];
        m.update(dt, state.canvasBounds);
        if (m.isDead) state.enemyMissiles.splice(i, 1);
    }
}

function updateMissiles(dt) {
    for (let i = state.missiles.length - 1; i >= 0; i--) {
        const m = state.missiles[i];
        m.update(dt, state.enemies, state.canvasBounds);
        if (m.isDead) state.missiles.splice(i, 1);
    }
}

function updateFloatingTexts(dt) {
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        ft.update(dt);
        if (ft.isDead) state.floatingTexts.splice(i, 1);
    }
}

function getNearestEnemy(source = state.planet, range = state.weapon.range, excludeTarget = null) {
    let nearest = null;
    let minDist = Infinity;
    for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (excludeTarget && e === excludeTarget) continue;
        const dist = Math.hypot(e.x - source.x, e.y - source.y);
        if (dist <= range && dist < minDist) {
            if (hasLineOfSight(source.x, source.y, e.x, e.y, state.walls)) {
                minDist = dist;
                nearest = e;
            }
        }
    }
    return nearest;
}

function loop(timestamp) {
    if (state.lastTime === 0) state.lastTime = timestamp;
    let dt = timestamp - state.lastTime;
    state.lastTime = timestamp;
    dt = Math.min(dt, 50);
    
    if (state.planet.health > 0) {
        if (!state.isPaused) {
            update(dt * state.selectedSpeed);
        }
        draw();
        updateHud(state, upgrades);
        
        if (state.planet.health !== lastPlanetHealth || state.planet.isMoving !== lastIsMoving) {
            updateUI(state, upgrades);
            lastPlanetHealth = state.planet.health;
            lastIsMoving = state.planet.isMoving;
        }
        
        requestAnimationFrame(loop);
    } else if (!state.isGameOver) {
        state.isGameOver = true;
        draw();
        document.getElementById("gameOverUI").style.display = "flex";
        updateUI(state, upgrades);
        updateHud(state, upgrades);
    }
}

function distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function hasLineOfSight(x1, y1, x2, y2, walls) {
    const start = { x: x1, y: y1 };
    const end = { x: x2, y: y2 };

    for (const wall of walls) {
        for (const seg of wall.segments) {
            if (seg.isDead) continue;
            const dist = distToSegment(seg, start, end);
            if (dist < seg.size * 0.5) {
                return false;
            }
        }
    }
    return true;
}

function handleWallHit(wall, segment, damage) {
    segment.health -= damage;
    if (segment.health <= 0 && !segment.isDead) {
        segment.isDead = true;
        rebuildGrid();
    }
}

const WallGenerator = {
    generate(state, planetX, planetY) {
        state.walls = [];
        state.gridSystem.centerX = planetX;
        state.gridSystem.centerY = planetY;
        const patterns = ['maze', 'maze2', 'square', 'geometric', 'honeycomb', 'diamond'];
        const selected = patterns[Math.floor(Math.random() * patterns.length)];
        const themeColors = [
            {r: 0, g: 188, b: 212},
            {r: 76, g: 175, b: 80},
            {r: 255, g: 152, b: 0},
            {r: 156, g: 39, b: 176},
            {r: 63, g: 81, b: 181}
        ];
        state.wallTheme = themeColors[Math.floor(Math.random() * themeColors.length)];
        this[selected](state, planetX, planetY);
        
        rebuildGrid();

        const grid = state.gridSystem;
        let spawned = false;
        let attempts = 0;

        while (!spawned && attempts < 100) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const dist = 250 + Math.random() * 50;
            const testX = planetX + Math.cos(angle) * dist;
            const testY = planetY + Math.sin(angle) * dist;

            const gridPos = grid.worldToGrid(testX, testY);

            if (gridPos.col >= 0 && gridPos.col < grid.cols && gridPos.row >= 0 && gridPos.row < grid.rows) {
                const idx = gridPos.row * grid.cols + gridPos.col;
                if (grid.grid[idx] !== 1) {
                    const centerX = gridPos.col * grid.cellSize + grid.centerX - grid.offsetX + (grid.cellSize / 2);
                    const centerY = gridPos.row * grid.cellSize + grid.centerY - grid.offsetY + (grid.cellSize / 2);

                    state.coins.push(new Coin(centerX, centerY, 8, 50));
                    spawned = true;
                }
            }
        }
    },

    maze2(state, px, py) {
        const cellSize = state.gridSystem.cellSize;
        const pathWidth = 1;
        const wallWidth = 1;
        const step = pathWidth + wallWidth;
        const nodesX = 15;
        const nodesY = 15;
        const cols = nodesX * step + wallWidth;
        const rows = nodesY * step + wallWidth;
        const grid = new Array(cols * rows).fill(1);

        const carveNode = (nx, ny) => {
            const sx = nx * step + wallWidth;
            const sy = ny * step + wallWidth;
            grid[sy * cols + sx] = 0;
        };

        const carveH = (nx, ny) => {
            const sx = nx * step + wallWidth + pathWidth;
            const sy = ny * step + wallWidth;
            grid[sy * cols + sx] = 0;
        };

        const carveV = (nx, ny) => {
            const sx = nx * step + wallWidth;
            const sy = ny * step + wallWidth + pathWidth;
            grid[sy * cols + sx] = 0;
        };

        const visited = new Set();
        const carveMaze = (nx, ny) => {
            visited.add(`${nx},${ny}`);
            carveNode(nx, ny);

            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
            for (const [dx, dy] of dirs) {
                const tx = nx + dx;
                const ty = ny + dy;
                if (tx >= 0 && tx < nodesX && ty >= 0 && ty < nodesY && !visited.has(`${tx},${ty}`)) {
                    if (dx === 1) carveH(nx, ny);
                    if (dx === -1) carveH(tx, ny);
                    if (dy === 1) carveV(nx, ny);
                    if (dy === -1) carveV(nx, ty);
                    carveMaze(tx, ty);
                }
            }
        };

        carveMaze(Math.floor(nodesX / 2), Math.floor(nodesY / 2));

        const cx = Math.floor(cols / 2);
        const cy = Math.floor(rows / 2);
        for (let r = -4; r <= 4; r++) {
            for (let c = -4; c <= 4; c++) {
                if (cy + r >= 0 && cy + r < rows && cx + c >= 0 && cx + c < cols) {
                    grid[(cy + r) * cols + (cx + c)] = 0;
                }
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r < 2 || r >= rows - 2 || c < 2 || c >= cols - 2) {
                    grid[r * cols + c] = 0;
                }
            }
        }

        const gateSize = 3;
        for (let i = -gateSize; i <= gateSize; i++) {
            if (cy + i >= 0 && cy + i < rows) {
                grid[0 * cols + (cx + i)] = 0;
                grid[(rows - 1) * cols + (cx + i)] = 0;
            }
            if (cx + i >= 0 && cx + i < cols) {
                grid[(cy + i) * cols + 0] = 0;
                grid[(cy + i) * cols + (cols - 1)] = 0;
            }
        }

        const w = new Wall(px, py, 0, 0, 0, cellSize);
        w.padding = 0;
        w.segments = [];
        const offsetX = px - (cols * cellSize) / 2;
        const offsetY = py - (rows * cellSize) / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r * cols + c] === 1) {
                    w.segments.push({
                        x: offsetX + c * cellSize + cellSize / 2,
                        y: offsetY + r * cellSize + cellSize / 2,
                        angle: 0,
                        size: cellSize,
                        maxHealth: 30,
                        health: 30,
                        isDead: false
                    });
                }
            }
        }
        state.walls.push(w);
    },

    maze(state, px, py) {
        const cellSize = state.gridSystem.cellSize;
        const pathWidth = 3;
        const wallWidth = 1;
        const step = pathWidth + wallWidth;
        const nodesX = 15; 
        const nodesY = 15;
        const cols = nodesX * step + wallWidth;
        const rows = nodesY * step + wallWidth;
        const grid = new Array(cols * rows).fill(1);

        const carveNode = (nx, ny) => {
            const sx = nx * step + wallWidth;
            const sy = ny * step + wallWidth;
            for(let r=0; r<pathWidth; r++) {
                for(let c=0; c<pathWidth; c++) {
                    grid[(sy+r)*cols + (sx+c)] = 0;
                }
            }
        };

        const carveH = (nx, ny) => {
            const sx = nx * step + wallWidth + pathWidth;
            const sy = ny * step + wallWidth;
            for(let r=0; r<pathWidth; r++) {
                for(let c=0; c<wallWidth; c++) {
                    grid[(sy+r)*cols + (sx+c)] = 0;
                }
            }
        };

        const carveV = (nx, ny) => {
            const sx = nx * step + wallWidth;
            const sy = ny * step + wallWidth + pathWidth;
            for(let r=0; r<wallWidth; r++) {
                for(let c=0; c<pathWidth; c++) {
                    grid[(sy+r)*cols + (sx+c)] = 0;
                }
            }
        };

        const visited = new Set();
        const carveMaze = (nx, ny) => {
            visited.add(`${nx},${ny}`);
            carveNode(nx, ny);

            const dirs = [[1,0], [-1,0], [0,1], [0,-1]].sort(() => Math.random() - 0.5);
            for (const [dx, dy] of dirs) {
                const tx = nx + dx;
                const ty = ny + dy;
                if (tx >= 0 && tx < nodesX && ty >= 0 && ty < nodesY && !visited.has(`${tx},${ty}`)) {
                    if (dx === 1) carveH(nx, ny);
                    if (dx === -1) carveH(tx, ny);
                    if (dy === 1) carveV(nx, ny);
                    if (dy === -1) carveV(nx, ty);
                    carveMaze(tx, ty);
                }
            }
        };

        carveMaze(Math.floor(nodesX/2), Math.floor(nodesY/2));

        for(let i=0; i < (nodesX * nodesY) / 4; i++) {
            const nx = Math.floor(Math.random()*(nodesX-1));
            const ny = Math.floor(Math.random()*(nodesY-1));
            if (Math.random() < 0.5) carveH(nx, ny);
            else carveV(nx, ny);
        }
        
        const cx = Math.floor(cols/2);
        const cy = Math.floor(rows/2);
        for(let r=-6; r<=6; r++) {
            for(let c=-6; c<=6; c++) {
                if (cy+r >= 0 && cy+r < rows && cx+c >= 0 && cx+c < cols) {
                    grid[(cy+r)*cols + (cx+c)] = 0;
                }
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r < 2 || r >= rows - 2 || c < 2 || c >= cols - 2) {
                    grid[r * cols + c] = 0;
                }
            }
        }

        const gateSize = 5;
        for (let i = -gateSize; i <= gateSize; i++) {
            for (let d = 0; d < 4; d++) {
                if (cy + i >= 0 && cy + i < rows) {
                    grid[d * cols + (cx + i)] = 0;
                    grid[(rows - 1 - d) * cols + (cx + i)] = 0;
                }
            }
            for (let d = 0; d < 4; d++) {
                if (cx + i >= 0 && cx + i < cols) {
                    grid[(cy + i) * cols + d] = 0;
                    grid[(cy + i) * cols + (cols - 1 - d)] = 0;
                }
            }
        }

        const w = new Wall(px, py, 0, 0, 0, cellSize);
        w.padding = 0;
        w.segments = [];
        const offsetX = px - (cols * cellSize) / 2;
        const offsetY = py - (rows * cellSize) / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r * cols + c] === 1) {
                    w.segments.push({
                        x: offsetX + c * cellSize + cellSize / 2,
                        y: offsetY + r * cellSize + cellSize / 2,
                        angle: 0,
                        size: cellSize,
                        maxHealth: 30,
                        health: 30,
                        isDead: false
                    });
                }
            }
        }
        state.walls.push(w);
    },

    geometric(state, px, py) {
        const sides = 4 + Math.floor(Math.random() * 4);
        const layers = 2 + Math.floor(state.wave / 8);
        for (let l = 0; l < layers; l++) {
            const radius = 220 + l * 100;
            const rotOffset = (l % 2 === 0 ? 0 : Math.PI / sides);
            for (let i = 0; i < sides; i++) {
                const centerAngle = (i / sides) * Math.PI * 2 + rotOffset;
                
                const minPhysicalGap = 140;
                const gapInRadians = minPhysicalGap / radius;
                const fullSpan = (Math.PI * 2) / sides;
                const span = Math.max(fullSpan * 0.2, fullSpan - gapInRadians);

                state.walls.push(new Wall(px, py, radius, centerAngle - span/2, centerAngle + span/2, 14 + l * 2));
            }
        }
    },

    fortress(state, px, py) {
        const dist = 300;
        const size = 18;
        for (let i = 0; i < 4; i++) {
            const angle = i * (Math.PI / 2);
            state.walls.push(new Wall(px, py, dist, angle - 0.4, angle + 0.4, size));
            state.walls.push(new Wall(px, py, dist + 40, angle - 0.2, angle + 0.2, size));
        }
    },

    honeycomb(state, px, py) {
        const rings = 3;
        for (let r = 1; r <= rings; r++) {
            const radius = r * 150;
            const count = r * 6;
            for (let i = 0; i < count; i++) {
                if (Math.random() > 0.4) {
                    const angle = (i / count) * Math.PI * 2;
                    state.walls.push(new Wall(px, py, radius, angle - 0.1, angle + 0.1, 20));
                }
            }
        }
    },

    square(state, px, py) {
        const cellSize = state.gridSystem.cellSize;
        const cols = 61;
        const rows = 61;
        const grid = new Array(cols * rows).fill(1);

        const minLeafSize = 14;

        class Leaf {
            constructor(x, y, w, h) {
                this.x = x;
                this.y = y;
                this.w = w;
                this.h = h;
                this.leftChild = null;
                this.rightChild = null;
                this.room = null;
                this.halls = [];
            }

            split() {
                if (this.leftChild || this.rightChild) return false;

                let splitH = Math.random() > 0.5;
                if (this.w > this.h && this.w / this.h >= 1.25) splitH = false;
                else if (this.h > this.w && this.h / this.w >= 1.25) splitH = true;

                const max = (splitH ? this.h : this.w) - minLeafSize;
                if (max <= minLeafSize) return false;

                const split = Math.floor(Math.random() * (max - minLeafSize + 1)) + minLeafSize;

                if (splitH) {
                    this.leftChild = new Leaf(this.x, this.y, this.w, split);
                    this.rightChild = new Leaf(this.x, this.y + split, this.w, this.h - split);
                } else {
                    this.leftChild = new Leaf(this.x, this.y, split, this.h);
                    this.rightChild = new Leaf(this.x + split, this.y, this.w - split, this.h);
                }

                return true;
            }

            createRooms() {
                if (this.leftChild || this.rightChild) {
                    if (this.leftChild) this.leftChild.createRooms();
                    if (this.rightChild) this.rightChild.createRooms();
                    if (this.leftChild && this.rightChild) {
                        this.createHall(this.leftChild.getRoom(), this.rightChild.getRoom());
                    }
                } else {
                    const roomW = Math.floor(Math.random() * (this.w - 6)) + 5;
                    const roomH = Math.floor(Math.random() * (this.h - 6)) + 5;
                    const roomX = Math.floor(Math.random() * (this.w - roomW - 2)) + 1;
                    const roomY = Math.floor(Math.random() * (this.h - roomH - 2)) + 1;
                    this.room = { x: this.x + roomX, y: this.y + roomY, w: roomW, h: roomH };
                }
            }

            getRoom() {
                if (this.room) return this.room;
                let lRoom = null;
                let rRoom = null;
                if (this.leftChild) lRoom = this.leftChild.getRoom();
                if (this.rightChild) rRoom = this.rightChild.getRoom();
                if (!lRoom && !rRoom) return null;
                if (!rRoom) return lRoom;
                if (!lRoom) return rRoom;
                return Math.random() > 0.5 ? lRoom : rRoom;
            }

            createHall(l, r) {
                const pathW = 4;
                const point1 = {
                    x: Math.floor(l.x + l.w / 2),
                    y: Math.floor(l.y + l.h / 2)
                };
                const point2 = {
                    x: Math.floor(r.x + r.w / 2),
                    y: Math.floor(r.y + r.h / 2)
                };

                const w = point2.x - point1.x;
                const h = point2.y - point1.y;

                if (w < 0) {
                    if (h < 0) {
                        if (Math.random() < 0.5) {
                            this.halls.push({ x: point2.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                        } else {
                            this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point1.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                        }
                    } else if (h > 0) {
                        if (Math.random() < 0.5) {
                            this.halls.push({ x: point2.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point2.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                        } else {
                            this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                        }
                    } else {
                        this.halls.push({ x: point2.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                    }
                } else if (w > 0) {
                    if (h < 0) {
                        if (Math.random() < 0.5) {
                            this.halls.push({ x: point1.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point1.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                        } else {
                            this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                        }
                    } else if (h > 0) {
                        if (Math.random() < 0.5) {
                            this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point2.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                        } else {
                            this.halls.push({ x: point1.x, y: point2.y, w: Math.abs(w) + 1, h: pathW });
                            this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                        }
                    } else {
                        this.halls.push({ x: point1.x, y: point1.y, w: Math.abs(w) + 1, h: pathW });
                    }
                } else {
                    if (h < 0) {
                        this.halls.push({ x: point2.x, y: point2.y, w: pathW, h: Math.abs(h) + 1 });
                    } else if (h > 0) {
                        this.halls.push({ x: point1.x, y: point1.y, w: pathW, h: Math.abs(h) + 1 });
                    }
                }
            }
        }

        const root = new Leaf(0, 0, cols, rows);
        const leaves = [root];

        let didSplit = true;
        while (didSplit) {
            didSplit = false;
            for (let i = 0; i < leaves.length; i++) {
                if (leaves[i].leftChild === null && leaves[i].rightChild === null) {
                    if (leaves[i].w > 30 || leaves[i].h > 30 || Math.random() > 0.25) {
                        if (leaves[i].split()) {
                            leaves.push(leaves[i].leftChild);
                            leaves.push(leaves[i].rightChild);
                            didSplit = true;
                        }
                    }
                }
            }
        }

        root.createRooms();

        const drawRoom = (r) => {
            for (let y = r.y; y < r.y + r.h; y++) {
                for (let x = r.x; x < r.x + r.w; x++) {
                    if (y >= 0 && y < rows && x >= 0 && x < cols) {
                        grid[y * cols + x] = 0;
                    }
                }
            }
        };

        const drawHalls = (leaf) => {
            if (leaf.room) drawRoom(leaf.room);
            if (leaf.halls.length > 0) {
                for (const hall of leaf.halls) {
                    drawRoom(hall);
                }
            }
            if (leaf.leftChild) drawHalls(leaf.leftChild);
            if (leaf.rightChild) drawHalls(leaf.rightChild);
        };

        drawHalls(root);

        const cx = Math.floor(cols / 2);
        const cy = Math.floor(rows / 2);
        for (let r = -6; r <= 6; r++) {
            for (let c = -6; c <= 6; c++) {
                if (cy + r >= 0 && cy + r < rows && cx + c >= 0 && cx + c < cols) {
                    grid[(cy + r) * cols + (cx + c)] = 0;
                }
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r < 2 || r >= rows - 2 || c < 2 || c >= cols - 2) {
                    grid[r * cols + c] = 0;
                }
            }
        }

        const gateSize = 5;
        for (let i = -gateSize; i <= gateSize; i++) {
            for (let d = 0; d < 4; d++) {
                if (cy + i >= 0 && cy + i < rows) {
                    grid[d * cols + (cx + i)] = 0;
                    grid[(rows - 1 - d) * cols + (cx + i)] = 0;
                }
            }
            for (let d = 0; d < 4; d++) {
                if (cx + i >= 0 && cx + i < cols) {
                    grid[(cy + i) * cols + d] = 0;
                    grid[(cy + i) * cols + (cols - 1 - d)] = 0;
                }
            }
        }

        const w = new Wall(px, py, 0, 0, 0, cellSize);
        w.padding = 0;
        w.segments = [];
        const offsetX = px - (cols * cellSize) / 2;
        const offsetY = py - (rows * cellSize) / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r * cols + c] === 1) {
                    w.segments.push({
                        x: offsetX + c * cellSize + cellSize / 2,
                        y: offsetY + r * cellSize + cellSize / 2,
                        angle: 0,
                        size: cellSize,
                        maxHealth: 30,
                        health: 30,
                        isDead: false
                    });
                }
            }
        }
        state.walls.push(w);
    },

    diamond(state, px, py) {
        const wallSize = 16;
        const radii = [200, 350, 500];

        for (const r of radii) {
            const w = new Wall(px, py, 0, 0, 0, wallSize);
            w.segments = [];
            const dist = Math.hypot(r, r);
            const steps = Math.floor(dist / (wallSize * 1.1));
            
            const gap1 = 0.1 + Math.random() * 0.6;
            const gap2 = 0.1 + Math.random() * 0.6;
            const gap3 = 0.1 + Math.random() * 0.6;
            const gap4 = 0.1 + Math.random() * 0.6;
            const gapSize = 0.2;
            
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                
                if (!(t > gap1 && t < gap1 + gapSize)) {
                    const x1 = px + t * r;
                    const y1 = py - r + t * r;
                    w.segments.push({ x: x1, y: y1, angle: Math.PI / 4, size: wallSize, maxHealth: 30, health: 30, isDead: false });
                }

                if (!(t > gap2 && t < gap2 + gapSize)) {
                    const x2 = px + r - t * r;
                    const y2 = py + t * r;
                    w.segments.push({ x: x2, y: y2, angle: -Math.PI / 4, size: wallSize, maxHealth: 30, health: 30, isDead: false });
                }

                if (!(t > gap3 && t < gap3 + gapSize)) {
                    const x3 = px - t * r;
                    const y3 = py + r - t * r;
                    w.segments.push({ x: x3, y: y3, angle: Math.PI / 4, size: wallSize, maxHealth: 30, health: 30, isDead: false });
                }

                if (!(t > gap4 && t < gap4 + gapSize)) {
                    const x4 = px - r + t * r;
                    const y4 = py - t * r;
                    w.segments.push({ x: x4, y: y4, angle: -Math.PI / 4, size: wallSize, maxHealth: 30, health: 30, isDead: false });
                }
            }
            state.walls.push(w);
        }
    }
};

function spawnLineEnemies() {
    const numEnemies = 10;
    const dist = state.spawnRadius;
    const side = Math.floor(Math.random() * 4);
    const selectedType = enemyTypes.find(e => e.type === "standard");
    const scaledHealth = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.healthMultiplier, state.wave - 1)));
    const scaledSpeed = selectedType.baseSpeed * Math.pow(difficultyCurve.speedMultiplier, state.wave - 1);
    const scaledReward = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.rewardMultiplier, state.wave - 1)));
    
    const spacing = 40;
    const startOffset = -((numEnemies - 1) * spacing) / 2;

    for (let i = 0; i < numEnemies; i++) {
        let x, y;
        const pos = startOffset + i * spacing;

        if (side === 0) {
            x = state.planet.x + pos;
            y = state.planet.y - dist;
        } else if (side === 1) {
            x = state.planet.x + dist;
            y = state.planet.y + pos;
        } else if (side === 2) {
            x = state.planet.x + pos;
            y = state.planet.y + dist;
        } else {
            x = state.planet.x - dist;
            y = state.planet.y + pos;
        }

        if (state.gridSystem) {
            const grid = state.gridSystem;
            const gridPos = grid.worldToGrid(x, y);
            let targetCol = Math.max(0, Math.min(grid.cols - 1, gridPos.col));
            let targetRow = Math.max(0, Math.min(grid.rows - 1, gridPos.row));

            x = targetCol * grid.cellSize + grid.centerX - grid.offsetX + (grid.cellSize / 2);
            y = targetRow * grid.cellSize + grid.centerY - grid.offsetY + (grid.cellSize / 2);
        }

        state.enemies.push(new Enemy(x, y, selectedType.radius, scaledSpeed, scaledHealth, selectedType.color, scaledReward, selectedType.type));
    }
}

function update(dt) {
    if (state.phase === "map") {
        updateFloatingTexts(dt);
        return;
    }

    if (state.phase === "reward") {
        updateFloatingTexts(dt);
        return;
    }
    
    if (state.phase === "map_transition") {
        const targetNode = state.mapNodes.find(n => n.id === state.mapTargetNodeId);
        if (targetNode) {
            const dx = targetNode.x - state.mapPlayerX;
            const dy = targetNode.y - state.mapPlayerY;
            const dist = Math.hypot(dx, dy);
            const speed = 150;
            
            if (dist === 0 || dist <= speed * (dt / 1000)) {
                state.mapPlayerX = targetNode.x;
                state.mapPlayerY = targetNode.y;
                state.currentNodeId = targetNode.id;
                
                if (!targetNode.completed) {
                    state.phase = "combat";
                    state.sectorWave = 1;
                    state.wave++;
                    state.coins = [];

                    state.planet.x = state.planet.spawnX;
                    state.planet.y = state.planet.spawnY;
                    state.planet.targetX = null;
                    state.planet.targetY = null;
                    state.planet.targetNodeX = null;
                    state.planet.targetNodeY = null;
                    state.planet.isMoving = false;

                    if (state.wave % 10 === 0) {
                        state.enemiesToSpawn = 1;
                    } else if (state.wave % 10 === 1 && state.wave > 1) {
                        state.enemiesToSpawn = 5 + state.wave * 2;
                    } else {
                        if (state.wave === 1) state.enemiesToSpawn = 5;
                        else state.enemiesToSpawn += 3;
                    }

                    state.enemiesSpawned = 0;
                    WallGenerator.generate(state, state.planet.x, state.planet.y);
                    //spawnLineEnemies();

                    const offsetX = state.mapPlayerX - viewport.x;
                    const offsetY = state.mapPlayerY - viewport.y;
                    viewport.x = state.planet.x - offsetX;
                    viewport.y = state.planet.y - offsetY;
                } else {
                    state.phase = "map";
                }

                updateUI(state, upgrades);
            } else {
                state.mapPlayerX += (dx / dist) * speed * (dt / 1000);
                state.mapPlayerY += (dy / dist) * speed * (dt / 1000);
            }
        }
        updateFloatingTexts(dt);
        return;
    }

    if (!state.abilityTimers) state.abilityTimers = {};
    let externalSpeedMod = 1.0;
    let blocksTargeting = false;
    let isDiving = false;

    upgrades.filter(u => u.isAbility && state.abilities[u.id]).forEach(upg => {
        if (!state.abilityTimers[upg.id]) state.abilityTimers[upg.id] = { cooldown: 0, active: 0 };
        const timers = state.abilityTimers[upg.id];
        
        if (timers.cooldown > 0) timers.cooldown = Math.max(0, timers.cooldown - dt);
        if (timers.active > 0) {
            timers.active = Math.max(0, timers.active - dt);
            if (upg.triggerType === 'double_tap_move') {
                isDiving = true;
            }
            if (upg.speedModFn) {
                externalSpeedMod *= upg.speedModFn(timers.active, upg.activeDuration);
            }
            if (upg.blocksTargeting) {
                blocksTargeting = true;
            }
        }
    });

    if (!isDiving && state.planet.queuedTargetX !== undefined && state.planet.queuedTargetX !== null) {
        state.planet.targetX = state.planet.queuedTargetX;
        state.planet.targetY = state.planet.queuedTargetY;
        state.planet.targetNodeX = null;
        state.planet.targetNodeY = null;
        state.planet.isMoving = true;
        state.gridSystem.buildPlayerFlowField(state.planet.targetX, state.planet.targetY);
        
        state.planet.queuedTargetX = null;
        state.planet.queuedTargetY = null;
    }

    if (state.walls) {
        for (const wall of state.walls) {
            wall.update(dt);
        }
    }

    updateTurretAndWeapon(dt, blocksTargeting);

    const isAttacking = state.currentTarget !== null;
    if (state.planet.update(dt, state.gridSystem, isAttacking, state.walls, externalSpeedMod)) {
        state.gridSystem.buildFlowField(state.planet.x, state.planet.y);
    }
    
    manageSpawning(dt);
    updateEnemies(dt);
    updateMissiles(dt);
    updateEnemyMissiles(dt);
    updateCoins(dt);
    CollisionSystem.run(state, handleEnemyHit, handlePlanetHit, handleWallHit);
    updateFloatingTexts(dt);
    upgrades.forEach((upg) => upg.update(dt, state));
    processLevelUps();
}

function manageSpawning(dt) {
    if (state.phase === "map" || state.phase === "reward") return;

    if (state.isTransitioning) {
        state.waveTransitionTimer -= dt;

        if (state.waveTransitionTimer <= 0) {
            state.isTransitioning = false;

            const currentNode = state.mapNodes.find(n => n.id === state.currentNodeId);

            const advanceWave = () => {
                state.wavesCompleted++;

                if (state.sectorWave < currentNode.wavesTotal) {
                    state.sectorWave++;
                    state.wave++;

                    if (state.wave % 10 === 0) {
                        state.enemiesToSpawn = 1;
                    } else if (state.wave % 10 === 1 && state.wave > 1) {
                        state.enemiesToSpawn = 5 + state.wave * 2;
                    } else {
                        if (state.wave === 1) state.enemiesToSpawn = 5;
                        else state.enemiesToSpawn += 3;
                    }
                    state.enemiesSpawned = 0;
                } else {
                    if (currentNode && !currentNode.completed) {
                        currentNode.completed = true;
                        state.phase = "reward"; 

                        upgrades.forEach(upg => {
                            if (state.upgrades[upg.id] && state.upgrades[upg.id].level > 0 && upg.onSectorEnd) {
                                upg.onSectorEnd(state);
                            }
                        });

                        const finishSector = (rewardText) => {
                            showSectorCleared(currentNode, rewardText, () => {
                                state.phase = "map";
                                
                                const offsetX = state.planet.x - viewport.x;
                                const offsetY = state.planet.y - viewport.y;
                                viewport.x = state.mapPlayerX - offsetX;
                                viewport.y = state.mapPlayerY - offsetY;

                                updateUI(state, upgrades);
                            });
                        };

                        if (currentNode.reward && currentNode.reward.type === 'random_permanent_upgrade') {
                            let rewardText = "Reward: None";
                            const validUpgrades = upgrades.filter(u => {
                                const uState = state.upgrades[u.id];
                                return uState && uState.baseLevel < u.maxLevel && u.category !== 'abilities' && u.category !== 'perk';
                            });
                            if (validUpgrades.length > 0) {
                                const pickedUpg = validUpgrades[Math.floor(Math.random() * validUpgrades.length)];
                                const uState = state.upgrades[pickedUpg.id];
                                uState.baseLevel++;
                                uState.level++;
                                saveProgress(state);
                                state.recalculateStats(upgrades);
                                if (pickedUpg.onPurchase) pickedUpg.onPurchase(state);
                                rewardText = `Reward: Permanent ${pickedUpg.name} Upgrade!`;
                            }
                            finishSector(rewardText);
                        } else {
                            finishSector();
                        }
                    } else {
                        state.phase = "map";
                        
                        const offsetX = state.planet.x - viewport.x;
                        const offsetY = state.planet.y - viewport.y;
                        viewport.x = state.planet.x - offsetX;
                        viewport.y = state.planet.y - offsetY;
                    }
                }
                updateUI(state, upgrades);
            };

            advanceWave();
        }
        return;
    }

    state.enemySpawnTimer += dt;
    let currentSpawnDelay = Math.max(300, 1200 - state.wave * 150);

    if (state.enemySpawnTimer > currentSpawnDelay && state.enemiesSpawned < state.enemiesToSpawn) {
        spawnEnemy();
        state.enemiesSpawned++;
        state.enemySpawnTimer = 0;
    } else if (state.enemiesSpawned >= state.enemiesToSpawn && state.enemies.length === 0) {
        updateUI(state, upgrades);
        state.isTransitioning = true;
        state.waveTransitionTimer = 1500;
    }
}

function draw() {
    if (state.phase === "map" || state.phase === "map_transition") {
        const mapOffsetY = 200;
        viewport.x += (state.mapPlayerX - viewport.x) * 0.1;
        viewport.y += ((state.mapPlayerY - mapOffsetY) - viewport.y) * 0.1;
    } else {
        viewport.x += (state.planet.x - viewport.x) * 0.1;
        viewport.y += (state.planet.y - viewport.y) * 0.1;
    }
    renderer.render(state, viewport);
}

window.addEventListener("resize", resizeCanvas);

window.gameState = state;

state.initUpgradesList(upgrades);
loadProgress(state, upgrades);
initUI(state, upgrades, resetGame);
resizeCanvas();
setupInput();
resetGame();