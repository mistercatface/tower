const SKILLS = {
   MAXSTAMINA: {
      maxLevel: 10,
      xpCostMult: 500, 
      onLevelUp: (ent, lvl) => {
         const oldMax = ent.maxStamina;
         ent.maxStamina = STARTING_STAMINA + (lvl - 1) * 10; 
         ent.stamina += (ent.maxStamina - oldMax); 
         showLevelUpMessage(`[PROFICIENCY] Max Stamina Level ${lvl}/${SKILLS.MAXSTAMINA.maxLevel}: Max stamina increased to ${ent.maxStamina}`);
      }
   },
   STAMINAREGEN: {
      maxLevel: 10,
      xpCostMult: 1000, 
      onLevelUp: (ent, lvl) => {
         ent.regenRate = STARTING_STAMINA_REGEN_RATE + (lvl - 1) * 2.0;
         showLevelUpMessage(`[PROFICIENCY] Stamina Regen Level ${lvl}/${SKILLS.STAMINAREGEN.maxLevel}: Regen rate increased to ${ent.regenRate.toFixed(1)}/s`);
      }
   },
   AWARENESS: {
      maxLevel: 10,
      xpCostMult: 1000, 
      onLevelUp: (ent, lvl) => {
         const startAlpha = STARTING_AWARENESS_LEVEL;
         const totalDrop = 0.60;
         const steps = SKILLS.AWARENESS.maxLevel - 1;
         ent.awarenessLevel = startAlpha - ((lvl - 1) * (totalDrop / steps));
         showLevelUpMessage(`[PROFICIENCY] Awareness Level ${lvl}/${SKILLS.AWARENESS.maxLevel}: Fog density reduced to ${ent.awarenessLevel.toFixed(2)}`);
      }
   },
   RECOIL: {
      maxLevel: 10,
      xpCostMult: 100,
      onLevelUp: (ent, lvl) => {
         const targetRecoil = 0.03;
         const startRecoil = STARTING_RECOIL;
         const totalDrop = startRecoil - targetRecoil;
         const steps = SKILLS.RECOIL.maxLevel - 1;
         const dropPerLevel = totalDrop / steps;
         let steadied = ent.recoil <= ent.recoilAmount;
         ent.recoilAmount = startRecoil - ((lvl - 1) * dropPerLevel);
         if(steadied) ent.recoil = ent.recoilAmount;
         if(ent.id === character.id) { showLevelUpMessage(`[PROFICIENCY] Marksmanship Level ${lvl}: Weapon Stability increased.`); }
      }
   },
   VAULTSTAMINA: {
      maxLevel: 10,
      xpCostMult: 100,
      onLevelUp: (ent, lvl) => {
         const targetStamina = 5;
         const totalDrop = STARTING_VAULT_STAMINA_COST - targetStamina;
         const steps = SKILLS.VAULTSTAMINA.maxLevel - 1;
         const dropPerLevel = totalDrop / steps;
         ent.vaultStaminaCost = STARTING_VAULT_STAMINA_COST - ((lvl - 1) * dropPerLevel);
         showLevelUpMessage(`[PROFICIENCY] General Fitness Level ${lvl}/${SKILLS.VAULTSTAMINA.maxLevel}: Vault stamina cost reduced to ${ent.vaultStaminaCost.toFixed(2)}`);
      }
   },
   WALKSPEED: {
      maxLevel: 10,
      xpCostMult: 1500,
      onLevelUp: (ent, lvl) => {
         const targetSpeed = 6.0;
         const totalIncrease = targetSpeed - STARTING_WALK_SPEED;
         const steps = SKILLS.WALKSPEED.maxLevel - 1;
         const increasePerLevel = totalIncrease / steps;
         ent.walkSpeed = STARTING_WALK_SPEED + ((lvl - 1) * increasePerLevel);
         showLevelUpMessage(`[PROFICIENCY] Mobility Level ${lvl}/${SKILLS.WALKSPEED.maxLevel}: Walking speed increased to ${ent.walkSpeed.toFixed(2)}`);
      }
   },
   RUNSPEED: {
      maxLevel: 10,
      xpCostMult: 750,
      onLevelUp: (ent, lvl) => {
         const targetMultiplier = 2.0;
         const totalIncrease = targetMultiplier - STARTING_RUN_SPEED;
         const steps = SKILLS.RUNSPEED.maxLevel - 1;
         const increasePerLevel = totalIncrease / steps;
         ent.runSpeed = STARTING_RUN_SPEED + ((lvl - 1) * increasePerLevel);
         showLevelUpMessage(`[PROFICIENCY] Anaerobic Fitness ${lvl}/${SKILLS.RUNSPEED.maxLevel}: Running speed multiplier increased to ${ent.runSpeed.toFixed(2)}`);
      }
   },
   RELOADSPEED: {
      maxLevel: 10,
      xpCostMult: 250,
      onLevelUp: (ent, lvl) => {
         const targetMultiplier = 0.5;
         const totalDecrease = STARTING_RELOAD_SPEED - targetMultiplier;
         const steps = SKILLS.RELOADSPEED.maxLevel - 1;
         const decreasePerLevel = totalDecrease / steps;
         ent.reloadSpeed = STARTING_RELOAD_SPEED - ((lvl - 1) * decreasePerLevel);
         const speedIncreaseFactor = (STARTING_RELOAD_SPEED / ent.reloadSpeed) - 1;
         const speedIncreasePercent = Math.round(speedIncreaseFactor * 100);
         showLevelUpMessage(`[PROFICIENCY] Firearm Handling ${lvl}/${SKILLS.RELOADSPEED.maxLevel}: Reload ${speedIncreasePercent}% faster`);
      }
   }
};

function showLevelUpMessage(text) {
   let container = document.getElementById('notification-area');
   if (!container) {
      container = document.createElement('div');
      container.id = 'notification-area';
      elements.wrapper.appendChild(container);
   }
   const msg = document.createElement('div');
   msg.className = 'level-up-msg';
   msg.innerText = text;
   container.appendChild(msg);
   requestAnimationFrame(() => { msg.classList.add('visible'); });
   setTimeout(() => {
      msg.classList.remove('visible');
      setTimeout(() => {
         msg.remove();
         if (container.children.length === 0) { container.remove(); }
      }, 500);
   }, 5000);
}

function awardXP(ent, skillKey, amount) {
   if (!ent.skills || !ent.skills[skillKey]) return;
   const skillData = ent.skills[skillKey];
   const config = SKILLS[skillKey];
   if (skillData.level >= config.maxLevel) return;
   skillData.xp += amount;
   const xpNeeded = skillData.level * config.xpCostMult;
   if (skillData.xp >= xpNeeded) {
      skillData.xp -= xpNeeded;
      skillData.level++;
      if (config.onLevelUp) config.onLevelUp(ent, skillData.level);
   }
}