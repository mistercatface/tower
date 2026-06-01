const lightCanvas = document.createElement('canvas');
const lightCtx = lightCanvas.getContext('2d');
const MAX_RAYS_PER_ENTITY = 360;
const STATIC_RAY_BUFFER = Array.from({ length: MAX_RAYS_PER_ENTITY }, () => ({ x: 0, y: 0 }));
const RAY_RESULT_POOL = new Array(MAX_RAYS_PER_ENTITY * 2).fill(null).map(() => ({ 
    x: 0, 
    y: 0, 
    dist: 0, 
    mapX: 0, 
    mapY: 0, 
    hitContent: 0, 
    angle: 0,
    result: null
}));
const COLOR_CACHE = new Map();

function lerp(start, end, amt) {
   return (1 - amt) * start + amt * end;
}

function hexToRGB(hex) {
   const cleanHex = hex.replace('#', '');
   const bigint = parseInt(cleanHex, 16);
   if (cleanHex.length === 8) {
       return {
           r: (bigint >> 24) & 255,
           g: (bigint >> 16) & 255,
           b: (bigint >> 8) & 255
       };
   }
   return {
       r: (bigint >> 16) & 255,
       g: (bigint >> 8) & 255,
       b: bigint & 255
   };
}
function hexToRgba(hex, alpha) {
   if (!hex) return 'rgba(255, 0, 0, 1)';
   const a = Math.round(alpha * 10) / 10;
   const key = hex + a;
   if (COLOR_CACHE.has(key)) return COLOR_CACHE.get(key);
   const r = parseInt(hex.slice(1, 3), 16);
   const g = parseInt(hex.slice(3, 5), 16);
   const b = parseInt(hex.slice(5, 7), 16);
   const res = `rgba(${r}, ${g}, ${b}, ${a})`;
   COLOR_CACHE.set(key, res);
   return res;
}

function getShieldRGB(current, max) {
   const safeMax = (max && max > 0) ? max : 100;
   const safeCur = (current !== undefined) ? current : 0;
   const pct = Math.max(0, Math.min(1, safeCur / safeMax));
   let r, g, b = 0;
   if (pct < 0.5) {
      r = 255;
      g = Math.floor(255 * (pct * 2));
   } else {
      r = Math.floor(255 * ((1.0 - pct) * 2));
      g = 255;
   }
   return { r, g, b };
}

function drawEntity(entity, deltaTime) {
   const ctx = elements.ctx;
   const { x: vx, y: vy, width: vw, height: vh } = viewport;
   if (entity.x < vx - 2 || entity.x > vx + vw + 2 || entity.y < vy - 2 || entity.y > vy + vh + 2) return;
   const cellSizeX = elements.canvas.width / vw;
   const cellSizeY = elements.canvas.height / vh;
   const px = (entity.renderX - vx) * cellSizeX;
   const py = (entity.renderY - vy) * cellSizeY;
   const destW = cellSizeX;
   const destH = cellSizeY;
   const centerX = px + destW * 0.5;
   let centerY = py + destH * 0.5;
   let sinkOffset = 0;
   if (entity.isDying) {
      if (entity.falling) {
         const maxFallTime = 1.0;
         const rawProgress = 1.0 - (entity.deathTimer / maxFallTime);
         const progress = Math.max(0, Math.min(1, rawProgress));
         const ease = progress * progress;
         fallScale = Math.max(0.1, 1.0 - (ease * 0.9));
         fallDrop = destH * ease;
         whiteAmount = 0;
      } else {
         const elapsedTime = DEATH_DURATION - entity.deathTimer;
         whiteAmount = Math.min(1.0, elapsedTime * 3.0);
      }
   }
   if (entity.isVaulting) {
      const totalTime = 0.35;
      const progress = 1.0 - (entity.vaultTimer / totalTime);
      const height = Math.sin(progress * Math.PI) * (destH * 0.4);
      sinkOffset = -height;
      centerY += sinkOffset;
   }
   if (entity.id === character.id) {
      const rect = elements.canvas.getBoundingClientRect();
      const scaleX = elements.canvas.width / rect.width;
      const scaleY = elements.canvas.height / rect.height;
      const mx = (mousePos.clientX - rect.left) * scaleX;
      const my = (mousePos.clientY - rect.top) * scaleY;
      const dx = mx - centerX;
      const dy = my - centerY;
      entity.rotation = Math.atan2(dy, dx);
   }
   const mainSprite = getSprite(entity, deltaTime);
   if (entity.shield && !entity.isDying) {
      ctx.save();
      ctx.translate(centerX, centerY);
      const radiusPx = entity.shield.radius * cellSizeX;
      const baseShieldColor = entity.shield.color || '#000000ff';
      if (entity.shield.fizzleTimer > 0) {
         const maxTime = 0.4;
         const pct = 1.0 - (entity.shield.fizzleTimer / maxTime);
         ctx.globalAlpha = 1.0 - (pct * 1.5);
         ctx.globalCompositeOperation = 'lighter';
         if (pct < 0.2) {
            ctx.beginPath(); ctx.arc(0, 0, radiusPx * (1.0 + pct * 0.5), 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = Math.max(0, 0.8 - pct * 4); ctx.fill();
         }
         ctx.globalAlpha = Math.max(0, 0.5 - pct * 0.5);
         ctx.beginPath(); ctx.arc(0, 0, radiusPx * (1.0 + pct * 0.5), 0, Math.PI * 2);
         ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3 * (1 - pct);
         ctx.shadowColor = baseShieldColor; ctx.shadowBlur = 10 * (1 - pct); ctx.stroke();
         ctx.globalCompositeOperation = 'source-over';
         ctx.globalAlpha = 1.0;
      } else if (entity.shield.active) {
         ctx.globalCompositeOperation = 'lighter';
         ctx.beginPath(); ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
         ctx.strokeStyle = baseShieldColor; ctx.lineWidth = 2.0;
         ctx.shadowColor = baseShieldColor; ctx.shadowBlur = 10; ctx.stroke();
         const healthPct = entity.shield.currentCharge / entity.shield.maxCharge;
         if (healthPct < 0.3) {
            const pulse = Math.abs(Math.sin(Date.now() / 100));
            ctx.globalAlpha = pulse * 0.5; ctx.fillStyle = baseShieldColor; ctx.fill(); ctx.globalAlpha = 1.0;
         } else {
            ctx.fillStyle = hexToRgba(baseShieldColor, 0.1); ctx.fill();
         }
         if (entity.shield.flashTimer > 0) {
            ctx.rotate(entity.shield.hitAngle);
            ctx.beginPath(); ctx.arc(0, 0, radiusPx, -Math.PI / 4, Math.PI / 4);
            ctx.strokeStyle = '#ffe600ff'; ctx.lineWidth = 6; ctx.shadowColor = '#ff0000ff'; ctx.shadowBlur = 15; ctx.stroke();
         }
         ctx.globalCompositeOperation = 'source-over';
      } else {
         const pct = 1.0 - (entity.shield.timer / entity.shield.cooldown);
         ctx.shadowBlur = 0; ctx.fillStyle = baseShieldColor; ctx.globalAlpha = 0.5 + (pct * 0.5);
         const baseRotation = (Date.now() / 500) % (Math.PI * 2);
         const numParticles = 30;
         for (let i = 0; i < numParticles; i++) {
            const angle = (i / numParticles) * Math.PI * 2 + baseRotation;
            const dx = Math.cos(angle) * radiusPx; const dy = Math.sin(angle) * radiusPx;
            ctx.beginPath(); ctx.arc(dx, dy, 0.5 + Math.random() * 0.8, 0, Math.PI * 2); ctx.fill();
         }
         ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = baseShieldColor; ctx.shadowBlur = 10; ctx.globalAlpha = pct * 0.3;
         ctx.beginPath(); ctx.arc(0, 0, radiusPx * 0.8, 0, Math.PI * 2); ctx.fill();
         ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
   }
   ctx.globalAlpha = 1.0;
   ctx.save();
   ctx.translate(centerX, centerY);
   if (entity.falling) {
      const fallDuration = 1.5;
      const fallProgress = 1.0 - (entity.deathTimer / fallDuration);
      const scale = Math.max(0.01, 1.0 - fallProgress);
      ctx.scale(scale, scale);
      ctx.rotate(fallProgress * Math.PI * 2); 
   }
   const scale = mainSprite.drawRatio;
   const dW = destW * scale; 
   const dH = destH * scale;
   const spriteScaleRatio = dW / mainSprite.width;
   const vShiftRaw = mainSprite.verticalShift || 0;
   const vShiftScaled = vShiftRaw * spriteScaleRatio;
   ctx.drawImage(mainSprite, -dW / 2, (-dH / 2) - vShiftScaled, dW, dH);
   ctx.restore();
   ctx.globalAlpha = 1.0;
}
function lerpAngle(current, target, factor) {
    let diff = target - current;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return current + diff * factor;
}

function drawAllVisionCones(entities) {
   const LIGHT_SCALE = 0.5;
   const targetWidth = elements.canvas.width * LIGHT_SCALE;
   const targetHeight = elements.canvas.height * LIGHT_SCALE;
   
   if (lightCanvas.width !== targetWidth || lightCanvas.height !== targetHeight) {
      lightCanvas.width = targetWidth;
      lightCanvas.height = targetHeight;
   }

   lightCtx.save();
   lightCtx.scale(LIGHT_SCALE, LIGHT_SCALE);

   lightCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
   lightCtx.globalCompositeOperation = 'source-over';
   lightCtx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
   
   lightCtx.globalCompositeOperation = 'hard-light';

   const { x: vx, y: vy, width: vw, height: vh } = viewport;
   const cellSizeX = elements.canvas.width / vw;
   const cellSizeY = elements.canvas.height / vh;
   
   // Subtle hum based on time, not random noise
   const time = Date.now();
   const voltageHum = 0.9 + (Math.sin(time * 0.002) * 0.03); 

   for (const entity of entities) {
      if (entity.isDying) continue;
      // Loose bounds checking
      if (entity.x < vx - 20 || entity.x > vx + vw + 20 || entity.y < vy - 20 || entity.y > vy + vh + 20) continue;
      
      const profile = VISION_PROFILES[entity.currentProfile] || VISION_PROFILES['CASUAL'];
      
      // --- STRICT ANIMATION STATE ---
      if (!entity.visAnim) {
          const startRGB = hexToRGB(profile.color);
          entity.visAnim = { 
              range: profile.range, 
              fov: profile.fov, 
              r: startRGB.r, g: startRGB.g, b: startRGB.b,
              x: entity.x, y: entity.y, facing: entity.facing || 0
          };
      }

      // --- 1. SET TARGETS ---
      const targetX = entity.renderX !== undefined ? entity.renderX : entity.x;
      const targetY = entity.renderY !== undefined ? entity.renderY : entity.y;
      const targetFacing = entity.facing !== undefined ? entity.facing : 0;
      const targetRGB = hexToRGB(profile.color);

      // --- 2. APPLY STRICT LERP (HEAVY DAMPING) ---
      // Low numbers = Heavy weight, slow catch up (Smooth)
      // High numbers = Snappy, jittery (Jerky)
      const POS_LERP = 0.1;  
      const ROT_LERP = 0.08; // Very strict rotation lag
      const COLOR_LERP = 0.05;

      // Position
      entity.visAnim.x = lerp(entity.visAnim.x, targetX, POS_LERP);
      entity.visAnim.y = lerp(entity.visAnim.y, targetY, POS_LERP);
      
      // Rotation
      entity.visAnim.facing = lerpAngle(entity.visAnim.facing, targetFacing, ROT_LERP);
      
      // Color/Shape
      entity.visAnim.range = lerp(entity.visAnim.range, profile.range, COLOR_LERP);
      entity.visAnim.fov = lerp(entity.visAnim.fov, profile.fov, COLOR_LERP);
      entity.visAnim.r = lerp(entity.visAnim.r, targetRGB.r, COLOR_LERP);
      entity.visAnim.g = lerp(entity.visAnim.g, targetRGB.g, COLOR_LERP);
      entity.visAnim.b = lerp(entity.visAnim.b, targetRGB.b, COLOR_LERP);

      // --- 3. DEADZONE STABILIZATION (Stops Breathing) ---
      // If we are extremely close to the target, snap to it. 
      // This stops the "micro-jitter" calculation errors when standing still.
      if (Math.abs(entity.visAnim.x - targetX) < 0.01) entity.visAnim.x = targetX;
      if (Math.abs(entity.visAnim.y - targetY) < 0.01) entity.visAnim.y = targetY;
      
      // --- 4. HIGH DENSITY RAYCAST ---
      // We perform the raycast using the *Smoothed* (visAnim) values.
      const realX = entity.x; const realY = entity.y; const realFacing = entity.facing;
      
      entity.x = entity.visAnim.x;
      entity.y = entity.visAnim.y;
      entity.facing = entity.visAnim.facing;

      // DENSITY: If 'density' is step size, make it small (0.5). If it is rays-per-degree, make it high.
      // Assuming typical implementation where higher number = more rays or finer step.
      // Doubling typical density helps catch wall corners smoothly.
      const density = 8.0; 
      
      const pointCount = computeVisionPolygon(entity, entity.visAnim.fov, entity.visAnim.range, density);
      
      // Reset physics
      entity.x = realX; entity.y = realY; entity.facing = realFacing;
      
      if (pointCount < 2) continue;

      // --- 5. DRAWING ---
      // We floor the Origin to lock it to the pixel grid
      const sourceScreenX = Math.floor(((entity.visAnim.x + 0.5) - vx) * cellSizeX);
      const sourceScreenY = Math.floor(((entity.visAnim.y + 0.5) - vy) * cellSizeY);
      const radiusPx = entity.visAnim.range * cellSizeX;

      const r = Math.floor(entity.visAnim.r);
      const g = Math.floor(entity.visAnim.g);
      const b = Math.floor(entity.visAnim.b);

      lightCtx.save();
      lightCtx.beginPath();
      // Round joins prevent spikes when vertices get close
      lightCtx.lineJoin = 'round';

      if (entity.visAnim.fov > 6.0) {
         lightCtx.arc(sourceScreenX, sourceScreenY, radiusPx, 0, Math.PI * 2);
      } else {
         lightCtx.moveTo(sourceScreenX, sourceScreenY);
         for (let i = 0; i < pointCount; i++) {
            const p = STATIC_RAY_BUFFER[i];
            // DO NOT floor ray tips. Let the canvas anti-alias the wall slides.
            lightCtx.lineTo((p.x - vx) * cellSizeX, (p.y - vy) * cellSizeY);
         }
      }
      lightCtx.closePath();

      // Clip & Fill
      lightCtx.clip();
      
      const gradient = lightCtx.createRadialGradient(sourceScreenX, sourceScreenY, 0, sourceScreenX, sourceScreenY, radiusPx);
      const alpha = 0.5 * voltageHum; // Slightly higher base opacity for grit
      
      gradient.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`); // Harder falloff
      gradient.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);
      
      lightCtx.fillStyle = gradient;
      lightCtx.fill();

      // Scanlines
      if (typeof SCANLINE_PATTERN !== 'undefined' && SCANLINE_PATTERN) {
         lightCtx.globalCompositeOperation = 'source-atop';
         lightCtx.fillStyle = SCANLINE_PATTERN;
         lightCtx.save(); 
         lightCtx.translate(Math.floor(-vx*cellSizeX), Math.floor(-vy*cellSizeY));
         lightCtx.fillRect(Math.floor(vx*cellSizeX) + sourceScreenX - radiusPx, Math.floor(vy*cellSizeY) + sourceScreenY - radiusPx, radiusPx * 2, radiusPx * 2);
         lightCtx.restore();
      }
      lightCtx.restore();

      // Outline
      lightCtx.beginPath();
      lightCtx.lineJoin = 'round';
      if (entity.visAnim.fov > 6.0) {
         lightCtx.arc(sourceScreenX, sourceScreenY, radiusPx, 0, Math.PI * 2);
      } else {
         lightCtx.moveTo(sourceScreenX, sourceScreenY);
         for (let i = 0; i < pointCount; i++) {
            const p = STATIC_RAY_BUFFER[i];
            lightCtx.lineTo((p.x - vx) * cellSizeX, (p.y - vy) * cellSizeY);
         }
         lightCtx.closePath();
      }
      
      // Low opacity outline to define shape without being distracting
      lightCtx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
      lightCtx.lineWidth = 1;
      lightCtx.stroke();
   }
   
   lightCtx.restore();

   const ctx = elements.ctx;
   ctx.save();
   ctx.globalCompositeOperation = 'source-over'; 
   ctx.drawImage(lightCanvas, 0, 0, elements.canvas.width, elements.canvas.height);
   ctx.restore();
}