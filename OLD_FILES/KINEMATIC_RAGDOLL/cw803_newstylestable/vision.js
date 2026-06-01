function processAgentVision(ent) {
   if (ent.isDying) return false;
   let profileKey = 'CASUAL';
   if (ent.patrolState === 'CHASE' || ent.shootTimer > 0 || ent.seesPlayer) {
      profileKey = 'COMBAT';
   } else if (['SECTOR_SEARCH', 'SEARCHING', 'MOVING_TO_REGION'].includes(ent.patrolState)) {
      profileKey = 'SEARCH';
   }
   ent.currentProfile = profileKey;
   const profile = VISION_PROFILES[profileKey] || VISION_PROFILES['CASUAL'];
   const canSee = checkEntityVisible(ent, character, profile.fov, profile.range);
   if(ent.reactionTimer > 0) return;
   if (canSee) {
      ent.seesPlayer = true;
      ent.hearingGunshot = false;
      ent.lookTarget = null;
      if (ent.patrolState === 'CHASE') {
         ent.reactionTimer = 0;
         chaseTimer = CHASE_COOLDOWN;
         setLastKnownTarget(character.endTile.x, character.endTile.y);
      } else {
         if (ent.reactionTimer <= 0) ent.reactionTimer = 0.2 + Math.random() * 0.5;
         ent.lookTarget = {
            x: (character.renderX + 0.5) - (ent.renderX + 0.5),
            y: (character.renderY + 0.5) - (ent.renderY + 0.5)
         };
      }
   } else {
      ent.seesPlayer = false;
   }
}

function checkEntityVisible(observer, target, fov, range) {
   const obsX = observer.x + 0.5;
   const obsY = observer.y + 0.5;
   const tgtX = target.x + 0.5;
   const tgtY = target.y + 0.5;
   const dx = tgtX - obsX;
   const dy = tgtY - obsY;
   const distSq = dx * dx + dy * dy;
   if (distSq > range * range) return false;
   if (fov > 6.0) { return true; }
   const angleToTarget = Math.atan2(dy, dx);
   let angleDiff = angleToTarget - observer.rotation;
   while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
   while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
   if (Math.abs(angleDiff) > fov / 2) return false;
   return !raycastHitWall(obsX, obsY, tgtX, tgtY);
}

function raycastHitWall(x1, y1, x2, y2, visualize = false) {
    let mapX = Math.floor(x1);
    let mapY = Math.floor(y1);
    const endMapX = Math.floor(x2);
    const endMapY = Math.floor(y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const stepX = (dx > 0) ? 1 : -1;
    const stepY = (dy > 0) ? 1 : -1;
    const deltaDistX = (Math.abs(dx) < 1e-10) ? 1e30 : Math.abs(1 / dx);
    const deltaDistY = (Math.abs(dy) < 1e-10) ? 1e30 : Math.abs(1 / dy);
    let sideDistX = (dx < 0) ? (x1 - mapX) * deltaDistX : (mapX + 1 - x1) * deltaDistX;
    let sideDistY = (dy < 0) ? (y1 - mapY) * deltaDistY : (mapY + 1 - y1) * deltaDistY;
    const maxSteps = Math.abs(endMapX - mapX) + Math.abs(endMapY - mapY) + 20;
    let hit = false;
    for (let i = 0; i < maxSteps; i++) {
        if (mapX >= 0 && mapX < GRID_WIDTH && mapY >= 0 && mapY < GRID_HEIGHT) {
            if (ObstacleGrid[mapX + mapY * GRID_WIDTH] === 1 || ObstacleGrid[mapX + mapY * GRID_WIDTH] === 3) {
                hit = true;
                break;
            }
        }
        if (mapX === endMapX && mapY === endMapY) {
            hit = false;
            break;
        }
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
        }
    }

    if (visualize) {
        if (DEBUG_RAYS.length > 200) DEBUG_RAYS.shift();
        DEBUG_RAYS.push({
            x1: x1,
            y1: y1,
            x2: hit ? (mapX + 0.5) : x2,
            y2: hit ? (mapY + 0.5) : y2,
            hit: hit,
            timestamp: Date.now() / 1000
        });
    }
    return hit;
}

function computeVisionPolygon(entity, fov, viewDistance, density = 1.0) {
    const rayCount = Math.min(MAX_RAYS_PER_ENTITY, Math.ceil(fov * 15 * density));
    const startAngle = entity.rotation - (fov / 2);
    const angleInc = fov / (rayCount - 1);
    
    // Cache entity position for the loop
    const startX = (entity.renderX !== undefined ? entity.renderX : entity.x) + 0.5;
    const startY = (entity.renderY !== undefined ? entity.renderY : entity.y) + 0.5;
    
    const gridW = GRID_WIDTH;
    const gridH = GRID_HEIGHT;
    const grid = ObstacleGrid;
    const skelGrid = SkeletonGrid;
    const entTileIdx = Math.floor(startX) + Math.floor(startY) * gridW;

    // --- GC OPTIMIZATION: Reusable Ray Result Object ---
    // We'll use a single reusable object for the castRay return value.
    const _reusableRayResult = RAY_RESULT_POOL[0]; 

    // --- 1. DEFINE THE RAYCAST LOGIC (Updated for GC) ---
    // Returns: The reusable object (not a new one)
    function castRay(theta, resultObject) {
        const rayDirX = Math.cos(theta);
        const rayDirY = Math.sin(theta);
        
        let mapX = Math.floor(startX);
        let mapY = Math.floor(startY);
        
        const deltaDistX = (rayDirX === 0) ? 1e30 : Math.abs(1 / rayDirX);
        const deltaDistY = (rayDirY === 0) ? 1e30 : Math.abs(1 / rayDirY);
        
        let stepX, stepY;
        let sideDistX, sideDistY;

        if (rayDirX < 0) {
            stepX = -1;
            sideDistX = (startX - mapX) * deltaDistX;
        } else {
            stepX = 1;
            sideDistX = (mapX + 1.0 - startX) * deltaDistX;
        }
        if (rayDirY < 0) {
            stepY = -1;
            sideDistY = (startY - mapY) * deltaDistY;
        } else {
            stepY = 1;
            sideDistY = (mapY + 1.0 - startY) * deltaDistY;
        }

        let dist = 0;
        let hit = false;
        let hitContent = 0; 

        while (!hit) {
            if (sideDistX < sideDistY) {
                sideDistX += deltaDistX;
                mapX += stepX;
                dist = sideDistX - deltaDistX;
            } else {
                sideDistY += deltaDistY;
                mapY += stepY;
                dist = sideDistY - deltaDistY;
            }

            if (dist > viewDistance) {
                dist = viewDistance;
                hit = true;
            } else if (mapX < 0 || mapX >= gridW || mapY < 0 || mapY >= gridH) {
                hit = true;
            } else {
                const currentIdx = mapX + mapY * gridW;
                const tileType = grid[currentIdx];

                if (tileType === 1 || tileType === 3) {
                    hit = true;
                    hitContent = 1;
                } else if (entity.id !== character.id && currentIdx !== entTileIdx) {
                    // Check Skeletons
                    const skelIdx = skelGrid[currentIdx];
                    if (skelIdx !== -1) {
                        const skel = skeletons[skelIdx];
                        const dx = skel.x + 0.5 - startX;
                        const dy = skel.y + 0.5 - startY;
                        const t = dx * rayDirX + dy * rayDirY;
                        const closestX = startX + t * rayDirX;
                        const closestY = startY + t * rayDirY;
                        const distSq = (skel.x + 0.5 - closestX)**2 + (skel.y + 0.5 - closestY)**2;
                        
                        const radius = skel.radius; 
                        if (distSq < radius * radius) {
                            const offset = Math.sqrt(radius * radius - distSq);
                            dist = t - offset;
                            hit = true;
                            hitContent = 2; // Hit a skeleton
                        }
                    }
                }
            }
        }

        // Populate and return the reusable result object
        resultObject.x = startX + rayDirX * dist;
        resultObject.y = startY + rayDirY * dist;
        resultObject.dist = dist;
        resultObject.mapX = mapX;
        resultObject.mapY = mapY;
        resultObject.hitContent = hitContent;
        return resultObject;
    }

    // --- 2. MAIN SWEEP (GC Optimized using RAY_RESULT_POOL) ---
    // Use the global pool as the temporary array
    let rayResults = RAY_RESULT_POOL; 
    let rayResultsCount = 0;
    
    // Cast the primary rays
    for (let i = 0; i < rayCount; i++) {
        const theta = startAngle + (i * angleInc);
        const rayItem = rayResults[rayResultsCount]; // Get reusable object from pool
        
        // Pass the internal 'result' object for the raycasting logic to populate
        castRay(theta, rayItem); 
        
        // Store angle separately for loop convenience
        rayItem.angle = theta; 
        rayItem.result = rayItem; // Set the result pointer to itself for consistency with original structure
        rayResultsCount++;
    }

    // --- 3. EDGE SEEKING & BUFFER FILL (GC Optimized) ---
    let validPoints = 0;

    for (let i = 0; i < rayResultsCount; i++) {
        const current = rayResults[i];
        
        // Add current ray to STATIC_RAY_BUFFER (reusing existing objects in the buffer)
        if (!STATIC_RAY_BUFFER[validPoints]) STATIC_RAY_BUFFER[validPoints] = {};
        STATIC_RAY_BUFFER[validPoints].x = current.x; // Use current.x directly now
        STATIC_RAY_BUFFER[validPoints].y = current.y; // Use current.y directly now
        validPoints++;

        // Look ahead to check for discontinuities
        if (i < rayResultsCount - 1) {
            const next = rayResults[i+1];
            // Since we set rayItem.result = rayItem, resA/resB reference the pool objects directly
            const resA = current; 
            const resB = next;

            // Detect if we hit different things
            const isDiscontinuity = (resA.mapX !== resB.mapX || resA.mapY !== resB.mapY) && (resA.hitContent !== 0 || resB.hitContent !== 0);

            if (isDiscontinuity) {
                // BINARY SEARCH FOR THE CORNER
                let lowAngle = current.angle;
                let highAngle = next.angle;
                let bestHit = null;

                // Create a temporary result object for the binary search intermediate steps
                // NOTE: Creating one object per binary search iteration is the last GC point, 
                // but essential for accuracy here. We'll use a single reusable temp object outside the loop.
                const tempRes = RAY_RESULT_POOL[rayResultsCount + 1]; // Use a dedicated temp slot

                for (let j = 0; j < 4; j++) {
                    const midAngle = (lowAngle + highAngle) / 2;
                    // Use the temporary slot for midRes
                    const midRes = castRay(midAngle, tempRes); 
                    
                    // Check if the mid ray matches the LEFT side (current)
                    if (midRes.mapX === resA.mapX && midRes.mapY === resA.mapY) {
                        lowAngle = midAngle; 
                        
                        // We must clone the best hit data since the next iteration overwrites `tempRes`
                        // To avoid GC, we can push the current best hit into the buffer slot directly.
                        bestHit = midRes; 
                    } else {
                        highAngle = midAngle; 
                    }
                }
                
                // --- Save the best hit into the final buffer ---
                if (bestHit) {
                    if (!STATIC_RAY_BUFFER[validPoints]) STATIC_RAY_BUFFER[validPoints] = {};
                    STATIC_RAY_BUFFER[validPoints].x = bestHit.x;
                    STATIC_RAY_BUFFER[validPoints].y = bestHit.y;
                    validPoints++;
                }
            }
        }
    }

    return validPoints;
}