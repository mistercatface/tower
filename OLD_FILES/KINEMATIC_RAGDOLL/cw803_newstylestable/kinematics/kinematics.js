// Returns the aim angle relative to the dive direction, so the pose is always as if diving right
function getRelativeAimAngle(diveDir, aimAngle) {
   // 'diveDir' and 'aimAngle' are both in radians, 0 = right, PI/2 = down, PI = left, -PI/2 = up
   // We want to rotate the aiming pose so that 'diveDir' always acts like 0 (right)
   let rel = aimAngle - diveDir;
   // Normalize to [-PI, PI]
   while (rel > Math.PI) rel -= 2 * Math.PI;
   while (rel < -Math.PI) rel += 2 * Math.PI;
   return rel;
}

function getAimingArmAngles(aimAngle, whichArms = 'right', extension = -1.5, diveDir = 0) {
   // relAim is the aim angle relative to dive direction
   // This makes the pose consistent regardless of which way you're diving
   let relAim = getRelativeAimAngle(diveDir, aimAngle);

   let rArm, lArm, rElbow, lElbow;
   let rArmZ = 0.0, lArmZ = 0.0;
   let rElbowZ = 0.0, lElbowZ = 0.0;

   // Normalize whichArms
   let armsArr = [];
   if (whichArms === 'both') {
      armsArr = ['right', 'left'];
   } else if (typeof whichArms === 'string') {
      armsArr = [whichArms];
   } else if (Array.isArray(whichArms)) {
      armsArr = whichArms;
   }

   if (armsArr.length === 2) {
      // TWO-HANDED: Both arms extended, both rotate together, hands meet at gun
      rArm = -Math.PI / 2;
      lArm = -Math.PI / 2;
      rElbow = extension;
      lElbow = extension;
      
      // Both shoulders rotate to aim
      // Add convergence to bring hands together
      const handConvergence = 0.35;
      rArmZ = relAim + handConvergence;
      lArmZ = -(relAim - handConvergence); // Negated because getSeg uses -lArmZ
      
   } else if (armsArr.length === 1) {
      // ONE-HANDED: Gun arm extended and aims, other arm at side
      if (armsArr[0] === 'right') {
         rArm = -Math.PI / 2;
         rElbow = extension;
         rArmZ = relAim;
         
         // Left arm at side
         lArm = 0.0;
         lElbow = -0.2;
         lArmZ = 0.0;
      } else {
         lArm = -Math.PI / 2;
         lElbow = extension;
         lArmZ = -relAim; // Negated because getSeg uses -lArmZ
         
         // Right arm at side
         rArm = 0.0;
         rElbow = -0.2;
         rArmZ = 0.0;
      }
   } else {
      // Default: right arm as gun arm
      rArm = -Math.PI / 2;
      rElbow = extension;
      rArmZ = relAim;
      
      lArm = 0.0;
      lElbow = -0.2;
      lArmZ = 0.0;
   }

   return {
      rArm, lArm, rElbow, lElbow,
      rArmZ, lArmZ,
      rElbowZ: 0.0, lElbowZ: 0.0
   };
}

const ENTITY_STATES = {};

const SHARED_CANVAS = document.createElement('canvas');
const SHARED_CTX = SHARED_CANVAS.getContext('2d', { alpha: true });
SHARED_CANVAS.width = 256;
SHARED_CANVAS.height = 256;

const DEFAULT_CONFIG = Object.freeze({
   STRIDE_SPEED: 6.0,
   IDLE_SPEED: 2.0,
   WALK_DIR: 1,
   BODY_OFFSET: Math.PI,
   SIZE: 17,
   ANCHOR_Y: 0.9,
   PADDING: 120,
   HEAD_R: 0.15,
   TORSO_W: 0.25,
   TORSO_D: 0.15,
   TORSO_H: 0.25,
   HIP_W: 0.12,
   ARM_L1: 0.13,
   ARM_L2: 0.12,
   ARM_R1: 0.13,
   ARM_R2: 0.12,
   ARM_FLARE: 0.04,
   LEG_L1: 0.15,
   LEG_L2: 0.15,
   LEG_FLARE: 0.0,
   TILT: 0.40,
   HAND_R: 0.04,
});

// --- SPRITE CACHING SYSTEM ---
const SPRITE_CACHE = {
   cache: new Map(),
   MAX_ITEMS: 3000,    // Increased limit slightly to handle tilt variations
   ROTATION_STEPS: 32, 
   ANIM_FRAMES: 30,    
   TILT_STEPS: 5,      // NEW: 5 zones of perspective depth (Center -> Edge)
   CACHE_PADDING: 40,

   getKey(id, pose, weapon, rotation, cycle, crouch, tiltFactor) {
      // 1. Quantize Rotation
      const rotStep = (Math.PI * 2) / this.ROTATION_STEPS;
      let r = (rotation % (Math.PI * 2));
      if (r < 0) r += Math.PI * 2;
      const qRot = Math.floor(r / rotStep);

      // 2. Quantize Animation
      const cycStep = (Math.PI * 2) / this.ANIM_FRAMES;
      let c = (cycle % (Math.PI * 2));
      if (c < 0) c += Math.PI * 2;
      const qCyc = Math.floor(c / cycStep);

      // 3. Quantize Crouch
      const qCrouch = crouch > 0.5 ? 1 : 0;
      
      // 4. NEW: Quantize Tilt (0.0 to 1.0)
      // 0 = Center of screen, 1 = Far edge
      const qTilt = Math.floor(tiltFactor * (this.TILT_STEPS - 1));

      const wKey = weapon || 'none';

      return `${id}_${pose}_${wKey}_${qRot}_${qCyc}_${qCrouch}_${qTilt}`;
   },

   get(key) {
      const item = this.cache.get(key);
      if (item) {
         item.lastUsed = Date.now();
         return item.canvas;
      }
      return null;
   },

   set(key, sourceCanvas) {
      if (this.cache.size >= this.MAX_ITEMS) {
         const oldestKey = this.cache.keys().next().value;
         this.cache.delete(oldestKey);
      }

      const c = document.createElement('canvas');
      c.width = sourceCanvas.width;
      c.height = sourceCanvas.height;
      c.drawRatio = sourceCanvas.drawRatio;
      c.verticalShift = sourceCanvas.verticalShift;
      
      const ctx = c.getContext('2d');
      ctx.drawImage(sourceCanvas, 0, 0);

      this.cache.set(key, { canvas: c, lastUsed: Date.now() });
      return c;
   },

   // Returns snapped values so rendering matches the key
   getQuantizedValues(rotation, cycle, tiltFactor) {
      const rotStep = (Math.PI * 2) / this.ROTATION_STEPS;
      let r = (rotation % (Math.PI * 2));
      if (r < 0) r += Math.PI * 2;
      const qRot = Math.floor(r / rotStep) * rotStep;

      const cycStep = (Math.PI * 2) / this.ANIM_FRAMES;
      let c = (cycle % (Math.PI * 2));
      if (c < 0) c += Math.PI * 2;
      const qCyc = Math.floor(c / cycStep) * cycStep;
      
      // Snap tilt to the nearest bucket value (0.0, 0.25, 0.5, etc)
      const bucket = Math.floor(tiltFactor * (this.TILT_STEPS - 1));
      const qTilt = bucket / (this.TILT_STEPS - 1);
      
      return { rotation: qRot, cycle: qCyc, tilt: qTilt };
   }
};

const getScaledPhysics = (size) => {
   const scale = size / 32;
   const base = RAGDOLL_CONFIG.PHYSICS;
   return {
      GRAVITY: base.GRAVITY * scale,
      AIR_DRAG: base.AIR_DRAG,
      GROUND_FRICTION: base.GROUND_FRICTION,
      WALL_BOUNCE: base.WALL_BOUNCE,
      WALL_FRICTION: base.WALL_FRICTION,
      SPEED_CAP: base.SPEED_CAP * scale,
      COLLISION_STEPS: base.COLLISION_STEPS,
      IMPACT_DISTRIBUTION: base.IMPACT_DISTRIBUTION,
      CHAOS: base.CHAOS * scale,
      VELOCITY_SCALER: base.VELOCITY_SCALER,
   };
};

const RAGDOLL_CONFIG = {
   PHYSICS: {
      GRAVITY: 0.5,
      AIR_DRAG: 0.95,
      GROUND_FRICTION: 0.9,
      WALL_BOUNCE: 0.5,
      WALL_FRICTION: 0.5,
      SPEED_CAP: 3.5,
      COLLISION_STEPS: 3,
      IMPACT_DISTRIBUTION: 0.4,
      CHAOS: 0.2,
      VELOCITY_SCALER: 0.35,
   },
   CONSTRAINTS: {
      STIFFNESS: 0.75,
      ITERATIONS: 4,
      JOINT_ANGLES: {
         ELBOW: { min: -2.5, max: 0.1 },
         KNEE: { min: -0.1, max: 2.5 },
         NECK: { min: -0.7, max: 0.7 },
      }
   },
   GORE: {
      FORCE_MULTIPLIER: 0.43,
      SEVER_THRESHOLD: 10,
      MAX_SEVER_COUNT: 5,
      CASCADE_CHANCE: 0.65,
      CASCADE_DECAY: 0.6,
      FRAGILITY: {  // (lower = easier to cut)
         head: 0.75,
         rArm: 1.0, 
         lArm: 1.0,
         rLeg: 0.9,
         lLeg: 0.9
      },
      MAX_SPLITS: {
         head: 5,
         torso: 5,
         limb: 5
      }
   },
   BLOOD: {
      BURST_COUNT: 5,
      SPRAY_LIFE: 2.0,
      GRAVITY: 2.0,
      DRAG: 0.96,
      LIFESPAN_MIN: 2.0,
      LIFESPAN_MAX: 5.0,
      DROP_SIZE: 0.01,
      SPLAT_SIZE: 1.0,
      PALETTE: {
         ARTERIAL: '#ad0000ff',
         VENOUS: '#8a0000',
         DRIED: '#4a0000',
         BONE: '#e8e6d1',
         MARROW: '#5c1818'
      }
   },
   HEALTH: {
      head: 50,
      torso: 60,
      limb: 30,
      default: 30
   },
};

const DAMAGE_NEIGHBORS = {
   'head': ['spineTop'],
   'spineTop': ['head', 'rArm', 'lArm', 'spineBot'],
   'spineBot': ['spineTop', 'rHip', 'lHip'],
   'rShoulder': ['spineTop', 'rArm'],
   'lShoulder': ['spineTop', 'lArm'],
   'rArm': ['rShoulder'],
   'lArm': ['lShoulder'],
   'rHip': ['spineBot', 'rLeg'],
   'lHip': ['spineBot', 'lLeg'],
   'rLeg': ['rHip'],
   'lLeg': ['lHip']
};

const SEVER_MAP = {
   'head': 'head',
   'rShoulder': 'rArm',
   'rArm': 'rArm',
   'rElbow': 'rForearm',
   'rForearm': 'rForearm',
   'rHand': 'rForearm',
   'lShoulder': 'lArm',
   'lArm': 'lArm',
   'lElbow': 'lForearm',
   'lForearm': 'lForearm',
   'lHand': 'lForearm',
   'rHip': 'rLeg',
   'rLeg': 'rLeg',
   'rKnee': 'rShin',
   'rShin': 'rShin',
   'rFoot': 'rShin',
   'lHip': 'lLeg',
   'lLeg': 'lLeg',
   'lKnee': 'lShin',
   'lShin': 'lShin',
   'lFoot': 'lShin'
};

const HIT_ZONES = [
   { id: 'head', weight: 15, severable: true, link: null },
   { id: 'spineTop', weight: 20, severable: false, link: null },
   { id: 'spineBot', weight: 15, severable: false, link: null },
   { id: 'rShoulder', weight: 20, severable: true, link: 'rArm' },
   { id: 'lShoulder', weight: 20, severable: true, link: 'lArm' },
   { id: 'rHip', weight: 15, severable: true, link: 'rLeg' },
   { id: 'lHip', weight: 15, severable: true, link: 'lLeg' }
];

const distToSegment = (p, v, w) => {
   const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2 + (w.z - v.z) ** 2;
   if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y, p.z - v.z);
   let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y) + (p.z - v.z) * (w.z - v.z)) / l2;
   t = Math.max(0, Math.min(1, t));
   return {
      dist: Math.sqrt((p.x - (v.x + t * (w.x - v.x))) ** 2 +
         (p.y - (v.y + t * (w.y - v.y))) ** 2 +
         (p.z - (v.z + t * (w.z - v.z))) ** 2),
      t: t
   };
};

const getPartCategory = (partName) => {
   const clean = partName.split('_fr_')[0].split('_fracture_')[0];
   if (clean === 'head') return 'head';
   if (clean.includes('spine') || clean === 'torso') return 'torso';
   return 'limb';
};

const getBasePart = (name) => {
   const match = name.match(/^(head|torso|spine\w*|[rl](?:Arm|Leg|Shoulder|Elbow|Hand|Hip|Knee|Foot|Forearm|Shin))/i);
   return match ? match[1] : name;
};

const countSplits = (state, partName) => {
   if (!state.ragdoll || !state.ragdoll.splitCounts) return 0;
   const basePart = getBasePart(partName);
   return state.ragdoll.splitCounts[basePart] || 0;
};

const incrementSplitCount = (state, partName) => {
   if (!state.ragdoll) return;
   if (!state.ragdoll.splitCounts) state.ragdoll.splitCounts = {};
   const basePart = getBasePart(partName);
   state.ragdoll.splitCounts[basePart] = (state.ragdoll.splitCounts[basePart] || 0) + 1;
};

const canSplitPart = (state, partName) => {
   const category = getPartCategory(partName);
   const maxSplits = RAGDOLL_CONFIG.GORE.MAX_SPLITS[category];
   const currentSplits = countSplits(state, partName);
   return currentSplits < maxSplits;
};

const splitBone = (state, boneStartName, t = 0.5) => {
   const ragdoll = state.ragdoll;
   if (!ragdoll) return null;
   if (!canSplitPart(state, boneStartName)) { return null; }
   const constraints = ragdoll.constraints;
   const points = ragdoll.points;
   const prevPoints = ragdoll.prevPoints;
   const basePart = getBasePart(boneStartName);
   if (basePart === 'torso' || basePart === 'spineTop' || basePart === 'spineBot') {
      if (boneStartName.includes('_fr_') || ragdoll.torsoFragmented) { return null; }
      const top = points.spineTop;
      const bot = points.spineBot;
      if (!top || !bot) return null;
      for (let i = constraints.length - 1; i >= 0; i--) {
         const c = constraints[i];
         const isTop = (id) => id === 'spineTop' || id === 'head' || (id && id.includes('Shoulder'));
         const isBot = (id) => id === 'spineBot' || (id && id.includes('Hip'));
         if ((isTop(c.a) && isBot(c.b)) || (isTop(c.b) && isBot(c.a))) { constraints.splice(i, 1); }
      }
      const mx = (top.x + bot.x) * 0.5;
      const my = (top.y + bot.y) * 0.5;
      const mz = (top.z + bot.z) * 0.5;
      let ax = bot.x - top.x, az = bot.z - top.z;
      const alen = Math.hypot(ax, az) || 1.0;
      ax /= alen; az /= alen;
      let lx = -az, lz = ax;
      const push = (RIG ? RIG.torsoHalfWidth : 4.0) * (RIG ? RIG.size / 32 : 1.0);
      const idL = `torso_fr_left_${Math.floor(Math.random() * 10000)}`;
      const idR = `torso_fr_right_${Math.floor(Math.random() * 10000)}`;
      points[idL] = { x: mx + lx * push, y: my, z: mz + lz * push };
      points[idR] = { x: mx - lx * push, y: my, z: mz - lz * push };
      prevPoints[idL] = { ...points[idL] };
      prevPoints[idR] = { ...points[idR] };
      const dTL = Math.hypot(top.x - points[idL].x, top.y - points[idL].y, top.z - points[idL].z);
      const dRB = Math.hypot(points[idR].x - bot.x, points[idR].y - bot.y, points[idR].z - bot.z);
      constraints.push({ a: 'spineTop', b: idL, len: dTL * 0.95 });
      constraints.push({ a: idR, b: 'spineBot', len: dRB * 0.95 });
      spawnGuts(state, 'spineTop', 8);
      spawnGuts(state, 'spineTop', 6);
      const impulse = 2.0 * (RIG ? RIG.size / 32 : 1.0);
      prevPoints[idL].x -= lx * impulse;
      prevPoints[idL].z -= lz * impulse;
      prevPoints[idR].x += lx * impulse;
      prevPoints[idR].z += lz * impulse;
      ragdoll.torsoFragmented = true;
      ragdoll.torsoFragments = { left: idL, right: idR };
      if (!ragdoll.splitCounts) ragdoll.splitCounts = {};
      ragdoll.splitCounts['torso'] = 1;
      incrementSplitCount(state, boneStartName);
      return idL;
   }
   if (basePart === 'head' && !boneStartName.includes('_fr_')) {
      const headP = points.head;
      const spineP = points.spineTop;
      if (!headP || !spineP) return null;
      const numSlices = 6;
      const detachFraction = 0.25;
      const attachLenFactor = 0.7;
      const sizeScale = (RIG ? RIG.size / 32 : 1.0);
      const radialBase = ((RIG && RIG.headR) ? RIG.headR : 8) * (0.8 + Math.random() * 0.2);
      const impulseBase = (0.25 + Math.random() * 1.75) * sizeScale;
      const createdIds = [];
      const bCfg = RAGDOLL_CONFIG.BLOOD;
      for (let i = 0; i < numSlices; i++) {
         const angle = (i / numSlices) * Math.PI * 2;
         const radial = radialBase * (0.55 + Math.random() * 0.6);
         const fx = headP.x + Math.cos(angle) * radial;
         const fz = headP.z + Math.sin(angle) * radial;
         const fy = headP.y + (Math.random() - 0.5) * (radial * 0.18);

         const fragId = `${basePart}_fr_${Date.now()}_${i}`;
         points[fragId] = { x: fx, y: fy, z: fz };
         prevPoints[fragId] = { x: fx, y: fy, z: fz };
         createdIds.push(fragId);
      }
      const detachCount = Math.max(1, Math.round(numSlices * detachFraction));
      const indices = Array.from({ length: numSlices }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const detachSet = new Set(indices.slice(0, detachCount));
      for (let i = 0; i < createdIds.length; i++) {
         const id = createdIds[i];
         const p = points[id];
         let dx = p.x - headP.x;
         let dz = p.z - headP.z;
         const dist = Math.hypot(dx, dz) || 1.0;
         dx /= dist; dz /= dist;
         if (detachSet.has(i)) {
            const speed = impulseBase * (1.0 + Math.random() * 1.2);
            const up = 1.8 * sizeScale * (0.6 + Math.random() * 1.0);
            prevPoints[id].x = p.x - dx * speed;
            prevPoints[id].z = p.z - dz * speed;
            prevPoints[id].y = p.y - (-up);
            ragdoll.emitters.push({
               bone: id,
               dir: { x: dx * 0.6, y: -1.0, z: dz * 0.6 },
               life: bCfg.SPRAY_LIFE * (0.8 + Math.random() * 0.6),
               scale: 0.9 + Math.random() * 0.8
            });
            for (let k = 0; k < 3; k++) {
               const lifeDur = bCfg.LIFESPAN_MIN + Math.random() * (bCfg.LIFESPAN_MAX - bCfg.LIFESPAN_MIN);
               ragdoll.particles.push({
                  x: p.x + (Math.random() - 0.5) * 0.05,
                  y: p.y + (Math.random() - 0.5) * 0.05,
                  z: p.z + (Math.random() - 0.5) * 0.05,
                  vx: dx * (2 + Math.random() * 3) + (Math.random() - 0.5),
                  vy: - (2 + Math.random() * 3),
                  vz: dz * (2 + Math.random() * 3) + (Math.random() - 0.5),
                  life: lifeDur, startLife: lifeDur, size: 0.6 + Math.random() * 0.6,
                  color: (Math.random() < 0.6) ? bCfg.PALETTE.ARTERIAL : bCfg.PALETTE.VENOUS,
                  onGround: false
               });
            }
         } else {
            const d = Math.hypot(p.x - headP.x, p.y - headP.y, p.z - headP.z);
            constraints.push({ a: 'head', b: id, len: Math.max(0.001, d * attachLenFactor) });
            ragdoll.emitters.push({
               bone: id,
               dir: { x: 0.0, y: -1.0, z: 0.0 },
               life: bCfg.SPRAY_LIFE * 0.5,
               scale: 0.45 + Math.random() * 0.3
            });
         }
      }
      if (prevPoints['head']) {
         prevPoints['head'].x = points['head'].x;
         prevPoints['head'].y = points['head'].y;
         prevPoints['head'].z = points['head'].z;
      }
      ragdoll.headFragmented = true;
      if (!ragdoll.splitCounts) ragdoll.splitCounts = {};
      ragdoll.splitCounts['head'] = RAGDOLL_CONFIG.GORE.MAX_SPLITS.head;
      try {  severLimb(state, 'head'); } catch (e) { console.log('hamburgers'); }
      incrementSplitCount(state, boneStartName);
      return createdIds[0] || 'head';
   }
   const VISUAL_TO_PHYSICS = {
      'rLeg': 'rHip', 'rThigh': 'rHip',
      'lLeg': 'lHip', 'lThigh': 'lHip',
      'rShin': 'rKnee', 'rKnee': 'rKnee',
      'lShin': 'lKnee', 'lKnee': 'lKnee',
      'rArm': 'rShoulder', 'rShoulder': 'rShoulder',
      'lArm': 'lShoulder', 'lShoulder': 'lShoulder',
      'rForearm': 'rElbow', 'rElbow': 'rElbow',
      'lForearm': 'lElbow', 'lElbow': 'lElbow',
      'torso': 'spineTop', 'spineTop': 'spineTop',
      'head': 'head'
   };
   let searchID = boneStartName;
   if (boneStartName.includes('_fr_')) {
      searchID = boneStartName;
   } else if (VISUAL_TO_PHYSICS[boneStartName]) {
      searchID = VISUAL_TO_PHYSICS[boneStartName];
   }
   let constraintIndex = -1;
   let foundConstraint = null;
   if (searchID === 'spineTop' && !boneStartName.includes('_fr_')) {
      constraintIndex = constraints.findIndex(c => c.a === 'spineTop' && c.b === 'spineBot');
   }
   else if (searchID === 'head' && !boneStartName.includes('_fr_')) {
      constraintIndex = constraints.findIndex(c => c.a === 'head' || c.b === 'head');
      if (constraintIndex !== -1) {
         foundConstraint = constraints[constraintIndex];
         if (foundConstraint.b === 'head') { t = 1.0 - t; }
      }
   }
   else if (boneStartName.includes('_fr_')) {
      constraintIndex = constraints.findIndex(c => c.a === searchID || c.b === searchID);
      if (constraintIndex !== -1) {
         foundConstraint = constraints[constraintIndex];
         if (foundConstraint.b === searchID) { t = 1.0 - t; }
      }
   }
   else {
      constraintIndex = constraints.findIndex(c => c.a === searchID);
   }
   if (constraintIndex === -1) {
      constraintIndex = constraints.findIndex(c => c.b === searchID);
      if (constraintIndex !== -1) { t = 1.0 - t; }
   }
   if (constraintIndex === -1) return null;
   const oldConstraint = constraints[constraintIndex];
   if (oldConstraint.len < 0.10) return null;
   const p1Name = oldConstraint.a;
   const p2Name = oldConstraint.b;
   const p1 = points[p1Name];
   const p2 = points[p2Name];
   if (!p1 || !p2) return null;
   const newPointId = `${basePart}_fr_${Math.floor(Math.random() * 9999)}`;
   ragdoll.points[newPointId] = { x: p1.x + (p2.x - p1.x) * t,  y: p1.y + (p2.y - p1.y) * t, z: p1.z + (p2.z - p1.z) * t };
   ragdoll.prevPoints[newPointId] = { ...ragdoll.points[newPointId] };
   constraints.splice(constraintIndex, 1);
   const dist1 = Math.hypot( p1.x - ragdoll.points[newPointId].x,p1.y - ragdoll.points[newPointId].y, p1.z - ragdoll.points[newPointId].z );
   const dist2 = Math.hypot( p2.x - ragdoll.points[newPointId].x, p2.y - ragdoll.points[newPointId].y, p2.z - ragdoll.points[newPointId].z);
   constraints.push({ a: p1Name, b: newPointId, len: dist1 });
   constraints.push({ a: newPointId, b: p2Name, len: dist2 });
   incrementSplitCount(state, boneStartName);
   return newPointId;
};

const applyRagdollImpulse = (entityId, forceX, forceY, forceZ, hitPart, damageVal = 10, offsetT = 0.5) => {
   const state = ENTITY_STATES[entityId];
   if (!state || !state.isRagdoll || !state.ragdoll) return;
   const gCfg = RAGDOLL_CONFIG.GORE;
   const bCfg = RAGDOLL_CONFIG.BLOOD;
   const hCfg = RAGDOLL_CONFIG.HEALTH;
   const rotation = state.ragdollRotation || 0;
   const bRot = rotation + DEFAULT_CONFIG.BODY_OFFSET;
   const cos = Math.cos(-bRot);
   const sin = Math.sin(-bRot);
   const localFx = forceX * cos - forceZ * sin;
   const localFz = forceX * sin + forceZ * cos;
   const localFy = forceY;
   const forceVec = { x: localFx, y: localFy, z: localFz };
   const physCfg = getScaledPhysics(RIG.size);
   const VELOCITY_SCALER = physCfg.VELOCITY_SCALER;
   const points = state.ragdoll.points;
   const prevPoints = state.ragdoll.prevPoints;
   const constraints = state.ragdoll.constraints;
   let impulseCenter = hitPart;
   if (!points[impulseCenter]) {
      const physMap = { 'torso': 'spineTop', 'rLeg': 'rHip', 'lLeg': 'lHip', 'rArm': 'rShoulder', 'lArm': 'lShoulder' };
      impulseCenter = physMap[hitPart] || 'spineTop';
      if (!points[impulseCenter]) impulseCenter = 'spineTop';
   }
   if (!points[impulseCenter]) return;
   const maxDepth = 2;
   const affectedSet = new Set();
   const q = [{ id: impulseCenter, depth: 0 }];
   affectedSet.add(impulseCenter);
   while (q.length > 0) {
      const { id, depth } = q.shift();
      if (depth >= maxDepth) continue;
      for (const c of constraints) {
         if (c.a === id && !affectedSet.has(c.b)) {
            affectedSet.add(c.b);
            q.push({ id: c.b, depth: depth + 1 });
         } else if (c.b === id && !affectedSet.has(c.a)) {
            affectedSet.add(c.a);
            q.push({ id: c.a, depth: depth + 1 });
         }
      }
   }
   const maxInfluence = RIG.size * 0.45;
   const centerP = points[impulseCenter];
   for (const key of Object.keys(points)) {
      if (!affectedSet.has(key)) continue;
      const p = points[key];
      const prev = prevPoints[key];
      if (!prev) continue;
      if (key === impulseCenter) {
         prev.x -= forceVec.x * VELOCITY_SCALER;
         prev.y -= forceVec.y * VELOCITY_SCALER;
         prev.z -= forceVec.z * VELOCITY_SCALER;
         continue;
      }
      const d = Math.hypot(p.x - centerP.x, p.y - centerP.y, p.z - centerP.z);
      if (d > maxInfluence) continue;
      const distFactor = Math.max(0.0, 1.0 - (d / maxInfluence));
      const falloff = distFactor * distFactor;
      const transfer = physCfg.IMPACT_DISTRIBUTION * falloff;
      if (transfer <= 1e-6) continue;
      prev.x -= forceVec.x * transfer * VELOCITY_SCALER;
      prev.y -= forceVec.y * transfer * VELOCITY_SCALER;
      prev.z -= forceVec.z * transfer * VELOCITY_SCALER;
   }
   let cleanType = hitPart.split('_fr_')[0].split('_fracture_')[0];
   const severTarget = SEVER_MAP[cleanType] || null;
   let healthCategory = 'default';
   if (cleanType === 'head') healthCategory = 'head';
   else if (cleanType.includes('spine') || cleanType === 'torso') healthCategory = 'torso';
   else healthCategory = 'limb';
   const maxHP = hCfg[healthCategory] || hCfg.default;
   if (state.ragdoll.partHealth[hitPart] === undefined) { state.ragdoll.partHealth[hitPart] = maxHP; }
   const totalForce = Math.hypot(forceX, forceY, forceZ);
   const forceMultiplier = Math.min(2.0, totalForce / 5.0);
   const damageInflicted = damageVal * (0.5 + forceMultiplier);
   state.ragdoll.partHealth[hitPart] -= damageInflicted;
   const isHealthDepleted = state.ragdoll.partHealth[hitPart] <= 0;
   const fragility = gCfg.FRAGILITY[cleanType] || 1.0;
   const threshold = gCfg.SEVER_THRESHOLD * fragility;
   const isInstantBreak = (totalForce * 0.1 > threshold);
   const canFracture = canSplitPart(state, hitPart);
   const canSever = !!severTarget && !state.ragdoll.severed[severTarget];
   if (isHealthDepleted || isInstantBreak) {
      let action = 'NONE';
      if (canFracture && canSever) {
         action = Math.random() < 0.5 ? 'FRACTURE' : 'SEVER';
      } else if (canFracture) {
         action = 'FRACTURE';
      } else if (canSever) {
         action = 'SEVER';
      }
      if (action === 'FRACTURE') {
         const brokenBoneId = splitBone(state, hitPart, offsetT || 0.5);
         if (brokenBoneId) {
            state.ragdoll.partHealth[brokenBoneId] = maxHP * 0.5;
            const bP = state.ragdoll.points[brokenBoneId];
            for (let i = 0; i < 3; i++) {
               state.ragdoll.particles.push({
                  x: bP.x, y: bP.y, z: bP.z,
                  vx: (Math.random() - 0.5) * 4,
                  vy: -Math.random() * 4,
                  vz: (Math.random() - 0.5) * 4,
                  life: 0.7, startLife: 0.7, size: 0.5,
                  color: bCfg.PALETTE.BONE,
                  onGround: false
               });
            }
            state.ragdoll.particles.push({
               x: bP.x, y: bP.y, z: bP.z,
               vx: (Math.random() - 0.5) * 2,
               vy: -1,
               vz: (Math.random() - 0.5) * 2,
               life: 1.0, startLife: 1.0, size: 0.6,
               color: bCfg.PALETTE.ARTERIAL,
               onGround: false
            });
         }
      } else if (action === 'SEVER') {
         severLimb(state, severTarget);
      }
   } else {
      const bP = state.ragdoll.points[impulseCenter];
      if (bP) {
         state.ragdoll.particles.push({
            x: bP.x, y: bP.y, z: bP.z,
            vx: (Math.random() - 0.5),
            vy: -0.5,
            vz: (Math.random() - 0.5),
            life: 0.4, startLife: 0.4, size: 0.4,
            color: bCfg.PALETTE.VENOUS,
            onGround: false
         });
      }
   }
};

const checkSkeletonHit = (entity, bulletX, bulletY, bulletZ = 1.0, bulletRadius = 0.1) => {
   const state = ENTITY_STATES[entity.id];
   if (!state) return null;
   const dx = bulletX - (entity.x + 0.5);
   const dy = bulletY - (entity.y + 0.5);
   const rotation = -entity.rotation - DEFAULT_CONFIG.BODY_OFFSET;
   const cos = Math.cos(rotation), sin = Math.sin(rotation);
   const lx = (dx * cos - dy * sin) * RIG.size;
   const lz = (dx * sin + dy * cos) * RIG.size;
   const ly = RIG.groundY - (bulletZ * (RIG.groundY - RIG.baseShoulderY) * 0.8);
   const localBullet = { x: lx, y: ly, z: lz };
   const hitRadiusScale = bulletRadius * RIG.size;
   let bones = [];
   if (state.isRagdoll && state.ragdoll) {
      const points = state.ragdoll.points;
      const constraints = state.ragdoll.constraints;
      if (points.head) {
         bones.push({ id: 'head', type: 'sphere', p1: points.head, radius: RIG.headR });
      }
      for (const c of constraints) {
         const p1 = points[c.a];
         const p2 = points[c.b];
         if (!p1 || !p2) continue;
         let r = RIG.armL1 * 0.25;
         const nameCheck = c.a + c.b;
         if (nameCheck.includes('spine') || nameCheck.includes('torso')) { 
            r = RIG.torsoHalfWidth; 
         }
         else if (nameCheck.toLowerCase().includes('leg') || nameCheck.toLowerCase().includes('hip') || nameCheck.toLowerCase().includes('shin') || nameCheck.toLowerCase().includes('knee') || nameCheck.toLowerCase().includes('foot')) {
            r = RIG.legL1 * 0.3;
         }
         else if (nameCheck.toLowerCase().includes('arm') || nameCheck.toLowerCase().includes('shoulder') || nameCheck.toLowerCase().includes('elbow') || nameCheck.toLowerCase().includes('hand')) {
            r = RIG.armL1 * 0.3;
         }
         else if (nameCheck.toLowerCase().includes('head')) {
            r = RIG.headR * 0.8;
         }
         r *= 2.5;
         bones.push({
            id: `${c.a}_${c.b}`,
            type: 'capsule',
            aName: c.a,
            bName: c.b,
            p1: p1,
            p2: p2,
            radius: r
         });
      }
   } else {
      const pointsToCheck = calculateCharacterRig(state, state.animCycle, entity);
      bones = [
         { id: 'head', type: 'sphere', p1: pointsToCheck.head, radius: RIG.headR },
         { id: 'torso', type: 'capsule', p1: pointsToCheck.spineTop, p2: pointsToCheck.spineBot, radius: RIG.torsoHalfWidth },
         { id: 'rArm', type: 'capsule', p1: pointsToCheck.rArm.p1, p2: pointsToCheck.rArm.p2, radius: RIG.armL1 * 0.3 },
         { id: 'rForearm', type: 'capsule', p1: pointsToCheck.rArm.p2, p2: pointsToCheck.rArm.p3, radius: RIG.armL1 * 0.25 },
         { id: 'lArm', type: 'capsule', p1: pointsToCheck.lArm.p1, p2: pointsToCheck.lArm.p2, radius: RIG.armL1 * 0.3 },
         { id: 'lForearm', type: 'capsule', p1: pointsToCheck.lArm.p2, p2: pointsToCheck.lArm.p3, radius: RIG.armL1 * 0.25 },
         { id: 'rLeg', type: 'capsule', p1: pointsToCheck.rLeg.p1, p2: pointsToCheck.rLeg.p2, radius: RIG.legL1 * 0.3 },
         { id: 'rShin', type: 'capsule', p1: pointsToCheck.rLeg.p2, p2: pointsToCheck.rLeg.p3, radius: RIG.legL1 * 0.25 },
         { id: 'lLeg', type: 'capsule', p1: pointsToCheck.lLeg.p1, p2: pointsToCheck.lLeg.p2, radius: RIG.legL1 * 0.3 },
         { id: 'lShin', type: 'capsule', p1: pointsToCheck.lLeg.p2, p2: pointsToCheck.lLeg.p3, radius: RIG.legL1 * 0.25 }
      ];
   }
   for (const bone of bones) {
      let dist, t = 0;
      const effectiveRadius = bone.radius + hitRadiusScale;
      const ignoreHeight = (state.isRagdoll && state.ragdoll);
      if (bone.type === 'sphere') {
         dist = Math.hypot(localBullet.x - bone.p1.x, localBullet.y - bone.p1.y, localBullet.z - bone.p1.z);
         if (dist < effectiveRadius) { return { part: bone.id, offsetT: 0, ...localBullet }; }
         continue;
      } else {
         if (ignoreHeight) {
            const dx = bone.p2.x - bone.p1.x;
            const dz = bone.p2.z - bone.p1.z;
            const l2 = dx * dx + dz * dz;
            if (l2 === 0) {
               dist = Math.hypot(localBullet.x - bone.p1.x, localBullet.z - bone.p1.z);
               t = 0;
            }
            else {
               t = ((localBullet.x - bone.p1.x) * dx + (localBullet.z - bone.p1.z) * dz) / l2;
               t = Math.max(0, Math.min(1, t));
               dist = Math.hypot(localBullet.x - (bone.p1.x + t * dx), localBullet.z - (bone.p1.z + t * dz));
            }
         } else {
            const check = distToSegment(localBullet, bone.p1, bone.p2);
            dist = check.dist;
            t = check.t;
         }
      }
      if (dist < effectiveRadius) {
         if (bone.aName && bone.bName) {
            const chosen = (t < 0.5) ? bone.aName : bone.bName;
            return { part: chosen, offsetT: t, ...localBullet };
         }
         return { part: bone.id, offsetT: t, ...localBullet };
      }
   }
   return null;
};

const RIG = (() => {
   const legLength = DEFAULT_CONFIG.SIZE * (DEFAULT_CONFIG.LEG_L1 + DEFAULT_CONFIG.LEG_L2);
   const baseShoulderY = DEFAULT_CONFIG.SIZE * (0.25 + 0.09 + 0.05); // mystery numbers
   const standingHipY = baseShoulderY + (DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.TORSO_H);
   const groundY = standingHipY + legLength;
   return Object.freeze({
      size: DEFAULT_CONFIG.SIZE,
      legLength,
      baseShoulderY,
      standingHipY,
      groundY,
      torsoHalfWidth: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.TORSO_W * 0.5,
      hipHalfWidth: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.HIP_W * 0.5,
      armL1: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.ARM_L1,
      armL2: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.ARM_L2,
      armR1: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.ARM_R1,
      armR2: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.ARM_R2,
      armFlare: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.ARM_FLARE,
      legL1: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.LEG_L1,
      legL2: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.LEG_L2,
      legR1: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.LEG_R1,
      legR2: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.LEG_R2,
      legFlare: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.LEG_FLARE,
      headR: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.HEAD_R,
      handR: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.HAND_R,
      torsoH: DEFAULT_CONFIG.SIZE * DEFAULT_CONFIG.TORSO_H
   });
})();

const blend = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const getSeg = (sx, sy, sz, angle, angleZ, len, flare) => {
   const rawSin = Math.sin(angle);
   const rawCos = Math.cos(angle);
   const y = sy + rawCos * len;
   const hMag = rawSin * len;
   const x = sx + Math.cos(angleZ) * hMag;
   const z = sz + Math.sin(angleZ) * hMag + flare;
   return { x, y, z };
};

const solveIK = (startX, startY, targetX, targetY, len1, len2) => {
   const dx = targetX - startX;
   const dy = targetY - startY;
   const dist = Math.sqrt(dx * dx + dy * dy);
   const maxReach = len1 + len2;
   const minReach = Math.abs(len1 - len2);
   const clampedDist = Math.max(minReach, Math.min(maxReach, dist));
   const angleToTarget = Math.atan2(dx, dy);
   const cosHip = (len1 * len1 + clampedDist * clampedDist - len2 * len2) / (2 * len1 * clampedDist);
   const hipBend = Math.acos(Math.max(-1, Math.min(1, cosHip)));
   const cosKnee = (len1 * len1 + len2 * len2 - clampedDist * clampedDist) / (2 * len1 * len2);
   const kneeBend = Math.acos(Math.max(-1, Math.min(1, cosKnee)));
   return {
      hipAngle: angleToTarget - hipBend,
      kneeAngle: Math.PI - kneeBend
   };
};

const applyLocalTilt = (p, angle, anchorY) => {
   const pyShifted = p.y - anchorY;
   const tCos = Math.cos(angle);
   const tSin = Math.sin(angle);
   return { x: p.x * tCos + pyShifted * tSin, y: -p.x * tSin + pyShifted * tCos + anchorY, z: p.z };
};

const getRagdollRig = (state) => {
   if (!state.ragdoll) return null;
   const { points } = state.ragdoll;
   return {
      spineTop: points.spineTop,
      spineBot: points.spineBot,
      head: points.head,
      rArm: { p1: points.rShoulder, p2: points.rElbow, p3: points.rHand },
      lArm: { p1: points.lShoulder, p2: points.lElbow, p3: points.lHand },
      rLeg: { p1: points.rHip, p2: points.rKnee, p3: points.rFoot },
      lLeg: { p1: points.lHip, p2: points.lKnee, p3: points.lFoot },
      leftHand: points.lHand,
      rightHand: points.rHand
   };
};

const createPose = (name, options) => ({
   name,
   rotation: {
      bodyOffset: options.rotation?.bodyOffset ?? 0,
   },
   getTargets(cycle) {
      const feet = options.feet || {};
      const spreadX = feet.spreadX ?? 0.015;
      const offsetX = feet.offsetX ?? 0;
      const rightOffsetX = feet.rightOffsetX ?? (offsetX - spreadX);
      const leftOffsetX = feet.leftOffsetX ?? (offsetX + spreadX);
      return {
         rightFoot: { x: RIG.size * rightOffsetX, y: RIG.groundY },
         leftFoot: { x: RIG.size * leftOffsetX, y: RIG.groundY }
      };
   },
   getModifiers(cycle) {
      const body = options.body || {};
      const lift = (body.lift ?? 0) * RIG.size;
      const leanBase = body.leanBase ?? 0;
      const leanRange = body.leanRange ?? 0;
      const leanSpeed = body.leanSpeed ?? 0.5;
      const bobRange = body.bobRange ?? 0.008;
      const bobSpeed = body.bobSpeed ?? 1.5;
      return { lift, lean: leanBase + Math.sin(cycle * leanSpeed) * leanRange, bob: Math.sin(cycle * bobSpeed) * (RIG.size * bobRange) };
   },
   getArmAngles: options.getArmAngles
});

const createWalkPose = () => ({
   name: 'WALK',
   getTargets(cycle) {
      const rawSwing = Math.sin(cycle);
      const fSwing = rawSwing * -DEFAULT_CONFIG.WALK_DIR;
      const swingDist = RIG.size * 0.08;
      const stepHeight = RIG.size * 0.12;
      const rLift = Math.max(0, Math.cos(cycle)) * stepHeight;
      const lLift = Math.max(0, Math.cos(cycle + Math.PI)) * stepHeight;
      return {
         rightFoot: { x: fSwing * swingDist, y: RIG.groundY - rLift },
         leftFoot: { x: -fSwing * swingDist, y: RIG.groundY - lLift }
      };
   },
   getModifiers(cycle) {
      const bob = Math.cos(cycle * 2) * (RIG.size * 0.02);
      return { lift: 0, lean: 0, bob };
   },
   getArmAngles(cycle) {
      const rawSwing = Math.sin(cycle);
      const fSwing = rawSwing * DEFAULT_CONFIG.WALK_DIR;
      const range = 0.8;
      return { rArm: -(fSwing * range), lArm: fSwing * range, rElbow: -(fSwing * range) - 0.3, lElbow: (fSwing * range) - 0.3 };
   }
});

const POSES = {
   ROLL: {
      name: 'ROLL',
      getTargets(cycle) {
         const targetY = RIG.groundY - (RIG.size * 0.3);
         const extensionX = RIG.size * 0.35; 
         
         return {
            rightFoot: { x: extensionX, y: targetY },
            leftFoot: { x: extensionX, y: targetY }
         };
      },
      getModifiers(cycle) {
         return {
            lift: -0.45 * RIG.size,
            lean: 1.5,
            bob: 0
         };
      },
 getArmAngles(cycle) {
          return {
            // Reach forward (diving motion) instead of tucking
            rArm: -2.8, lArm: -2.8,
            rElbow: 0.3, lElbow: 0.3,
            // Tuck arms slightly in front of head/body
            rArmZ: 1.2, lArmZ: -1.2,
           rElbowZ: 0.0, lElbowZ: 0.0
          };
      }
   },
   WALK: createWalkPose(),
   CROUCH: {
      name: 'CROUCH',
      getTargets(cycle) {
         const lL1 = RIG.size * DEFAULT_CONFIG.LEG_L1;
         const lL2 = RIG.size * DEFAULT_CONFIG.LEG_L2;
         const totalLegLen = lL1 + lL2;
         const standingHipY = (RIG.size * 0.25) + (RIG.size * 0.09) + (RIG.size * 0.05) + (RIG.size * DEFAULT_CONFIG.TORSO_H);
         const groundY = standingHipY + totalLegLen;
         return {
            rightFoot: { x: -RIG.size * 0.07, y: groundY },
            leftFoot: { x: RIG.size * 0.1, y: groundY }
         };
      },
      getModifiers(cycle) {
         const breath = Math.sin(cycle) * (RIG.size * 0.015);
         const bodyDrop = -0.20 * RIG.size;
         return { lift: bodyDrop, lean: 0.1, bob: breath };
      },
      getArmAngles(cycle) {
         return {
            rArm: 0.4,
            lArm: 0.4,
            rElbow: -0.6,
            lElbow: -0.6,
         };
      }
   },
   SNEAK: {
      name: 'SNEAK',
      getArmAngles(cycle) {
         const sway = Math.sin(cycle) * 0.1;
         return {
            rArm: 0.2 + sway,
            lArm: 0.2 - sway,
            rElbow: -0.5,
            lElbow: -0.5,
            rArmZ: 0.2, lArmZ: 0.2, rElbowZ: 0, lElbowZ: 0
         };
      },
      getModifiers(cycle) {
         return {
            lift: -0.15 * RIG.size,
            lean: 0.2 + Math.sin(cycle) * 0.02,
            bob: Math.cos(cycle * 2) * (RIG.size * 0.01)
         };
      },
      getTargets(cycle) {
         const rawSwing = Math.sin(cycle);
         const fSwing = rawSwing * (-DEFAULT_CONFIG.WALK_DIR || 1);
         const swingDist = RIG.size * 0.10;
         const stepHeight = RIG.size * 0.1;
         const rLift = Math.max(0, Math.cos(cycle)) * stepHeight;
         const lLift = Math.max(0, Math.cos(cycle + Math.PI)) * stepHeight;
         return {
            rightFoot: { x: fSwing * swingDist, y: RIG.groundY - rLift },
            leftFoot: { x: -fSwing * swingDist, y: RIG.groundY - lLift }
         };
      }
   },
   RUN: createPose('RUN', {
      feet: {
         spreadX: 0.015,
         offsetX: 0,
         rightOffsetX: 0.015,
         leftOffsetX: -0.015
      },
      body: {
         lift: -0.02,
         leanBase: 0.25,
         leanRange: 0.05,
         leanSpeed: 1.5,
         bobRange: 0.025,
         bobSpeed: 3
      },
      getArmAngles(cycle) {
         const swing = (base, amp, speed, phase) => base + Math.sin(cycle * speed + phase) * amp;
         return {
            rArm: swing(-0.200, 1.100, 1.000, 3.142),
            lArm: swing(-0.200, 1.100, 1.000, 0.000),
            rElbow: swing(-1.500, 0.500, 1.000, 3.142),
            lElbow: swing(-1.500, 0.500, 1.000, 0.000),
            rArmZ: 0.000,
            lArmZ: 0.000,
            rElbowZ: 0.000,
            lElbowZ: 0.000
         };
      },
      getTargets(cycle) {
         const rightOffsetX = 0.015;
         const leftOffsetX = -0.015;
         const stride = 0.25 * RIG.size;
         const stepHeight = 0.15 * RIG.size;
         const rWalkX = -Math.sin(cycle) * stride;
         const lWalkX = -Math.sin(cycle + Math.PI) * stride;
         const rLift = stepHeight > 0 ? Math.max(0, Math.cos(cycle)) * stepHeight : 0;
         const lLift = stepHeight > 0 ? Math.max(0, Math.cos(cycle + Math.PI)) * stepHeight : 0;
         return {
            rightFoot: { x: RIG.size * rightOffsetX + rWalkX, y: RIG.groundY - rLift },
            leftFoot: { x: RIG.size * leftOffsetX + lWalkX, y: RIG.groundY - lLift }
         };
      }
   }),
   IDLE: createPose('IDLE', {
      feet: { spreadX: 0.015 },
      body: { leanRange: 0.02, bobRange: 0.008, bobSpeed: 1.5, leanSpeed: 0.5 },
      getArmAngles(cycle) {
         const swing = Math.sin(cycle * 0.75) * 0.15;
         return { rArm: swing, lArm: -swing, rElbow: -0.2, lElbow: -0.2 };
      }
   }),

   PISTOL: createPose('PISTOL', {
      feet: { rightOffsetX: 0.10, leftOffsetX: -0.05 },
      body: { lift: 0, leanBase: -0.05, bobRange: 0.005, bobSpeed: 1.5 },
      getArmAngles(cycle) {
         const baseShoulder = -Math.PI * 0.5;
         const baseElbow = -Math.PI * 0.5;
         const sway = Math.sin(cycle * 0.5) * 0.05;
         return {
            lArm: baseShoulder - sway,
            lElbow: baseElbow,
            rArm: 0.1 + sway,
            rElbow: -0.1
         };
      }
   }),
   SHOTGUN: createPose('SHOTGUN', {
      feet: { rightOffsetX: 0.070, leftOffsetX: -0.072 },
      body: {
         lift: -0.035,
         leanBase: 0.180,
         leanRange: 0.020,
         bobRange: 0.008,
         bobSpeed: 1.5
      },
      getArmAngles(cycle) {
         const sway = Math.sin(cycle * 0.5) * 0.050;
         return {
            lArm: -1.342 - sway,
            lElbow: -1.442,
            rArm: -1.322 + sway,
            rElbow: -1.322,
            lArmZ: 0.398,
            lElbowZ: 0.128,
            rArmZ: 0.378,
            rElbowZ: 0.198
         };
      }
   })
};

const ALL_STATIC_POSES = Object.values(POSES).filter(p => p.name !== 'WALK');
const WEAPON_POSE_NAMES = Object.values(WEAPON_VISUALS).map(w => w.pose);
const UNARMED_STATIC_POSES = ALL_STATIC_POSES.filter(p => !WEAPON_POSE_NAMES.includes(p.name));

function getDesiredStaticPose(state, entity) {
   const weaponPose = getWeaponPose(entity);
   if (weaponPose) { return weaponPose; }
   if (state.lastStaticChange >= 2.0 && !WEAPON_POSE_NAMES.includes(state.currentStaticPose.name)) {
      let nextPose = state.currentStaticPose;
      while (nextPose === state.currentStaticPose) { nextPose = UNARMED_STATIC_POSES[Math.floor(Math.random() * UNARMED_STATIC_POSES.length)]; }
      return nextPose;
   }
   if (!weaponPose && WEAPON_POSE_NAMES.includes(state.currentStaticPose.name)) { return POSES.IDLE; }
   return state.currentStaticPose;
}

function manageStaticTransition(state, desiredPose, delta, transitionTime) {
   state.staticBlendFactor = Math.min(1.0, state.staticBlendFactor + delta / transitionTime);
   state.lastStaticChange += delta;
   if (desiredPose !== state.currentStaticPose) {
      const previousTarget = state.currentStaticPose;
      const previousSource = state.lastStaticPose;
      const currentFactor = state.staticBlendFactor;
      if (desiredPose === previousSource && currentFactor < 1.0) {
         const sEased = currentFactor * currentFactor;
         const easedRemaining = 1.0 - sEased;
         state.staticBlendFactor = Math.sqrt(Math.max(0, easedRemaining));
      } else {
         state.staticBlendFactor = 0;
      }
      state.lastStaticPose = previousTarget;
      state.currentStaticPose = desiredPose;
      state.lastStaticChange = 0;
   }
   state.pose = state.currentStaticPose.name;
}

const startRoll = (entityId, duration = 0.6) => {
   const state = ENTITY_STATES[entityId];
   if (!state || state.isRagdoll || state.isRolling) return;
   state.isRolling = true;
   state.rollTimer = 0;
   state.rollDuration = duration;
   state.crouchFactor = 1.0;
   state.lockedRotation = undefined
};

const calculateCharacterRig = (state, cycle, entity) => {
   const weaponVisual = getWeaponVisual(entity?.equippedWeapon);
   
   const cf = state.crouchFactor || 0;
   const walkTargets = POSES.WALK.getTargets(cycle);
   const walkMods = POSES.WALK.getModifiers(cycle);
   const walkArms = POSES.WALK.getArmAngles(cycle);
   const sneakTargets = POSES.SNEAK.getTargets(cycle);
   const sneakMods = POSES.SNEAK.getModifiers(cycle);
   const sneakArms = POSES.SNEAK.getArmAngles(cycle);
   
   const activeWalkMods = {
      lift: blend(walkMods.lift, sneakMods.lift, cf),
      lean: blend(walkMods.lean, sneakMods.lean, cf),
      bob: blend(walkMods.bob, sneakMods.bob, cf),
   };
   const activeWalkTargets = {
      rightFoot: { x: blend(walkTargets.rightFoot.x, sneakTargets.rightFoot.x, cf), y: blend(walkTargets.rightFoot.y, sneakTargets.rightFoot.y, cf) },
      leftFoot: { x: blend(walkTargets.leftFoot.x, sneakTargets.leftFoot.x, cf), y: blend(walkTargets.leftFoot.y, sneakTargets.leftFoot.y, cf) }
   };
   const activeWalkArms = {
      rArm: blend(walkArms.rArm, sneakArms.rArm, cf),
      lArm: blend(walkArms.lArm, sneakArms.lArm, cf),
      rElbow: blend(walkArms.rElbow, sneakArms.rElbow, cf),
      lElbow: blend(walkArms.lElbow, sneakArms.lElbow, cf),
      rArmZ: blend(walkArms.rArmZ || 0, sneakArms.rArmZ || 0, cf),
      lArmZ: blend(walkArms.lArmZ || 0, sneakArms.lArmZ || 0, cf),
      rElbowZ: blend(walkArms.rElbowZ || 0, sneakArms.rElbowZ || 0, cf),
      lElbowZ: blend(walkArms.lElbowZ || 0, sneakArms.lElbowZ || 0, cf),
   };
   
   const s = Math.min(1, state.staticBlendFactor);
   const sEased = s * s;
   const lastT = state.lastStaticPose.getTargets(cycle);
   const nextT = state.currentStaticPose.getTargets(cycle);
   const lastM = state.lastStaticPose.getModifiers(cycle);
   const nextM = state.currentStaticPose.getModifiers(cycle);
   let staticLift = blend(lastM.lift, nextM.lift, sEased);
   let staticLean = blend(lastM.lean, nextM.lean, sEased);
   let staticBob = blend(lastM.bob, nextM.bob, sEased);
   let staticRF = { x: blend(lastT.rightFoot.x, nextT.rightFoot.x, sEased), y: blend(lastT.rightFoot.y, nextT.rightFoot.y, sEased) };
   let staticLF = { x: blend(lastT.leftFoot.x, nextT.leftFoot.x, sEased), y: blend(lastT.leftFoot.y, nextT.leftFoot.y, sEased) };
   
   if (cf > 0.01) {
      const crouchT = POSES.CROUCH.getTargets(cycle);
      const crouchM = POSES.CROUCH.getModifiers(cycle);
      staticLift = blend(staticLift, crouchM.lift, cf);
      staticLean = blend(staticLean, crouchM.lean, cf);
      staticBob = blend(staticBob, crouchM.bob, cf);
      staticRF = { x: blend(staticRF.x, crouchT.rightFoot.x, cf), y: blend(staticRF.y, crouchT.rightFoot.y, cf) };
      staticLF = { x: blend(staticLF.x, crouchT.leftFoot.x, cf), y: blend(staticLF.y, crouchT.leftFoot.y, cf) };
   }
   
   const t = ease(state.poseFactor);
   const vals = {
      lift: blend(staticLift, activeWalkMods.lift, t),
      lean: blend(staticLean, activeWalkMods.lean, t),
      bob: blend(staticBob, activeWalkMods.bob, t),
      rightFootTarget: {
         x: blend(staticRF.x, activeWalkTargets.rightFoot.x, t),
         y: blend(staticRF.y, activeWalkTargets.rightFoot.y, t)
      },
      leftFootTarget: {
         x: blend(staticLF.x, activeWalkTargets.leftFoot.x, t),
         y: blend(staticLF.y, activeWalkTargets.leftFoot.y, t)
      }
   };
   
   if (state.altitude) { vals.lift += state.altitude * RIG.size; }
   
   let lastA = state.lastStaticPose.getArmAngles(cycle);
   let nextA = state.currentStaticPose.getArmAngles(cycle);

   // --- FIX: Pre-blend modification ---
   // If crouching, we force the "PISTOL" pose data to look like the two-handed crouch grip
   // BEFORE it gets blended. This ensures that when switching from Pistol -> Rifle, 
   // the "lastA" (Pistol) is already two-handed, matching the "nextA" (Rifle), preventing the pop.
   if (cf > 0.01) {
      // Generate a generic two-handed aim pose
      const twoHanded = getAimingArmAngles(0, 'both', -1.4, 0);
      
      const applyCrouchGrip = (arms) => ({
         rArm: blend(arms.rArm, twoHanded.rArm, cf),
         lArm: blend(arms.lArm, twoHanded.lArm, cf),
         rElbow: blend(arms.rElbow, twoHanded.rElbow, cf),
         lElbow: blend(arms.lElbow, twoHanded.lElbow, cf),
         rArmZ: blend(arms.rArmZ || 0, twoHanded.rArmZ, cf),
         lArmZ: blend(arms.lArmZ || 0, twoHanded.lArmZ, cf),
         rElbowZ: blend(arms.rElbowZ || 0, twoHanded.rElbowZ, cf),
         lElbowZ: blend(arms.lElbowZ || 0, twoHanded.lElbowZ, cf),
      });

      if (state.lastStaticPose.name === 'PISTOL') {
         lastA = applyCrouchGrip(lastA);
      }
      if (state.currentStaticPose.name === 'PISTOL') {
         nextA = applyCrouchGrip(nextA);
      }
   }
   // -----------------------------------

   const crouchA = POSES.CROUCH.getArmAngles(cycle);
   let sRA = blend(lastA.rArm, nextA.rArm, sEased);
   let sLA = blend(lastA.lArm, nextA.lArm, sEased);
   let sRE = blend(lastA.rElbow, nextA.rElbow, sEased);
   let sLE = blend(lastA.lElbow, nextA.lElbow, sEased);
   let sRAZ = blend(lastA.rArmZ || 0, nextA.rArmZ || 0, sEased);
   let sLAZ = blend(lastA.lArmZ || 0, nextA.lArmZ || 0, sEased);
   let sREZ = blend(lastA.rElbowZ || 0, nextA.rElbowZ || 0, sEased);
   let sLEZ = blend(lastA.lElbowZ || 0, nextA.lElbowZ || 0, sEased);
   
   if (cf > 0.01 && !weaponVisual) {
      sRA = blend(sRA, crouchA.rArm, cf);
      sLA = blend(sLA, crouchA.lArm, cf);
      sRE = blend(sRE, crouchA.rElbow, cf);
      sLE = blend(sLE, crouchA.lElbow, cf);
   }
   
   let finalArms;
   if (state.isRolling && weaponVisual) {
      // Determine which arms to extend and by how much, based on weaponVisual or pose
      const aimAngle = entity.aimAngle !== undefined ? entity.aimAngle : entity.rotation;
      // Default: right arm only, extension -1.5
      let whichArms = 'right';
      let extension = -1.5;
      if (weaponVisual.extendArms) {
         // weaponVisual.extendArms can be 'right', 'left', 'both', or array
         whichArms = weaponVisual.extendArms;
      }
      if (weaponVisual.extensionValue !== undefined) {
         extension = weaponVisual.extensionValue;
      }
      const diveDir = state.rollDirection !== undefined ? state.rollDirection : (entity.rotation || 0);
      const aimingArms = getAimingArmAngles(aimAngle, whichArms, extension, diveDir);
      
      // Store the weapon aim angle for drawing the gun
      state.rollWeaponAimAngle = aimAngle;
      
      finalArms = {
         rArm: aimingArms.rArm,
         lArm: aimingArms.lArm !== undefined ? aimingArms.lArm : sLA,
         rElbow: aimingArms.rElbow,
         lElbow: aimingArms.lElbow !== undefined ? aimingArms.lElbow : sLE,
         rArmZ: aimingArms.rArmZ,
         lArmZ: aimingArms.lArmZ !== undefined ? aimingArms.lArmZ : sLAZ,
         rElbowZ: aimingArms.rElbowZ,
         lElbowZ: aimingArms.lElbowZ !== undefined ? aimingArms.lElbowZ : sLEZ
      };
   } else if (weaponVisual) {
      finalArms = {
         rArm: sRA, lArm: sLA,
         rElbow: sRE, lElbow: sLE,
         rArmZ: sRAZ, lArmZ: sLAZ,
         rElbowZ: sREZ, lElbowZ: sLEZ
      };
   } else {
      finalArms = {
         rArm: blend(sRA, activeWalkArms.rArm, t),
         lArm: blend(sLA, activeWalkArms.lArm, t),
         rElbow: blend(sRE, activeWalkArms.rElbow, t),
         lElbow: blend(sLE, activeWalkArms.lElbow, t),
         rArmZ: blend(sRAZ, activeWalkArms.rArmZ, t),
         lArmZ: blend(sLAZ, activeWalkArms.lArmZ, t),
         rElbowZ: blend(sREZ, activeWalkArms.rElbowZ, t),
         lElbowZ: blend(sLEZ, activeWalkArms.lElbowZ, t)
      };
   }
   
   vals.rArm = finalArms.rArm;
   vals.lArm = finalArms.lArm;
   vals.rElbow = finalArms.rElbow;
   vals.lElbow = finalArms.lElbow;
   vals.rArmZ = finalArms.rArmZ;
   vals.lArmZ = finalArms.lArmZ;
   vals.rElbowZ = finalArms.rElbowZ;
   vals.lElbowZ = finalArms.lElbowZ;
   
   const totalYOffset = vals.bob + vals.lift;
   const sY = RIG.baseShoulderY - totalYOffset;
   const hY = sY + RIG.torsoH;
   const hipAnchorY = hY;
   const effectiveTilt = state.isRagdoll ? 0 : DEFAULT_CONFIG.TILT;
   const localTiltAngle = vals.lean * effectiveTilt;
   const hipCenter = { x: 0, y: hY, z: 0 };
   const tiltedHipCenter = applyLocalTilt(hipCenter, localTiltAngle, hipAnchorY);
   const hipX = tiltedHipCenter.x;
   const rA_p1 = applyLocalTilt({ x: 0, y: sY, z: RIG.torsoHalfWidth }, localTiltAngle, hipAnchorY);
   const lA_p1 = applyLocalTilt({ x: 0, y: sY, z: -RIG.torsoHalfWidth }, localTiltAngle, hipAnchorY);
   const rL_p1 = { x: hipX, y: hY, z: RIG.hipHalfWidth };
   const lL_p1 = { x: hipX, y: hY, z: -RIG.hipHalfWidth };
   const headY = (RIG.size * 0.25) - totalYOffset;
   const tiltedHead = applyLocalTilt({ x: 0, y: headY, z: 0 }, localTiltAngle, hipAnchorY);
   
   const rIK = solveIK(rL_p1.x, rL_p1.y, vals.rightFootTarget.x, vals.rightFootTarget.y, RIG.legL1, RIG.legL2);
   const rL_p2 = {
      x: rL_p1.x + Math.sin(rIK.hipAngle) * RIG.legL1,
      y: rL_p1.y + Math.cos(rIK.hipAngle) * RIG.legL1,
      z: rL_p1.z + RIG.legFlare
   };
   const rL_p3 = {
      x: rL_p2.x + Math.sin(rIK.hipAngle + rIK.kneeAngle) * RIG.legL2,
      y: rL_p2.y + Math.cos(rIK.hipAngle + rIK.kneeAngle) * RIG.legL2,
      z: rL_p2.z - (RIG.legFlare * 0.2)
   };
   const lIK = solveIK(lL_p1.x, lL_p1.y, vals.leftFootTarget.x, vals.leftFootTarget.y, RIG.legL1, RIG.legL2);
   const lL_p2 = {
      x: lL_p1.x + Math.sin(lIK.hipAngle) * RIG.legL1,
      y: lL_p1.y + Math.cos(lIK.hipAngle) * RIG.legL1,
      z: lL_p1.z - RIG.legFlare
   };
   const lL_p3 = {
      x: lL_p2.x + Math.sin(lIK.hipAngle + lIK.kneeAngle) * RIG.legL2,
      y: lL_p2.y + Math.cos(lIK.hipAngle + lIK.kneeAngle) * RIG.legL2,
      z: lL_p2.z + (RIG.legFlare * 0.2)
   };
   
   const rArmZ = vals.rArmZ;
   const lArmZ = vals.lArmZ;
   const rElbowZ = vals.rElbowZ;
   const lElbowZ = vals.lElbowZ;
   
   const rA_p2 = getSeg(rA_p1.x, rA_p1.y, rA_p1.z, vals.rArm, rArmZ, RIG.armL1, RIG.armFlare);
   const lA_p2 = getSeg(lA_p1.x, lA_p1.y, lA_p1.z, vals.lArm, -lArmZ, RIG.armL1, -RIG.armFlare);
   const rA_p3 = getSeg(rA_p2.x, rA_p2.y, rA_p2.z, vals.rElbow, rArmZ + rElbowZ, RIG.armL2, -(RIG.armFlare * 0.5));
   const lA_p3 = getSeg(lA_p2.x, lA_p2.y, lA_p2.z, vals.lElbow, -lArmZ - lElbowZ, RIG.armL2, (RIG.armFlare * 0.5));
   
   return {
      spineTop: applyLocalTilt({ x: 0, y: sY, z: 0 }, localTiltAngle, hipAnchorY),
      spineBot: tiltedHipCenter,
      head: tiltedHead,
      rArm: { p1: rA_p1, p2: rA_p2, p3: rA_p3 },
      lArm: { p1: lA_p1, p2: lA_p2, p3: lA_p3 },
      rLeg: { p1: rL_p1, p2: rL_p2, p3: rL_p3 },
      lLeg: { p1: lL_p1, p2: lL_p2, p3: lL_p3 },
      leftHand: lA_p3,
      rightHand: rA_p3
   };
};

function getSprite(entity, delta = 0.016) {
   // Default view context
   let viewContext = { yFactor: 0.8, shiftX: 0, shiftY: 0, ratio: 0.1 };
   let rotation = entity.rotation;
   let id = entity.id;
   const STATIC_TRANSITION_TIME = 0.75;
   
   if (!ENTITY_STATES[id]) {
      ENTITY_STATES[id] = {
         pose: 'IDLE',
         currentStaticPose: POSES.IDLE,
         lastStaticPose: POSES.IDLE,
         staticBlendFactor: 1.0,
         lastStaticChange: 0,
         animCycle: 0,
         lastX: entity ? entity.x : 0,
         lastY: entity ? entity.y : 0,
         smoothedSpeed: 0,
         poseFactor: 0,
         crouchFactor: 0,
         muzzleWorld: null,
         altitude: 0,
         vertVel: 0,
         isRagdoll: false,
         ragdoll: null,
         ragdollRotation: 0
      };
   }
   const state = ENTITY_STATES[id];

   // --- ROLLING LOGIC ---
   if (state.isRolling) {
      if (state.rollTimer === 0 || state.rollDirection === undefined) {
         const vx = entity.velocity?.x || 0;
         const vy = entity.velocity?.y || 0;
         let diveDir;
         if (vx !== 0 || vy !== 0) {
            diveDir = Math.atan2(vy, vx);
         } else {
            diveDir = entity.rotation || 0;
         }
         const aimAngle = entity.aimAngle !== undefined ? entity.aimAngle : entity.rotation;
         let aimDiff = aimAngle - diveDir;
         while (aimDiff > Math.PI) aimDiff -= 2 * Math.PI;
         while (aimDiff < -Math.PI) aimDiff += 2 * Math.PI;
         
         if (Math.abs(aimDiff) > Math.PI / 2) {
            state.rollDirection = diveDir + Math.PI;
            state.rollFlipped = true;
         } else {
            state.rollDirection = diveDir;
            state.rollFlipped = false;
         }
      }
      rotation = state.rollDirection;
   }

   // --- CALCULATE TILT FACTOR (Perspective Depth) ---
   // We calculate this for EVERYONE (cached or dynamic) so we know which cache bucket to use.
   const camX = (typeof character !== 'undefined' ? (character.renderX ?? character.x) : 0) + 0.5;
   const camZ = (typeof character !== 'undefined' ? (character.renderY ?? character.y) : 0) + 0.5;
   const entX = (entity.renderX ?? entity.x) + 0.5;
   const entZ = (entity.renderY ?? entity.y) + 0.5;
   const dx = entX - camX;
   const dz = entZ - camZ;
   
   const horizontalDist = Math.sqrt(dx * dx + dz * dz);
   const maxTiltDist = 15.0; // Max distance where tilt changes
   // 0.0 = Center (Top Down), 1.0 = Edge (Angled)
   const rawTiltFactor = Math.min(1.0, horizontalDist / maxTiltDist);

   // Calculate global perspective ratio
   const camHeight = (typeof LIGHT_FX !== 'undefined') ? LIGHT_FX.HEIGHT_CAMERA : 14; 
   const h = 1.0;
   const globalRatio = h / Math.max(0.1, camHeight - h);
   viewContext.ratio = globalRatio;

   const weaponVisual = getWeaponVisual(entity?.equippedWeapon);

   // --- RAGDOLL LOGIC (Skipped for Cache) ---
   if (state.isRagdoll) {
      if (state.ragdoll.baked) {
         SHARED_CANVAS.width = 1;
         SHARED_CANVAS.height = 1;
         SHARED_CTX.clearRect(0, 0, 1, 1);
         SHARED_CANVAS.drawRatio = 1.0;
         SHARED_CANVAS.verticalShift = 0;
         return SHARED_CANVAS;
      }
      const ragdollRotation = state.ragdollRotation ?? rotation;
      
      const wallChecker = entity?.wallChecker || (typeof checkWallCollision === 'function' ? checkWallCollision : null);
      
      updateRagdoll(state, delta, entX - 0.5, entZ - 0.5, ragdollRotation, wallChecker);
      
      const rigData = getRagdollRig(state);
      if (!rigData) {
         state.isRagdoll = false;
         state.ragdoll = null;
      } else {
         // Apply dynamic tilt to ragdoll
         const minYFactor = 0.1;
         viewContext.yFactor = minYFactor + (0.8 - minYFactor) * rawTiltFactor;

         const scene = projectRagdollRig(rigData, ragdollRotation, viewContext, state.ragdoll.points);
         let canvas = drawCharacter(scene, entity, viewContext, ragdollRotation);
         
         if (state.ragdoll.settled && typeof bakeRagdollToChunk === 'function') {
            const neutralViewContext = { yFactor: 0.8, shiftX: 0, shiftY: 0, ratio: viewContext.ratio };
            const neutralScene = projectRagdollRig(rigData, ragdollRotation, neutralViewContext, state.ragdoll.points);
            const neutralCanvas = drawCharacter(neutralScene, entity, neutralViewContext, ragdollRotation);
            const bakeConfig = { size: DEFAULT_CONFIG.SIZE, padding: DEFAULT_CONFIG.PADDING, anchorY: DEFAULT_CONFIG.ANCHOR_Y };
            bakeRagdollToChunk(entity, neutralCanvas, bakeConfig);
            state.ragdoll.baked = true;
         }
         const padding = DEFAULT_CONFIG.PADDING || 0;
         const canvasSize = DEFAULT_CONFIG.SIZE + padding * 2;
         canvas.drawRatio = canvasSize / DEFAULT_CONFIG.SIZE;
         const feetYInCanvas = padding + (DEFAULT_CONFIG.ANCHOR_Y * DEFAULT_CONFIG.SIZE);
         const canvasCenterY = canvasSize / 2;
         canvas.verticalShift = feetYInCanvas - canvasCenterY;
         return canvas;
      }
   }

   // --- PHYSICS & ANIMATION UPDATES ---
   let speed = 0;
   if (entity) {
      if (state.altitude > 0 || state.vertVel > 0) {
         state.vertVel -= 30.0 * delta;
         state.altitude += state.vertVel * delta;
         if (state.altitude <= 0) {
            if (state.vertVel < -5.0) {
               const impact = Math.min(1.0, Math.abs(state.vertVel) * 0.08);
               state.crouchFactor += impact;
            }
            state.altitude = 0;
            state.vertVel = 0;
         }
      }
      if (entity.z !== undefined && entity.z > 0) { state.altitude = entity.z; }
      const moveDx = entity.x - state.lastX;
      const moveDy = entity.y - state.lastY;
      const dist = Math.hypot(moveDx, moveDy);
      const safeDelta = Math.max(delta, 0.001);
      let measuredSpeed = dist / safeDelta;
      if (dist > 8.0) measuredSpeed = 0;
      state.smoothedSpeed = (measuredSpeed < state.smoothedSpeed)
         ? state.smoothedSpeed * 0.2 + measuredSpeed * 0.8
         : state.smoothedSpeed * 0.5 + measuredSpeed * 0.5;
      speed = Math.max(0, state.smoothedSpeed);
      state.lastX = entity.x;
      state.lastY = entity.y;
      if (state.crouchFactor === undefined) state.crouchFactor = 0;
      const targetCrouch = (entity && entity.isCrouching) ? 1.0 : 0.0;
      state.crouchFactor += (targetCrouch - state.crouchFactor) * delta * 8.0;
      const isWalking = speed > 0.1;
      speed *= 0.5;
      const targetPoseFactor = isWalking ? 1.0 : 0.0;
      const transitionSpeed = (state.poseFactor > 0.5) ? 3.0 : 1.5;
      state.poseFactor += (targetPoseFactor - state.poseFactor) * delta * transitionSpeed;
      state.poseFactor = Math.max(0, Math.min(1, state.poseFactor));
      
      if (!isWalking) {
         const desiredStaticPose = getDesiredStaticPose(state, entity);
         manageStaticTransition(state, desiredStaticPose, delta, STATIC_TRANSITION_TIME);
      } else {
         state.staticBlendFactor = Math.min(1.0, state.staticBlendFactor + delta / STATIC_TRANSITION_TIME);
         state.lastStaticChange = 0;
         const walkingBasePose = weaponVisual ? POSES[weaponVisual.pose] : POSES.IDLE;
         if (state.currentStaticPose !== walkingBasePose) {
            const previousTarget = state.currentStaticPose;
            const currentFactor = state.staticBlendFactor;
            state.lastStaticPose = previousTarget;
            state.currentStaticPose = walkingBasePose;
            if (walkingBasePose === state.lastStaticPose && currentFactor < 1.0) {
               const sEased = currentFactor * currentFactor;
               const easedRemaining = 1.0 - sEased;
               state.staticBlendFactor = Math.sqrt(Math.max(0, easedRemaining));
            } else {
               state.staticBlendFactor = 0;
            }
         }
         state.pose = (state.crouchFactor > 0.5) ? 'SNEAK' : 'WALK';
      }
      
      if (state.isRolling) {
         state.rollTimer += delta;
         const p = state.rollTimer / state.rollDuration;
         if (p >= 1.0) {
            state.isRolling = false;
            state.rollTimer = 0;
            state.lockedRotation = undefined;
            state.crouchFactor = 0.0;
            state.justFinishedRoll = true;
         } else {
            state.pose = 'ROLL';
            state.currentStaticPose = POSES.ROLL;
            state.lastStaticPose = POSES.ROLL;
            state.staticBlendFactor = 1.0;
            state.poseFactor = 0.0;
            state.justFinishedRoll = false;
         }
      } else {
         if (state.justFinishedRoll) {
            state.pose = 'IDLE';
            state.currentStaticPose = POSES.IDLE;
            state.lastStaticPose = POSES.IDLE;
            state.staticBlendFactor = 1.0;
            state.poseFactor = 0.0;
            state.justFinishedRoll = false;
         }
         if (state.crouchFactor < 0.01) state.crouchFactor = 0.0;
      }
   }
   
   const cycleSpeed = (state.poseFactor > 0.1) ? DEFAULT_CONFIG.STRIDE_SPEED : DEFAULT_CONFIG.IDLE_SPEED;
   const playbackSpeed = (state.poseFactor > 0.1) ? speed : 1.0;
   state.animCycle += playbackSpeed * delta * cycleSpeed;
   const naturalCycle = state.animCycle % (Math.PI * 2);

   // --- CACHE LOOKUP ---
   const canCache = entity && !state.isRolling && (!entity.stuckProjectiles || entity.stuckProjectiles.length === 0);
   let cacheKey = null;

   if (canCache) {
      cacheKey = SPRITE_CACHE.getKey(
         id, 
         state.pose, 
         entity.equippedWeapon, 
         rotation, 
         naturalCycle, 
         state.crouchFactor,
         rawTiltFactor // Now passing tilt to key
      );
      
      const cached = SPRITE_CACHE.get(cacheKey);
      if (cached) {
          return cached;
      }
   }

   let renderCycle = naturalCycle;
   let renderRotation = rotation;
   let renderPadding = DEFAULT_CONFIG.PADDING;

   if (canCache) {
      // 1. Quantize values, INCLUDING TILT
      const q = SPRITE_CACHE.getQuantizedValues(rotation, naturalCycle, rawTiltFactor);
      renderCycle = q.cycle;
      renderRotation = q.rotation;
      
      // 2. Apply Quantized Tilt to perspective
      const minYFactor = 0.1;
      viewContext.yFactor = minYFactor + (0.8 - minYFactor) * q.tilt;
      
      // 3. Zero shift (Centering)
      // We still center the sprite because caching 'parallax shift' (shiftX) 
      // is impossible (requires per-pixel caching). 
      // But preserving 'yFactor' restores the vertical perspective depth.
      viewContext.shiftX = 0;
      viewContext.shiftY = 0;

      // 4. Use tight padding for cache
      renderPadding = SPRITE_CACHE.CACHE_PADDING;
   } else if (entity) {
      // Dynamic Perspective
      const minYFactor = 0.1;
      viewContext.yFactor = minYFactor + (0.8 - minYFactor) * rawTiltFactor;
      
      // Dynamic Shift
      const rawDx = dx * DEFAULT_CONFIG.SIZE;
      const rawDz = dz * DEFAULT_CONFIG.SIZE;
      viewContext.shiftX = rawDx * viewContext.ratio;
      viewContext.shiftY = rawDz * viewContext.ratio;
   }

   let rigData;
   let finalBodyOffset = 0;
   
   rigData = calculateCharacterRig(state, renderCycle, entity);
   
   const currentPose = state.currentStaticPose;
   const lastPose = state.lastStaticPose;
   const lastBodyOffset = lastPose.rotation?.bodyOffset ?? 0;
   const currentBodyOffset = currentPose.rotation?.bodyOffset ?? 0;
   const sEased = state.staticBlendFactor * state.staticBlendFactor;
   const blendedBodyOffset = blend(lastBodyOffset, currentBodyOffset, sEased);
   const t = ease(state.poseFactor);
   finalBodyOffset = blend(blendedBodyOffset, 0, t);
   
   let finalRenderRotation = renderRotation + finalBodyOffset;
   const scene = projectRig(rigData, finalRenderRotation, viewContext);
   
   if (weaponVisual && entity) {
      const anchorPoint = scene.lArm.p3;
      const centerX = DEFAULT_CONFIG.SIZE / 2;
      const screenDeltaX = anchorPoint.x - centerX;
      const screenDeltaY = anchorPoint.y - DEFAULT_CONFIG.SIZE;
      const worldAimAngle = (state.isRolling && state.rollWeaponAimAngle !== undefined) 
         ? state.rollWeaponAimAngle 
         : entity.rotation;
      const weaponLength = getWeaponLength(entity.equippedWeapon);
      const muzzleOffsetX = Math.cos(worldAimAngle) * weaponLength;
      const muzzleOffsetY = Math.sin(worldAimAngle) * weaponLength;
      const entityCenterX = (entity.renderX ?? entity.x) + 0.5;
      const entityCenterY = (entity.renderY ?? entity.y) + 0.5;
      const handWorldX = entityCenterX + screenDeltaX / DEFAULT_CONFIG.SIZE;
      const handWorldY = entityCenterY + screenDeltaY / DEFAULT_CONFIG.SIZE;
      state.muzzleWorld = {
         x: handWorldX + muzzleOffsetX,
         y: handWorldY + muzzleOffsetY
      };
   }

   let canvas = drawCharacter(scene, entity, viewContext, finalRenderRotation, renderPadding);
   
   if (canCache && cacheKey) {
       canvas = SPRITE_CACHE.set(cacheKey, canvas);
   }

   const padding = renderPadding || DEFAULT_CONFIG.PADDING || 0;
   const canvasSize = DEFAULT_CONFIG.SIZE + padding * 2;
   canvas.drawRatio = canvasSize / DEFAULT_CONFIG.SIZE;
   const feetYInCanvas = padding + (DEFAULT_CONFIG.ANCHOR_Y * DEFAULT_CONFIG.SIZE);
   const canvasCenterY = canvasSize / 2;
   canvas.verticalShift = feetYInCanvas - canvasCenterY;
   
   return canvas;
}

const createProjector = (viewContext, rotation) => {
   const { yFactor = 0.8, shiftX = 0, shiftY = 0, ratio = 0 } = viewContext || {};
   const bRot = rotation + DEFAULT_CONFIG.BODY_OFFSET;
   const bCos = Math.cos(bRot);
   const bSin = Math.sin(bRot);
   const cx = DEFAULT_CONFIG.SIZE / 2;
   const groundY = DEFAULT_CONFIG.SIZE * 0.90;
   const boundsZ = Math.max(8, DEFAULT_CONFIG.SIZE * 0.6);
   const depthWeight = Math.max(0, 0.9 - yFactor) * 4.0;
   return (p) => {
      if (p.scale !== undefined) return p; 
      const rx = p.x * bCos - p.z * bSin;
      const rz = p.x * bSin + p.z * bCos;
      const worldHeight = groundY - p.y;
      const heightNorm = worldHeight / DEFAULT_CONFIG.SIZE;
      const dShiftX = shiftX + (rx * ratio);
      const dShiftY = shiftY + (rz * ratio);
      const rzVis = Math.max(-boundsZ, Math.min(boundsZ, rz));
      return {
         x: cx + rx + (dShiftX * heightNorm),
         y: groundY + rz - (worldHeight * yFactor) + (dShiftY * heightNorm),
         z: rz,
         sortZ: rzVis - (p.y * depthWeight),
         scale: 0.9 + (rzVis / DEFAULT_CONFIG.SIZE) * 0.5
      };
   };
};

const projectRig = (rigData, rotation, viewContext) => {
   const proj = createProjector(viewContext, rotation);
   const rArmP2 = proj(rigData.rArm.p2);
   const rLegP2 = proj(rigData.rLeg.p2);
   const lArmP2 = proj(rigData.lArm.p2);
   const lLegP2 = proj(rigData.lLeg.p2);
   const headP = proj(rigData.head);
   return {
      head: headP,
      headY: headP.y,
      headRot: rotation,
      bodyRot: rotation + DEFAULT_CONFIG.BODY_OFFSET,
      spineTop: proj(rigData.spineTop),
      spineBot: proj(rigData.spineBot),
      rArm: { p1: proj(rigData.rArm.p1), p2: rArmP2, p3: proj(rigData.rArm.p3) },
      lArm: { p1: proj(rigData.lArm.p1), p2: lArmP2, p3: proj(rigData.lArm.p3) },
      rLeg: { p1: proj(rigData.rLeg.p1), p2: rLegP2, p3: proj(rigData.rLeg.p3) },
      lLeg: { p1: proj(rigData.lLeg.p1), p2: lLegP2, p3: proj(rigData.lLeg.p3) },
      zRight: (rArmP2.z + rLegP2.z) / 2,
      zLeft: (lArmP2.z + lLegP2.z) / 2
   };
};

const projectRagdollRig = (rigData, rotation, viewContext, rawPoints) => {
   const proj = createProjector(viewContext, rotation);
   const headP = proj(rigData.head);
   const result = {
      head: headP,
      headY: headP.y,
      headRot: rotation,
      bodyRot: rotation + DEFAULT_CONFIG.BODY_OFFSET,
      spineTop: proj(rigData.spineTop),
      spineBot: proj(rigData.spineBot),
      rArm: { p1: proj(rigData.rArm.p1), p2: proj(rigData.rArm.p2), p3: proj(rigData.rArm.p3) },
      lArm: { p1: proj(rigData.lArm.p1), p2: proj(rigData.lArm.p2), p3: proj(rigData.lArm.p3) },
      rLeg: { p1: proj(rigData.rLeg.p1), p2: proj(rigData.rLeg.p2), p3: proj(rigData.rLeg.p3) },
      lLeg: { p1: proj(rigData.lLeg.p1), p2: proj(rigData.lLeg.p2), p3: proj(rigData.lLeg.p3) },
      lookup: {}
   };
   if (rawPoints) { for (const key in rawPoints) { result.lookup[key] = proj(rawPoints[key]); } }
   return result;
};

// --- PIXEL DRAWING HELPERS ---
const drawPixelCircle = (ctx, cx, cy, r, color) => {
   ctx.fillStyle = color;
   
   // Optimization: Tiny dots
   if (r <= 1) {
      ctx.fillRect(cx, cy, 1, 1);
      return;
   }

   // Rasterize a circle
   // We iterate a bounding box and check distance squared to avoid SquareRoot calls
   const rInt = Math.ceil(r);
   const rSq = r * r;
   
   for (let y = -rInt; y <= rInt; y++) {
      for (let x = -rInt; x <= rInt; x++) {
         if (x*x + y*y <= rSq) {
            ctx.fillRect(cx + x, cy + y, 1, 1);
         }
      }
   }
};

const drawPixelLine = (ctx, x0, y0, x1, y1, thickness, color) => {
   ctx.fillStyle = color;
   
   // Bresenham-like logic or just stepping
   const dx = x1 - x0;
   const dy = y1 - y0;
   const dist = Math.sqrt(dx*dx + dy*dy);
   
   if (dist === 0) {
      drawPixelCircle(ctx, x0, y0, thickness/2, color);
      return;
   }

   const steps = Math.ceil(dist);
   const xStep = dx / steps;
   const yStep = dy / steps;
   
   // Draw a dot at every step along the line
   for (let i = 0; i <= steps; i++) {
      const px = Math.round(x0 + (xStep * i));
      const py = Math.round(y0 + (yStep * i));
      
      // Draw a "brush" at this point
      if (thickness <= 1) {
         ctx.fillRect(px, py, 1, 1);
      } else {
         const brushR = thickness / 2;
         // Optimization: inline small brush logic for speed
         const bInt = Math.ceil(brushR);
         const bSq = brushR * brushR;
         for (let by = -bInt; by <= bInt; by++) {
            for (let bx = -bInt; bx <= bInt; bx++) {
               if (bx*bx + by*by <= bSq) {
                  ctx.fillRect(px + bx, py + by, 1, 1);
               }
            }
         }
      }
   }
};

const SceneRenderer = {
   queue: [],
   pool: [],
   poolIndex: 0,
   ctx: null,
   project: null,

   TYPE_SPHERE: 0,
   TYPE_CYLINDER: 1,
   TYPE_CUSTOM: 2,

   getItem() {
      if (this.poolIndex >= this.pool.length) {
         this.pool.push({});
      }
      return this.pool[this.poolIndex++];
   },

   begin(ctx, viewContext, rotation) {
      this.ctx = ctx;
      this.queue.length = 0;
      this.poolIndex = 0;
      this.project = createProjector(viewContext, rotation);
      // Still good to keep this, though we aren't using images anymore
      ctx.imageSmoothingEnabled = false; 
   },

   addSphere(pos, radius, palette) {
      const p = this.project(pos);
      const r = radius * p.scale; 
      
      if (r < 0.25) return;

      const item = this.getItem();
      item.type = this.TYPE_SPHERE;
      item.z = p.sortZ;
      item.x = Math.round(p.x);
      item.y = Math.round(p.y);
      item.r = r;
      item.palette = palette;
      
      this.queue.push(item);
   },

   addCylinder(start, end, radius, palette, scaleWidth = 1.0) {
      const s = this.project(start);
      const e = this.project(end);

      const item = this.getItem();
      item.type = this.TYPE_CYLINDER;
      item.z = (s.sortZ + e.sortZ) / 2;
      
      item.sx = Math.round(s.x);
      item.sy = Math.round(s.y);
      item.ex = Math.round(e.x);
      item.ey = Math.round(e.y);
      
      const avgScale = (s.scale + e.scale) * 0.5;
      item.thickness = Math.max(1, radius * avgScale * scaleWidth * 2); 
      item.palette = palette;

      this.queue.push(item);
   },

   addCustom(pos, offsetZ, callback) {
      const p = this.project(pos);
      const item = this.getItem();
      item.type = this.TYPE_CUSTOM;
      item.z = p.sortZ + offsetZ;
      item.p = p;
      item.callback = callback;
      this.queue.push(item);
   },

   flush() {
      this.queue.sort((a, b) => a.z - b.z);
      const ctx = this.ctx;
      
      for (let i = 0; i < this.queue.length; i++) {
         const item = this.queue[i];

         if (item.type === this.TYPE_SPHERE) {
            // PIXEL CIRCLE
            drawPixelCircle(ctx, item.x, item.y, item.r, item.palette.base);
            
            // Single pixel highlight
            if (item.r > 2.5) {
               ctx.fillStyle = item.palette.light;
               ctx.fillRect(item.x - 1, item.y - 1, 1, 1);
            }

         } else if (item.type === this.TYPE_CYLINDER) {
            // PIXEL LINE
            drawPixelLine(ctx, item.sx, item.sy, item.ex, item.ey, item.thickness, item.palette.base);

         } else if (item.type === this.TYPE_CUSTOM) {
            item.callback(ctx, item.p);
         }
      }
      this.queue.length = 0;
   }
};

const drawCharacter = (scene, entity, viewContext, rotation, overridePadding = null) => {
   const padding = overridePadding !== null ? overridePadding : (DEFAULT_CONFIG.PADDING || 0);
   const canvasSize = Math.ceil(RIG.size + padding * 2);

   if (SHARED_CANVAS.width !== canvasSize || SHARED_CANVAS.height !== canvasSize) {
      SHARED_CANVAS.width = canvasSize;
      SHARED_CANVAS.height = canvasSize;
   } else {
      SHARED_CTX.clearRect(0, 0, canvasSize, canvasSize);
   }

   const ctx = SHARED_CTX;
   ctx.save();
   ctx.translate(padding, padding);
   
   SceneRenderer.begin(ctx, viewContext, rotation);
   const Renderer = SceneRenderer;
   
   // --- INTERNAL HELPER: Gore Stumps ---
   const drawStump = (pointName, radiusMult = 0.6) => {
      let p = (scene.lookup && scene.lookup[pointName]) || scene[pointName];
      if (p && p.p1) p = p.p1;
      if (!p) return;
      
      Renderer.addCustom(p, 0.05, (ctx, p) => {
         const scale = p.scale || 1.0;
         const rBase = (RIG.torsoHalfWidth * radiusMult) * scale;
         
         // Tiny stump -> single pixel
         if (rBase < 1.0) {
             ctx.fillStyle = RAGDOLL_CONFIG.BLOOD.PALETTE.VENOUS;
             ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
             return;
         }

         const palette = RAGDOLL_CONFIG.BLOOD.PALETTE;
         
         // 1. Draw Meat (Ragged Pixels)
         ctx.fillStyle = palette.VENOUS;
         const rInt = Math.ceil(rBase);
         for(let y = -rInt; y <= rInt; y++) {
            for(let x = -rInt; x <= rInt; x++) {
               // Randomize radius check slightly for ragged look
               if (x*x + y*y <= rBase * rBase * (0.8 + Math.random()*0.4)) {
                   ctx.fillRect(Math.round(p.x + x), Math.round(p.y + y), 1, 1);
               }
            }
         }

         // 2. Bone center (Marrow) - only if big enough
         if (rBase > 1.5) {
             drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), rBase * 0.4, '#f2f0e6');
             drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), rBase * 0.15, palette.MARROW);
         }
      });
   };

   // --- DATA GATHERING ---
   const char = entity ? getCharacter(entity) : generateCharacter(0);
   const getPalette = (base, light, dark) => ({ base: base || '#888', light: light || '#fff', dark: dark || '#000' });
   const Palettes = {
      skin: getPalette(char.skinColor, char.skinLight, char.skinDark),
      shirt: getPalette(char.topColor, char.topLight, char.topDark),
      pants: getPalette(char.bottomColor, char.bottomLight, char.bottomDark),
      shoe: getPalette(char.shoeColor, '#333', '#000'),
      eye: getPalette(char.eyeColor, char.eyeLight, char.eyeDark),
      hair: getPalette(char.hairColor, '#fff', '#000')
   };
   const armPalette = (char.sleeveStyle === 'long') ? Palettes.shirt : Palettes.skin;
   const state = entity ? ENTITY_STATES[entity.id] : null;
   const isRagdoll = state && state.isRagdoll && scene.lookup;

   // --- RAGDOLL EXTRAS (Blood stains, etc) ---
   if (state && state.ragdoll && state.ragdoll.floorStains) {
      state.ragdoll.floorStains.forEach(stain => {
         Renderer.addCustom(stain, -0.05, (ctx, proj) => {
            const r = (DEFAULT_CONFIG.SIZE * 0.02) * proj.scale * stain.size;
            
            // Draw pixelated stain
            ctx.fillStyle = stain.color;
            ctx.globalAlpha = 0.9;
            
            // Simple random rect fill for stains at this resolution
            const rInt = Math.ceil(r);
            const cx = Math.round(proj.x);
            const cy = Math.round(proj.y);
            
            for(let y = -rInt; y <= rInt; y++) {
               for(let x = -rInt; x <= rInt; x++) {
                   // Flatten y to simulate perspective on floor
                   if (x*x + (y*2)*(y*2) <= r*r) {
                       if (Math.random() > 0.2) ctx.fillRect(cx + x, cy + y, 1, 1);
                   }
               }
            }
            ctx.globalAlpha = 1.0;
         });
      });
   }

   // --- MAIN RENDER LOGIC ---
   if (isRagdoll) {
      const constraints = state.ragdoll.constraints;
      const lookup = scene.lookup || {};
      const headCenter = lookup['head'] || scene.head;
      const headFragmentKeys = Object.keys(lookup).filter(k => k.startsWith('head_fr_'));
      
      if (headFragmentKeys.length > 0) {
         // Exploded Head
         const frPoints = headFragmentKeys.map(id => ({ id, p: lookup[id] })).filter(x => x.p);
         const skinPalette = Palettes.skin;
         const darkRed = '#5a0000';
         
         for (const f of frPoints) {
            const p = f.p;
            const s = p.scale || 1.0;
            const shardSize = Math.max(1, RIG.headR * 0.35 * s);
            
            Renderer.addCustom(p, 0.0, (ctx, p) => {
               const px = Math.round(p.x);
               const py = Math.round(p.y);
               // Just draw jagged shards
               ctx.fillStyle = skinPalette.base;
               ctx.fillRect(px, py, shardSize, shardSize);
               ctx.fillStyle = darkRed;
               ctx.fillRect(px, py + 1, shardSize, 1);
            });
         }
         if (headCenter) {
            Renderer.addCustom(headCenter, 0.02, (ctx, p) => {
                const r = (RIG.headR * 0.36) * (p.scale || 1.0);
                drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), r, '#f2f0e6');
                drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), r * 0.35, RAGDOLL_CONFIG.BLOOD.PALETTE.MARROW);
            });
         }
      } else {
         Renderer.addSphere(scene.head, RIG.headR, Palettes.skin);
      }
      
      const gutPalette = { base: '#8a3333', light: '#d16e6e', dark: '#4a1111' };
      for (const c of constraints) {
         if (!c.a || !c.b) continue;
         if (c.a.toString().startsWith('head_fr_') || c.b.toString().startsWith('head_fr_')) continue;
         const pA = scene.lookup && scene.lookup[c.a] ? scene.lookup[c.a] : scene[c.a];
         const pB = scene.lookup && scene.lookup[c.b] ? scene.lookup[c.b] : scene[c.b];
         if (!pA || !pB) continue;
         const nameA = c.a.split('_fr_')[0];
         const nameB = c.b.split('_fr_')[0];
         const nameCheck = nameA + nameB;
         let palette = Palettes.skin;
         let radius = RIG.armL1 * 0.25;
         const isGut = c.a.toString().startsWith('gut_') || c.b.toString().startsWith('gut_');
         if (isGut) {
            palette = gutPalette;
            radius = RIG.torsoHalfWidth * 0.35;
         }
         else if (nameCheck.includes('Leg') || nameCheck.includes('Hip') || nameCheck.includes('Shin') || nameCheck.includes('Knee') || nameCheck.includes('Foot')) {
            palette = Palettes.pants;
            radius = RIG.legL1 * 0.3;
         }
         else if (nameCheck.includes('Arm') || nameCheck.includes('Shoulder') || nameCheck.includes('Elbow') || nameCheck.includes('Hand')) {
            palette = armPalette;
            radius = RIG.armL1 * 0.3;
         }
         else if (nameCheck.includes('spine') || nameCheck.includes('torso')) {
            palette = Palettes.shirt;
            radius = RIG.torsoHalfWidth * 0.9;
            if (c.a.toString().includes('_fr_') || c.b.toString().includes('_fr_')) {
               radius = RIG.torsoHalfWidth * 0.4;
            }
         }
         else if (nameCheck.includes('head')) {
            palette = Palettes.skin;
            radius = RIG.headR * 0.6;
         }
         const lengthScale = Math.min(1.0, c.len / (RIG.size * 0.15));
         radius *= Math.max(0.3, lengthScale);
         Renderer.addCylinder(pA, pB, radius, palette);
         const isHidden = (id) => {
            if (!id) return false;
            const strId = id.toString();
            const isSpine = (strId === 'spineTop' || strId === 'spineBot');
            const isFrag = strId.includes('torso_fr_');
            return (state.ragdoll.torsoFragmented && isSpine) || isFrag;
         };
         const sphereRad = isGut ? radius * 0.85 : radius * 0.9;
         if (!isHidden(c.a)) { Renderer.addSphere(pA, sphereRad, palette); }
         if (!isHidden(c.b)) { Renderer.addSphere(pB, sphereRad, palette); }
      }
      if (isRagdoll && state.ragdoll && state.ragdoll.torsoFragmented && state.ragdoll.torsoFragments) {
         const rag = state.ragdoll;
         const leftId = rag.torsoFragments.left;   
         const rightId = rag.torsoFragments.right; 
         const lookup = scene.lookup || {};
         const leftP = lookup[leftId];
         const rightP = lookup[rightId];
         const drawFrag = (p) => {
             const r = (RIG.torsoHalfWidth * 0.9) * (p.scale || 1.0);
             drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), r, RAGDOLL_CONFIG.BLOOD.PALETTE.MARROW);
             drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), r * 0.4, '#f2f0e6');
         };
         if (leftP) Renderer.addCustom(leftP, 0.1, (ctx, p) => drawFrag(p));
         if (rightP) Renderer.addCustom(rightP, 0.1, (ctx, p) => drawFrag(p));
      }
      const severed = state.ragdoll.severed || {};
      if (severed.head) drawStump('spineTop', 0.6);
      if (severed.rArm) { drawStump('rShoulder', 0.5); drawStump('spineTop', 0.5); }
      if (severed.lArm) { drawStump('lShoulder', 0.5); drawStump('spineTop', 0.5); }
      if (severed.rForearm) { drawStump('rElbow', 0.4); drawStump('rShoulder', 0.4); }
      if (severed.lForearm) { drawStump('lElbow', 0.4); drawStump('lShoulder', 0.4); }
      if (severed.rLeg) { drawStump('rHip', 0.6); drawStump('spineBot', 0.6); }
      if (severed.lLeg) { drawStump('lHip', 0.6); drawStump('spineBot', 0.6); }
      if (severed.rShin) { drawStump('rKnee', 0.5); drawStump('rHip', 0.5); }
      if (severed.lShin) { drawStump('lKnee', 0.5); drawStump('lHip', 0.5); }
   } else {
      // STANDARD CHARACTER
      const spineTop = scene.spineTop;
      const spineBot = scene.spineBot;
      const spineMid = {
         x: (spineTop.x + spineBot.x) * 0.5,
         y: (spineTop.y + spineBot.y) * 0.5,
         z: (spineTop.z + spineBot.z) * 0.5,
         sortZ: (spineTop.sortZ + spineBot.sortZ) * 0.5,
         scale: (spineTop.scale + spineBot.scale) * 0.5
      };
      Renderer.addSphere(spineTop, RIG.torsoHalfWidth * 0.9, Palettes.shirt);
      Renderer.addCylinder(spineTop, spineMid, RIG.torsoHalfWidth * 0.95, Palettes.shirt);
      Renderer.addCylinder(spineMid, spineBot, RIG.torsoHalfWidth * 0.9, Palettes.shirt);
      Renderer.addSphere(spineBot, RIG.hipHalfWidth * 1.1, Palettes.pants);
      const legRad = RIG.legL1 * 0.35;
      Renderer.addSphere(scene.rLeg.p1, legRad, Palettes.pants);
      Renderer.addCylinder(scene.rLeg.p1, scene.rLeg.p2, legRad, Palettes.pants);
      Renderer.addSphere(scene.rLeg.p2, legRad * 0.9, Palettes.pants);
      Renderer.addCylinder(scene.rLeg.p2, scene.rLeg.p3, legRad * 0.8, Palettes.pants);
      Renderer.addSphere(scene.rLeg.p3, legRad * 1.2, Palettes.shoe);
      Renderer.addSphere(scene.lLeg.p1, legRad, Palettes.pants);
      Renderer.addCylinder(scene.lLeg.p1, scene.lLeg.p2, legRad, Palettes.pants);
      Renderer.addSphere(scene.lLeg.p2, legRad * 0.9, Palettes.pants);
      Renderer.addCylinder(scene.lLeg.p2, scene.lLeg.p3, legRad * 0.8, Palettes.pants);
      Renderer.addSphere(scene.lLeg.p3, legRad * 1.2, Palettes.shoe);
      const armRad = RIG.armL1 * 0.30;
      Renderer.addSphere(scene.rArm.p1, armRad, Palettes.shirt);
      Renderer.addCylinder(scene.rArm.p1, scene.rArm.p2, armRad, Palettes.shirt);
      Renderer.addSphere(scene.rArm.p2, armRad * 0.9, armPalette);
      Renderer.addCylinder(scene.rArm.p2, scene.rArm.p3, armRad * 0.8, armPalette);
      Renderer.addSphere(scene.rArm.p3, RIG.handR * 1.5, Palettes.skin);
      Renderer.addSphere(scene.lArm.p1, armRad, Palettes.shirt);
      Renderer.addCylinder(scene.lArm.p1, scene.lArm.p2, armRad, Palettes.shirt);
      Renderer.addSphere(scene.lArm.p2, armRad * 0.9, armPalette);
      Renderer.addCylinder(scene.lArm.p2, scene.lArm.p3, armRad * 0.8, armPalette);
      Renderer.addSphere(scene.lArm.p3, RIG.handR * 1.5, Palettes.skin);
   }
   
   const isRolling = state && (state.pose === 'ROLL' || state.isRolling);
   const headZOffset = isRolling ? -2.0 : 0.5;
   if (scene.head) scene.head.sortZ += headZOffset;
   if (scene.lookup && scene.lookup.head) scene.lookup.head.sortZ += headZOffset;
   
   const headFragmented = isRagdoll && state.ragdoll && state.ragdoll.headFragmented;
   const isDecapitated = isRagdoll && state.ragdoll.severed && state.ragdoll.severed.head;
   
   if (headFragmented) {
      const stump = scene.lookup ? scene.lookup.head : scene.head;
      if (stump) {
         Renderer.addCustom(stump, 0.02, (ctx, p) => {
            const r = (RIG.headR * 0.36) * (p.scale || 1.0);
            drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), r, '#f2f0e6');
            drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), r * 0.35, RAGDOLL_CONFIG.BLOOD.PALETTE.MARROW);
         });
      }
   } else if (isDecapitated) {
      const looseHead = scene.lookup ? scene.lookup.head : scene.head;
      if (looseHead) {
         Renderer.addSphere(looseHead, RIG.headR, Palettes.skin);
         Renderer.addCustom(looseHead, -0.1, (ctx, h) => {
            const r = (RIG.headR * 0.5) * h.scale;
            drawPixelCircle(ctx, Math.round(h.x), Math.round(h.y + (RIG.headR * 0.4 * h.scale)), r, '#500');
         });
      }
      const stump = scene.lookup ? scene.lookup.spineTop : scene.spineTop;
      if (stump) drawStump('spineTop', 0.6);
   } else {
      Renderer.addSphere(scene.head, RIG.headR, Palettes.skin);
   }
   
   const weaponVisual = getWeaponVisual(entity?.equippedWeapon);
   if (weaponVisual && !isRagdoll) {
      Renderer.addCustom(scene.lArm.p3, 0.1, (ctx) => {
         const pHandL = scene.lArm.p3;
         const pHandR = scene.rArm.p3;
         const scale = pHandL.scale;
         
         const state = entity?.id ? ENTITY_STATES[entity.id] : null;
         let aimAngle;
         if (state && state.isRolling && state.rollWeaponAimAngle !== undefined) {
            aimAngle = state.rollWeaponAimAngle;
         } else {
            aimAngle = rotation + DEFAULT_CONFIG.BODY_OFFSET - Math.PI;
         }
         
         const S = (r) => RIG.size * r;
         const COLORS = { GUN: ['#111', '#970000ff', '#fbff00ff'] };
         // For guns, we assume the weapon visual code uses fillRect already
         // If it uses ctx.lineTo, it will still be vectory unless updated,
         // but weapons usually look okay with straight lines.
         weaponVisual.draw(ctx, pHandL, pHandR, scale, aimAngle, S, COLORS);
      });
   }
   
   // --- PIXEL BLOOD PARTICLES ---
   if (state && state.ragdoll && state.ragdoll.particles.length > 0) {
      const bloodParticles = state.ragdoll.particles;
      const bCfg = RAGDOLL_CONFIG.BLOOD;
      bloodParticles.forEach(p => {
         const point = { x: p.x, y: p.y, z: p.z };
         const sortOffset = 0.01 + (Math.random() * 0.01);
         Renderer.addCustom(point, sortOffset, (ctx, proj) => {
            const pixelRadius = (DEFAULT_CONFIG.SIZE * bCfg.DROP_SIZE) * proj.scale * p.size;
            ctx.fillStyle = p.color;

            // Single pixel for small drops
            if (pixelRadius < 0.7) {
               ctx.fillRect(Math.round(proj.x), Math.round(proj.y), 1, 1);
               return;
            }

            if (p.onGround) {
               ctx.globalAlpha = 0.85 * (Math.min(1.0, p.life));
               const rInt = Math.ceil(pixelRadius * 2);
               // Simple rect splash
               ctx.fillRect(Math.round(proj.x - rInt/2), Math.round(proj.y), rInt, 1);
               ctx.globalAlpha = 1.0;
            } else {
               drawPixelCircle(ctx, Math.round(proj.x), Math.round(proj.y), pixelRadius, p.color);
               if (pixelRadius > 2.0) {
                   ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                   ctx.fillRect(Math.round(proj.x - 1), Math.round(proj.y - 1), 1, 1);
               }
            }
         });
      });
   }
   
   if (entity && entity.stuckProjectiles) {
      entity.stuckProjectiles.forEach(p => {
         let p1, p2;
         const lookup = (isRagdoll && scene.lookup) ? scene.lookup : null;
         const getLimb = (key) => {
            if (lookup) {
               if (key === 'rArm') return [lookup['rShoulder'], lookup['rElbow']];
               if (key === 'rForearm') return [lookup['rElbow'], lookup['rHand']];
               if (key === 'lArm') return [lookup['lShoulder'], lookup['lElbow']];
               if (key === 'lForearm') return [lookup['lElbow'], lookup['lHand']];
               if (key === 'rLeg') return [lookup['rHip'], lookup['rKnee']];
               if (key === 'lLeg') return [lookup['lHip'], lookup['lKnee']];
               return [lookup['spineTop'], lookup['spineBot']];
            } else {
               if (key === 'rArm') return [scene.rArm.p1, scene.rArm.p2];
               if (key === 'rForearm') return [scene.rArm.p2, scene.rArm.p3];
               if (key === 'lArm') return [scene.lArm.p1, scene.lArm.p2];
               if (key === 'lForearm') return [scene.lArm.p2, scene.lArm.p3];
               if (key === 'rLeg') return [scene.rLeg.p1, scene.rLeg.p2];
               if (key === 'lLeg') return [scene.lLeg.p1, scene.lLeg.p2];
               return [scene.spineTop, scene.spineBot];
            }
         };
         if (p.part === 'head') {
            p1 = lookup ? lookup.head : scene.head;
            p2 = p1;
         } else {
            [p1, p2] = getLimb(p.part);
         }
         if (p1 && p2) {
            const t = p.offsetT || 0;
            const drawX = p1.x + (p2.x - p1.x) * t;
            const drawY = p1.y + (p2.y - p1.y) * t;
            const sortZ = p1.sortZ + (p2.sortZ - p1.sortZ) * t;
            const scale = p1.scale;
            Renderer.addCustom({ x: drawX, y: drawY, sortZ: sortZ, scale: scale }, 0.1, (ctx, p) => {
               drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), 0.75 * p.scale, '#330000ff');
               ctx.fillStyle = '#8a0000';
               const w = Math.max(1, p.scale);
               const h = Math.max(2, 2 * p.scale);
               ctx.fillRect(Math.round(p.x - w*0.5), Math.round(p.y), Math.round(w), Math.round(h));
            });
         }
      });
   }
   
   Renderer.flush();
   ctx.restore();
   
   SHARED_CANVAS.drawRatio = canvasSize / DEFAULT_CONFIG.SIZE;
   const feetYInCanvas = padding + (DEFAULT_CONFIG.ANCHOR_Y * DEFAULT_CONFIG.SIZE);
   const canvasCenterY = canvasSize / 2;
   SHARED_CANVAS.verticalShift = feetYInCanvas - canvasCenterY;
   
   return SHARED_CANVAS;
};
function checkWallCollision(x, y) {
   if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return true;
   const ix = Math.floor(x);
   const iy = Math.floor(y);
   const idx = ix + iy * GRID_WIDTH;
   if (!ObstacleGrid || idx >= ObstacleGrid.length) return true;
   return ObstacleGrid[idx] !== 0;
}

const initializeRagdoll = (state, rigData, impactProfile) => {
   const clonePoint = (p) => ({ x: p.x, y: p.y, z: p.z || 0 });
   const points = {
      head: clonePoint(rigData.head),
      spineTop: clonePoint(rigData.spineTop),
      spineBot: clonePoint(rigData.spineBot),
      rShoulder: clonePoint(rigData.rArm.p1),
      rElbow: clonePoint(rigData.rArm.p2),
      rHand: clonePoint(rigData.rArm.p3),
      lShoulder: clonePoint(rigData.lArm.p1),
      lElbow: clonePoint(rigData.lArm.p2),
      lHand: clonePoint(rigData.lArm.p3),
      rHip: clonePoint(rigData.rLeg.p1),
      rKnee: clonePoint(rigData.rLeg.p2),
      rFoot: clonePoint(rigData.rLeg.p3),
      lHip: clonePoint(rigData.lLeg.p1),
      lKnee: clonePoint(rigData.lLeg.p2),
      lFoot: clonePoint(rigData.lLeg.p3),
   };
   const yOffset = (RIG.size / 32) * 2.0;
   for (const key in points) points[key].y -= yOffset;
   const dist = (a, b) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y, points[a].z - points[b].z);
   const constraints = [
      { a: 'head', b: 'spineTop', len: dist('head', 'spineTop') },
      { a: 'spineTop', b: 'spineBot', len: dist('spineTop', 'spineBot') },
      { a: 'spineTop', b: 'rShoulder', len: dist('spineTop', 'rShoulder') },
      { a: 'rShoulder', b: 'rElbow', len: dist('rShoulder', 'rElbow') },
      { a: 'rElbow', b: 'rHand', len: dist('rElbow', 'rHand') },
      { a: 'spineTop', b: 'lShoulder', len: dist('spineTop', 'lShoulder') },
      { a: 'lShoulder', b: 'lElbow', len: dist('lShoulder', 'lElbow') },
      { a: 'lElbow', b: 'lHand', len: dist('lElbow', 'lHand') },
      { a: 'spineBot', b: 'rHip', len: dist('spineBot', 'rHip') },
      { a: 'rHip', b: 'rKnee', len: dist('rHip', 'rKnee') },
      { a: 'rKnee', b: 'rFoot', len: dist('rKnee', 'rFoot') },
      { a: 'spineBot', b: 'lHip', len: dist('spineBot', 'lHip') },
      { a: 'lHip', b: 'lKnee', len: dist('lHip', 'lKnee') },
      { a: 'lKnee', b: 'lFoot', len: dist('lKnee', 'lFoot') },
      { a: 'rShoulder', b: 'lShoulder', len: dist('rShoulder', 'lShoulder') },
      { a: 'rHip', b: 'lHip', len: dist('rHip', 'lHip') },
   ];
   const prevPoints = {};
   const { force, hitBone } = impactProfile;
   const cfg = getScaledPhysics(RIG.size);
   const VELOCITY_SCALER = cfg.VELOCITY_SCALER;
   for (const key of Object.keys(points)) {
      const p = points[key];
      let vx, vy, vz;
      if (key === hitBone) {
         vx = force.x * VELOCITY_SCALER;
         vy = force.y * VELOCITY_SCALER;
         vz = force.z * VELOCITY_SCALER;
      } else {
         const d = Math.hypot(p.x - points[hitBone].x, p.y - points[hitBone].y, p.z - points[hitBone].z);
         const distFactor = Math.max(0.0, 1.0 - (d / (RIG.size * 1.5)));
         const transfer = cfg.IMPACT_DISTRIBUTION * distFactor;
         vx = force.x * transfer * VELOCITY_SCALER;
         vy = force.y * transfer * VELOCITY_SCALER;
         vz = force.z * transfer * VELOCITY_SCALER;
      }
      vx += (Math.random() - 0.5) * cfg.CHAOS;
      vy += (Math.random() - 0.5) * cfg.CHAOS;
      vz += (Math.random() - 0.5) * cfg.CHAOS;
      prevPoints[key] = { x: p.x - vx, y: p.y - vy, z: p.z - vz };
   }
   state.isRagdoll = true;
   state.ragdoll = {
      points,
      prevPoints,
      constraints,
      groundY: RIG.groundY,
      time: 0,
      settled: false,
      sleepTimer: 0,
      particles: [],
      emitters: [],
      severed: {},
      splitCounts: {},
      torsoFragmented: false,
      torsoFragments: null,
      partHealth: {},
      floorStains: [],
   };
};

const updateBloodEffects = (state, delta, wallChecker) => {
   if (!state.ragdoll) return;
   const { particles, emitters, points, groundY } = state.ragdoll;
   const dt = Math.min(delta, 0.033);
   const bCfg = RAGDOLL_CONFIG.BLOOD;
   if (particles.length > 500) { particles.splice(0, particles.length - 50); }
   const MAX_STAINS_PER_BODY = 20;
   if (state.ragdoll.floorStains.length > MAX_STAINS_PER_BODY) { state.ragdoll.floorStains.shift(); }
   for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      e.life -= dt;
      if (e.life <= 0) { emitters.splice(i, 1); continue; }
      const flowStrength = Math.min(1.0, e.life);
      const spawnRate = 1;
      const bone = points[e.bone];
      if (!bone) continue;
      for (let j = 0; j < spawnRate; j++) {
         const spread = 0.5;
         const vx = e.dir.x + (Math.random() - 0.5) * spread;
         const vy = e.dir.y + (Math.random() - 0.5) * spread;
         const vz = e.dir.z + (Math.random() - 0.5) * spread;
         const baseSpeed = 1.5 * flowStrength;
         const speed = baseSpeed * (e.scale || 1);
         const lifeDuration = bCfg.LIFESPAN_MIN + Math.random() * (bCfg.LIFESPAN_MAX - bCfg.LIFESPAN_MIN);
         const colorChoice = bCfg.PALETTE.ARTERIAL;
         const emitterScale = e.scale || 1;
         const moveX = (bone.x - state.ragdoll.prevPoints[e.bone].x) * 0.2;
         const moveZ = (bone.z - state.ragdoll.prevPoints[e.bone].z) * 0.2;
         particles.push({
            x: bone.x + (Math.random() - 0.5) * 0.1 * emitterScale,
            y: bone.y + (Math.random() - 0.5) * 0.1 * emitterScale,
            z: bone.z + (Math.random() - 0.5) * 0.1 * emitterScale,
            vx: vx * speed + moveX * emitterScale,
            vy: vy * speed,
            vz: vz * speed + moveZ * emitterScale,
            life: lifeDuration,
            startLife: lifeDuration,
            size: 0.6 + Math.random() * 0.4,
            color: colorChoice,
            onGround: false
         });
      }
   }
   if (!state.ragdoll.floorStains) state.ragdoll.floorStains = [];
   for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.onGround) {
         p.life -= dt * 0.5;
      } else {
         p.life -= dt;
         p.vy += bCfg.GRAVITY * dt;
         p.x += p.vx * dt;
         p.y += p.vy * dt;
         p.z += p.vz * dt;
         p.vx *= bCfg.DRAG;
         p.vy *= bCfg.DRAG;
         p.vz *= bCfg.DRAG;
         if (p.y > groundY) {
            p.y = groundY;
            p.vx *= 0.8; p.vz *= 0.8; p.vy = 0;
            p.onGround = true;
            if (Math.random() < 0.4) {
               if (state.ragdoll.floorStains.length > 500) {
                  state.ragdoll.floorStains.shift();
               }
               state.ragdoll.floorStains.push({
                  x: p.x,
                  y: groundY,
                  z: p.z,
                  size: p.size * (2.0 + Math.random()),
                  color: '#4a0000',
                  angle: Math.random() * Math.PI * 2
               });
            }
            p.size = (0.2 + (0.8 * (p.life / p.startLife))) * bCfg.SPLAT_SIZE;
         } else {
            p.size = 0.2 + (0.8 * (p.life / p.startLife));
         }
      }
      if (p.life <= 0) particles.splice(i, 1);
   }
};

const spawnGuts = (state, anchorId, count = 8) => {
   const rag = state.ragdoll;
   if (!rag || !rag.points[anchorId]) return;
   const anchor = rag.points[anchorId];
   const segLen = RIG.size * 0.08;
   let prevId = anchorId;
   const chainId = Math.floor(Math.random() * 99999);
   for (let i = 0; i < count; i++) {
      const id = `gut_${chainId}_${i}`;
      rag.points[id] = { x: anchor.x + (Math.random() - 0.5) * (RIG.size * 0.1), y: anchor.y + (segLen * (i + 1)), z: anchor.z + (Math.random() - 0.5) * (RIG.size * 0.1) };
      rag.prevPoints[id] = { x: rag.points[id].x + (Math.random() - 0.5) * 2.0, y: rag.points[id].y, z: rag.points[id].z + (Math.random() - 0.5) * 2.0 };
      rag.constraints.push({ a: prevId, b: id, len: segLen * 0.9 });
      prevId = id;
   }
   const firstGut = rag.prevPoints[`gut_${chainId}_0`];
   if (firstGut) firstGut.z += (RIG.size * 0.2);
};

const severLimb = (state, limbId) => {
   if (!state.ragdoll || !limbId) return;
   if (state.ragdoll.severed[limbId]) return;
   const bCfg = RAGDOLL_CONFIG.BLOOD;
   const scale = RIG.size / 32;
   const severData = {
      'head': { root: 'head', type: 'simple' },
      'rArm': { root: 'rShoulder', type: 'joint' },
      'lArm': { root: 'lShoulder', type: 'joint' },
      'rForearm': { root: 'rElbow', type: 'joint' },
      'lForearm': { root: 'lElbow', type: 'joint' },
      'rLeg': { root: 'rHip', type: 'joint' },
      'lLeg': { root: 'lHip', type: 'joint' },
      'rShin': { root: 'rKnee', type: 'joint' },
      'lShin': { root: 'lKnee', type: 'joint' }
   };
   const data = severData[limbId];
   if (!data) return;
   state.ragdoll.severed[limbId] = true;
   const rootPoint = state.ragdoll.points[data.root];
   if (!rootPoint) return;
   if (data.type === 'simple') {
      state.ragdoll.constraints = state.ragdoll.constraints.filter(c => c.a !== data.root && c.b !== data.root);
      const headChunkId = `${data.root}_chunk`;
      const headPos = state.ragdoll.points[data.root];
      state.ragdoll.points[headChunkId] = { x: headPos.x, y: headPos.y + RIG.headR * 0.5, z: headPos.z };
      state.ragdoll.prevPoints[headChunkId] = { ...state.ragdoll.points[headChunkId] };
      state.ragdoll.constraints.push({ a: data.root, b: headChunkId, len: RIG.headR * 0.5 });
   }
   else if (data.type === 'joint') {
      const newPointId = `${data.root}_severed_${Date.now()}`;
      state.ragdoll.points[newPointId] = { ...rootPoint };
      state.ragdoll.prevPoints[newPointId] = { ...state.ragdoll.prevPoints[data.root] };
      state.ragdoll.constraints.forEach(c => { if (c.a === data.root) { c.a = newPointId; } });
      state.ragdoll.prevPoints[newPointId].x += (Math.random() - 0.5) * 2;
      state.ragdoll.prevPoints[newPointId].z += (Math.random() - 0.5) * 2;
   }
   for (let i = 0; i < bCfg.BURST_COUNT; i++) {
      const lifeDur = bCfg.LIFESPAN_MIN + Math.random() * 1.0;
      state.ragdoll.particles.push({
         x: rootPoint.x, y: rootPoint.y, z: rootPoint.z,
         vx: (Math.random() - 0.5) * 8 * scale,
         vy: (-5 - Math.random() * 10) * scale,
         vz: (Math.random() - 0.5) * 8 * scale,
         life: lifeDur, startLife: lifeDur, size: 1.0,
         color: bCfg.PALETTE.ARTERIAL, onGround: false
      });
   }
   state.ragdoll.emitters.push({
      bone: data.root,
      dir: { x: (Math.random() - 0.5), y: -1, z: (Math.random() - 0.5) },
      life: bCfg.SPRAY_LIFE,
      scale: scale
   });
};

const applyJointLimits = (state) => {
   if (!state.ragdoll) return;
   const { points, severed, constraints } = state.ragdoll;
   const limits = RAGDOLL_CONFIG.CONSTRAINTS.JOINT_ANGLES;
   const areConnected = (pA_id, pB_id) => constraints.some(c => (c.a === pA_id && c.b === pB_id) || (c.a === pB_id && c.b === pA_id));
   const isSevered = (id) => severed && severed[id];
   const limitElbow = (shoulder, elbow, hand, minAngle, maxAngle) => {
      const v1x = elbow.x - shoulder.x;
      const v1y = elbow.y - shoulder.y;
      const v2x = hand.x - elbow.x;
      const v2y = hand.y - elbow.y;
      const angle = Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);
      if (angle < minAngle || angle > maxAngle) {
         const clampedAngle = Math.max(minAngle, Math.min(maxAngle, angle));
         const len = Math.sqrt(v2x * v2x + v2y * v2y);
         const baseAngle = Math.atan2(v1y, v1x);
         hand.x = elbow.x + Math.cos(baseAngle + clampedAngle) * len;
         hand.y = elbow.y + Math.sin(baseAngle + clampedAngle) * len;
      }
   };
   if (!isSevered('rArm') && areConnected('rShoulder', 'rElbow')) { limitElbow(points.rShoulder, points.rElbow, points.rHand, limits.ELBOW.min, limits.ELBOW.max); }
   if (!isSevered('lArm') && areConnected('lShoulder', 'lElbow')) { limitElbow(points.lShoulder, points.lElbow, points.lHand, limits.ELBOW.min, limits.ELBOW.max); }
   if (!isSevered('rLeg') && areConnected('rHip', 'rKnee')) { limitElbow(points.rHip, points.rKnee, points.rFoot, limits.KNEE.min, limits.KNEE.max); }
   if (!isSevered('lLeg') && areConnected('lHip', 'lKnee')) { limitElbow(points.lHip, points.lKnee, points.lFoot, limits.KNEE.min, limits.KNEE.max); }
   if (!isSevered('head') && areConnected('spineTop', 'head')) { limitElbow(points.spineBot, points.spineTop, points.head, limits.NECK.min, limits.NECK.max); }
};

const updateRagdoll = (state, delta, worldX = 0, worldY = 0, rotation = 0, wallChecker = null, entityId = null, entity = null) => {
   if (!state.ragdoll) return;
   const distToPlayer = Math.abs((worldX + 0.5) - character.x) + Math.abs((worldY + 0.5) - character.y);
   if (distToPlayer > 25 && state.ragdoll.sleepTimer > 0.1) { return; }
   if (distToPlayer > 15 && Math.random() > 0.5) { return; }
   if (state.ragdoll.settled) {
      console.log('settled in kinematics.js');
      //do something that makes the game faster
      state.ragdoll.sleepTimer += delta;
      updateBloodEffects(state, delta, wallChecker);
      return;
   }
   let totalMotion = 0;
   const { points, prevPoints, constraints, groundY } = state.ragdoll;
   const cfg = RAGDOLL_CONFIG;
   const phys = getScaledPhysics(RIG.size);
   const dt = Math.min(delta, 0.033);
   const dt2 = dt * dt;
   state.ragdoll.time += dt;
   for (const key of Object.keys(points)) {
      const p = points[key];
      const prev = prevPoints[key];
      let drag = phys.AIR_DRAG;
      let gravity = phys.GRAVITY;
      let vx = (p.x - prev.x) * drag;
      let vy = (p.y - prev.y) * drag;
      let vz = (p.z - prev.z) * drag;
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (speed > phys.SPEED_CAP) {
         const speedScale = phys.SPEED_CAP / speed;
         vx *= speedScale; vy *= speedScale; vz *= speedScale;
      }
      prev.x = p.x; prev.y = p.y; prev.z = p.z;
      p.x += vx;
      p.y += vy + (gravity * 1000 * dt2);
      p.z += vz;
   }
   const SCALE = 1 / RIG.size;
   const INV_SCALE = RIG.size;
   const visualRotation = (state.ragdollRotation ?? rotation) + DEFAULT_CONFIG.BODY_OFFSET;
   const cos = Math.cos(visualRotation);
   const sin = Math.sin(visualRotation);
   const entityCenterX = worldX + 0.5;
   const entityCenterY = worldY + 0.5;
   const getBodyPartRadius = (key) => {
      const baseName = key.split('_fr_')[0];
      if (baseName === 'head') return RIG.headR;
      if (baseName === 'spineTop' || baseName === 'spineBot') return RIG.torsoHalfWidth;
      if (baseName.includes('Shoulder') || baseName.includes('Elbow') || baseName.includes('Hand')) return RIG.armL1 * 0.3;
      if (baseName.includes('Hip') || baseName.includes('Knee') || baseName.includes('Foot')) return RIG.legL1 * 0.3;
      if (key.includes('_fr_')) return RIG.size * 0.08;
      return RIG.size * 0.1;
   };
   for (let step = 0; step < phys.COLLISION_STEPS; step++) {
      for (const key of Object.keys(points)) {
         const p = points[key];
         const prev = prevPoints[key];
         const radiusPx = getBodyPartRadius(key);
         const worldRadius = radiusPx * SCALE;
         const localX = p.x * SCALE;
         const localZ = p.z * SCALE;
         const worldOffsetX = localX * cos - localZ * sin;
         const worldOffsetY = localX * sin + localZ * cos;
         const wX = entityCenterX + worldOffsetX;
         const wY = entityCenterY + worldOffsetY;
         const startTileX = Math.floor(wX - worldRadius);
         const endTileX = Math.floor(wX + worldRadius);
         const startTileY = Math.floor(wY - worldRadius);
         const endTileY = Math.floor(wY + worldRadius);
         let totalPushX = 0;
         let totalPushY = 0;
         let hitCount = 0;
         for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
               const isWall = wallChecker ? wallChecker(tileX, tileY) : false;
               if (!isWall) continue;
               const closestX = Math.max(tileX, Math.min(wX, tileX + 1));
               const closestY = Math.max(tileY, Math.min(wY, tileY + 1));
               const dx = wX - closestX;
               const dy = wY - closestY;
               const distSq = dx * dx + dy * dy;
               const radiusSq = worldRadius * worldRadius;
               if (distSq < radiusSq && distSq > 0.000001) {
                  const dist = Math.sqrt(distSq);
                  const penetration = worldRadius - dist;
                  const nx = dx / dist;
                  const ny = dy / dist;
                  totalPushX += nx * penetration;
                  totalPushY += ny * penetration;
                  hitCount++;
               }
            }
         }
         if (hitCount > 0) {
            const pushWorldX = totalPushX / hitCount;
            const pushWorldY = totalPushY / hitCount;
            const pushLocalX = (pushWorldX * cos + pushWorldY * sin) * INV_SCALE;
            const pushLocalZ = (-pushWorldX * sin + pushWorldY * cos) * INV_SCALE;
            p.x += pushLocalX;
            p.z += pushLocalZ;
            const vx = p.x - prev.x;
            const vz = p.z - prev.z;
            const pushLen = Math.sqrt(pushLocalX * pushLocalX + pushLocalZ * pushLocalZ);
            if (pushLen > 0.0001) {
               const nx = pushLocalX / pushLen;
               const nz = pushLocalZ / pushLen;
               const vDotN = vx * nx + vz * nz;
               if (vDotN < 0) {
                  const tx = vx - nx * vDotN;
                  const tz = vz - nz * vDotN;
                  const newVx = tx * (1.0 - phys.WALL_FRICTION) - (nx * vDotN * phys.WALL_BOUNCE);
                  const newVz = tz * (1.0 - phys.WALL_FRICTION) - (nz * vDotN * phys.WALL_BOUNCE);
                  prev.x = p.x - newVx;
                  prev.z = p.z - newVz;
               }
            }
         }
      }
      let conIterations = cfg.CONSTRAINTS.ITERATIONS;
      if (state.ragdoll.sleepTimer > 0.5) conIterations = 1;
      for (let i = 0; i < conIterations; i++) {
         for (const c of constraints) {
            const pA = points[c.a];
            const pB = points[c.b];
            const dx = pB.x - pA.x;
            const dy = pB.y - pA.y;
            const dz = pB.z - pA.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < 0.0001) continue;
            const diff = (dist - c.len) / dist;
            const m = 0.5 * cfg.CONSTRAINTS.STIFFNESS;
            const ox = dx * diff * m;
            const oy = dy * diff * m;
            const oz = dz * diff * m;
            pA.x += ox; pA.y += oy; pA.z += oz;
            pB.x -= ox; pB.y -= oy; pB.z -= oz;
         }
         applyJointLimits(state);
      }
   }
   for (const key of Object.keys(points)) {
      const p = points[key];
      const prev = prevPoints[key];
      const r = getBodyPartRadius(key);
      const floor = groundY - (r * 0.5);
      if (p.y > floor) {
         p.y = floor;
         prev.y = floor; // Also update prev.y to prevent gravity-induced motion
         let friction = phys.GROUND_FRICTION;
         const vx = p.x - prev.x;
         const vz = p.z - prev.z;
         prev.x = p.x - vx * friction;
         prev.z = p.z - vz * friction;
      }
   }
   // Calculate totalMotion AFTER all physics, collisions, and constraints are resolved
   for (const key of Object.keys(points)) {
      const p = points[key];
      const prev = prevPoints[key];
      const distSq = (p.x - prev.x) ** 2 + (p.y - prev.y) ** 2 + (p.z - prev.z) ** 2;
      totalMotion += distSq;
   }
   
   if (totalMotion < 0.005) {
      state.ragdoll.sleepTimer = (state.ragdoll.sleepTimer || 0) + delta;
      if (state.ragdoll.sleepTimer > 1.0) {
         state.ragdoll.settled = true;
      }
   } else {
      state.ragdoll.sleepTimer = 0;
      state.ragdoll.settled = false;
   }
   updateBloodEffects(state, delta, wallChecker);
};

const RagdollPresets = {
   createImpactProfile: (dirX, dirY, power = 1.0) => {
      const gCfg = RAGDOLL_CONFIG.GORE;
      const forceMag = power * gCfg.FORCE_MULTIPLIER;
      const totalWeight = HIT_ZONES.reduce((sum, z) => sum + z.weight, 0);
      let r = Math.random() * totalWeight;
      let hitZone = HIT_ZONES[0];
      for (const zone of HIT_ZONES) {
         if (r < zone.weight) { hitZone = zone; break; }
         r -= zone.weight;
      }
      const severedLimbs = new Set();
      const processingQueue = [];
      processingQueue.push({ id: hitZone.id, force: forceMag, depth: 0 });
      let safetyBreaker = 0;
      while (processingQueue.length > 0 && severedLimbs.size < gCfg.MAX_SEVER_COUNT && safetyBreaker < 20) {
         safetyBreaker++;
         const current = processingQueue.shift();
         const limbId = SEVER_MAP[current.id];
         if (limbId && !severedLimbs.has(limbId)) {
            const fragility = gCfg.FRAGILITY[limbId] || 1.0;
            const threshold = gCfg.SEVER_THRESHOLD * fragility;
            if (current.force > threshold) { severedLimbs.add(limbId); }
         }
         if (current.force > 5 && current.depth < 2) {
            const neighbors = DAMAGE_NEIGHBORS[current.id] || [];
            for (const neighborId of neighbors) {
               if (Math.random() < gCfg.CASCADE_CHANCE) {
                  processingQueue.push({
                     id: neighborId,
                     force: current.force * gCfg.CASCADE_DECAY,
                     depth: current.depth + 1
                  });
               }
            }
         }
      }
      const yForce = -1.0 - (forceMag * 0.15);
      return {
         force: { x: dirX * forceMag, y: yForce, z: dirY * forceMag },
         hitBone: hitZone.id,
         sever: Array.from(severedLimbs)
      };
   }
};

const startRagdoll = (entityId, entity, rotation, bulletDirX, bulletDirY, power = 10) => {
   const state = ENTITY_STATES[entityId];
   if (!state || state.isRagdoll) return false;
   const dirX = bulletDirX || (Math.random() - 0.5);
   const dirY = bulletDirY || (Math.random() - 0.5);
   const impact = RagdollPresets.createImpactProfile(dirX, dirY, power);
   const bRot = rotation + DEFAULT_CONFIG.BODY_OFFSET;
   const cos = Math.cos(-bRot);
   const sin = Math.sin(-bRot);
   const localForceX = impact.force.x * cos - impact.force.z * sin;
   const localForceZ = impact.force.x * sin + impact.force.z * cos;
   impact.force.x = localForceX;
   impact.force.z = localForceZ;
   const rigData = calculateCharacterRig(state, state.animCycle || 0, entity);
   state.ragdollRotation = rotation;
   initializeRagdoll(state, rigData, impact);
   impact.sever.forEach(limb => severLimb(state, limb));
   return true;
};