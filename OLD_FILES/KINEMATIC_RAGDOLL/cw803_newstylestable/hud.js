function drawReticle() {
   const ctx = elements.ctx;
   const rect = elements.canvas.getBoundingClientRect();
   const scaleX = elements.canvas.width / rect.width;
   const scaleY = elements.canvas.height / rect.height;
   let mouseCanvasX = (mousePos.clientX - rect.left) * scaleX;
   let mouseCanvasY = (mousePos.clientY - rect.top) * scaleY;
   mouseCanvasX += aimRecoilOffset.x;
   mouseCanvasY += aimRecoilOffset.y;
   const reticleSize = 5 + (character.recoil * 20) * (character.isCrouching ? 0.1 : 1);
   const mainColor = character.recoil > character.maxRecoil ? '#fffb00ff' : '#ff0000ff';
   ctx.strokeStyle = mainColor;
   ctx.lineWidth = 2;
   ctx.shadowBlur = 4;
   ctx.shadowColor = mainColor;
   ctx.beginPath();
   ctx.moveTo(mouseCanvasX - reticleSize, mouseCanvasY - reticleSize / 2);
   ctx.lineTo(mouseCanvasX - reticleSize, mouseCanvasY - reticleSize);
   ctx.lineTo(mouseCanvasX - reticleSize / 2, mouseCanvasY - reticleSize);
   ctx.moveTo(mouseCanvasX + reticleSize / 2, mouseCanvasY - reticleSize);
   ctx.lineTo(mouseCanvasX + reticleSize, mouseCanvasY - reticleSize);
   ctx.lineTo(mouseCanvasX + reticleSize, mouseCanvasY - reticleSize / 2);
   ctx.moveTo(mouseCanvasX + reticleSize, mouseCanvasY + reticleSize / 2);
   ctx.lineTo(mouseCanvasX + reticleSize, mouseCanvasY + reticleSize);
   ctx.lineTo(mouseCanvasX + reticleSize / 2, mouseCanvasY + reticleSize);
   ctx.moveTo(mouseCanvasX - reticleSize / 2, mouseCanvasY + reticleSize);
   ctx.lineTo(mouseCanvasX - reticleSize, mouseCanvasY + reticleSize);
   ctx.lineTo(mouseCanvasX - reticleSize, mouseCanvasY + reticleSize / 2);
   ctx.stroke();
   ctx.fillStyle = mainColor;
   ctx.beginPath();
   ctx.arc(mouseCanvasX, mouseCanvasY, 1.5, 0, Math.PI * 2);
   ctx.fill();
   ctx.shadowBlur = 0;
}

function drawObjectiveCompass() {
   return;
   const target = cultists.find(c => c.isMissionObjective && c.isLeader && !c.isDying);
   if (!target) return;
   const ctx = elements.ctx;
   const { x: vx, y: vy, width: vw, height: vh } = viewport;
   const cellSizeX = elements.canvas.width / vw;
   const cellSizeY = elements.canvas.height / vh;
   const pScreenX = (character.renderX - vx) * cellSizeX + (cellSizeX / 2);
   const pScreenY = (character.renderY - vy) * cellSizeY + (cellSizeY / 2);
   const dx = target.x - character.x;
   const dy = target.y - character.y;
   const dist = Math.sqrt(dx * dx + dy * dy);
   const angle = Math.atan2(dy, dx);
   const indicatorRadius = Math.min(elements.canvas.width, elements.canvas.height) * 0.08;
   const arrowX = pScreenX + Math.cos(angle) * indicatorRadius;
   const arrowY = pScreenY + Math.sin(angle) * indicatorRadius;
   ctx.save();
   ctx.translate(arrowX, arrowY);
   ctx.rotate(angle);
   ctx.fillStyle = '#FFD700';
   ctx.strokeStyle = 'black';
   ctx.lineWidth = 2;
   ctx.beginPath();
   ctx.moveTo(12, 0);
   ctx.lineTo(-10, 8);
   ctx.lineTo(-6, 0);
   ctx.lineTo(-10, -8);
   ctx.closePath();
   ctx.fill();
   ctx.stroke();
   ctx.rotate(-angle);
   ctx.fillStyle = '#FFFFFF';
   ctx.strokeStyle = 'black';
   ctx.lineWidth = 3;
   ctx.font = 'bold 12px sans-serif';
   ctx.textAlign = 'center';
   ctx.textBaseline = 'middle';
   const distText = Math.floor(dist) + 'm';
   ctx.strokeText(distText, 0, 20);
   ctx.fillText(distText, 0, 20);
   ctx.restore();
}

function checkStaminaExhausted() {
   if (character.stamina > 0) return;
   character.stamina = 0;
   character.isStaminaExhausted = true;
}


function updateMovement(dt) {
   if(character.dashTimer > 0) {
      TARGET_TIME_SCALE = 0.5;
      return;
   }
   TARGET_TIME_SCALE = 1.0;
   
   const up = keysDown['w'] || keysDown['arrowup'];
   const down = keysDown['s'] || keysDown['arrowdown'];
   const left = keysDown['a'] || keysDown['arrowleft'];
   const right = keysDown['d'] || keysDown['arrowright'];
   let dx = 0;
   let dy = 0;
   if (up) dy -= 1;
   if (down) dy += 1;
   if (left) dx -= 1;
   if (right) dx += 1;
   if (dx !== 0 && dy !== 0) {
      const invLen = 1 / Math.sqrt(2);
      dx *= invLen;
      dy *= invLen;
   }
   const isMoving = dx !== 0 || dy !== 0;
   const wantsToRun = keysDown['shift'];
   const wantsToCrouch = keysDown['c'];
   const DRAIN_RATE = 40.0;
   let currentSpeed = character.walkSpeed;
   let canRun = false;
   
   if (wantsToCrouch) {
      character.isCrouching = true;
      currentSpeed *= 0.5;
   } else {
      character.isCrouching = false;
   }

   if (isMoving && !character.isStaminaExhausted) {
      if (wantsToRun) {
         canRun = true;
         currentSpeed *= character.runSpeed;
         character.stamina -= DRAIN_RATE * dt;
         awardXP(character, 'MAXSTAMINA', 25.0 * dt);
         awardXP(character, 'RUNSPEED', 25.0 * dt);
      }
      checkStaminaExhausted();
      if (!character.isStaminaExhausted && character.dashCooldown <= 0.5) {
         const checkDirX = Math.round(dx);
         const checkDirY = Math.round(dy);
         if (Math.abs(checkDirX) !== Math.abs(checkDirY)) {
            const cx = Math.floor(character.x + 0.5);
            const cy = Math.floor(character.y + 0.5);
            const wallX = cx + checkDirX;
            const wallY = cy + checkDirY;
            const wallIdx = wallX + wallY * GRID_WIDTH;
            const landX = wallX + checkDirX;
            const landY = wallY + checkDirY;
            const landIdx = landX + landY * GRID_WIDTH;
            const distToWallSq = (character.x - wallX) ** 2 + (character.y - wallY) ** 2;
            if (distToWallSq < 1.0) {
               if (wallIdx >= 0 && wallIdx < GRID_SIZE && landIdx >= 0 && landIdx < GRID_SIZE) {
                  if (ObstacleGrid[wallIdx] === 3) {
                     if (ObstacleGrid[landIdx] === 0) {
                        character.isVaulting = true;
                        character.vaultTimer = 0.35;
                        character.vaultStart = { x: character.x, y: character.y };
                        character.vaultEnd = { x: landX, y: landY };
                        character.stamina -= character.vaultStaminaCost;
                        character.velocity.x = 0;
                        character.velocity.y = 0;
                        awardXP(character, 'MAXSTAMINA', 25.0 * dt);
                        awardXP(character, 'VAULTSTAMINA', 25.0);
                        return;
                     }
                  }
               }
            }
         }
      }
      checkStaminaExhausted();
   }
   if(canRun === false) {
      character.stamina += character.regenRate * dt;
      awardXP(character, 'STAMINAREGEN', 25.0 * dt);
      if (character.stamina >= character.maxStamina) {
         character.stamina = character.maxStamina;
         character.isStaminaExhausted = false;
      }
   }

   if (keysDown[' '] && character.dashCooldown <= 0) {
      const isSprinting = keysDown['shift'];
      const DASH_MAGNITUDE = isSprinting ? 6.0 : 4.0;
      let dashDirX, dashDirY;
      if (dx !== 0 || dy !== 0) {
         dashDirX = dx;
         dashDirY = dy;
         character.velocity.x = (character.velocity.x * 0.25) + (dashDirX * DASH_MAGNITUDE);
         character.velocity.y = (character.velocity.y * 0.25) + (dashDirY * DASH_MAGNITUDE);
         character.dashTimer = 1.45;
         character.dashCooldown = 1.0;
         startRoll(character.id, 1.0);
      }
   }
   else {
      const targetVX = dx * currentSpeed;
      const targetVY = dy * currentSpeed;
      const ACCEL_FACTOR = 15.0; 
      const FRICTION_FACTOR = 5.0;
      const isStopping = (dx === 0 && dy === 0);
      const currentFactor = isStopping ? FRICTION_FACTOR : ACCEL_FACTOR;
      const lerp = Math.min(1.0, currentFactor * dt);
      character.velocity.x += (targetVX - character.velocity.x) * lerp;
      character.velocity.y += (targetVY - character.velocity.y) * lerp;
      if (Math.abs(character.velocity.x) < 0.05) character.velocity.x = 0;
      if (Math.abs(character.velocity.y) < 0.05) character.velocity.y = 0;
      const speedSq = character.velocity.x ** 2 + character.velocity.y ** 2;
      if (speedSq > 0.5) { awardXP(character, 'WALKSPEED', 25.0 * dt); }
   }
}

function resizeCanvas() {
   const dpr = window.devicePixelRatio || 1;
   const width = window.innerWidth;
   const height = window.innerHeight;
   elements.canvas.style.width = width + 'px';
   elements.canvas.style.height = height + 'px';
   elements.canvas.width = width * dpr;
   elements.canvas.height = height * dpr;
   elements.ctx.scale(dpr, dpr);
   elements.ctx.imageSmoothingEnabled = false;
   const tW = Math.floor(elements.canvas.width * LIGHT_CONFIG.resolution); 
   const tH = Math.floor(elements.canvas.height * LIGHT_CONFIG.resolution);
   shadowCanvas.width = tW;
   shadowCanvas.height = tH;
   const aspect = width / height;
   viewport.height = viewport.width / aspect;
}

function drawButtons() {
   elements.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.95 : 1.05;
      setViewportZoom(viewport.width * zoomFactor);
   });
   elements.canvas.addEventListener('mousemove', e => {
      mousePos.clientX = e.clientX;
      mousePos.clientY = e.clientY;
   });
   elements.canvas.addEventListener('mousedown', () => isMouseDown = true);
   elements.canvas.addEventListener('mouseup', () => isMouseDown = false);
   elements.canvas.addEventListener('mouseleave', () => isMouseDown = false);

   document.addEventListener('keydown', e => {
      const key = e.key.toLowerCase();
      keysDown[key] = true;
      if (key === 'r') {
         const weapon = WEAPONS[character.equippedWeapon];
         if (!character.isReloading && character.currentAmmo < weapon.magSize) {
            character.isReloading = true;
            character.reloadTimer = weapon.reloadTime * character.reloadSpeed;
            awardXP(character, 'RELOADSPEED', 25);
         }
      }
      const weaponSwitchMap = {
         '1': 'PISTOL',
         '2': 'ASSAULT_RIFLE',
         '3': 'SHOTGUN',
         '4': 'SNIPER'
      };
      if (weaponSwitchMap[key]) {
         const newWeaponKey = weaponSwitchMap[key];
         if (character.equippedWeapon !== newWeaponKey) {
            character.equippedWeapon = newWeaponKey;
            const newWeaponConfig = WEAPONS[newWeaponKey];
            character.currentAmmo = newWeaponConfig.magSize;
            character.isReloading = false;
            character.reloadTimer = 0;
            character.shootTimer = 0.5;
            character.currentBurst = newWeaponConfig.burstCount;
         }
      }
   });
   document.addEventListener('keyup', e => {
      delete keysDown[e.key.toLowerCase()];
   });
   window.addEventListener('resize', () => {
      resizeCanvas();
      //renderWorldToCanvas();
   });
}