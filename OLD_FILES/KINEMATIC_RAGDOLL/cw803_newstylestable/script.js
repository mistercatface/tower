let REGION_DEBUG_ON = false;
let AITarget = { x: 0, y: 0 };
let currentID = 0;
let cultists = [];
const elements = {
   wrapper: document.getElementById('wrapper'),
   canvas: document.getElementById('gameCanvas'),
   ctx: document.getElementById('gameCanvas').getContext('2d'),
};
let mousePos = { clientX: 0, clientY: 0 };
let isMouseDown = false;
const keysDown = {};

let aimRecoilOffset = { x: 0, y: 0 };
let viewport = { x: 0, y: 0, width: 0, height: 0 };

const ObstacleGrid = new Uint8Array(GRID_SIZE);
let lastVisible = new Uint8Array(GRID_SIZE);
let cells = new Array(GRID_SIZE);
let freeCells = [];
let lastTime = performance.now();
let lastFrame = lastTime;
let lastPhysicsTime = performance.now(); 
let lastGameDelta = 0.016;
let character;
let globalDists = new Float32Array(GRID_SIZE);
let isGameInitialized = false;
let patrolTimer = 0;
const AI_UPDATE_INTERVAL = 0.25;
const SHARED_FORCE = { x: 0, y: 0 };

const SPATIAL_WIDTH = GRID_WIDTH;
const SPATIAL_HEIGHT = GRID_HEIGHT;
const SPATIAL_SIZE = SPATIAL_WIDTH * SPATIAL_HEIGHT;
const MAX_ENTITIES_LIMIT = 500000;
const spatial_gridHead = new Int32Array(SPATIAL_SIZE).fill(-1);
const spatial_entityNext = new Int32Array(MAX_ENTITIES_LIMIT).fill(-1);
let entity_pool_count = 0;
const ChaseVectorMap = new Float32Array(GRID_SIZE * 2);
let globalFrameCount = 0;

let BOUNCE_FACTOR = 0.5;

let LoopEntities = [];

let shieldPickups = [];
const SHIELD_PICKUP_TEMPLATE = {
   radius: 0.3,
   color: '#00ff6aff',
   type: 'SHIELD',
   //duration: 30.0,
   id: 0,
};

const gradientCache = new Map();
const getRadialGradient = (ctx, x, y, r, palette) => {
   const key = `${palette.light}-${palette.base}-${palette.dark}`;
   let cached = gradientCache.get(key);
   if (!cached) {
      cached = [
         [0, '#fff'],
         [0.2, palette.light],
         [0.6, palette.base],
         [1, palette.dark]
      ];
      gradientCache.set(key, cached);
   }
   const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.05, x, y, r);
   cached.forEach(([stop, color]) => g.addColorStop(stop, color));
   return g;
};

const SpatialManager = {
   queryResult: [],
   rebuild(entities) {
      spatial_gridHead.fill(-1);
      for (let i = 0; i < entities.length; i++) {
         const ent = entities[i];
         if(!ent.isDying) {
            ent._physId = i;
            const gx = ent.endTile.x;
            const gy = ent.endTile.y;
            if (gx >= 0 && gx < SPATIAL_WIDTH && gy >= 0 && gy < SPATIAL_HEIGHT) {
               const idx = gx + gy * SPATIAL_WIDTH;
               spatial_entityNext[i] = spatial_gridHead[idx];
               spatial_gridHead[idx] = i;
            } else {
               spatial_entityNext[i] = -1;
            }
         }
      }
   },
   getNeighbors(ent, allEntities) {
      this.queryResult.length = 0;
      const cx = ent.endTile.x;
      const cy = ent.endTile.y;
      for (let y = cy - 1; y <= cy + 1; y++) {
         if (y < 0 || y >= SPATIAL_HEIGHT) continue;
         const yOffset = y * SPATIAL_WIDTH;
         for (let x = cx - 1; x <= cx + 1; x++) {
            if (x < 0 || x >= SPATIAL_WIDTH) continue;
            let neighborID = spatial_gridHead[x + yOffset];
            while (neighborID !== -1) {
               const other = allEntities[neighborID];
               if (other && neighborID !== ent._physId) {
                  this.queryResult.push(other);
               }
               neighborID = spatial_entityNext[neighborID];
            }
         }
      }
      return this.queryResult;
   }
};

// --- NEW FUNCTION: Draws all shield pickups ---
function drawPickups() {
    const ctx = elements.ctx;
    const { x: vx, y: vy, width: vw, height: vh } = viewport;
    const cellSizeX = elements.canvas.width / vw;
    const cellSizeY = elements.canvas.height / vh;
    
    for (const pickup of shieldPickups) {
        if (pickup.x < vx - 1 || pickup.x > vx + vw + 1 || pickup.y < vy - 1 || pickup.y > vy + vh + 1) continue;
        const px = (pickup.x - vx) * cellSizeX;
        const py = (pickup.y - vy) * cellSizeY;
        const centerX = px + cellSizeX / 2;
        const centerY = py + cellSizeY / 2;
        const radiusPx = pickup.radius * cellSizeX;
        
        ctx.save();
        ctx.translate(centerX, centerY);

        // Simple pulsing animation
        const pulse = Math.sin(performance.now() / 300) * 0.1 + 0.9;
        const pulseRadius = radiusPx * pulse;
        
        const baseColor = pickup.color || '#FFFFFF';

        // 1. Solid Center
        ctx.fillStyle = hexToRgba(baseColor, 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, pulseRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // 2. Neon Ring
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // 3. Icon (The plus sign)
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        const plusSize = pulseRadius * 0.4;
        ctx.fillRect(-plusSize / 4, -plusSize, plusSize / 2, plusSize * 2);
        ctx.fillRect(-plusSize, -plusSize / 4, plusSize * 2, plusSize / 2);

        ctx.restore();
    }
}

function drawAll(deltaTime) {
   const ctx = elements.ctx;
   ctx.clearRect(0, 0, elements.canvas.screenWidth, elements.canvas.screenHeight);
   drawBackgroundChunks();
   drawProjectiles();
   //updateSkeletonVisionGrid();
   //drawAllVisionCones(cultists);
   if (REGION_DEBUG_ON) drawTacticalOverlay(ctx);
   drawPickups();
   //drawSkeletonHorde(deltaTime);
   drawScene(LoopEntities, deltaTime * TIME_SCALE);
   drawParticles();
   drawReticle();
   //drawObjectiveCompass();
   drawPlantFollower(deltaTime * TIME_SCALE);
}

function updateShieldLogic(ent, dt) {
   if (!ent.shield) return;
   if (ent.shield.activeTimer !== undefined) {
      ent.shield.activeTimer -= dt;
      if (ent.shield.activeTimer <= 0) {
         ent.shield = null;
         return;
      }
   }
   if (ent.shield.fizzleTimer > 0) ent.shield.fizzleTimer -= dt;
   if (ent.shield.flashTimer > 0) ent.shield.flashTimer -= dt;
   if (!ent.shield.active) {
      ent.shield.timer -= dt;
      if (ent.shield.timer <= 0) {
         ent.shield.active = true;
         ent.shield.currentCharge = ent.shield.maxCharge * 0.25;
         notifySound(ent.x, ent.y, 1); 
      }
   }
   else {
      if (ent.shield.currentCharge < ent.shield.maxCharge) {
         ent.shield.currentCharge += ent.shield.regenRate * dt;
         if (ent.shield.currentCharge > ent.shield.maxCharge) {
            ent.shield.currentCharge = ent.shield.maxCharge;
         }
      }
   }
}

function resolveAllCollisions(allEntities, iterations = 2) {
    const gridWidth = SPATIAL_WIDTH;
    const gridHeight = SPATIAL_HEIGHT;
    const gridHead = spatial_gridHead;
    const entityNext = spatial_entityNext;
    const MAX_NEIGHBOR_CHECKS = allEntities.length + 1; 
    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < allEntities.length; i++) {
            const ent = allEntities[i];
            const gx = ent.endTile.x;
            const gy = ent.endTile.y;
            for (let y = gy - 1; y <= gy + 1; y++) {
                if (y < 0 || y >= gridHeight) continue;
                const yOffset = y * gridWidth;
                for (let x = gx - 1; x <= gx + 1; x++) {
                    if (x < 0 || x >= gridWidth) continue;
                    let neighborID = gridHead[x + yOffset];
                    let safetyCounter = 0;
                    while (neighborID !== -1 && neighborID !== undefined) {
                        safetyCounter++;
                        if (safetyCounter > MAX_NEIGHBOR_CHECKS) { break; }
                        if (neighborID > ent._physId) {
                            const other = allEntities[neighborID];
                            const dx = ent.x - other.x;
                            const dy = ent.y - other.y;
                            const combinedRadius = ent.radius + other.radius;
                            if (Math.abs(dx) < combinedRadius && Math.abs(dy) < combinedRadius) {
                                const distSq = dx * dx + dy * dy;
                                const radSq = combinedRadius * combinedRadius;
                                if (distSq < radSq) {
                                    let dist = Math.sqrt(distSq);
                                    let normalX;
                                    let normalY;
                                    if (dist < 0.0001) { 
                                        dist = 0.0001;
                                        const angle = Math.random() * Math.PI * 2;
                                        normalX = Math.cos(angle);
                                        normalY = Math.sin(angle);
                                    } else {
                                        normalX = dx / dist;
                                        normalY = dy / dist;
                                    }
                                    const penetration = combinedRadius - dist;
                                    const MAX_PENETRATION_CORRECTION = 0.5;
                                    const correctedPenetration = Math.min(penetration, MAX_PENETRATION_CORRECTION);
                                    const m1_base = ent.radius * ent.radius;
                                    const m2_base = other.radius * other.radius;
                                    const m1 = m1_base * (ent.physMassFactor || 1.0);
                                    const m2 = m2_base * (other.physMassFactor || 1.0);
                                    const totalMass = m1 + m2;
                                    const ratio1 = m2 / totalMass;
                                    const ratio2 = m1 / totalMass;
                                    ent.x += normalX * correctedPenetration * ratio1;
                                    ent.y += normalY * correctedPenetration * ratio1;
                                    other.x -= normalX * correctedPenetration * ratio2;
                                    other.y -= normalY * correctedPenetration * ratio2;
                                    if (ent.faction === other.faction && ent.faction === 'skeleton') {
                                        const relVX = ent.velocity.x - other.velocity.x;
                                        const relVY = ent.velocity.y - other.velocity.y;
                                        const velAlongNormal = relVX * normalX + relVY * normalY;
                                        const velSq = relVX * relVX + relVY * relVY;
                                        const LOW_SPEED_THRESHOLD_SQ = 0.25;
                                        if (velAlongNormal < 0 && velSq > LOW_SPEED_THRESHOLD_SQ) {
                                            const restitution = 0.1;
                                            const impulse = -(1 + restitution) * velAlongNormal;
                                            ent.velocity.x += impulse * normalX * ratio1;
                                            ent.velocity.y += impulse * normalY * ratio1;
                                            other.velocity.x -= impulse * normalX * ratio2;
                                            other.velocity.y -= impulse * normalY * ratio2;
                                        }
                                    } 
                                    else {
                                        const relVX = ent.velocity.x - other.velocity.x;
                                        const relVY = ent.velocity.y - other.velocity.y;
                                        const velAlongNormal = relVX * normalX + relVY * normalY;
                                        if (velAlongNormal < 0) {
                                            const impactSpeed = -velAlongNormal;
                                            if (impactSpeed > 4.0) {
                                               const damage = impactSpeed * 8.0;
                                               const resultA = processCombatInteraction(ent, other, normalX, normalY, damage);
                                               const resultB = processCombatInteraction(other, ent, -normalX, -normalY, damage);
                                               const shieldEvent = resultA.discharged || resultB.discharged;
                                               const impulseDamper = shieldEvent ? 0 : 1.2; 
                                               const restitution = shieldEvent ? 0 : 0.5;
                                               const impulseMag = -(1 + restitution) * velAlongNormal * impulseDamper;
                                               ent.velocity.x += impulseMag * normalX * ratio1;
                                               ent.velocity.y += impulseMag * normalY * ratio1;
                                               other.velocity.x -= impulseMag * normalX * ratio2;
                                               other.velocity.y -= impulseMag * normalY * ratio2;
                                               ent.dashTimer = 0.5;
                                               other.dashTimer = 0.5;
                                            } else {
                                               const impulse = -(1 + 0.1) * velAlongNormal * 0.6;
                                               ent.velocity.x += impulse * normalX * ratio1;
                                               ent.velocity.y += impulse * normalY * ratio1;
                                               other.velocity.x -= impulse * normalX * ratio2;
                                               other.velocity.y -= impulse * normalY * ratio2;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        neighborID = entityNext[neighborID];
                    }
                }
            }
        }
    }
}

function processCombatInteraction(attacker, victim, impactX, impactY, damage) {
    const result = { discharged: false, bonusForce: 0 };
    
    // 1. SKELETON CHECK
    if (attacker.faction === 'skeleton') return result;
    //if (attacker.isDying) return result;

    // 2. SPEED CHECK
    //if (attackerSpeed < SPEEDS.RUN + 1 && attacker.combatMove !== 'DIVE') return result;
    if(attacker.faction === 'cultist' && victim.faction === 'cultist' && attacker.combatMove !== 'DIVE') return result;
    if(attacker.faction === 'cultist' && victim.faction === 'skeleton' && attacker.combatMove !== 'DIVE') return result;

    // 3. FACING ALIGNMENT CHECK
    const dx = victim.x - attacker.x;
    const dy = victim.y - attacker.y;
    const dist = Math.hypot(dx, dy);
    const dirX = dx / dist;
    const dirY = dy / dist;
    const faceX = Math.cos(attacker.rotation);
    const faceY = Math.sin(attacker.rotation);
    const alignment = (faceX * dirX) + (faceY * dirY);
    if (alignment < 0.85) return result;

    // 4. SHIELD LOGIC
    if (victim.shield && victim.shield.active) {
        if (victim.shield.currentCharge > damage) {
            victim.shield.currentCharge -= damage;
            victim.shield.flashTimer = 0.5;
            victim.shield.hitAngle = Math.atan2(-dirY, -dirX);
            notifySound(victim.x, victim.y, 2); 
            spawnImpact(victim.x + 0.5, victim.y + 0.5, impactX, impactY, 'default');
        } else {
            result.bonusForce = victim.shield.currentCharge * 0.5;
            result.discharged = true;
            victim.shield.currentCharge = 0;
            victim.shield.active = false;
            victim.shield.timer = victim.shield.cooldown;
            victim.shield.fizzleTimer = 0.4;
            notifySound(victim.x, victim.y, 5);
            spawnImpact(victim.x + 0.5, victim.y + 0.5, impactX, impactY, 'ricochet');
        }
        return result;
    }

   // 5. KILL LOGIC
    if (!victim.isDying) {
        victim.isDying = true;
        deadBodies.push(victim);
        victim.timeOfDeath = Date.now();
        victim.deathTimer = DEATH_DURATION;
        spawnImpact(victim.x + 0.5, victim.y + 0.5, impactX, impactY, 'red');
        victim.impactVector = { x: impactX, y: impactY };
    }
    return result;
}

function getSeparationForce(ent, out, allEntities) {
   if(ent.isDying) return;
   out.x = 0;
   out.y = 0;

   // 1. CACHE GRID POINTERS (Direct Access for Speed)
   const gridWidth = SPATIAL_WIDTH;
   const gridHeight = SPATIAL_HEIGHT;
   const gridHead = spatial_gridHead;
   const nextEnt = spatial_entityNext;
   
   // 2. SETUP LOCAL VARS
   const cx = ent.endTile.x;
   const cy = ent.endTile.y;
   const myX = ent.x;
   const myY = ent.y;
   const myRadius = ent.radius;
   const myId = ent._physId; // This is the index in allEntities

   // 3. DEFINE SEARCH BOUNDS (Clamped to Grid)
   const startX = (cx - 1 < 0) ? 0 : cx - 1;
   const endX = (cx + 1 >= gridWidth) ? gridWidth - 1 : cx + 1;
   const startY = (cy - 1 < 0) ? 0 : cy - 1;
   const endY = (cy + 1 >= gridHeight) ? gridHeight - 1 : cy + 1;

   let sepX = 0;
   let sepY = 0;
   let foundAny = false;

   // 4. INLINED LOOP (No function calls, no array creation)
   for (let y = startY; y <= endY; y++) {
      const yOffset = y * gridWidth;
      for (let x = startX; x <= endX; x++) {
         
         // Start at the head of the linked list for this cell
         let neighborID = gridHead[x + yOffset];
         
         // Traverse the linked list
         while (neighborID !== -1) {
            
            // OPTIMIZATION: Integer comparison is much faster than object lookup.
            // Your logic requires skipping lower IDs (other._physId < ent._physId).
            // We also skip 'self' (neighborID === myId).
            // So we only process if neighborID > myId.
            if (neighborID > myId) {
               const other = allEntities[neighborID];
               
               const dx = myX - other.x;
               const dy = myY - other.y;
               const combinedRadius = myRadius + other.radius;
               const distSq = dx * dx + dy * dy;

               // Only do expensive Math.sqrt if actually overlapping
               if (distSq < combinedRadius * combinedRadius) {
                   const currentDist = Math.sqrt(distSq);
                   if (currentDist > 0.0001) { 
                      // Precise Force Calculation (Preserved)
                      const strength = (combinedRadius - currentDist) / currentDist;
                      const weight = 80.0;
                      sepX += dx * strength * weight;
                      sepY += dy * strength * weight;
                      foundAny = true;
                   }
               }
            }
            // Move to next entity in this cell
            neighborID = nextEnt[neighborID];
         }
      }
   }

   // 5. APPLY LIMITS
   if (foundAny) {
      const lenSq = sepX*sepX + sepY*sepY;
      const MAX_SEP_FORCE = 20.0; 
      
      if (lenSq > MAX_SEP_FORCE * MAX_SEP_FORCE) {
          const len = Math.sqrt(lenSq);
          const scale = MAX_SEP_FORCE / len;
          sepX *= scale;
          sepY *= scale;
      }
      out.x = sepX;
      out.y = sepY;
   }
}

function updateCharacterLogic(allEntities, dt) {
   const safeDt = Math.min(dt, 0.1);
   awardXP(character, 'AWARENESS', 25.0 * safeDt);
   updateShieldLogic(character, safeDt);

   if (character.timeScaleTimer === undefined) character.timeScaleTimer = 0;
   if (character.timeScaleTimer > 0) {
       character.timeScaleTimer -= safeDt;
       if (character.timeScaleTimer <= 0) {
           TARGET_TIME_SCALE = 1.0;
           character.timeScaleTimer = 0;
       }
   }

   if (character.isVaulting) {
      character.vaultTimer -= safeDt;

      // Calculate progress (0.0 to 1.0)
      const totalTime = 0.35; // Vault duration
      const t = 1.0 - (character.vaultTimer / totalTime);

      // Simple Lerp from Start to End
      character.x = character.vaultStart.x + (character.vaultEnd.x - character.vaultStart.x) * t;
      character.y = character.vaultStart.y + (character.vaultEnd.y - character.vaultStart.y) * t;

      // Update render coordinates
      character.renderX = character.x;
      character.renderY = character.y;

      // End Vault
      if (character.vaultTimer <= 0) {
         character.x = character.vaultEnd.x;
         character.y = character.vaultEnd.y;
         character.isVaulting = false;
      }
      return; // Skip all other logic (shooting, physics, etc) while vaulting
   }
   const decaySpeed = 10.0 * safeDt;
   aimRecoilOffset.x -= aimRecoilOffset.x * decaySpeed;
   aimRecoilOffset.y -= aimRecoilOffset.y * decaySpeed;
   if (Math.abs(aimRecoilOffset.x) < 0.1) aimRecoilOffset.x = 0;
   if (Math.abs(aimRecoilOffset.y) < 0.1) aimRecoilOffset.y = 0;
   const weaponKey = character.equippedWeapon || 'PISTOL';
   const weapon = WEAPONS[weaponKey];
   if (character.isReloading) {
      character.reloadTimer -= safeDt;
      character.recoil = character.recoilAmount;
      if (character.reloadTimer <= 0) {
         character.currentAmmo = weapon.magSize;
         character.isReloading = false;
         character.shootTimer = 0;
      }
   } else if (character.shootTimer > 0) {
      character.shootTimer -= safeDt;
   }
   const rect = elements.canvas.getBoundingClientRect();
   const scaleX = elements.canvas.width / rect.width;
   const scaleY = elements.canvas.height / rect.height;
   let mx = (mousePos.clientX - rect.left) * scaleX;
   let my = (mousePos.clientY - rect.top) * scaleY;
   mx += aimRecoilOffset.x;
   my += aimRecoilOffset.y;
   const cellSizeX = elements.canvas.width / viewport.width;
   const cellSizeY = elements.canvas.height / viewport.height;
   const gx = mx / cellSizeX + viewport.x;
   const gy = my / cellSizeY + viewport.y;

   const muzzlePos = getEntityMuzzlePosition(character);
   const startX = muzzlePos.x;
   const startY = muzzlePos.y;
   const centerScreenX = character.renderX + 0.5; 
   const centerScreenY = character.renderY + 0.5;
   const angle = Math.atan2(gy - centerScreenY, gx - centerScreenX);
   
   if (isMouseDown && !character.isReloading && character.shootTimer <= 0) {
      if (gx >= 0 && gy >= 0 && gx < GRID_SIZE && gy < GRID_SIZE) {
         if (character.currentAmmo > 0) {
            shootFireball(character, angle, weapon, startX, startY);
            character.currentAmmo--;
            character.shootTimer = weapon.fireDelay;
            const kickStrength = 400 * weapon.recoilAdd;
            const randAngle = Math.random() * Math.PI * 2;
            const randDist = (Math.random() * kickStrength) * 0.5;
            aimRecoilOffset.x += Math.cos(randAngle) * randDist;
            aimRecoilOffset.y += Math.sin(randAngle) * randDist;
            notifySound(character.x + 0.5, character.y + 0.5, WEAPONS[character.equippedWeapon].soundRadius, true);
            if (character.currentAmmo <= 0) {
               character.isReloading = true;
               character.reloadTimer = weapon.reloadTime * character.reloadSpeed;
               awardXP(character, 'RELOADSPEED', 25);
            }
         }
      }
   }
   if(character.dashCooldown > 0) character.dashCooldown-= safeDt;
   if (character.dashTimer > 0) { applyDivePhysics(character, safeDt); }
   updateMovement(safeDt);
   updatePhysics(character, safeDt);
   getSeparationForce(character, SHARED_FORCE, allEntities);
   character.velocity.x += SHARED_FORCE.x * 0.2;
   character.velocity.y += SHARED_FORCE.y * 0.2;
   computeLineOfSightRay();
   if (character.recoil > character.recoilAmount) {
      character.recoil -= 2.5 * safeDt;
      if (character.recoil < character.recoilAmount) character.recoil = character.recoilAmount;
   }
}

function notifySound(x, y, soundLevel = 3, isPlayerSource = false) {
   for (const agent of cultists) {
      if (agent.shootTimer > 0) continue;
      if (agent.reactionTimer > 0) continue;
      const dx = agent.x - x;
      const dy = agent.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > soundLevel) continue;
      if (isPlayerSource) setLastKnownTarget(x, y);
      if(chaseTimer > 0) return;
      agent.noiseTarget = { x: x, y: y };
      agent.hearingGunshot = true;
      agent.reactionTimer = 0.2 + Math.random() * 0.5;
      agent.lookTarget = { x: x - (agent.x + 0.5), y: y - (agent.y + 0.5) };
   }

   const soundLevelSq = soundLevel * soundLevel;
   for (const skel of skeletons) {
      if (skel.isDying) continue;
      const dx = skel.x - x;
      const dy = skel.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < soundLevelSq) skel.noiseTarget = { x: x, y: y };
   }
}

function renderLoop() {
   const newNow = performance.now();
   let deltaTime = (newNow - lastFrame) / 1000;
   lastFrame = newNow;

   // 1. Calculate Alpha
   const timeSincePhysics = (newNow - lastPhysicsTime) / 1000;
   // Alpha = (Time since last physics update) / (Duration of the last physics update)
   const alpha = Math.min(1.0, lastGameDelta > 0 ? timeSincePhysics / lastGameDelta : 1.0);

   // 2. Apply Interpolation to Render Coordinates
   for (const ent of LoopEntities) {
       // Only interpolate if we have a previous position and we are not in a hardcoded/vaulting animation
       // Vaulting/Dying coordinates are directly set in updateEntityLogic/handleDeathPhysics, 
       // so they should not be interpolated with prevX/Y here.
       if (ent.prevX !== undefined && !ent.isVaulting && !ent.isDying) { 
            ent.renderX = ent.prevX + (ent.x - ent.prevX) * alpha;
            ent.renderY = ent.prevY + (ent.y - ent.prevY) * alpha;
       } else {
            // Use current physical position or the position set by the dedicated animation logic (Vault/Death)
            ent.renderX = ent.x;
            ent.renderY = ent.y;
       }
   }
   
   updateViewport(deltaTime); 
   drawAll(deltaTime);
   requestAnimationFrame(renderLoop);
}

function getRandomFreeCell() {
   const cell = freeCells[Math.floor(Math.random() * freeCells.length)];
   return { x: cell.x, y: cell.y };
}

function updateFreeCells() {
   freeCells = cells.filter(c => !c.selected);
   AITarget = getRandomFreeCell();
}

function getNewId() {
   currentID = Math.floor(currentID + 1 + 1000 * Math.random());
   return currentID;
}

function resolveWallCollision(entity) {
   const cx = entity.x + 0.5;
   const cy = entity.y + 0.5;
   const radius = entity.radius;
   const startX = Math.floor(cx - radius);
   const endX = Math.ceil(cx + radius);
   const startY = Math.floor(cy - radius);
   const endY = Math.ceil(cy + radius);
   let nudged = false;
   for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
         const gridVal = (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) ? 1 : ObstacleGrid[x + y * GRID_WIDTH];
         let isSolid = false;
         if (gridVal === 1 || gridVal === 3) {
            isSolid = true;
         } 
         else if (gridVal === 2) {
            if (entity.dashTimer <= 0 && !entity.isVaulting && !entity.falling && !entity.isDying) { isSolid = true; }
         }
         if (isSolid) {
            const closestX = Math.max(x, Math.min(cx, x + 1));
            const closestY = Math.max(y, Math.min(cy, y + 1));
            const dx = cx - closestX;
            const dy = cy - closestY;
            const distSq = dx * dx + dy * dy;
            if (distSq < radius * radius) {
               let dist = Math.sqrt(distSq);
               let nx, ny;
               if (dist < 0.0001) {
                  dist = 0.0001; 
                  const angle = Math.random() * Math.PI * 2;
                  nx = Math.cos(angle);
                  ny = Math.sin(angle);
               } else {
                  nx = dx / dist;
                  ny = dy / dist;
               }
               const penetration = radius - dist;
               const MAX_PENETRATION_CORRECTION = 0.5; 
               const correctedPenetration = Math.min(penetration, MAX_PENETRATION_CORRECTION);
               entity.x += nx * correctedPenetration;
               entity.y += ny * correctedPenetration;
               const vDotN = entity.velocity.x * nx + entity.velocity.y * ny;
               if (vDotN < 0) {
                  const impactSpeed = -vDotN;
                  if (impactSpeed > 4.0) {
                      const restitution = BOUNCE_FACTOR;
                      const impulse = -(1 + restitution) * vDotN;
                      entity.velocity.x += nx * impulse;
                      entity.velocity.y += ny * impulse;
                  } 
                  else {
                      entity.velocity.x -= nx * vDotN;
                      entity.velocity.y -= ny * vDotN;
                  }
               }
               nudged = true;
            }
         }
      }
   }
   return nudged;
}

function updatePhysics(entity, dt) {
   const safeDt = Math.min(dt, 0.03);
   entity.x += entity.velocity.x * safeDt;
   entity.y += entity.velocity.y * safeDt;
   for(let i=0; i<3; i++) { if(!resolveWallCollision(entity)) { break; } }
   if (!isFinite(entity.x) || !isFinite(entity.y)) {
       console.error(`Entity ${entity.id} hit non-finite position! Resetting to last valid tile.`);
       entity.x = entity.endTile.x;
       entity.y = entity.endTile.y;
       entity.velocity.x = 0;
       entity.velocity.y = 0;
   }
   const rawX = Math.floor(entity.x + 0.5);
   const rawY = Math.floor(entity.y + 0.5);
   if (rawX >= 0 && rawX < GRID_WIDTH && rawY >= 0 && rawY < GRID_HEIGHT) {
      const idx = rawX + rawY * GRID_WIDTH;
      const tileType = ObstacleGrid[idx];
      if (tileType === 0) {
         entity.endTile.x = rawX;
         entity.endTile.y = rawY;
      }
      else if (tileType === 2 && !entity.falling && !entity.isVaulting) {
          if (entity.dashTimer <= 0) {
              if (!entity.isDying) {
                  entity.isDying = true;
                  deadBodies.push(entity);
              }
              entity.falling = true;
              entity.timeOfDeath = Date.now();
              entity.deathTimer = DEATH_DURATION;
          }
      }
   }
}

function updateTimeScale() {
   //TARGET_TIME_SCALE = 0.2;
   TIME_SCALE += (TARGET_TIME_SCALE - TIME_SCALE) * 0.5;
   if (Math.abs(TIME_SCALE - TARGET_TIME_SCALE) < 0.01) {
      TIME_SCALE = TARGET_TIME_SCALE;
   }
}

function gameLoop() {
   globalFrameCount++;
   resetSkeletonAIBudget();
   const now = performance.now();
   let deltaTime = (now - lastTime) / 1000;
   lastTime = now;
   
   // --- INTERPOLATION SETUP (Physics Side) ---
   lastGameDelta = deltaTime; // Store raw duration of the last tick
   lastPhysicsTime = now;     // Store execution time of this tick

   updateTimeScale();
   const gameDeltaTime = deltaTime * TIME_SCALE;
   
   // Store previous positions BEFORE any physics is calculated
   for (const ent of LoopEntities) {
       ent.prevX = ent.x;
       ent.prevY = ent.y;
   }

   // --- SIMULATION START ---
   
   updateEntitiesDeath(gameDeltaTime);
   updateProjectiles(gameDeltaTime, LoopEntities);
   updateParticles(gameDeltaTime);
   
   SpatialManager.rebuild(LoopEntities);
   if (!isGameInitialized) {
      setLastKnownTarget(character.endTile.x, character.endTile.y);
      updateDistances(lastKnownTarget.x, lastKnownTarget.y);
      initializePatrol();
      isGameInitialized = true;
   }
   patrolTimer += gameDeltaTime;
   updateAIState(gameDeltaTime);
   checkPickups();
   updateCharacterLogic(LoopEntities, gameDeltaTime);
   for (let i = 0; i < cultists.length; i++) { updateEntityLogic(cultists[i], gameDeltaTime, LoopEntities); }

   skelStartIndex = (skelStartIndex + 113) % skeletons.length;
   for (let i = 0; i < skeletons.length; i++) {
       const idx = (skelStartIndex + i) % skeletons.length;
       updateEntityLogic(skeletons[idx], gameDeltaTime, LoopEntities); 
   }

   resolveAllCollisions(LoopEntities, 2);
   requestAnimationFrame(gameLoop);
}

function checkCollision(centerX, centerY, radius) {
   const startX = Math.floor(centerX - radius);
   const endX = Math.ceil(centerX + radius);
   const startY = Math.floor(centerY - radius);
   const endY = Math.ceil(centerY + radius);
   const r2 = radius * radius;
   const shrinkage = 0.25;
   for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
         if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
            if (centerX - radius < 0) return true;
            if (centerX + radius > GRID_WIDTH) return true;
            if (centerY - radius < 0) return true;
            if (centerY + radius > GRID_HEIGHT) return true;
            continue;
         }
         if (ObstacleGrid[x + y * GRID_WIDTH] === 1 || ObstacleGrid[x + y * GRID_WIDTH] === 3) {
            const minX = x + shrinkage;
            const maxX = x + 1 - shrinkage;
            const minY = y + shrinkage;
            const maxY = y + 1 - shrinkage;
            const closestX = Math.max(minX, Math.min(centerX, maxX));
            const closestY = Math.max(minY, Math.min(centerY, maxY));
            const dx = centerX - closestX;
            const dy = centerY - closestY;
            if ((dx * dx) + (dy * dy) < r2) { return true; }
         }
      }
   }
   return false;
}

function evaluateStrafeOption(targetX, targetY, playerX, playerY) {
   if (targetX < 0 || targetX >= GRID_WIDTH || targetY < 0 || targetY >= GRID_HEIGHT) { return { valid: false, cover: false }; }
   if (checkCollision(targetX, targetY, 0.25)) { return { valid: false, cover: false }; }
   const isCover = raycastHitWall(targetX, targetY, playerX, playerY);
   return { valid: true, cover: isCover };
}

function updateEntityLogic(ent, dt, allEntities) {
   const safeDt = Math.min(dt, 0.05);
   
   if (ent.isDying) {
      handleDeathPhysics(ent, safeDt);
      return;
   }
   
   if (ent.isVaulting) {
      ent.vaultTimer -= safeDt;
      const totalTime = 0.35;
      const t = 1.0 - (ent.vaultTimer / totalTime);
      // Lerp position
      ent.x = ent.vaultStart.x + (ent.vaultEnd.x - ent.vaultStart.x) * t;
      ent.y = ent.vaultStart.y + (ent.vaultEnd.y - ent.vaultStart.y) * t;
      // Sync render position
      ent.renderX = ent.x;
      ent.renderY = ent.y;
      if (ent.vaultTimer <= 0) {
         ent.x = ent.vaultEnd.x;
         ent.y = ent.vaultEnd.y;
         ent.isVaulting = false;
         ent.decisionTimer = 0;
      }
      return; // Skip all other logic while vaulting
   }

   initializeEntityDefaults(ent);
   updateEntityTimers(ent, safeDt);
   updateShieldLogic(ent, safeDt);
   const shouldThink = (globalFrameCount + ent.id) % 5 === 0;
   if (shouldThink && ent.dashTimer <= 0 && !ent.hearingGunshot) { computeAIIntent(ent, allEntities); }
   let isControllingRotation = false;
   const isRecoveringFromDive = (ent.combatMove === 'DIVE' && ent.decisionTimer > 0);
   if (ent.dashTimer <= 0 && !isRecoveringFromDive && ent.id !== character.id) {
      if (!ent.hearingGunshot) {
         isControllingRotation = handleShootingLogic(ent, dt);
      }
   }
   applyEntityPhysics(ent, safeDt, allEntities, isControllingRotation, isRecoveringFromDive);
}

function assignMissionToExistingSquad() {
   // 1. Map leaders to their squad size
   const leaderSquads = new Map();
   
   // Initialize counts
   for (const c of cultists) {
       if (c.isLeader && !c.isDying) {
           leaderSquads.set(c.id, { leader: c, count: 0 });
       }
   }
   
   // Count followers
   for (const c of cultists) {
       if (c.leader && !c.isDying && leaderSquads.has(c.leader.id)) {
           leaderSquads.get(c.leader.id).count++;
       }
   }

   // Convert to array and filter out loners (unless we have no choice)
   let candidates = Array.from(leaderSquads.values());
   
   // Sort by squad size (descending) so we pick the guy with the most friends
   candidates.sort((a, b) => b.count - a.count);

   let chosenEntry = null;
   let route = [];

   // 2. Find the best leader who ALSO has a valid path
   for (const entry of candidates) {
       const leader = entry.leader;
       const idx = getIndex(leader.x, leader.y);
       const rId = REGION_ID_MAP[idx];

       if (rId !== undefined && rId !== -1) {
           const testRoute = generateLongDistanceRoute(rId);
           if (testRoute.length > 2) {
               chosenEntry = entry;
               route = testRoute;
               break; 
           }
       }
   }

   if (!chosenEntry) {
       console.log("No valid mission leader found.");
       return;
   }

   const chosenLeader = chosenEntry.leader;

   // 3. Promote Leader
   chosenLeader.isLeader = true; 
   chosenLeader.isMissionObjective = true;
   chosenLeader.maxStamina = 300; 
   chosenLeader.equippedWeapon = 'ASSAULT_RIFLE'; 
   
   chosenLeader.patrolState = 'MISSION_PATH';
   chosenLeader.regionQueue = route;
   chosenLeader.regionQueueIndex = 0;
   chosenLeader.speed = SPEEDS.WALK; 

   // 4. Promote Bodyguards
   let bodyguardCount = 0;
   for (const minion of cultists) {
       if (minion.leader === chosenLeader && !minion.isDying) {
           minion.isMissionObjective = true;
           minion.patrolState = 'FOLLOW_LEADER';
           minion.speed = SPEEDS.RUN; 
           bodyguardCount++;
       }
   }

   console.log(`Mission Assigned! Target ID: ${chosenLeader.id} | Bodyguards: ${bodyguardCount}`);
}

function handleDeathPhysics(ent, dt) {
   /*
   if (ent.dashTimer > 0) ent.dashTimer -= dt;
   const baseFriction = (ent.physFriction !== undefined) ? ent.physFriction : 4.0;
   const friction = baseFriction * dt;
   ent.velocity.x *= (1.0 - Math.min(friction, 1.0));
   ent.velocity.y *= (1.0 - Math.min(friction, 1.0));
   if (Math.abs(ent.velocity.x) > 0.1 || Math.abs(ent.velocity.y) > 0.1) {
      const targetRotation = Math.atan2(ent.velocity.y, ent.velocity.x);
      let diff = targetRotation - ent.rotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      ent.rotation += diff * 8.0 * dt;
   }
   updatePhysics(ent, dt);
   */
}

function initializeEntityDefaults(ent) {
   if (ent.cachedVX === undefined) { ent.cachedVX = 0; ent.cachedVY = 0; }
   if (ent.combatMove === undefined) { ent.combatMove = 'NONE'; }
   if (ent.decisionTimer === undefined) { ent.decisionTimer = 0; }
   if (ent.dashCooldown === undefined) { ent.dashCooldown = 0; }
   if (ent.dashTimer === undefined) { ent.dashTimer = 0; }
}

function updateEntityTimers(ent, dt) {
   if (ent.dashCooldown > 0) ent.dashCooldown -= dt;
   if (ent.dashTimer > 0) ent.dashTimer -= dt;
   if (ent.decisionTimer > 0) ent.decisionTimer -= dt;
   if (ent.shootTimer > 0) ent.shootTimer -= dt;
   if (ent.reactionTimer > 0) {
      ent.reactionTimer -= dt;
      if (ent.reactionTimer <= 0) {
         triggerGlobalAlert(ent);
         if (ent.hearingGunshot) {
            ent.hearingGunshot = false;
            ent.lookTarget = null;
         } else if (!ent.seesPlayer) {
            ent.lookTarget = null;
         }
      }
   }
   if (ent.isReloading) {
      ent.reloadTimer -= dt;
      ent.recoil = ent.recoilAmount;
      if (ent.reloadTimer <= 0) {
         const weapon = WEAPONS[ent.equippedWeapon];
         ent.currentAmmo = weapon.magSize;
         ent.isReloading = false;
         ent.currentBurst = weapon.burstCount;
      }
   }
}

function computeAIIntent(ent, allEntities) {
   if (ent.faction === 'skeleton') {
      runSkeletonAI(ent, allEntities);
      return; 
   }
   const entCX = ent.x + 0.5;
   const entCY = ent.y + 0.5;
   let targetVX = 0;
   let targetVY = 0;
   let overridePathing = false;
   ent.combatMove = 'NONE';
   const pX = character.renderX + 0.5;
   const pY = character.renderY + 0.5;
   const dx = entCX - pX;
   const dy = entCY - pY;
   const distSq = dx * dx + dy * dy;
   const dist = Math.sqrt(distSq);
   const hasLineOfSight = !raycastHitWall(pX, pY, entCX, entCY);
   // 1. COMBAT BEHAVIOR
   if (ent.id !== character.id && ent.patrolState === 'CHASE' && hasLineOfSight && dist < ent.optimalRange * 1.5) {
      overridePathing = true;
      const toEnemyX = dx / dist;
      const toEnemyY = dy / dist;
      const playerDirX = Math.cos(character.rotation);
      const playerDirY = Math.sin(character.rotation);
      const aimAlignment = toEnemyX * playerDirX + toEnemyY * playerDirY;
      const isTargeted = (aimAlignment > 0.92) && hasLineOfSight;
      if (ent.decisionTimer <= 0) { 
          decideCombatStrategy(ent, isTargeted, dist, dx, dy, entCX, entCY, pX, pY); 
      }
      if (ent.decisionTimer > 0 && ent.combatMove !== 'DIVE') {
         const result = calculateCombatVelocity(ent, dx, dy, dist);
         targetVX = result.x;
         targetVY = result.y;
      }
   }
   // 2. SQUAD BEHAVIOR (Flow Field with Hysteresis & Cooldown)
   if (!overridePathing && ent.patrolState === 'FOLLOW_LEADER' && ent.leader) {
      if ((globalFrameCount + ent.id) % 3 === 0) {
          const vec = getSquadVector(ent, ent.leader);
          ent.cachedSquadVX = vec.x;
          ent.cachedSquadVY = vec.y;
          ent.cachedSquadDist = vec.dist;
      }
      const flowDist = ent.cachedSquadDist !== undefined ? ent.cachedSquadDist : Infinity
      if (ent.squadCatchupMode) {
          if (flowDist <= 6) {
              ent.squadCatchupMode = false;
          }
      }

      let fX = 0;
      let fY = 0;
      if (!ent.squadCatchupMode) {
          fX = ent.cachedSquadVX || 0;
          fY = ent.cachedSquadVY || 0;
      }
      if (fX !== 0 || fY !== 0) {
          overridePathing = true;
          targetVX = fX * ent.speed;
          targetVY = fY * ent.speed;
          if (ent.cbsTarget) {
            ent.cbsTarget = null;
            COOP_PATHS.delete(ent.id);
          }
      } 
      else {
          ent.squadCatchupMode = true;
          const now = performance.now();
          if (!ent.lastRepathTime) ent.lastRepathTime = 0;
          if (!COOP_PATHS.has(ent.id) || (now - ent.lastRepathTime > 1500)) {
               ent.cbsTarget = { x: ent.leader.endTile.x, y: ent.leader.endTile.y };
               ent.lastRepathTime = now;
               requestPath(ent);
          }
      }
   }
   // 3. CHASE BEHAVIOR
   if (!overridePathing && ent.patrolState === 'CHASE') {
      const tileIdx = Math.floor(entCX) + Math.floor(entCY) * GRID_WIDTH;
      if (tileIdx >= 0 && tileIdx < GRID_SIZE) {
         targetVX = ChaseVectorMap[tileIdx * 2] * ent.speed;
         targetVY = ChaseVectorMap[tileIdx * 2 + 1] * ent.speed;
         overridePathing = true;
      }
   }
   // 4. STANDARD PATHFINDING (Execute Path)
   if (!overridePathing) {
      const pathResult = calculatePathfindingVelocity(ent, entCX, entCY);
      targetVX = pathResult.x;
      targetVY = pathResult.y;
   }
   if (ent.combatMove !== 'DIVE') {
      ent.cachedVX = targetVX;
      ent.cachedVY = targetVY;
   }
}

function decideCombatStrategy(ent, isTargeted, dist, dx, dy, entCX, entCY, pX, pY) {
   const roll = Math.random();

   // dirX/Y points TOWARDS the player
   const dirX = -dx / dist;
   const dirY = -dy / dist;

   // --- 1. DEFENSIVE VAULT (Retreat over tree) ---
   // Only check this if we are being aimed at
   if (isTargeted) {
      // We want to move AWAY from the player.
      // dx and dy are (Entity - Player), so they already point away.
      const retreatX = dx / dist;
      const retreatY = dy / dist;

      // Snap to cardinal direction for the grid check
      const backDirX = Math.abs(retreatX) > Math.abs(retreatY) ? Math.sign(retreatX) : 0;
      const backDirY = Math.abs(retreatY) >= Math.abs(retreatX) ? Math.sign(retreatY) : 0;

      const wallX = Math.floor(entCX) + backDirX;
      const wallY = Math.floor(entCY) + backDirY;
      const wallIdx = wallX + wallY * GRID_WIDTH;

      const landX = wallX + backDirX;
      const landY = wallY + backDirY;
      const landIdx = landX + landY * GRID_WIDTH;

      // Check: Is it a Tree behind me? Is the spot after it free?
      if (wallIdx >= 0 && wallIdx < GRID_SIZE && ObstacleGrid[wallIdx] === 3) {
            if (landIdx >= 0 && landIdx < GRID_SIZE && ObstacleGrid[landIdx] === 0) {

               // EXECUTE BACKWARD VAULT
               ent.combatMove = 'VAULT';
               ent.isVaulting = true;
               ent.vaultTimer = 0.35;
               ent.vaultStart = { x: ent.x, y: ent.y };
               ent.vaultEnd = { x: landX, y: landY };

               // Clear path memory
               COOP_PATHS.delete(ent.id);
               PATH_STEP_COUNTER.delete(ent.id);
               return;
            }
      }
   }

   const forwardDirX = Math.abs(dirX) > Math.abs(dirY) ? Math.sign(dirX) : 0;
   const forwardDirY = Math.abs(dirY) >= Math.abs(dirX) ? Math.sign(dirY) : 0;

   const fWallX = Math.floor(entCX) + forwardDirX;
   const fWallY = Math.floor(entCY) + forwardDirY;
   const fWallIdx = fWallX + fWallY * GRID_WIDTH;

   const fLandX = fWallX + forwardDirX;
   const fLandY = fWallY + forwardDirY;
   const fLandIdx = fLandX + fLandY * GRID_WIDTH;

   if (fWallIdx >= 0 && fWallIdx < GRID_SIZE && ObstacleGrid[fWallIdx] === 3) {
      if (fLandIdx >= 0 && fLandIdx < GRID_SIZE && ObstacleGrid[fLandIdx] === 0) {
         ent.combatMove = 'VAULT';
         ent.isVaulting = true;
         ent.vaultTimer = 0.35;
         ent.vaultStart = { x: ent.x, y: ent.y };
         ent.vaultEnd = { x: fLandX, y: fLandY };
         COOP_PATHS.delete(ent.id);
         PATH_STEP_COUNTER.delete(ent.id);
         return;
      }
   }

   if (isTargeted && roll < 0.6 && ent.dashCooldown <= 0) {
      performDive(ent, dirX, dirY, entCX, entCY, pX, pY);
      return;
   }

   if (roll < 0.9) {
      ent.combatMove = 'STRAFE';
      const LOOK = 1.5;
      const rEval = evaluateStrafeOption(entCX - dirY * LOOK, entCY + dirX * LOOK, pX, pY);
      const lEval = evaluateStrafeOption(entCX + dirY * LOOK, entCY - dirX * LOOK, pX, pY);

      let newDir = ent.strafeDir;
      if (ent.strafeDir === 1 && !rEval.valid) newDir = -1;
      else if (ent.strafeDir === -1 && !lEval.valid) newDir = 1;
      else if (isTargeted) {
         if (rEval.cover && !lEval.cover) newDir = 1;
         else if (!rEval.cover && lEval.cover) newDir = -1;
      }
      ent.strafeDir = newDir;
      ent.decisionTimer = 0.5 + Math.random() * 1.0;
   }

   // --- 5. TURRET ---
   else {
      ent.combatMove = 'TURRET';
      ent.decisionTimer = 0.5 + Math.random() * 1.0;
   }

   COOP_PATHS.delete(ent.id);
   PATH_STEP_COUNTER.delete(ent.id);
}

function applyDivePhysics(ent, dt) {
   const baseFriction = (ent.physFriction !== undefined) ? ent.physFriction : 3.5;
   const friction = baseFriction * dt;
   ent.velocity.x *= (1.0 - friction);
   ent.velocity.y *= (1.0 - friction);
   if (ent.id !== character.id) {
       if (Math.abs(ent.velocity.x) > 0.1 || Math.abs(ent.velocity.y) > 0.1) {
          ent.rotation = Math.atan2(ent.velocity.y, ent.velocity.x);
       }
   }
   ent.dashTimer -= dt;
   if (ent.dashTimer < 0) { ent.dashTimer = 0; }
}

function performDive(ent, dirX, dirY, entCX, entCY, pX, pY) {
   ent.combatMove = 'DIVE';
   const DIVE_DIST = 1.5;
   const rEval = evaluateStrafeOption(entCX - dirY * DIVE_DIST, entCY + dirX * DIVE_DIST, pX, pY);
   const lEval = evaluateStrafeOption(entCX + dirY * DIVE_DIST, entCY - dirX * DIVE_DIST, pX, pY);

   let diveDir = 0;
   if (rEval.cover && !lEval.cover) diveDir = 1;
   else if (!rEval.cover && lEval.cover) diveDir = -1;
   else if (rEval.valid && !lEval.valid) diveDir = 1;
   else if (!rEval.valid && lEval.valid) diveDir = -1;
   else diveDir = (Math.random() < 0.5) ? 1 : -1;

   const dashSpeed = ent.speed * 2.2;
   const perpX = -dirY * diveDir;
   const perpY = dirX * diveDir;

   ent.velocity.x = perpX * dashSpeed;
   ent.velocity.y = perpY * dashSpeed;
   ent.rotation = Math.atan2(ent.velocity.y, ent.velocity.x);
   ent.dashTimer = 0.4;
   ent.decisionTimer = 0.9;
   ent.dashCooldown = 2.0 + Math.random() * 2.0;
   ent.lookTarget = null;

   COOP_PATHS.delete(ent.id);
   PATH_STEP_COUNTER.delete(ent.id);
}

function calculateCombatVelocity(ent, dx, dy, dist) {
   const dirX = -dx / dist;
   const dirY = -dy / dist;

   if (ent.combatMove === 'STRAFE') {
      let perpX = -dirY * ent.strafeDir;
      let perpY = dirX * ent.strafeDir;
      let forwardBias = 0;
      if (dist < ent.optimalRange * 0.5) forwardBias = -0.3;
      else if (dist > ent.optimalRange) forwardBias = 0.2;
      const strafeSpeed = Math.max(ent.speed, 4.0) * 0.8;
      return {
         x: (perpX + dirX * forwardBias) * strafeSpeed,
         y: (perpY + dirY * forwardBias) * strafeSpeed
      };
   }

   if (ent.combatMove === 'TURRET') {
      return { x: 0, y: 0 };
   }

   return { x: 0, y: 0 };
}

function calculatePathfindingVelocity(ent, entCX, entCY) {
   let vx = 0;
   let vy = 0;
   const tileIdx = Math.floor(entCX) + Math.floor(entCY) * GRID_WIDTH;

   if (ent.patrolState === 'CHASE') {
      if (tileIdx >= 0 && tileIdx < GRID_SIZE) {
         vx = ChaseVectorMap[tileIdx * 2] * ent.speed;
         vy = ChaseVectorMap[tileIdx * 2 + 1] * ent.speed;
      }
   } else {
      // Cooperative Path Follow (Patrol)
      const path = COOP_PATHS.get(ent.id);
      if (path && path.length > 0) {
         
         // --- START: TIME-BASED STUCK WATCHDOG ---
         const now = performance.now();
         
         // Initialize watchdog state if missing
         if (!ent.pathWatchdog) {
             ent.pathWatchdog = {
                 lastX: ent.x,
                 lastY: ent.y,
                 lastCheckTime: now,
                 stuckDuration: 0
             };
         }

         // 1. Throttle the check: Only look at position changes every 100ms.
         // This prevents high-FPS jitter from triggering false positives.
         if (now - ent.pathWatchdog.lastCheckTime > 100) {
             const dx = ent.x - ent.pathWatchdog.lastX;
             const dy = ent.y - ent.pathWatchdog.lastY;
             const distSq = dx*dx + dy*dy;

             // If moved less than 0.1 units in 100ms (approx 1 tile per second speed), count as stuck
             if (distSq < 0.01) {
                 ent.pathWatchdog.stuckDuration += (now - ent.pathWatchdog.lastCheckTime);
             } else {
                 // We moved! Reset the stuck timer.
                 ent.pathWatchdog.stuckDuration = 0;
             }

             // Update baseline for next check
             ent.pathWatchdog.lastX = ent.x;
             ent.pathWatchdog.lastY = ent.y;
             ent.pathWatchdog.lastCheckTime = now;
         }

         // 2. Trigger: If stuck for more than 500ms (0.5 seconds), abort.
         if (ent.pathWatchdog.stuckDuration > 1500) {
             //console.log("Agent stuck (time-based). Aborting.");
             COOP_PATHS.delete(ent.id);
             ent.cbsTarget = null;
             ent.pathWatchdog = null;
             return { x: 0, y: 0 };
         }
         // --- END: WATCHDOG ---

         let step = PATH_STEP_COUNTER.get(ent.id) || 0;

         // Logic to advance path nodes
         if (step < path.length) {
            let node = path[step];
            let tx = (node.x !== undefined) ? node.x : (node.index % GRID_WIDTH) + 0.5;
            let ty = (node.y !== undefined) ? node.y : Math.floor(node.index / GRID_WIDTH) + 0.5;
            let dx = tx - entCX;
            let dy = ty - entCY;

            // --- LEASH CHECK ---
            // If physically knocked far away (> 2 tiles) from the target node, the path is broken.
            // 4.0 = 2.0 tiles squared.
            if (dx*dx + dy*dy > 4.0) {
                COOP_PATHS.delete(ent.id);
                ent.cbsTarget = null;
                ent.pathWatchdog = null;
                return { x: 0, y: 0 };
            }

            // Reached node?
            if (dx * dx + dy * dy < 0.6) {
               step++;
               PATH_STEP_COUNTER.set(ent.id, step);
               // If we hit a node, we are definitely moving. Reset watchdog.
               if(ent.pathWatchdog) ent.pathWatchdog.stuckDuration = 0;

               if (step < path.length) {
                  node = path[step];
                  tx = (node.x !== undefined) ? node.x : (node.index % GRID_WIDTH) + 0.5;
                  ty = (node.y !== undefined) ? node.y : Math.floor(node.index / GRID_WIDTH) + 0.5;
                  dx = tx - entCX;
                  dy = ty - entCY;
               }
            }

            if (step < path.length) {
               const dist = Math.hypot(dx, dy);
               if (dist > 0.01) {
                  vx = (dx / dist) * ent.speed;
                  vy = (dy / dist) * ent.speed;
               }
            } else {
               COOP_PATHS.delete(ent.id);
            }
         }
      }
   }
   return { x: vx, y: vy };
}

function handleShootingLogic(ent, dt) {
   if (ent.isReloading) return false;
   const weapon = WEAPONS[ent.equippedWeapon];
   let isControllingRotation = false;
   if (ent.seesPlayer) {
      const pX = character.renderX + 0.5;
      const pY = character.renderY + 0.5;
      const startX = ent.renderX + 0.5;
      const startY = ent.renderY + 0.5;
      if (!raycastHitWall(startX, startY, pX, pY)) {
         isControllingRotation = true;
         const targetAngle = Math.atan2(pY - startY, pX - startX);
         let diff = targetAngle - ent.rotation;
         while (diff < -Math.PI) diff += Math.PI * 2;
         while (diff > Math.PI) diff -= Math.PI * 2;
         const turnSpeed = 20.0;
         if (Math.abs(diff) < 0.1) ent.rotation = targetAngle;
         else ent.rotation += diff * turnSpeed * dt;
         if (ent.shootDelayTimer > 0) {
            ent.shootDelayTimer -= dt;
         } else {
            const currentDiff = Math.abs(targetAngle - ent.rotation);
            if (ent.shootTimer <= 0 && currentDiff < Math.max(0.1, weapon.accuracy)) {
               fireWeapon(ent, weapon);
            }
         }
      } else {
         ent.shootDelayTimer = 0.5 + Math.random() * 0.5;
      }
   } else {
      ent.currentBurst = weapon.burstCount;
      ent.shootDelayTimer = 0.5 + Math.random() * 0.5;
   }   
   return isControllingRotation;
}

function fireWeapon(ent, weapon) {
   if (ent. reactionTimer > 0) return;
   if (ent.currentAmmo > 0) {
      const muzzlePos = getEntityMuzzlePosition(ent);
      const startX = muzzlePos.x;
      const startY = muzzlePos.y;
      shootFireball(ent, ent.rotation, weapon, startX, startY);
      ent.currentAmmo--;
      if (ent.currentAmmo <= 0) {
         startReload(ent, weapon, 0.1);
         return;
      }
      ent.currentBurst--;
      if (ent. currentBurst > 0 && !weapon.isShotgun) {
         ent.shootTimer = weapon.burstInterval;
         ent.recoil = Math.max(ent.recoil, ent.recoilAmount * 0.6);
      } else {
         ent.currentBurst = weapon. burstCount;
         ent.shootTimer = weapon.fireDelay + Math. random() * 0.1 + Math.random() * 0.3;
      }
   } else {
      startReload(ent, weapon, 0);
   }
}

function startReload(ent, weapon, extraDelay) {
   ent.isReloading = true;
   ent.reloadTimer = weapon.reloadTime + (Math.random() * 0.1) + extraDelay;
}

function applyEntityPhysics(ent, dt, allEntities, isControllingRotation, isRecoveringFromDive) {
   if (ent.dashTimer > 0) { applyDivePhysics(ent, dt); }
   else if (ent.reactionTimer > 0 && (ent.patrolState !== 'CHASE' || ent.hearingGunshot)) {
      ent.velocity.x = 0;
      ent.velocity.y = 0;
      updateEntityRotation(ent, dt);
   }
   else {
      getSeparationForce(ent, SHARED_FORCE, allEntities);
      const sepWeight = 1.0;
      let brakeFactor = 1.0;
      const crowdPressure = SHARED_FORCE.x*SHARED_FORCE.x + SHARED_FORCE.y*SHARED_FORCE.y;
      if (crowdPressure > 10.0) {
          brakeFactor = 0.0; 
      } else if (crowdPressure > 2.0) {
          brakeFactor = 0.5;
      }
      const desiredVX = (ent.cachedVX * brakeFactor) + (SHARED_FORCE.x * sepWeight);
      const desiredVY = (ent.cachedVY * brakeFactor) + (SHARED_FORCE.y * sepWeight);
      const smoothFactor = ent.steeringFactor || 15.0;
      const smoothAmt = Math.min(1.0, smoothFactor * dt);
      ent.velocity.x += (desiredVX - ent.velocity.x) * smoothAmt;
      ent.velocity.y += (desiredVY - ent.velocity.y) * smoothAmt;
      const speedSq = ent.velocity.x*ent.velocity.x + ent.velocity.y*ent.velocity.y;
      const maxSpeed = (ent.speed || SPEEDS.RUN) * 2.0;
      if (speedSq > maxSpeed * maxSpeed) {
          const speed = Math.sqrt(speedSq);
          const ratio = maxSpeed / speed;
          ent.velocity.x *= ratio;
          ent.velocity.y *= ratio;
      }
      if (!isControllingRotation && !isRecoveringFromDive) { updateEntityRotation(ent, dt); }
   }
   if (Math.abs(ent.velocity.x) < 0.01) ent.velocity.x = 0;
   if (Math.abs(ent.velocity.y) < 0.01) ent.velocity.y = 0;
   updatePhysics(ent, dt);
}

function updateEntityRotation(ent, dt) {
   let lookX = 0;
   let lookY = 0;
   let hasInput = false;
   if (ent.lookTarget) {
      lookX = ent.lookTarget.x;
      lookY = ent.lookTarget.y;
      hasInput = true;
   }
   else if (ent.cachedVX !== undefined && (Math.abs(ent.cachedVX) > 0.1 || Math.abs(ent.cachedVY) > 0.1)) {
      lookX = ent.cachedVX;
      lookY = ent.cachedVY;
      hasInput = true;
   }
   else if (ent.patrolState === 'CHASE') {
      const dx = character.x - ent.x;
      const dy = character.y - ent.y;
      const distSq = dx * dx + dy * dy;
      const PROXIMITY_THRESHOLD_SQ = 25.0;
      const hasLineOfSight = !raycastHitWall(ent.x + 0.5, ent.y + 0.5, lastKnownTarget.x + 0.5, lastKnownTarget.y + 0.5);
      if (hasLineOfSight || (distSq < PROXIMITY_THRESHOLD_SQ && ent.patrolState === 'CHASE')) {
         lookX = dx;
         lookY = dy;
         hasInput = true;
      }
   }
   if (hasInput && (Math.abs(lookX) > 0.1 || Math.abs(lookY) > 0.1)) {
      const targetRotation = Math.atan2(lookY, lookX);
      let diff = targetRotation - ent.rotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      ent.rotation += diff * 10.0 * dt;
   }
}

function createEntity(faction, cell = getRandomFreeCell()) {
   const weaponKeys = Object.keys(WEAPONS);
   const randomKey = weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
   const ent = {
      faction,
      x: cell.x, y: cell.y,
      renderX: cell.x, renderY: cell.y,
      path: [],
      endTile: { x: cell.x, y: cell.y },
      id: getNewId(),
      radius: 0.25,
      velocity: { x: 0, y: 0 },
      steeringFactor: 15.0,
      rotation: 0,
      physMassFactor: 1.0,
      recoil: ENTITY_MAX_RECOIL,
      recoilAmount: ENTITY_MAX_RECOIL,

      visibleTiles: new Set(),
      seesPlayer: false,
      sightRadius: CHARACTER_VIEW_DISTANCE,

      equippedWeapon: randomKey,
      currentBurst: WEAPONS[randomKey].burstCount,

      strafeDir: (Math.random() < 0.5) ? 1 : -1,
      strafeTimer: 0,
      optimalRange: WEAPONS[randomKey].optimalRange * (0.8 + Math.random() * 0.4),

      equippedWeapon: randomKey,
      currentAmmo: WEAPONS[randomKey].magSize,
      maxAmmo: WEAPONS[randomKey].magSize,

      isReloading: false,
      reloadTimer: 0,
      shootTimer: 0,

      reactionTimer: 0,
      dashCooldown: 0,
      dashTimer: 0,
      shootDelayTimer: 0.5,

      stamina: 100,
      maxStamina: STARTING_STAMINA,
      isStaminaExhausted: false,

      regenRate: STARTING_STAMINA_REGEN_RATE,

      patrolState: 'IDLE',
   };

   return ent;
}

function setupActors() {
   character = createEntity('character');
   character.recoil = STARTING_RECOIL;
   character.recoilAmount = STARTING_RECOIL;
   character.vaultStaminaCost = STARTING_VAULT_STAMINA_COST;
   character.walkSpeed = STARTING_WALK_SPEED;
   character.runSpeed = STARTING_RUN_SPEED;
   character.reloadSpeed = STARTING_RELOAD_SPEED;
   character.physFriction = 2.0;
   const skills = {};
   Object.keys(SKILLS).forEach(key => { skills[key] = { level: 1, xp: 0 }; });
   character.skills = skills;

    const ENEMY_SHIELD_CHANCE = 0.05;
    const ENEMY_SHIELD_TEMPLATE = {
        active: true,
        maxCharge: 100,
        currentCharge: 100,
        regenRate: 4.0,
        cooldown: 10.0,
        timer: 0,
        fizzleTimer: 0,
        flashTimer: 0,
        hitAngle: 0,
        radius: 0.3, 
        color: '#edff48ff'
    };

   let spawnPool = cells.filter(c => !c.selected);
   let currentCount = 0;
   while (currentCount < NUM_CULTISTS) {
      if (spawnPool.length === 0) break;
      const remaining = NUM_CULTISTS - currentCount;
      const maxSquadSize = Math.min(6, remaining);
      let squadSize = 1;
      while (squadSize < maxSquadSize && Math.random() < 0.25) { squadSize++; }
      const leaderIdx = Math.floor(Math.random() * spawnPool.length);
      const leaderCell = spawnPool[leaderIdx];
      spawnPool.splice(leaderIdx, 1);
      const leader = createEntity('cultist');
      if (Math.random() < ENEMY_SHIELD_CHANCE) leader.shield = { ...ENEMY_SHIELD_TEMPLATE };
      //leader.shield = { ...ENEMY_SHIELD_TEMPLATE };
      leader.speed = SPEEDS.SNEAK;
      leader.endTile.x = leaderCell.x;
      leader.endTile.y = leaderCell.y;
      leader.x = leaderCell.x;
      leader.y = leaderCell.y;
      leader.isLeader = true;
      cultists.push(leader);
      currentCount++;
      const SPAWN_RADIUS_SQ = 36;
      for (let i = 1; i < squadSize; i++) {
         if (spawnPool.length === 0) break;
         const candidates = [];
         for (let k = 0; k < spawnPool.length; k++) {
            const c = spawnPool[k];
            const dx = c.x - leader.x;
            const dy = c.y - leader.y;
            if (dx * dx + dy * dy <= SPAWN_RADIUS_SQ) {
               candidates.push(k);
            }
         }
         let chosenPoolIndex;
         if (candidates.length > 0) {
            const randCandIdx = Math.floor(Math.random() * candidates.length);
            chosenPoolIndex = candidates[randCandIdx];
         } else {
            chosenPoolIndex = Math.floor(Math.random() * spawnPool.length);
         }
         const followerCell = spawnPool[chosenPoolIndex];
         spawnPool.splice(chosenPoolIndex, 1);
         const follower = createEntity('cultist');
         follower.speed = SPEEDS.SNEAK;
         follower.leader = leader;
         follower.patrolState = 'FOLLOW_LEADER';
         follower.endTile.x = followerCell.x;
         follower.endTile.y = followerCell.y;
         follower.x = followerCell.x;
         follower.y = followerCell.y;
         cultists.push(follower);
         currentCount++;
      }
   }
   freeCells = spawnPool;
   let bestCell = null;
   let maxMinDistanceSq = -1;
   const getDistanceSq = (x1, y1, x2, y2) => (x1 - x2) ** 2 + (y1 - y2) ** 2;
   for (const cell of freeCells) {
      let minDistanceSq = Infinity;
      for (const enemy of cultists) {
         const distSq = getDistanceSq(cell.x, cell.y, enemy.x, enemy.y);
         if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
         }
      }
      if (minDistanceSq > maxMinDistanceSq) {
         maxMinDistanceSq = minDistanceSq;
         bestCell = cell;
      }
   }
   if (bestCell) {
      character.endTile.x = bestCell.x;
      character.endTile.y = bestCell.y;
      character.x = bestCell.x;
      character.y = bestCell.y;
   }
   spawnShieldPickup(character.endTile.x + 1, character.endTile.y);

   if (typeof REGION_SYSTEM !== 'undefined' && REGION_SYSTEM.regions.length === 0) { REGION_SYSTEM.build(); }
   assignMissionToExistingSquad();

  // --- SKELETON SPAWN LOGIC (Now driven by mapData region quota) ---
   const allSkelSpawnCells = cells.filter(c => c.startingEntity === 'skeleton');
   let cellsByRegion = new Map();

   // 1. Group spawn cells by region and get max quota for each region
   for (const cell of allSkelSpawnCells) {
       const rId = cell.regionId;
       if (!cellsByRegion.has(rId)) {
           cellsByRegion.set(rId, {
               limit: cell.maxRegionSkeletons || 9999,
               cells: []
           });
       }
       cellsByRegion.get(rId).cells.push(cell);
   }

   let skelCount = 0;
   let maxSkeletonsTotal = NUM_SKELETONS;

   // 2. Spawn Skeletons per Region up to the limit
   for (const [rId, data] of cellsByRegion.entries()) {
       const regionCells = data.cells;
       const regionLimit = data.limit;
       
       for (let i = regionCells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [regionCells[i], regionCells[j]] = [regionCells[j], regionCells[i]];
        }
        
       const spawnAmount = Math.min(regionCells.length, regionLimit, maxSkeletonsTotal - skelCount);
       
       for (let i = 0; i < spawnAmount; i++) {
           const cell = regionCells.pop();
           const skel = createEntity('skeleton');
           skel.speed = 0.1;
           skel.radius = 0.25;
           skel.physMassFactor = 0.025;
           skel.endTile.x = cell.x;
           skel.endTile.y = cell.y;
           skel.x = cell.x;
           skel.y = cell.y;
           skeletons.push(skel);
           skelCount++;
       }
   }

   // 3. Fallback/Remaining spawns from freeCells
   while (skelCount < maxSkeletonsTotal && freeCells.length > 0) {
      const cell = freeCells.pop(); 
      const skel = createEntity('skeleton');
      skel.speed = 0.1;
      skel.radius = 0.25;
      skel.physMassFactor = 0.025;
      skel.endTile.x = cell.x;
      skel.endTile.y = cell.y;
      skel.x = cell.x;
      skel.y = cell.y;
      skeletons.push(skel);
      skelCount++;
   }

   LoopEntities = [character, ...cultists, ...skeletons];
}

function spawnShieldPickup(x, y) {
   const pickup = {
      ...SHIELD_PICKUP_TEMPLATE,
      x: x,
      y: y,
      id: getNewId(),
      renderX: x,
      renderY: y,
      spawnTime: performance.now(),
   };
   shieldPickups.push(pickup);
}

function checkPickups() {
   const entity = character;
   let newPickups = [];

   for (const pickup of shieldPickups) {
      const dx = entity.x - pickup.x;
      const dy = entity.y - pickup.y;
      const distSq = dx * dx + dy * dy;
      const combinedRadius = entity.radius + pickup.radius;

      if (distSq < combinedRadius * combinedRadius) {
         applyShieldEffect(entity, pickup);
      } else {
         newPickups.push(pickup);
      }
   }
   shieldPickups = newPickups;
}

function applyShieldEffect(entity, pickup) {
    if (!entity.shield) {
        entity.shield = {
            active: true,
            maxCharge: 100,
            currentCharge: 100,
            regenRate: 5.0,
            cooldown: 15.0,
            timer: 0,
            fizzleTimer: 0,
            flashTimer: 0,
            hitAngle: 0,
            radius: 0.3,
            color: '#ff0000ff',
        };
    } else {
        entity.shield.currentCharge = entity.shield.maxCharge;
        entity.shield.active = true;
        entity.shield.timer = 0;
    }
    entity.shield.activeTimer = pickup.duration; 
}

loadImages(texturePaths).then(imgs => {
   initializeImages(imgs);
   initializeMeshCache(); //plantkinematics.js
   drawButtons();
   generateDungeon();
   updateFreeCells();
   setupNeighborArrays();
   setupActors();
   setDefaultViewport();
   createOverlay();
   resizeCanvas();
   renderWorldToCanvas();
   setupWorkshopUI();
   setGlobalBrightness(1.0);
   requestAnimationFrame(gameLoop);
   requestAnimationFrame(renderLoop);
});