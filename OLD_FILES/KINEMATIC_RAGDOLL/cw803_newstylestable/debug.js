const STATE_COLORS = {
   INVESTIGATING: '#ffaa00',
   LKP_SEARCH: '#ff6600', // NEW: Color for the localized search after reaching LKP
   SEARCHING: '#ff9900',
   MOVING_TO_REGION: '#ffcc00',
   CASUAL_MOVING: '#66aa33',
   PATROL_ROUTE: '#66aa33',
   IDLE: '#aaaaaa',
   FOLLOW_LEADER: '#8888ff', // NEW: Added a distinct color for followers waiting
   DEFAULT: '#999999',
};

const UI_COLORS = {
   clearedFill: 'rgba(0, 255, 128, 0.04)',
   busyFill: 'rgba(255, 200, 0, 0.04)',
   busyDetail: 'rgba(255, 200, 0, 0.25)',
   pathPatrol: 'rgba(150, 255, 255, 0.15)',
   pathChase: 'rgba(255, 100, 100, 0.2)',
   edge: 'rgba(255, 255, 255, 0.03)',
};

const patrolRenderer = (function () {
   // Cache region bounding boxes to avoid iterating tiles unnecessarily
   const regionBoundsCache = new Map();
   let regionCacheDirty = true;

   function updateRegionBounds() {
      if (!regionCacheDirty || typeof REGION_TILES === 'undefined') return;
      
      regionBoundsCache.clear();
      for (const [rId, tiles] of REGION_TILES) {
         if (tiles.length === 0) continue;
         let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
         
         // Find the AABB (Axis Aligned Bounding Box) for the region
         for (const tIdx of tiles) {
            const tx = tIdx % GRID_WIDTH;
            const ty = (tIdx / GRID_WIDTH) | 0;
            if (tx < minX) minX = tx;
            if (tx > maxX) maxX = tx;
            if (ty < minY) minY = ty;
            if (ty > maxY) maxY = ty;
         }
         // Store with 1 tile padding for borders
         regionBoundsCache.set(rId, { minX: minX - 1, minY: minY - 1, maxX: maxX + 2, maxY: maxY + 2 });
      }
      regionCacheDirty = false;
   }

   // Call this if regions are ever rebuilt/changed during gameplay
   function invalidateCache() { regionCacheDirty = true; }

   return {
      invalidate: invalidateCache,
      
      draw: function (ctx, vx, vy, vw, vh, screenWidth, screenHeight) {
         updateRegionBounds();

         // Viewport Bounds (in Grid Coordinates)
         const startX = Math.floor(vx);
         const startY = Math.floor(vy);
         const endX = Math.ceil(vx + vw);
         const endY = Math.ceil(vy + vh);
         
         const cellSizeX = screenWidth / vw;
         const cellSizeY = screenHeight / vh;
         const halfX = cellSizeX / 2;
         const halfY = cellSizeY / 2;
         const time = Date.now() / 1000;

         ctx.save();
         
         // --- OPTIMIZATION 1: Pre-calculate active set ---
         const activeRegions = new Set();
         // Only check living cultists
         for (let i = 0; i < cultists.length; i++) {
             const c = cultists[i];
             if (c.regionLock !== -1 && !c.isDying) activeRegions.add(c.regionLock);
         }

         // --- REGION DRAWING ---
         if (typeof REGION_TILES !== 'undefined') {
            for (const [rId, bounds] of regionBoundsCache) {
               // --- OPTIMIZATION 2: AABB Culling ---
               // If the region's bounding box doesn't overlap the camera, SKIP IT completely
               if (bounds.maxX < startX || bounds.minX > endX || 
                   bounds.maxY < startY || bounds.minY > endY) {
                  continue;
               }

               const tiles = REGION_TILES.get(rId);
               const regionStatus = REGION_STATUS.get(rId);
               const isActive = activeRegions.has(rId);
               const isCleared = regionStatus && regionStatus.status === 'CLEARED';

               // --- OPTIMIZATION 3: Fake Glow (No shadowBlur) ---
               // shadowBlur is extremely expensive. We use double-stroke instead.
               let mainColor, glowColor;
               let baseWidth = 1;

               if (isActive) {
                  mainColor = 'rgba(255, 165, 0, 0.3)'; 
                  glowColor = 'rgba(255, 165, 0, 0.1)'; // Wide faint stroke
                  baseWidth = 2;
               } else if (isCleared) {
                  mainColor = 'rgba(0, 255, 100, 0.1)';
                  glowColor = 'rgba(0, 255, 100, 0.025)';
               } else {
                  mainColor = 'rgba(255, 255, 255, 0.1)';
                  glowColor = 'rgba(255, 255, 255, 0.025)';
               }

               ctx.beginPath();
               
               // Only iterate tiles if the Region is visible (we passed the AABB check)
               // Also tight loop optimization: caching grid width
               const GW = GRID_WIDTH;
               const GH = GRID_HEIGHT;

               for (let i = 0; i < tiles.length; i++) {
                  const tIdx = tiles[i];
                  const tx = tIdx % GW;
                  const ty = (tIdx / GW) | 0;

                  // Inner Culling: Don't draw tiles outside viewport even if region overlaps
                  if (tx < startX - 1 || tx > endX + 1 || ty < startY - 1 || ty > endY + 1) continue;

                  const sx = (tx - vx) * cellSizeX;
                  const sy = (ty - vy) * cellSizeY;
                  const ex = sx + cellSizeX;
                  const ey = sy + cellSizeY;

                  // Top
                  if (ty === 0 || REGION_ID_MAP[tIdx - GW] !== rId) {
                     ctx.moveTo(sx, sy); ctx.lineTo(ex, sy);
                  }
                  // Bottom
                  if (ty === GH - 1 || REGION_ID_MAP[tIdx + GW] !== rId) {
                     ctx.moveTo(sx, ey); ctx.lineTo(ex, ey);
                  }
                  // Left
                  if (tx === 0 || REGION_ID_MAP[tIdx - 1] !== rId) {
                     ctx.moveTo(sx, sy); ctx.lineTo(sx, ey);
                  }
                  // Right
                  if (tx === GW - 1 || REGION_ID_MAP[tIdx + 1] !== rId) {
                     ctx.moveTo(ex, sy); ctx.lineTo(ex, ey);
                  }
               }

               // Draw "Glow" (Wide transparent stroke)
               ctx.lineWidth = baseWidth + 4;
               ctx.strokeStyle = glowColor;
               ctx.stroke();

               // Draw "Core" (Thin sharp stroke)
               ctx.lineWidth = baseWidth;
               ctx.strokeStyle = mainColor;
               ctx.stroke();
            }
         }

         // --- SEARCH POINTS ---
         // Batch drawing dots to avoid state changes
         ctx.fillStyle = STATE_COLORS.SEARCHING || '#ffff00';
         ctx.globalAlpha = 0.5;
         ctx.beginPath();
         let hasPoints = false;

         for (const [rId, st] of REGION_STATUS) {
             if (activeRegions.has(rId) && st.pendingPoints) {
                 for (let p of st.pendingPoints) {
                    // Culling Points
                    if (p.x < startX || p.x > endX || p.y < startY || p.y > endY) continue;
                    
                    const px = (p.x - vx) * cellSizeX + halfX;
                    const py = (p.y - vy) * cellSizeY + halfY;
                    ctx.moveTo(px, py); // Move to center avoids connecting lines between dots
                    ctx.arc(px, py, 2, 0, Math.PI * 2);
                    hasPoints = true;
                 }
             }
         }
         if (hasPoints) ctx.fill();

         // --- ENTITY PATHS ---
         for (let i = 0; i < cultists.length; i++) {
            const c = cultists[i];
            if (c.isDying) continue;

            // --- OPTIMIZATION 4: Entity Culling ---
            // Don't calculate paths for agents off screen
            if (c.x < startX - 5 || c.x > endX + 5 || c.y < startY - 5 || c.y > endY + 5) continue;

            const agentSx = (c.x - vx) * cellSizeX + halfX;
            const agentSy = (c.y - vy) * cellSizeY + halfY;

            let stateColor = STATE_COLORS[c.patrolState] || STATE_COLORS.DEFAULT;
            if (c.seesPlayer) stateColor = '#ff0000';
            
            const path = COOP_PATHS.get(c.id);
            const step = PATH_STEP_COUNTER.get(c.id) || 0;
            
            if (path && path.length > step + 1 && c.patrolState !== 'CHASE') {
               const vectorLimit = Math.min(path.length, step + 15);
               
               ctx.strokeStyle = stateColor;
               ctx.lineWidth = 2;
               ctx.globalAlpha = 0.7;
               ctx.beginPath();
               
               ctx.moveTo(agentSx, agentSy);

               // Draw path
               let prevX = agentSx, prevY = agentSy;
               for (let k = step + 1; k < vectorLimit; k++) {
                  const pIdx = path[k].index;
                  const tx = (pIdx % GRID_WIDTH - vx) * cellSizeX + halfX;
                  const ty = (((pIdx / GRID_WIDTH) | 0) - vy) * cellSizeY + halfY;
                  
                  // Simple quadratic smoothing
                  const mx = (prevX + tx) * 0.5;
                  const my = (prevY + ty) * 0.5;
                  ctx.quadraticCurveTo(prevX, prevY, mx, my);
                  
                  prevX = tx; 
                  prevY = ty;
                  
                  // Optimization: Stop drawing if the path goes way off screen
                  if (k % 5 === 0 && (tx < -50 || tx > screenWidth + 50 || ty < -50 || ty > screenHeight + 50)) break;
               }
               ctx.lineTo(prevX, prevY);
               ctx.stroke();

               // Target Box
               if(c.cbsTarget) {
                  const tx = (c.cbsTarget.x - vx) * cellSizeX + halfX;
                  const ty = (c.cbsTarget.y - vy) * cellSizeY + halfY;
                  ctx.fillStyle = stateColor;
                  ctx.fillRect(tx-2, ty-2, 4, 4);
               }
            }
         }

         // --- TARGET PULSE ---
         if(AITarget.x && AITarget.y) {
            const lkpX = AITarget.x;
            const lkpY = AITarget.y;
            if (lkpX >= startX && lkpX <= endX && lkpY >= startY && lkpY <= endY) {
               const sx = (lkpX - vx) * cellSizeX + halfX;
               const sy = (lkpY - vy) * cellSizeY + halfY;
               const ringPulse = (time * 2.0) % 1;
               ctx.strokeStyle = '#ff3333';
               ctx.lineWidth = 2;
               ctx.globalAlpha = 1.0 - ringPulse;
               ctx.beginPath();
               ctx.arc(sx, sy, (cellSizeX * 2) * ringPulse, 0, Math.PI * 2);
               ctx.stroke();
               
               ctx.fillStyle = '#ff3333';
               ctx.globalAlpha = 1.0;
               ctx.font = 'bold 11px monospace';
               ctx.textAlign = 'center';
               ctx.fillText('TARGET', sx, sy - 12);
            }
         }

         ctx.restore();
      }
   };
})();

function drawTacticalOverlay(ctx) {
   const { x: vx, y: vy } = viewport;
   const screenW = elements.canvas.width;
   const screenH = elements.canvas.height;
   ctx.save();
   ctx.restore();
   patrolRenderer.draw(ctx, vx, vy, viewport.width, viewport.height, screenW, screenH);
   debugRayRenderer.draw(ctx, vx, vy, viewport.width, viewport.height, screenW, screenH);
}

const DEBUG_RAYS = [];
const DEBUG_RAY_LIFETIME = 1.5;
const debugRayRenderer = (function () {
   return {
      draw: function (ctx, vx, vy, vw, vh, screenWidth, screenHeight) {
         const cellSizeX = screenWidth / vw;
         const cellSizeY = screenHeight / vh;
         const now = Date.now() / 1000;

         ctx.save();
         ctx.lineWidth = 2;

         // Iterate backwards to allow removal of dead rays
         for (let i = DEBUG_RAYS.length - 1; i >= 0; i--) {
            const ray = DEBUG_RAYS[i];
            const age = now - ray.timestamp;

            // Remove if older than lifetime
            if (age > DEBUG_RAY_LIFETIME) {
               DEBUG_RAYS.splice(i, 1);
               continue;
            }

            // Calculate Fade
            const alpha = 1.0 - (age / DEBUG_RAY_LIFETIME);
            ctx.globalAlpha = alpha;

            // Transform World Coords to Screen Coords
            // Adding 0.5 to center existing entities, but rays usually use exact float coords
            const sx1 = (ray.x1 - vx) * cellSizeX;
            const sy1 = (ray.y1 - vy) * cellSizeY;
            const sx2 = (ray.x2 - vx) * cellSizeX;
            const sy2 = (ray.y2 - vy) * cellSizeY;

            // Color Logic: Red if wall hit, Cyan/Green if clear
            if (ray.hit) {
               ctx.strokeStyle = '#ff0055'; // Blocked
            } else {
               ctx.strokeStyle = '#00ffaa'; // Clear LOS
            }

            ctx.beginPath();
            ctx.moveTo(sx1, sy1);
            ctx.lineTo(sx2, sy2);
            ctx.stroke();

            // Optional: Draw little X at the end
            ctx.beginPath();
            const s = 3;
            ctx.moveTo(sx2 - s, sy2 - s); ctx.lineTo(sx2 + s, sy2 + s);
            ctx.moveTo(sx2 + s, sy2 - s); ctx.lineTo(sx2 - s, sy2 + s);
            ctx.stroke();
         }

         ctx.restore();
      }
   };
})();