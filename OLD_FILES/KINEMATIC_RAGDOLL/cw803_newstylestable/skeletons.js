let skeletons = [];
let skelStartIndex = 0;
let aiFrameStartTime = 0;
const SkeletonGrid = new Int16Array(GRID_SIZE).fill(-1);
let skeletonDirtyIndices = [];

function updateSkeletonVisionGrid() {
   const len = skeletonDirtyIndices.length;
   for (let i = 0; i < len; i++) {
      SkeletonGrid[skeletonDirtyIndices[i]] = -1;
   }
   skeletonDirtyIndices.length = 0;
   const skelLen = skeletons.length;
   for (let i = 0; i < skelLen; i++) {
      const skel = skeletons[i];
      if (skel.isDying) continue;
      const gx = Math.floor(skel.x + 0.5); 
      const gy = Math.floor(skel.y + 0.5);
      if (gx >= 0 && gx < GRID_WIDTH && gy >= 0 && gy < GRID_HEIGHT) {
         const idx = gx + gy * GRID_WIDTH;
         SkeletonGrid[idx] = i; 
         skeletonDirtyIndices.push(idx);
      }
   }
}

function resetSkeletonAIBudget() { 
   aiFrameStartTime = performance.now(); 
}

function runSkeletonAI(ent, allEntities) {
   const AI_BUDGET_MS = 15.0;
   if (performance.now() - aiFrameStartTime > AI_BUDGET_MS) return;

   const SKELETON_TURN_FACTOR = 0.08; 
   const FRAME_RATE_DT_APPROX = 0.016;
   const MAX_CHASE_TIME = 15.0;
   const BASE_SPEED = 0.1; 
   const MAX_BONUS_SPEED = 1.4; 
   const MAX_TIMER = MAX_CHASE_TIME;
   const DETECTION_RANGE_SQ = 9;
   const LOSE_RANGE_SQ = 36;
   const STOP_DIST_SQ = 0.25;

   if (!ent.aiState) ent.aiState = { target: null, targetTimer: 0, noiseTarget: null, wanderTarget: null }; 
   const state = ent.aiState;

   if (state.targetTimer > 0) state.targetTimer -= FRAME_RATE_DT_APPROX;

   const speedT = state.targetTimer / MAX_TIMER;
   const currentSpeed = BASE_SPEED + (MAX_BONUS_SPEED * (speedT < 0 ? 0 : (speedT > 1 ? 1 : speedT)));

   // --- PRIORITY 1: COMBAT TARGET ---
   if (state.target) {
      if (state.target.isDying) {
         state.target = null;
      } else {
         const dx = state.target.x - ent.x;
         const dy = state.target.y - ent.y;
         const distSq = dx * dx + dy * dy;

         if (distSq > LOSE_RANGE_SQ) {
            state.noiseTarget = { x: state.target.x, y: state.target.y };
            state.targetTimer = MAX_CHASE_TIME; 
            state.target = null;
         } else {
            // Chase Target
            state.targetTimer = MAX_CHASE_TIME;
            state.noiseTarget = null;
            moveToTarget(ent, dx, dy, distSq, SKELETON_TURN_FACTOR, currentSpeed, STOP_DIST_SQ);
            return; 
         }
      }
   }

   // --- PRIORITY 2: SCANNING (Throttled) ---
   if ((globalFrameCount + ent.id) % 15 === 0) {
      let foundTarget = null;
      let closestDistSq = DETECTION_RANGE_SQ;
      if (!character.isDying) {
         const dx = character.x - ent.x;
         const dy = character.y - ent.y;
         const dSq = dx * dx + dy * dy;
         if (dSq < closestDistSq) {
            closestDistSq = dSq;
            foundTarget = character;
         }
      }
      if (!foundTarget || closestDistSq > 1.0) {
         for (let i = 0; i < cultists.length; i++) {
            const c = cultists[i];
            if (c.isDying) continue;
            const dx = c.x - ent.x;
            const dy = c.y - ent.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < closestDistSq) {
               closestDistSq = dSq;
               foundTarget = c;
            }
         }
      }

      if (foundTarget) {
         state.target = foundTarget;
         state.targetTimer = MAX_CHASE_TIME;
         state.noiseTarget = null;
         const dx = state.target.x - ent.x;
         const dy = state.target.y - ent.y;
         moveToTarget(ent, dx, dy, closestDistSq, SKELETON_TURN_FACTOR, currentSpeed, STOP_DIST_SQ);
         return;
      }
   }

   // --- PRIORITY 3: INVESTIGATE NOISE / LAST KNOWN ---
   if (ent.noiseTarget && state.targetTimer > 0) {
      const dx = ent.noiseTarget.x - ent.x;
      const dy = ent.noiseTarget.y - ent.y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < 1.0) {
         ent.noiseTarget = null;
         state.targetTimer = 0; 
         ent.cachedVX = 0;
         ent.cachedVY = 0;
      } else {
         moveToTarget(ent, dx, dy, distSq, SKELETON_TURN_FACTOR, currentSpeed, 0.01);
         return;
      }
   }

   // --- PRIORITY 4: WANDER AIMLESSLY ---
   if (!ent.wanderTarget || (ent.cachedVX === 0 && ent.cachedVY === 0)) {
       const angle = Math.random() * Math.PI * 2;
       const dist = 1.0 + Math.random() * 4.0;
       ent.wanderTarget = { 
           x: ent.x + Math.cos(angle) * dist, 
           y: ent.y + Math.sin(angle) * dist 
       };
   }

   const dx = ent.wanderTarget.x - ent.x;
   const dy = ent.wanderTarget.y - ent.y;
   const distSq = dx * dx + dy * dy;
   
   if (distSq > 0.1) {
       moveToTarget(ent, dx, dy, distSq, SKELETON_TURN_FACTOR, BASE_SPEED * 0.5, 0.1);
   } else {
       ent.cachedVX = 0;
       ent.cachedVY = 0;
       ent.wanderTarget = null;
   }
}

function moveToTarget(ent, dx, dy, distSq, turnFactor, speed, stopDistSq) {
   const targetRotation = Math.atan2(dy, dx);
   let diff = targetRotation - ent.rotation;
   while (diff < -Math.PI) diff += Math.PI * 2;
   while (diff > Math.PI) diff -= Math.PI * 2;
   ent.rotation += diff * turnFactor;
   if (distSq > stopDistSq) {
      const dist = Math.sqrt(distSq); 
      ent.cachedVX = (dx / dist) * speed;
      ent.cachedVY = (dy / dist) * speed;
   } else {
      ent.cachedVX = 0;
      ent.cachedVY = 0;
   }
}

function drawSkeletonHorde(deltaTime) {   
   const ctx = elements.ctx;
   const { x: vx, y: vy, width: vw, height: vh } = viewport;
   const viewMinX = vx - 1;
   const viewMaxX = vx + vw + 1;
   const viewMinY = vy - 1;
   const viewMaxY = vy + vh + 1;
   const cellSizeX = elements.canvas.width / vw;
   const cellSizeY = elements.canvas.height / vh;
   const destW = Math.ceil(cellSizeX);
   const destH = Math.ceil(cellSizeY);

   // --- DRAW DEAD SKELETONS ---
   for (const skel of deadBodies) {
      if (skel.faction !== 'skeleton') continue;
      if (skel.x < viewMinX || skel.x > viewMaxX || skel.y < viewMinY || skel.y > viewMaxY) continue;
      const px = (skel.renderX - vx) * cellSizeX;
      const py = (skel.renderY - vy) * cellSizeY;
      const centerX = Math.floor(px) + destW / 2;
      const centerY = Math.floor(py) + destH / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(skel.rotation);
      let alpha = 1.0;
      ctx.globalAlpha = alpha;
      const deadSprite = getSprite('#ff0000ff', skel.rotation, skel.id, skel, deltaTime); 
      ctx.drawImage(deadSprite, -destW/2, -destH/2, destW, destH);
      ctx.restore();
   }

   // --- DRAW ALIVE SKELETONS ---
   ctx.globalAlpha = 1.0;
   for (const skel of skeletons) {
      if (skel.isDying) continue;
      if (skel.x < viewMinX || skel.x > viewMaxX || skel.y < viewMinY || skel.y > viewMaxY) continue;
      const px = (skel.renderX - vx) * cellSizeX;
      const py = (skel.renderY - vy) * cellSizeY;
      const centerX = Math.floor(px) + destW / 2;
      const centerY = Math.floor(py) + destH / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(skel.rotation);
      const aliveSprite = getSprite('#009e0dff', skel.rotation, skel.id, skel, deltaTime);
      ctx.drawImage(aliveSprite, -destW/2, -destH/2, destW, destH);
      ctx.restore();
   }
}