const projectiles = [];
const particles = [];
const deadBodies = [];
const DEATH_DURATION = 0.5;

function updateEntitiesDeath(deltaTime) {
   if(character.isDying) {
      character.isDying = false;
      const cell = getRandomFreeCell();
      character.x = cell.x;
      character.y = cell.y;
      character.endTile.x = cell.x;
      character.endTile.y = cell.y;
   }
    for (let i = deadBodies.length - 1; i >= 0; i--) {
        const ent = deadBodies[i];
        ent.deathTimer -= deltaTime;
        if (ent.deathTimer <= 0) { ent.deathTimer = 0; }
        const entState = ENTITY_STATES[ent.id];
        if (entState?.ragdoll?.baked) {
            console.log('baked in projectiles.js, deleting ENTITY_STATE reference.')
            const idx = LoopEntities.findIndex(e => e.id === ent.id);
            if (idx !== -1) LoopEntities.splice(idx, 1);
            deadBodies.splice(i, 1);
            delete ENTITY_STATES[ent.id];
        }
    }
}

function updateProjectiles(deltaTime, allTargets) {
    const safeDt = Math.min(deltaTime, 0.1);
    const radiusOffset = 0.5;

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];

        // --- 1. Trail Logic ---
        if (!p.isShotgun) {
            if (!p.trail) p.trail = [];
            p.trail.push({ x: p.x, y: p.y });
            if (p.trail.length > 8) p.trail.shift();
        }

        // --- 2. Movement Calculations ---
        const moveDist = p.speed * safeDt;
        const stepSize = 0.4;
        const steps = Math.ceil(moveDist / stepSize);
        
        const dxPerStep = (p.dirX * moveDist) / steps;
        const dyPerStep = (p.dirY * moveDist) / steps;
        const dzPerStep = ((p.dirZ || 0) * moveDist) / steps; 

        let projectileDestroyed = false;
        const impactDamage = p.speed * 1.25;
        const impactForce = p.speed * 0.05;

        // --- 3. Sub-Stepping Loop ---
        for (let s = 0; s < steps; s++) {
            const prevX = p.x;
            const prevY = p.y;
            
            p.x += dxPerStep;
            p.y += dyPerStep;
            if (p.z === undefined) p.z = 1.4; 
            p.z += dzPerStep;

            let hitSomething = false;

            // --- 4. ENTITY COLLISION ---
            for (const ent of allTargets) {
                if (ent.id === p.ownerId) continue;
                
                // [MODIFIED] Check if this is a ragdoll (dead/dying)
                const entState = ENTITY_STATES[ent.id];
                const isRagdoll = ent.isDying || (entState && entState.isRagdoll);

                const entCenterX = ent.x + radiusOffset;
                const entCenterY = ent.y + radiusOffset;
                const entRadius = ent.radius || 0.4; 
                const pRadius = p.radius || 0.1;

                // --- A. BROAD PHASE ---
                const distSq = (entCenterX - p.x)**2 + (entCenterY - p.y)**2;
               const hitLimit = isRagdoll ? (entRadius + 3.0) : (entRadius + 0.5);

               if (distSq > hitLimit * hitLimit) continue;

                // --- B. SHIELD LOGIC (Only for active units) ---
                if (!isRagdoll && ent.shield && ent.shield.active) {
                    const dist = Math.sqrt(distSq);
                    const threshold = ent.shield.radius + pRadius + 0.2;

                    const prevDistSq = (prevX - entCenterX)**2 + (prevY - entCenterY)**2;
                    const prevDist = Math.sqrt(prevDistSq);

                    if (prevDist >= threshold && dist < threshold) {
                         ent.shield.currentCharge -= impactDamage;
                         ent.shield.hitAngle = Math.atan2(p.y - entCenterY, p.x - entCenterX);
                         
                         const normalX = (p.x - entCenterX) / (dist || 1);
                         const normalY = (p.y - entCenterY) / (dist || 1);

                         if (ent.shield.currentCharge <= 0) {
                             ent.shield.currentCharge = 0;
                             ent.shield.active = false;
                             ent.shield.timer = ent.shield.cooldown;
                             ent.shield.fizzleTimer = 0.4;
                             notifySound(p.x, p.y, 3);
                             spawnImpact(p.x, p.y, normalX, normalY, 'ricochet');
                         } else {
                             ent.shield.flashTimer = 0.2;
                             notifySound(p.x, p.y, 1);
                             spawnImpact(p.x, p.y, normalX, normalY, 'ricochet');
                         }
                         hitSomething = true;
                         projectileDestroyed = true;
                         break; 
                    }
                }

                // --- C. NARROW PHASE (Kinematics Check) ---
                // Now works for both Animation Rig AND Ragdolls
                let boneHit = checkSkeletonHit(ent, p.x, p.y, p.z, pRadius);
               if(boneHit && ent.isDying && ent.deathTimer <= 0) {
                  console.log('rolling dice');
                  if(Math.random() < 0.99) { boneHit = false; }
               }
                if (boneHit) {
                    const normalX = (p.x - entCenterX);
                    const normalY = (p.y - entCenterY);
                    hitSomething = true;
                    
                    // --- BRANCH: RAGDOLL VS ALIVE ---
                    if (isRagdoll) {
                        // [NEW] Hit an existing ragdoll
                        // Force calculation: Bullet Dir * Power
                        // Vertical force: slightly up to lift body
                        const rForceX = p.dirX * (p.speed * 1.5);
                        const rForceZ = p.dirY * (p.speed * 1.5);
                        const rForceY = -5.0; // Lift

                        applyRagdollImpulse(ent.id, rForceX, rForceY, rForceZ, boneHit.part, impactDamage, boneHit.offsetT);                
                        spawnImpact(p.x, p.y, normalX, normalY, 'red'); // Blood
                        
                    } else {
                        // [OLD] Hit a live entity
                        if (ent.velocity) {
                            ent.velocity.x += p.dirX * impactForce;
                            ent.velocity.y += p.dirY * impactForce;
                            const maxKnockback = 6.0;
                            const currentSpeed = Math.hypot(ent.velocity.x, ent.velocity.y);
                            if (currentSpeed > maxKnockback) {
                                const scale = maxKnockback / currentSpeed;
                                ent.velocity.x *= scale;
                                ent.velocity.y *= scale;
                            }
                        }

                        let damageMult = 1.0;
                        if (boneHit.part === 'head') damageMult = 4.0;
                        else if (boneHit.part.includes('Leg')) damageMult = 0.6;
                        else if (boneHit.part.includes('Arm')) damageMult = 0.5;

                        const finalDamage = impactDamage * damageMult;

                        // Stick Projectile
                        if (!ent.stuckProjectiles) ent.stuckProjectiles = [];
                        ent.stuckProjectiles.push({
                            part: boneHit.part,
                            offsetT: boneHit.offsetT
                        });
                        if (ent.stuckProjectiles.length > 6) ent.stuckProjectiles.shift();

                        // Handle Death logic...
                        if (ent.id !== character.id) {
                            ent.isDying = true;
                            ent.timeOfDeath = Date.now();
                            ent.deathTimer = DEATH_DURATION;

                            const ragdollForce = Math.max(12, p.speed / 1.2) * damageMult;
                            startRagdoll(ent.id, ent, ent.rotation, p.dirX, p.dirY, ragdollForce); 

                           deadBodies.push(ent);

                            const state = ENTITY_STATES[ent.id];
                            if (state && state.ragdoll) {
                                if (boneHit.part === 'head' || finalDamage > 20) {
                                    severLimb(state, boneHit.part);
                                }
                            }
                        }
                        
                        if (boneHit.part === 'head') {
                             spawnImpact(p.x, p.y, normalX, normalY, 'red');
                             if (p.ownerId === character.id) awardXP(character, 'ACCURACY', 50.0);
                        } else {
                             spawnImpact(p.x, p.y, normalX, normalY, 'red');
                             if (p.ownerId === character.id) awardXP(character, 'RECOIL', 25.0);
                        }
                    }

                    break; // Bullet used up on this entity
                }
            }

            if (hitSomething) {
                projectileDestroyed = true;
                break;
            }

            // --- 5. WALL COLLISION ---
            const tileX = Math.floor(p.x);
            const tileY = Math.floor(p.y);
            const idx = tileX + (tileY * GRID_WIDTH);
            
            if ((tileX < 0 || tileX >= GRID_WIDTH || tileY < 0 || tileY >= GRID_HEIGHT || 
                 ObstacleGrid[idx] === 1 || ObstacleGrid[idx] === 3)) {
                
                let didRicochet = false;

                if (tileX >= 0 && tileX < GRID_WIDTH && tileY >= 0 && tileY < GRID_HEIGHT) {
                    const prevTileX = Math.floor(prevX);
                    const prevTileY = Math.floor(prevY);
                    let normalX = 0;
                    let normalY = 0;

                    if (tileX !== prevTileX) {
                        const adjIdx = tileX + prevTileY * GRID_WIDTH;
                        if (ObstacleGrid[adjIdx] === 1 || ObstacleGrid[adjIdx] === 3) {
                             normalX = (prevTileX < tileX) ? -1 : 1;
                        }
                    }
                    if (tileY !== prevTileY) {
                        const adjIdx = prevTileX + tileY * GRID_WIDTH;
                        if (ObstacleGrid[adjIdx] === 1 || ObstacleGrid[adjIdx] === 3) {
                             normalY = (prevTileY < tileY) ? -1 : 1;
                        }
                    }
                    if (normalX === 0 && normalY === 0) {
                        normalX = -p.dirX;
                        normalY = -p.dirY;
                    }
                    const dotProduct = (p.dirX * normalX) + (p.dirY * normalY);
                    const RICOCHET_THRESHOLD = 0.1;

                    if (Math.abs(dotProduct) < RICOCHET_THRESHOLD) {
                        if (normalX !== 0) p.dirX *= -1;
                        if (normalY !== 0) p.dirY *= -1;
                        p.x = prevX;
                        p.y = prevY;
                        spawnImpact(p.x, p.y, normalX, normalY, 'ricochet');
                        notifySound(p.x, p.y, 3);
                        didRicochet = true;
                    } else {
                        p.lastNormalX = normalX;
                        p.lastNormalY = normalY;
                    }
                }

                if (!didRicochet) {
                    const normalX = p.lastNormalX !== undefined ? p.lastNormalX : -p.dirX;
                    const normalY = p.lastNormalY !== undefined ? p.lastNormalY : -p.dirY;
                    spawnImpact(p.x, p.y, normalX, normalY, 'default');
                    projectileDestroyed = true;
                    break;
                }
            }
        } 

        if (projectileDestroyed) {
            p.alive = false;
            projectiles.splice(i, 1);
        }
    }
}

function spawnImpact(x, y, normalX = 0, normalY = 0, colorType = 'default') {
   // Ricochets shouldn't happen on every bullet to reduce noise, 
   // but since we are doing pixel art, concise bursts are fine.
   if (colorType !== 'ricochet') notifySound(x, y, 3);
   
   // Pixel art looks better with fewer, more distinct particles
   const particleCount = colorType === 'ricochet' ? 3 : 4;
   
   for (let i = 0; i < particleCount; i++) {
      let baseAngle;
      
      if (colorType === 'ricochet') {
         // Reflect angle slightly for ricochets
         baseAngle = Math.atan2(normalY, normalX);
      } else {
         // Omni-directional burst for standard hits
         baseAngle = Math.random() * Math.PI * 2;
      }

      // Wider spread for messy pixel look
      const spread = (Math.random() - 0.5) * 2.0; 
      const angle = baseAngle + spread;
      
      // Fast burst speed
      const speed = Math.random() * 8 + 4;
      
      let pColor;
      // Pixel Palette Colors
      if (colorType === 'red') {
         pColor = Math.random() > 0.5 ? '#b81414' : '#7a0909'; // Chunky red/dark red
      } else if (colorType === 'ricochet') {
         pColor = Math.random() > 0.5 ? '#ffffff' : '#aaddff'; // White/Cyan hot sparks
      } else {
         pColor = Math.random() > 0.5 ? '#fffebb' : '#ffaa00'; // Yellow/Orange sparks
      }
      
      particles.push({
         type: colorType === 'red' ? 'blood_pixel' : 'spark_pixel', // New Types
         x: x,
         y: y,
         vx: Math.cos(angle) * speed,
         vy: Math.sin(angle) * speed,
         life: 0.3 + Math.random() * 0.2, // Short life (snap)
         decay: 3.0,
         color: pColor,
         size: Math.random() > 0.5 ? 2 : 1 // Variation in pixel size
      });
   }
}

function updateParticles(deltaTime) {
   for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vx *= 0.90;
      p.vy *= 0.90;
      p.life -= deltaTime * p.decay;
      if (p.life <= 0) {
         particles.splice(i, 1);
      }
   }
}

function shootFireball(ent, angle, weaponConfig, startX, startY) {
   const realSX = startX !== undefined ? startX : ent.x + 0.5;
   const realSY = startY !== undefined ? startY : ent.y + 0.5;
   
   particles.push({
       type: 'flash',
       x: realSX, y: realSY, vx: 0, vy: 0, life: 0.1, decay: 10.0,
       color: '#FFFFFF', widthMultiplier: 4.0,
       shadowColor: weaponConfig.projectileColor ? `rgb(${weaponConfig.projectileColor})` : '#FFAA00'
   });

   if (!weaponConfig.isShotgun || Math.random() > 0.5) {
       particles.push({
            type: 'smoke', x: realSX, y: realSY,
            vx: Math.cos(angle) * 0.5 + (Math.random() - 0.5),
            vy: Math.sin(angle) * 0.5 + (Math.random() - 0.5),
            life: 0.4 + Math.random() * 0.3, decay: 2.0,
            color: '#AAAAAA', alpha: 0.6, widthMultiplier: 1.5
       });
   }

   const entState = ENTITY_STATES[ent.id];
   const muzzleZ = (entState && entState.crouchFactor > 0.5) ? 0.5 : 1.0;

   const currentRecoil = ent.recoil;
   const pellets = weaponConfig.isShotgun ? 12 : 1;
   
   for (let i = 0; i < pellets; i++) {
      const spread = (Math.random() - 0.5) * (currentRecoil + weaponConfig.accuracy);
      const finalAngle = angle + spread;
      const dirX = Math.cos(finalAngle);
      const dirY = Math.sin(finalAngle);
      
      projectiles.push({
         x: realSX,
         y: realSY,
         z: muzzleZ,
         dirX: dirX,
         dirY: dirY,
         dirZ: (Math.random() - 0.5) * 0.05, 
         speed: weaponConfig.projectileSpeed,
         color: weaponConfig.projectileColor,         
         alive: true,
         radius: 0.1,
         ownerId: ent.id,
         isShotgun: weaponConfig.isShotgun,
         spawnTime: performance.now() 
      });
   }
   ent.recoil += weaponConfig.recoilAdd;
}

function drawParticles() {
   const ctx = elements.ctx;
   const { x: vx, y: vy, width: vw, height: vh } = viewport;
   const cellSizeX = elements.canvas.width / vw;
   const cellSizeY = elements.canvas.height / vh;

   for (const p of particles) {
      if (p.x < vx - 1 || p.x > vx + vw + 1 || p.y < vy - 1 || p.y > vy + vh + 1) continue;
      
      const px = (p.x - vx) * cellSizeX;
      const py = (p.y - vy) * cellSizeY;
      
      ctx.globalAlpha = (p.alpha !== undefined) ? Math.min(p.alpha, p.life) : p.life;
      
      // --- MUZZLE FLASH ---
      if (p.type === 'flash') {
          ctx.shadowBlur = 0; // Remove blur for crisp pixel look
          ctx.fillStyle = p.color;
          ctx.beginPath();
          const r = p.widthMultiplier * 2; 
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          continue; 
      }

      // --- GUN SMOKE (Dithered or chunky) ---
      if (p.type === 'smoke') {
          ctx.fillStyle = p.color;
          const size = (p.widthMultiplier || 1) * 3 * (1 - p.life * 0.3);
          // Draw as a square puff
          ctx.fillRect(px - size/2, py - size/2, size, size);
          continue;
      }

      // --- PIXEL SPARKS & BLOOD ---
      if (p.type === 'spark_pixel' || p.type === 'blood_pixel') {
          ctx.fillStyle = p.color;
          
          // Calculate pixel size relative to screen
          // We want chunky pixels, so we ceil() the value
          let size = Math.ceil((p.size || 1) * (cellSizeX / 32)); 
          size = Math.max(2, size); // Minimum 2x2 pixels for visibility

          ctx.fillRect(Math.floor(px), Math.floor(py), size, size);
          continue;
      }

      // --- LEGACY FALLBACK (If needed) ---
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - p.vx * 0.05 * cellSizeX, py - p.vy * 0.05 * cellSizeY);
      ctx.stroke();
   }
   
   ctx.globalAlpha = 1.0;
   ctx.shadowBlur = 0;
}

function drawProjectiles() {
   const ctx = elements.ctx;
   const { x: vx, y: vy, width: vw, height: vh } = viewport;
   const cellSizeX = elements.canvas.width / vw;
   const cellSizeY = elements.canvas.height / vh;
   
   ctx.lineCap = 'butt';

   const now = performance.now();

   for (const p of projectiles) {
      if (p.x < vx - 1 || p.x > vx + vw + 1 || p.y < vy - 1 || p.y > vy + vh + 1) continue;

      // --- FADE IN LOGIC ---
      const age = now - p.spawnTime;
      
      // 1. Invisible for first frame (prevents overlapping gun)
      if (age < 15) continue; 

      // 2. Quick Fade In (15ms to 60ms)
      // This hides the tail popping in inside the chest
      let alpha = 1.0;
      if (age < 60) {
          alpha = (age - 15) / 45;
      }
      ctx.globalAlpha = alpha;

      const screenX = (p.x - vx) * cellSizeX;
      const screenY = (p.y - vy) * cellSizeY;
      
      if (p.isShotgun) {
         // --- SHOTGUN PELLETS ---
         const pelletLen = 0.2 * cellSizeX;
         const tailX = screenX - (p.dirX * pelletLen);
         const tailY = screenY - (p.dirY * pelletLen);

         ctx.strokeStyle = '#000000';
         ctx.lineWidth = 3;
         ctx.beginPath();
         ctx.moveTo(screenX, screenY);
         ctx.lineTo(tailX, tailY);
         ctx.stroke();

         ctx.strokeStyle = '#FFDD88'; 
         ctx.lineWidth = 1;
         ctx.beginPath();
         ctx.moveTo(screenX, screenY);
         ctx.lineTo(tailX, tailY);
         ctx.stroke();

      } else {
         // --- RIFLE/PISTOL TRACERS ---
         // Reverted to simple fixed length
         const traceLen = 0.25 * cellSizeX; 
         
         const tailX = screenX - (p.dirX * traceLen);
         const tailY = screenY - (p.dirY * traceLen);

         // Outline
         ctx.strokeStyle = '#000000';
         ctx.lineWidth = 2.5; 
         ctx.beginPath();
         ctx.moveTo(screenX, screenY);
         ctx.lineTo(tailX, tailY);
         ctx.stroke();

         // Core
         ctx.strokeStyle = '#FFFFEE'; 
         ctx.lineWidth = 1.5; 
         ctx.beginPath();
         ctx.moveTo(screenX, screenY);
         ctx.lineTo(tailX, tailY);
         ctx.stroke();
      }
   }
   
   // Reset alpha for safety
   ctx.globalAlpha = 1.0;
}