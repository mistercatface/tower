// 1. GLOBAL STATE & CONFIG
const WORKSHOP_NODES = new Map();
const WORKSHOP_BEAMS = [];
const WORKSHOP_MESH_DEFS = {};
const CONSTRAINT_FORCES = new Map();

// OPTIMIZATIONS
const COLOR_CACHE_K = new Map();
const RENDER_QUEUE = [];
let physicsFrameCount = 0;

// 2. GLOBALS FOR MATH OPTIMIZATION
const _ROT_OUT = { x: 0, y: 0, z: 0 };
const LIGHT_DIR = { x: 0.5, y: 1.0, z: 0.5 };
(() => {
   const len = Math.sqrt(LIGHT_DIR.x ** 2 + LIGHT_DIR.y ** 2 + LIGHT_DIR.z ** 2);
   LIGHT_DIR.x /= len; LIGHT_DIR.y /= len; LIGHT_DIR.z /= len;
})();

let WORKSHOP_BUFFER = document.createElement('canvas');
let WB_CTX = WORKSHOP_BUFFER.getContext('2d', { alpha: true });
WB_CTX.imageSmoothingEnabled = false;

let WORKSHOP_CURSOR = {
   x: 0, y: 0, z: 0,
   valid: false,
   snapped: false,
   snapTargetId: null,
   snapLocalOffset: null
};
let WORKSHOP_DATA = {
   showSkeleton: false,
   showGrid: false,
   showShadows: false,
   cursorY: 0,
   activeTool: 'select',
   pendingBeamStartId: null,
   pendingBeamAnchor: null,
   selectedNodeId: null,

   isDragging: false,
   transformMode: null, // 'translate' | 'rotate'
   axisLock: null,      // 'x' | 'y' | 'z'
   dragStartPos: null,
   objStartPos: null,
   objStartRot: null,

   globalTime: 0,
   physicsEnabled: false
};

const WORKSHOP_CONFIG = {
   RESOLUTION: 512,
   NODE_RADIUS: 0.15,
   CUBE_SIZE: 0.4,
   BEAM_RADIUS: 0.05,
   SNAP_DIST: 0.5,
   HEIGHT_CAMERA: 16.0,
   RENDER_INTERVAL: 1,
   COLORS: {
      node: '#e0e0e0',
      nodeSelected: '#00ff00',
      cube: '#4488ff',
      cylinder: '#ff4444',
      cone: '#aa44ff',
      beam: '#ffaa00',
      snap: '#ffff00',
      ghost: 'rgba(255, 255, 255, 0.0)',
      wireframe: 'rgba(0, 0, 0, 0.0)'
   }
};

// [NEW] Pre-calculates the perspective distortion for the entire object center
// instead of doing it for every single vertex.
function precalculateProjectionData(objWorldPos, pState) {
    const dx = objWorldPos.x - pState.camX;
    const dz = objWorldPos.z - pState.camZ;
    
    // 1. Distance & Tilt
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    const maxTiltDist = LIGHT_FX.HEIGHT_CAMERA; // or WORKSHOP_CONFIG.HEIGHT_CAMERA
    const tiltFactor = Math.min(1.0, horizontalDist / maxTiltDist);

    // 2. Y-Compression based on tilt
    const minYFactor = 0.15;
    const yFactor = minYFactor + (0.8 - minYFactor) * tiltFactor;

    // 3. Perspective Shift Ratio
    const h = Math.max(0, objWorldPos.y);
    const ratio = h / Math.max(0.1, pState.camY - h);

    // 4. Base Screen Position (Center of object)
    const baseScreenX = (objWorldPos.x - pState.vx) * pState.ppu;
    const baseScreenZ = (objWorldPos.z - pState.vy) * pState.ppu;

    // 5. Camera Center Screen Pos
    const camScreenX = (pState.camX - pState.vx) * pState.ppu;
    const camScreenZ = (pState.camZ - pState.vy) * pState.ppu;

    // 6. Final Parallax Shift for the object center
    const shiftX = (baseScreenX - camScreenX) * ratio;
    const shiftZ = (baseScreenZ - camScreenZ) * ratio;

    return {
        centerX: baseScreenX + shiftX,
        centerY: baseScreenZ + shiftZ - (objWorldPos.y * pState.ppu * yFactor),
        yFactor: yFactor, // How much Y is compressed
        ratio: ratio,     // How much perspective scaling applied
        ppu: pState.ppu
    };
}

// [NEW] Ultra-fast vertex transformer that uses the pre-calculated object data
function transformVertexOptimized(local, projData, cachedCos, cachedSin) {
    // 1. Rotation (Fast)
    // Note: Inline the math here to avoid function call overhead in tight loops
    let y1 = local.y * cachedCos.x - local.z * cachedSin.x;
    let z1 = local.y * cachedSin.x + local.z * cachedCos.x;
    let x2 = local.x * cachedCos.y - z1 * cachedSin.y;
    let z2 = local.x * cachedSin.y + z1 * cachedCos.y;
    let x3 = x2 * cachedCos.z - y1 * cachedSin.z;
    let y3 = x2 * cachedSin.z + y1 * cachedCos.z; // This is the local rotated Y

    // 2. Apply Projection (Linear offset from precalculated center)
    // We assume the perspective distortion *within* the object is negligible (isometric-ish locally)
    return {
        x: projData.centerX + (x3 * projData.ppu),
        y: projData.centerY + (y3 * projData.ppu * 0.8), // 0.8 is arbitrary foreshortening
        z: z2 
    };
}

function rotatePoint(p, rot) {
   const cx = Math.cos(rot.x), sx = Math.sin(rot.x);
   const cy = Math.cos(rot.y), sy = Math.sin(rot.y);
   const cz = Math.cos(rot.z), sz = Math.sin(rot.z);
   let y1 = p.y * cx - p.z * sx;
   let z1 = p.y * sx + p.z * cx;
   let x2 = p.x * cy - z1 * sy;
   let z2 = p.x * sy + z1 * cy;
   let x3 = x2 * cz - y1 * sz;
   let y3 = x2 * sz + y1 * cz;
   return { x: x3, y: y3, z: z2 };
}

// Faster rotation that takes pre-calculated Sin/Cos values
function rotatePointFast(p, c, s) {
   // c = {x: cosX, y: cosY, z: cosZ}, s = {x: sinX, y: sinY, z: sinZ}
   let y1 = p.y * c.x - p.z * s.x;
   let z1 = p.y * s.x + p.z * c.x;
   let x2 = p.x * c.y - z1 * s.y;
   let z2 = p.x * s.y + z1 * c.y;
   let x3 = x2 * c.z - y1 * s.z;
   let y3 = x2 * s.z + y1 * c.z;
   return { x: x3, y: y3, z: z2 };
}


function unrotatePoint(p, rot) {
   if (!p || !rot) return { x: 0, y: 0, z: 0 };
   let x = p.x, y = p.y, z = p.z;
   let c = Math.cos(-rot.z), s = Math.sin(-rot.z);
   let nx = x * c - y * s, ny = x * s + y * c; x = nx; y = ny;
   c = Math.cos(-rot.y); s = Math.sin(-rot.y);
   nx = x * c - z * s; let nz = x * s + z * c; x = nx; z = nz;
   c = Math.cos(-rot.x); s = Math.sin(-rot.x);
   let ny2 = y * c - z * s; nz = y * s + z * c; y = ny2; z = nz;
   return { x, y, z };
}

function initializeMeshCache() {
   const r = 1.0;
   const segs = 12;
   WORKSHOP_MESH_DEFS.cube = {
      v: [
         { x: -r, y: -r, z: -r }, { x: r, y: -r, z: -r }, { x: r, y: -r, z: r }, { x: -r, y: -r, z: r },
         { x: -r, y: r, z: -r }, { x: r, y: r, z: -r }, { x: r, y: r, z: r }, { x: -r, y: r, z: r }
      ],
      f: [
         { idx: [0, 1, 5, 4], n: { x: 0, y: 0, z: -1 } },
         { idx: [2, 3, 7, 6], n: { x: 0, y: 0, z: 1 } },
         { idx: [1, 2, 6, 5], n: { x: 1, y: 0, z: 0 } },
         { idx: [3, 0, 4, 7], n: { x: -1, y: 0, z: 0 } },
         { idx: [4, 5, 6, 7], n: { x: 0, y: 1, z: 0 } },
         { idx: [0, 3, 2, 1], n: { x: 0, y: -1, z: 0 } }
      ]
   };

   // ========== CYLINDER MESH ==========
   const cylV = [];
   for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      cylV.push({ x: Math.cos(ang) * r, y: -r, z: Math.sin(ang) * r });
   }
   for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      cylV.push({ x: Math.cos(ang) * r, y: r, z: Math.sin(ang) * r });
   }
   const cylF = [];
   for (let i = 0; i < segs; i++) {
      const next = (i + 1) % segs;
      const ang = ((i + 0.5) / segs) * Math.PI * 2;
      const norm = { x: Math.cos(ang), y: 0, z: Math.sin(ang) };
      cylF.push({ idx: [i, next, next + segs, i + segs], n: norm });
   }
   const botIdx = []; for (let i = 0; i < segs; i++) botIdx.push(i);
   const topIdx = []; for (let i = 0; i < segs; i++) topIdx.push(i + segs);
   cylF.push({ idx: botIdx.reverse(), n: { x: 0, y: -1, z: 0 } });
   cylF.push({ idx: topIdx, n: { x: 0, y: 1, z: 0 } });
   WORKSHOP_MESH_DEFS.cylinder = { v: cylV, f: cylF };

   // ========== ELLIPSOID MESH ==========
   const ellipV = [];
   const ellipF = [];
   const rings = 8;

   // Generate vertices
   for (let ring = 0; ring <= rings; ring++) {
      const vAng = (ring / rings) * Math.PI;
      const yBase = Math.cos(vAng);
      const ringRadius = Math.sin(vAng);
      for (let s = 0; s < segs; s++) {
         const hAng = (s / segs) * Math.PI * 2;
         ellipV.push({
            x: Math.cos(hAng) * ringRadius * r,
            y: -yBase * r,
            z: Math.sin(hAng) * ringRadius * r
         });
      }
   }

   // Generate faces
   for (let ring = 0; ring < rings; ring++) {
      for (let s = 0; s < segs; s++) {
         const curr = ring * segs + s;
         const next = ring * segs + (s + 1) % segs;
         const nextRing = (ring + 1) * segs + s;
         const nextRingNext = (ring + 1) * segs + (s + 1) % segs;
         const hAng = ((s + 0.5) / segs) * Math.PI * 2;
         const vAng = ((ring + 0.5) / rings) * Math.PI;
         const norm = {
            x: Math.cos(hAng) * Math.sin(vAng),
            y: -Math.cos(vAng),
            z: Math.sin(hAng) * Math.sin(vAng)
         };
         ellipF.push({
            idx: [curr, next, nextRingNext, nextRing],
            n: norm
         });
      }
   }

   WORKSHOP_MESH_DEFS.ellipsoid = { v: ellipV, f: ellipF };

   // ========== ELLIPSOID MESH (LOW DETAIL) ==========
   const ellipVLow = [];
   const ellipFLow = [];
   const segsLow = 6;
   const ringsLow = 4;

   // Generate low-detail vertices
   for (let ring = 0; ring <= ringsLow; ring++) {
      const vAng = (ring / ringsLow) * Math.PI;
      const yBase = Math.cos(vAng);
      const ringRadius = Math.sin(vAng);
      for (let s = 0; s < segsLow; s++) {
         const hAng = (s / segsLow) * Math.PI * 2;
         ellipVLow.push({
            x: Math.cos(hAng) * ringRadius * r,
            y: -yBase * r,
            z: Math.sin(hAng) * ringRadius * r
         });
      }
   }

   // Generate low-detail faces
   for (let ring = 0; ring < ringsLow; ring++) {
      for (let s = 0; s < segsLow; s++) {
         const curr = ring * segsLow + s;
         const next = ring * segsLow + (s + 1) % segsLow;
         const nextRing = (ring + 1) * segsLow + s;
         const nextRingNext = (ring + 1) * segsLow + (s + 1) % segsLow;
         const hAng = ((s + 0.5) / segsLow) * Math.PI * 2;
         const vAng = ((ring + 0.5) / ringsLow) * Math.PI;
         const norm = {
            x: Math.cos(hAng) * Math.sin(vAng),
            y: -Math.cos(vAng),
            z: Math.sin(hAng) * Math.sin(vAng)
         };
         ellipFLow.push({
            idx: [curr, next, nextRingNext, nextRing],
            n: norm
         });
      }
   }
   WORKSHOP_MESH_DEFS.ellipsoid_low = { v: ellipVLow, f: ellipFLow };

   // ========== ROCK MESH (Irregular, faceted) ==========
   const rockV = [];
   const rockF = [];

   // Start with icosahedron vertices (20-sided die shape)
   const phi = (1 + Math.sqrt(5)) / 2;
   const icosaVerts = [
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
   ];

   // Normalize and randomize each vertex for rock irregularity
   icosaVerts.forEach(v => {
      const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
      const randomScale = 0.8 + Math.random() * 0.4; // Vary radius
      rockV.push({
         x: (v[0] / len) * r * randomScale,
         y: (v[1] / len) * r * randomScale,
         z: (v[2] / len) * r * randomScale
      });
   });

   // Icosahedron faces (20 triangular faces)
   const icosaFaces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
   ];

   icosaFaces.forEach(face => {
      // Calculate face normal
      const v0 = rockV[face[0]], v1 = rockV[face[1]], v2 = rockV[face[2]];
      const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
      const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      const nlen = Math.sqrt(nx ** 2 + ny ** 2 + nz ** 2);

      rockF.push({
         idx: face,
         n: { x: nx / nlen, y: ny / nlen, z: nz / nlen }
      });
   });

   WORKSHOP_MESH_DEFS.rock = { v: rockV, f: rockF };

}

function exportRig() {
   const data = {
      nodes: Array.from(WORKSHOP_NODES.values()),
      beams: WORKSHOP_BEAMS
   };
   const json = JSON.stringify(data, null, 2);
   console.log(json);
   navigator.clipboard.writeText(json).then(() => alert('Rig JSON copied to clipboard!')).catch(err => console.error('Failed to copy', err));
}

function adjustColor(hex, intensity, material = 'matte') {
    if (!hex || typeof hex !== 'string') hex = '#ffffff';

    // 1. Retrieve Cached RGB (Avoids string parsing)
    let base = COLOR_CACHE_K.get(hex);
    if (!base) {
        let c = hex.substring(1);
        if (c.length === 3) c = c[0]+c[0] + c[1]+c[1] + c[2]+c[2];
        const num = parseInt(c, 16);
        base = { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
        COLOR_CACHE_K.set(hex, base);
    }

    // 2. Determine Alpha & Lighting Factor
    const ambient = (typeof LIGHT_FX !== 'undefined') ? LIGHT_FX.AMBIENT_LIGHT : 0.5;
    let alpha = 1.0;
    let lighting = intensity;

    if (material === 'glow') {
        lighting = 1.5;
    } 
    else if (material === 'glass') {
        alpha = 0.3;
        lighting = Math.max(ambient, ambient + (intensity * 0.9));
    }
    else if (material === 'jelly') {
        alpha = 0.6;
        lighting = Math.max(ambient, ambient + (intensity * 0.9));
    }
    else if (material === 'ghost') {
        alpha = 0.15;
        lighting = ambient + (Math.max(0, intensity) * 0.8);
    }
    else if (material === 'metal') {
        lighting = ambient + (Math.max(0, intensity) * 1.2);
        if (ambient < 0.2) lighting *= 0.8;
    }
    else {
        // Matte / Smooth
        lighting = ambient + (Math.max(0, intensity) * 0.8);
    }

    // 3. Apply Lighting (Fast Clamp)
    if (lighting > 1.3) lighting = 1.3;
    else if (lighting < 0) lighting = 0;

    // Use bitwise OR (| 0) for fast flooring
    const r = (base.r * lighting) | 0;
    const g = (base.g * lighting) | 0;
    const b = (base.b * lighting) | 0;

    // Return string (Conditional check is faster than Math.min for clamping 255)
    return `rgba(${r > 255 ? 255 : r},${g > 255 ? 255 : g},${b > 255 ? 255 : b},${alpha})`;
}

function getLighting(normal, rot) {
   const n = rotatePoint(normal, rot);
   return (n.x * LIGHT_DIR.x) + (n.y * LIGHT_DIR.y) + (n.z * LIGHT_DIR.z);
}

const K_PRESETS = {};
function loadPreset(name) {
   WORKSHOP_NODES.clear();
   WORKSHOP_BEAMS.length = 0;
   WORKSHOP_DATA.selectedNodeId = null;
   const p = K_PRESETS[name];
   if (!p) return;
   if (typeof p === 'function') {
      p();
      updatePropertiesPanel();
      return;
   }
   if (p.nodes) {
      p.nodes.forEach(nDef => {
         const n = {
            velocity: { x: 0, y: 0, z: 0 },
            id: nDef.id, type: nDef.type, parentId: nDef.parentId || null,
            pos: { ...nDef.pos }, rot: nDef.rot ? { ...nDef.rot } : { x: 0, y: 0, z: 0 },
            scale: nDef.scale ? { ...nDef.scale } : { x: 1, y: 1, z: 1 },
            taper: nDef.taper !== undefined ? nDef.taper : 1.0,
            material: nDef.material || 'matte', color: nDef.color,
            anim: nDef.anim ? { ...nDef.anim } : { type: 'none', axis: 'y', speed: 1, amp: 0.5, phase: 0 },
            localTransform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } },
            worldTransform: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }
         };
         WORKSHOP_NODES.set(n.id, n);
      });
   }
   if (p.beams) {
      p.beams.forEach(b => {
         WORKSHOP_BEAMS.push({
            id: Math.random().toString(36).substr(2, 9),
            startNodeId: b.from, endNodeId: b.to, length: 0,
            anchorA: { x: 0, y: 0, z: 0 }, anchorB: { x: 0, y: 0, z: 0 },
            color: WORKSHOP_CONFIG.COLORS.beam, slack: b.slack || 0, width: b.width || 1
         });
      });
   }
   updatePropertiesPanel();
}

function setParent(childId, parentId) {
   const child = WORKSHOP_NODES.get(childId);
   if (!child) return;
   const currentWorldPos = { ...child.worldTransform.pos };
   const currentWorldRot = { ...child.worldTransform.rot };
   child.parentId = parentId;
   if (parentId && WORKSHOP_NODES.has(parentId)) {
      const parent = WORKSHOP_NODES.get(parentId);
      const diff = {
         x: currentWorldPos.x - parent.worldTransform.pos.x,
         y: currentWorldPos.y - parent.worldTransform.pos.y,
         z: currentWorldPos.z - parent.worldTransform.pos.z
      };
      child.pos = unrotatePoint(diff, parent.worldTransform.rot);
      child.rot = {
         x: currentWorldRot.x - parent.worldTransform.rot.x,
         y: currentWorldRot.y - parent.worldTransform.rot.y,
         z: currentWorldRot.z - parent.worldTransform.rot.z
      };
   } else {
      child.pos = currentWorldPos;
      child.rot = currentWorldRot;
   }
}


function calculateConstraintForces() {
   CONSTRAINT_FORCES.clear();

   WORKSHOP_BEAMS.forEach(beam => {
      const tip1 = WORKSHOP_NODES.get(beam.startNodeId);
      const tip2 = WORKSHOP_NODES.get(beam.endNodeId);
      if (!tip1 || !tip2 || !tip1.worldTransform || !tip2.worldTransform) return;

      // Get world positions
      const p1 = tip1.worldTransform.pos;
      const p2 = tip2.worldTransform.pos;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (!beam.restLength) beam.restLength = dist;

      const diff = dist - beam.restLength;
      beam.tension = diff > 0 ? Math.min(1, diff / (beam.restLength * 0.2)) : 0;

      // Only apply force if stretched
      if (diff < 0.01) return;

      // Find the animated pivot nodes
      let pivot1 = tip1;
      while (pivot1.parentId) {
         const parent = WORKSHOP_NODES.get(pivot1.parentId);
         if (parent && parent.anim && parent.anim.type === 'wave') {
            pivot1 = parent;
            break;
         }
         if (!parent) break;
         pivot1 = parent;
      }

      let pivot2 = tip2;
      while (pivot2.parentId) {
         const parent = WORKSHOP_NODES.get(pivot2.parentId);
         if (parent && parent.anim && parent.anim.type === 'wave') {
            pivot2 = parent;
            break;
         }
         if (!parent) break;
         pivot2 = parent;
      }

      if (pivot1 === pivot2) return;

      // Calculate force direction and magnitude
      const forceMag = diff * 0.1;
      const dirX = dx / dist;
      const dirY = dy / dist;
      const dirZ = dz / dist;

      // Store forces
      if (!CONSTRAINT_FORCES.has(pivot1.id)) {
         CONSTRAINT_FORCES.set(pivot1.id, { x: 0, y: 0, z: 0 });
      }
      if (!CONSTRAINT_FORCES.has(pivot2.id)) {
         CONSTRAINT_FORCES.set(pivot2.id, { x: 0, y: 0, z: 0 });
      }

      const f1 = CONSTRAINT_FORCES.get(pivot1.id);
      const f2 = CONSTRAINT_FORCES.get(pivot2.id);

      f1.x += dirX * forceMag;
      f1.y += dirY * forceMag;
      f1.z += dirZ * forceMag;

      f2.x -= dirX * forceMag;
      f2.y -= dirY * forceMag;
      f2.z -= dirZ * forceMag;
   });
}

function updateHierarchy(deltaTime) {
   WORKSHOP_DATA.globalTime += deltaTime;
   const t = WORKSHOP_DATA.globalTime;

   const childrenMap = new Map();
   const roots = [];

   // Phase 1: Calculate Local Transforms with constraint forces
   WORKSHOP_NODES.forEach(n => {
      if (!n.pos) n.pos = { x: 0, y: 0, z: 0 };
      if (!n.rot) n.rot = { x: 0, y: 0, z: 0 };
      if (!n.scale) n.scale = { x: 1, y: 1, z: 1 };

      let rx = n.rot.x, ry = n.rot.y, rz = n.rot.z;
      let sx = n.scale.x, sy = n.scale.y, sz = n.scale.z;
      let px = n.pos.x, py = n.pos.y, pz = n.pos.z;

      if (!n.basePos || WORKSHOP_DATA.isDragging && WORKSHOP_DATA.selectedNodeId === n.id) {
         n.basePos = { x: n.pos.x, y: n.pos.y, z: n.pos.z };
      }

      // Apply constraint forces BEFORE animations
      if (CONSTRAINT_FORCES.has(n.id)) {
         const force = CONSTRAINT_FORCES.get(n.id);
         px += force.x;
         py += force.y;
         pz += force.z;
      }

      // Animation logic
      for (const key in n) {
         if (key.startsWith('anim') && typeof n[key] === 'object' && n[key].type !== 'none') {
            const anim = n[key];
            const speed = anim.speed || 1.0;
            const phase = anim.phase || 0.0;
            const amp = anim.amp || 0.5;
            const val = Math.sin(t * speed + phase) * amp;

            if (anim.type === 'spin') {
               const spinVal = t * speed;
               if (anim.axis === 'x') rx += spinVal;
               if (anim.axis === 'y') ry += spinVal;
               if (anim.axis === 'z') rz += spinVal;
            }
            else if (anim.type === 'wave') {
               if (anim.axis === 'x') rx += val;
               if (anim.axis === 'y') ry += val;
               if (anim.axis === 'z') rz += val;
            }
            else if (anim.type === 'pulse') {
               const pulseVal = 1 + val;
               if (anim.axis === 'x' || anim.axis === 'scale') sx *= pulseVal;
               if (anim.axis === 'y' || anim.axis === 'scale') sy *= pulseVal;
               if (anim.axis === 'z' || anim.axis === 'scale') sz *= pulseVal;
            }
            else if (anim.type === 'bob') {
               if (n.basePos) {
                  if (anim.axis === 'x') px = n.basePos.x + val;
                  if (anim.axis === 'y') py = n.basePos.y + val;
                  if (anim.axis === 'z') pz = n.basePos.z + val;
               }
            }
            else if (anim.type === 'orbit') {
               const r = amp;
               const ang = t * speed + phase;
               if (anim.axis === 'y') {
                  px = n.pos.x + Math.cos(ang) * r;
                  pz = n.pos.z + Math.sin(ang) * r;
               } else if (anim.axis === 'x') {
                  py = n.pos.y + Math.cos(ang) * r;
                  pz = n.pos.z + Math.sin(ang) * r;
               } else if (anim.axis === 'z') {
                  px = n.pos.x + Math.cos(ang) * r;
                  py = n.pos.y + Math.sin(ang) * r;
               }
            }
         }
      }

      n.pos.x = px; n.pos.y = py; n.pos.z = pz;
      n.scale.x = sx; n.scale.y = sy; n.scale.z = sz;

      n.localTransform = { pos: n.pos, rot: { x: rx, y: ry, z: rz } };
      n.worldTransform = { pos: { ...n.localTransform.pos }, rot: { ...n.localTransform.rot } };

      if (!n.parentId || !WORKSHOP_NODES.has(n.parentId)) {
         roots.push(n.id);
      } else {
         if (!childrenMap.has(n.parentId)) {
            childrenMap.set(n.parentId, []);
         }
         childrenMap.get(n.parentId).push(n.id);
      }
   });

   // Phase 2: Propagate World Transforms
   const queue = [...roots];
   let head = 0;

   while (head < queue.length) {
      const parentId = queue[head++];
      const p = WORKSHOP_NODES.get(parentId);

      if (!p || !childrenMap.has(parentId)) continue;

      for (const childId of childrenMap.get(parentId)) {
         const n = WORKSHOP_NODES.get(childId);
         if (!n) continue;

         const rPos = rotatePoint(n.localTransform.pos, p.worldTransform.rot);

         n.worldTransform.pos.x = p.worldTransform.pos.x + rPos.x;
         n.worldTransform.pos.y = p.worldTransform.pos.y + rPos.y;
         n.worldTransform.pos.z = p.worldTransform.pos.z + rPos.z;

         n.worldTransform.rot.x = p.worldTransform.rot.x + n.localTransform.rot.x;
         n.worldTransform.rot.y = p.worldTransform.rot.y + n.localTransform.rot.y;
         n.worldTransform.rot.z = p.worldTransform.rot.z + n.localTransform.rot.z;

         queue.push(childId);
      }
   }
}

function getProjectionState(viewport) {
    const width = WORKSHOP_CONFIG.RESOLUTION;
    const aspect = elements.canvas.width / elements.canvas.height;
    const height = Math.floor(width / aspect);
    const ppu = width / viewport.width;
    
    // Camera world position (same as drawShadows.js)
    const camX = (character.renderX ?? character.x) + 0.5;
    const camZ = (character.renderY ?? character.y) + 0.5;
    const camY = WORKSHOP_CONFIG.HEIGHT_CAMERA;
    
    return { 
        width, 
        height, 
        ppu, 
        vx: viewport.x, 
        vy: viewport.y,
        camX,      // Camera world X
        camZ,      // Camera world Z  
        camY,
    };
}

function project(wx, wy, wz, state) {
    const screenX = (wx - state.vx) * state.ppu;
    const screenY = (wz - state.vy) * state.ppu - (wy * state.ppu * 0.8);
    return { x: screenX, y: screenY };
}


function unproject(bx, by, wy, state) {
    // Reverse the perspective transformation
    const h = Math.max(0, wy * 0.5);
    const ratio = h / Math.max(0.1, LIGHT_FX.HEIGHT_CAMERA);
    const scale = 1 + ratio;
    
    // Solve for base screen position
    const adjustedBx = (bx + state.camScreenX * ratio) / scale;
    const adjustedBy = (by + state.camScreenZ * ratio + (wy * state.ppu * 0.8)) / scale;
    
    const wx = (adjustedBx / state.ppu) + state.vx;
    const wz = (adjustedBy / state.ppu) + state.vy;
    
    return { x: wx, y: wy, z: wz };
}

function transformVertexWithViewAngle(localVertex, objWorldPos, objRot, pState, cachedCos, cachedSin) {
    // 1. Rotate (Use fast version if cache exists)
    let rotated;
    if (cachedCos && cachedSin) {
        rotated = rotatePointFast(localVertex, cachedCos, cachedSin);
    } else {
        rotated = rotatePoint(localVertex, objRot);
    }
    
    // 2. World Pos
    const worldX = objWorldPos.x + rotated.x;
    const worldY = objWorldPos.y + rotated.y;
    const worldZ = objWorldPos.z + rotated.z;
    
    // 3. View Vector
    const dx = worldX - pState.camX;
    const dz = worldZ - pState.camZ;
    // Note: dy is not used for horizontalDist, but implicit in projection
    
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    
    // CHANGE: Lower this value. 
    // Was 15.0. 8.0 means objects will "stand up" fully when 8 units away (approx edge of screen).
    const maxTiltDist = LIGHT_FX.HEIGHT_CAMERA;
    const tiltFactor = Math.min(1.0, horizontalDist / maxTiltDist);
    
    // 5. Projection
    const baseScreenX = (worldX - pState.vx) * pState.ppu;
    const baseScreenZ = (worldZ - pState.vy) * pState.ppu;
    
    const minYFactor = 0.15;
    const yFactor = minYFactor + (0.8 - minYFactor) * tiltFactor;
    
    // Perspective Ratio
    const h = Math.max(0, worldY);
    // Use camY from state (which is now 8.0)
    const ratio = h / Math.max(0.1, pState.camY - h);
    
    const camScreenX = (pState.camX - pState.vx) * pState.ppu;
    const camScreenZ = (pState.camZ - pState.vy) * pState.ppu;
    
    const shiftX = (baseScreenX - camScreenX) * ratio;
    const shiftZ = (baseScreenZ - camScreenZ) * ratio;
    
    return {
        x: baseScreenX + shiftX,
        y: baseScreenZ + shiftZ - (worldY * pState.ppu * yFactor),
        z: rotated.z
    };
}

function drawOrientedSphere(ctx, cx, cy, radius, scaleY, color, rot, ppu, isSelected) {
   const rPx = radius * ppu;
   const ryPx = rPx * scaleY * 0.8;
   ctx.beginPath();
   ctx.ellipse(cx, cy, rPx, ryPx, 0, 0, Math.PI * 2);
   const g = ctx.createRadialGradient(cx - rPx * 0.3, cy - ryPx * 0.3, rPx * 0.1, cx, cy, rPx);
   g.addColorStop(0, '#fff'); g.addColorStop(0.3, color); g.addColorStop(1, '#000');
   ctx.fillStyle = g; ctx.fill();
   if (isSelected) { ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawCone(ctx, cx, cy, obj, ppu, isSelected, pState) {
    const r = WORKSHOP_CONFIG.NODE_RADIUS * obj.scale.x;
    const h = WORKSHOP_CONFIG.CUBE_SIZE * obj.scale.y;
    const segs = 12;
    
    const worldPos = obj.worldTransform ? obj.worldTransform.pos : obj.pos;
    const rot = obj.worldTransform ? obj.worldTransform.rot : obj.rot;
    
    const verts = [];
    for (let i = 0; i < segs; i++) {
        const t = (i / segs) * Math.PI * 2;
        const local = { x: Math.cos(t) * r, y: -h / 2, z: Math.sin(t) * r };
        verts.push(transformVertexWithViewAngle(local, worldPos, rot, pState));
    }
    const tipLocal = { x: 0, y: h / 2, z: 0 };
    verts.push(transformVertexWithViewAngle(tipLocal, worldPos, rot, pState));
    
    const tipIdx = verts.length - 1;
    const faces = [];
    for (let i = 0; i < segs; i++) {
        const next = (i + 1) % segs;
        faces.push({ idx: [i, next, tipIdx], c: obj.color });
    }
    const botIdx = [];
    for (let i = 0; i < segs; i++) botIdx.push(i);
    faces.push({ idx: botIdx.reverse(), c: obj.color });
    faces.forEach(f => {
        let z = 0;
        f.idx.forEach(i => z += verts[i].z);
        f.z = z / f.idx.length;
    });
    faces.sort((a, b) => a.z - b.z);
    drawMesh(ctx, verts, faces, cx, cy, isSelected, obj.material);
}

// ============================================================================
// CHANGE 9: Update drawWedge (around line 719)
// ============================================================================

function drawWedge(ctx, cx, cy, obj, ppu, isSelected, pState) {
    const sx = WORKSHOP_CONFIG.CUBE_SIZE * obj.scale.x * 0.5;
    const sy = WORKSHOP_CONFIG.CUBE_SIZE * obj.scale.y * 0.5;
    const sz = WORKSHOP_CONFIG.CUBE_SIZE * obj.scale.z * 0.5;
    
    const worldPos = obj.worldTransform ? obj.worldTransform.pos : obj.pos;
    const rot = obj.worldTransform ? obj.worldTransform.rot : obj.rot;
    
    const vRaw = [
        { x: -sx, y: -sy, z: -sz }, { x: sx, y: -sy, z: -sz },
        { x: sx, y: -sy, z: sz }, { x: -sx, y: -sy, z: sz },
        { x: -sx, y: sy, z: -sz }, { x: sx, y: sy, z: -sz }
    ];
    
    const verts = vRaw.map(v => transformVertexWithViewAngle(v, worldPos, rot, pState));
    
    const nSlope = { x: 0, y: 0.7, z: 0.7 };
    const normals = [
        { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, nSlope
    ];
    const faces = [
        { idx: [0, 1, 5, 4], n: normals[0] }, { idx: [1, 2, 5], n: normals[2] },
        { idx: [3, 0, 4], n: normals[3] },
        { idx: [0, 3, 2, 1], n: normals[4] }, { idx: [2, 3, 4, 5], n: normals[5] }
    ];
    faces.forEach(f => {
        const intensity = getLighting(f.n, rot);
        f.c = adjustColor(obj.color, intensity, obj.material);
        let z = 0;
        f.idx.forEach(i => z += verts[i].z);
        f.z = z / f.idx.length;
    });
    faces.sort((a, b) => a.z - b.z);
    drawMesh(ctx, verts, faces, cx, cy, isSelected, obj.material);
}

// ============================================================================
// CHANGE 10: Update drawRock (around line 608)
// ============================================================================

function drawRock(ctx, cx, cy, obj, ppu, isSelected, pState) {
    const meshDef = WORKSHOP_MESH_DEFS.rock;
    const r = WORKSHOP_CONFIG.NODE_RADIUS * 2;
    
    const worldPos = obj.worldTransform ? obj.worldTransform.pos : obj.pos;
    const rot = obj.worldTransform ? obj.worldTransform.rot : obj.rot;
    
    const verts = meshDef.v.map(vRaw => {
        const scaled = {
            x: vRaw.x * r * obj.scale.x,
            y: vRaw.y * r * obj.scale.y,
            z: vRaw.z * r * obj.scale.z
        };
        return transformVertexWithViewAngle(scaled, worldPos, rot, pState);
    });
    
    const faces = meshDef.f.map(fDef => {
        const intensity = getLighting(fDef.n, rot);
        const c = adjustColor(obj.color, intensity, obj.material);
        let z = 0;
        fDef.idx.forEach(i => z += verts[i].z);
        return { idx: fDef.idx, c: c, z: z / fDef.idx.length };
    });
    
    faces.sort((a, b) => a.z - b.z);
    drawMesh(ctx, verts, faces, cx, cy, isSelected, obj.material);
}

// ============================================================================
// CHANGE 11: Update drawCapsule (around line 874)
// ============================================================================

function drawCapsule(ctx, cx, cy, obj, ppu, isSelected, pState) {
    const h = WORKSHOP_CONFIG.CUBE_SIZE * obj.scale.y;
    const worldPos = obj.worldTransform ? obj.worldTransform.pos : obj.pos;
    const rot = obj.worldTransform ? obj.worldTransform.rot : obj.rot;
    
    // Calculate endpoints
    const topRotated = rotatePoint({ x: 0, y: h / 2, z: 0 }, rot);
    const botRotated = rotatePoint({ x: 0, y: -h / 2, z: 0 }, rot);
    
    const topWorldPos = {
        x: worldPos.x + topRotated.x,
        y: worldPos.y + topRotated.y,
        z: worldPos.z + topRotated.z
    };
    const botWorldPos = {
        x: worldPos.x + botRotated.x,
        y: worldPos.y + botRotated.y,
        z: worldPos.z + botRotated.z
    };

    // --- OPTIMIZATION START ---
    // If it's not selected, draw as a fast 2D line instead of 3D mesh
    if (!isSelected) {
       const sTop = project(topWorldPos.x, topWorldPos.y, topWorldPos.z, pState);
       const sBot = project(botWorldPos.x, botWorldPos.y, botWorldPos.z, pState);
       
       // Standard 2D Line Drawing (Native Canvas Speed)
       ctx.beginPath();
       ctx.lineCap = 'round';
       // Use average scale for width
       const thickness = WORKSHOP_CONFIG.NODE_RADIUS * ((obj.scale.x + obj.scale.z) / 2) * 2 * ppu;
       
       ctx.lineWidth = thickness;
       ctx.strokeStyle = obj.color; 
       
       // Simple lighting approximation
       if (obj.material !== 'glow') {
          // Darken slightly based on angle to mimic 3D shading
          const angle = Math.abs(Math.sin(rot.x)); 
          // You can use your adjustColor function here if you want high fidelity
          // But raw stroke is fastest
       }

       ctx.moveTo(sTop.x, sTop.y);
       ctx.lineTo(sBot.x, sBot.y);
       ctx.stroke();
       return; 
    }
    // --- OPTIMIZATION END ---

    // Fallback to high-detail 3D mesh if selected (so you can edit it precisely)
    drawCylinder(ctx, cx, cy, obj, ppu, isSelected, pState);
    
    const capObj = {
        worldTransform: { pos: topWorldPos, rot: rot },
        pos: topWorldPos, rot: rot, scale: obj.scale, taper: obj.taper,
        material: obj.material, color: obj.color
    };
    
    if (typeof drawEllipsoid === 'function') {
        const topScreen = project(topWorldPos.x, topWorldPos.y, topWorldPos.z, pState);
        drawEllipsoid(ctx, topScreen.x, topScreen.y, capObj, ppu, isSelected, pState);
        
        capObj.worldTransform.pos = botWorldPos;
        capObj.pos = botWorldPos;
        const botScreen = project(botWorldPos.x, botWorldPos.y, botWorldPos.z, pState);
        drawEllipsoid(ctx, botScreen.x, botScreen.y, capObj, ppu, isSelected, pState);
    }
}


// 7. RENDERERS
function drawMesh(ctx, verts, faces, cx, cy, isSelected, material) {
    // [OPTIMIZED] Removed 'new Map()' and array allocations.
    // Draws faces immediately in Z-sorted order (Painter's Algorithm).
    
    // Cache the last used color to minimize expensive context state changes
    let lastColor = null;
    
    // Default line width
    if (isSelected) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0f0'; // Selection color
    }

    // Iterate faces (already sorted by Z in the calling function)
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const v0 = verts[face.idx[0]];
        const v1 = verts[face.idx[1]];
        const v2 = verts[face.idx[2]];

        // Backface Culling (Optimization)
        // Calculate cross product Z-component to see if face points towards camera
        const val = (v1.x - v0.x) * (v2.y - v1.y) - (v1.y - v0.y) * (v2.x - v1.x);

        // Only draw if facing forward
        if (val < -0.1) {
            
            // 1. FILL
            // Only change context color if it's different from the last face
            if (face.c !== lastColor) {
                ctx.fillStyle = face.c;
                lastColor = face.c;
            }

            ctx.beginPath();
            ctx.moveTo(v0.x, v0.y);
            // Loop through remaining vertices
            for (let j = 1; j < face.idx.length; j++) {
                const v = verts[face.idx[j]];
                ctx.lineTo(v.x, v.y);
            }
            ctx.closePath();
            ctx.fill();

            // 2. STROKE (Only if selected)
            // We draw stroke immediately to ensure it outlines this specific face correctly
            if (isSelected) {
                ctx.beginPath();
                ctx.moveTo(v0.x, v0.y);
                for (let j = 1; j < face.idx.length; j++) {
                    const v = verts[face.idx[j]];
                    ctx.lineTo(v.x, v.y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
    }
}

function drawEllipsoid(ctx, cx, cy, obj, ppu, isSelected, pState) {
    const r = WORKSHOP_CONFIG.NODE_RADIUS;
    
    // 1. Calculate Screen Radius
    // Approximate visual size to decide LOD
    const screenRadius = r * obj.scale.x * ppu;

    // --- OPTIMIZATION: 2D FALLBACK ---
    // If it's tiny or very far away, just draw a circle. 
    // This saves calculating 24+ vertices and faces.
    if (screenRadius < 6.0 && !isSelected) {
        ctx.fillStyle = obj.color; 
        ctx.beginPath();
        // Flatten the circle slightly to look like it's on the ground plane
        ctx.ellipse(cx, cy, screenRadius, screenRadius * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    // 2. Select Mesh LOD
    const useLowDetail = screenRadius < 20; 
    const meshDef = useLowDetail
        ? WORKSHOP_MESH_DEFS.ellipsoid_low
        : WORKSHOP_MESH_DEFS.ellipsoid;
    
    const worldPos = obj.worldTransform ? obj.worldTransform.pos : obj.pos;
    const rot = obj.worldTransform ? obj.worldTransform.rot : obj.rot;
    
    // 3. Trig Caching 
    const c = { x: Math.cos(rot.x), y: Math.cos(rot.y), z: Math.cos(rot.z) };
    const s = { x: Math.sin(rot.x), y: Math.sin(rot.y), z: Math.sin(rot.z) };

    // 4. Pre-calculate Projection Matrix for this Object
    const projData = precalculateProjectionData(worldPos, pState);
    
    // 5. Vertex Transformation (Using Optimized Path)
    // We map directly into a new array to avoid pushing
    const len = meshDef.v.length;
    const verts = new Array(len);
    
    for(let i=0; i<len; i++) {
        const vRaw = meshDef.v[i];
        const scaled = {
            x: vRaw.x * r * obj.scale.x,
            y: vRaw.y * r * obj.scale.y,
            z: vRaw.z * r * obj.scale.z
        };
        verts[i] = transformVertexOptimized(scaled, projData, c, s);
    }
    
    // 6. Lighting & Face Prep
    const facesLen = meshDef.f.length;
    const faces = new Array(facesLen);
    
    for (let i = 0; i < facesLen; i++) {
        const fDef = meshDef.f[i];
        
        // Fast rotation for normal
        // Inline rotatePointFast logic for speed
        let ny1 = fDef.n.y * c.x - fDef.n.z * s.x;
        let nz1 = fDef.n.y * s.x + fDef.n.z * c.x;
        let nx2 = fDef.n.x * c.y - nz1 * s.y;
        let nz2 = fDef.n.x * s.y + nz1 * c.y;
        let nx3 = nx2 * c.z - ny1 * s.z;
        let ny3 = nx2 * s.z + ny1 * c.z;
        
        // Inline lighting calc
        const intensity = (nx3 * LIGHT_DIR.x) + (ny3 * LIGHT_DIR.y) + (nz2 * LIGHT_DIR.z);
        
        faces[i] = { 
            idx: fDef.idx, 
            c: adjustColor(obj.color, intensity, obj.material) 
        };
    }
    
    drawMesh(ctx, verts, faces, cx, cy, isSelected, obj.material);
}

// ============================================================================
// CHANGE 6: Update drawCylinder (around line 838)
// ============================================================================

function drawCylinder(ctx, cx, cy, obj, ppu, isSelected, pState) {
    const meshDef = WORKSHOP_MESH_DEFS.cylinder;
    const rBase = WORKSHOP_CONFIG.NODE_RADIUS;
    const hBase = WORKSHOP_CONFIG.CUBE_SIZE;
    const t = (obj.taper !== undefined) ? obj.taper : 1.0;
    const sX = rBase * obj.scale.x;
    const sY = hBase * obj.scale.y * 0.5;
    const sZ = rBase * obj.scale.z;
    const segs = meshDef.v.length / 2;
    
const worldPos = obj.worldTransform ? obj.worldTransform.pos : obj.pos;
    const rot = obj.worldTransform ? obj.worldTransform.rot : obj.rot;

    // [OPTIMIZATION] Pre-calculate trig once for this whole cylinder
    const c = { x: Math.cos(rot.x), y: Math.cos(rot.y), z: Math.cos(rot.z) };
    const s = { x: Math.sin(rot.x), y: Math.sin(rot.y), z: Math.sin(rot.z) };

    const verts = meshDef.v.map((vRaw, i) => {
        const taperScale = (i >= segs) ? t : 1.0;
        const scaled = {
            x: vRaw.x * sX * taperScale,
            y: vRaw.y * sY,
            z: vRaw.z * sZ * taperScale
        };
      return transformVertexWithViewAngle(scaled, worldPos, rot, pState, c, s);    
   });
    
    const faces = meshDef.f.map(fDef => {
        const intensity = getLighting(fDef.n, rot);
        const c = adjustColor(obj.color, intensity, obj.material);
        let z = 0;
        fDef.idx.forEach(i => z += verts[i].z);
        return { idx: fDef.idx, c: c, z: z / fDef.idx.length, n: fDef.n };
    });
    
    faces.sort((a, b) => a.z - b.z);
    drawMesh(ctx, verts, faces, cx, cy, isSelected, obj.material);
}

// ============================================================================
// CHANGE 7: Update drawOrientedCube (around line 800)
// ============================================================================

function drawOrientedCube(ctx, cx, cy, obj, ppu, isSelected, pState) {
    const meshDef = WORKSHOP_MESH_DEFS.cube;
    const r = WORKSHOP_CONFIG.CUBE_SIZE * 0.5;
    const sX = r * obj.scale.x;
    const sY = r * obj.scale.y;
    const sZ = r * obj.scale.z;
    const t = (obj.taper !== undefined) ? obj.taper : 1.0;
    
    const worldPos = obj.worldTransform ? obj.worldTransform.pos : obj.pos;
    const rot = obj.worldTransform ? obj.worldTransform.rot : obj.rot;

    const c = { x: Math.cos(rot.x), y: Math.cos(rot.y), z: Math.cos(rot.z) };
    const s = { x: Math.sin(rot.x), y: Math.sin(rot.y), z: Math.sin(rot.z) };
    
    const verts = meshDef.v.map((vRaw, i) => {
        const taperScale = (i >= 4) ? t : 1.0;
        const scaled = {
            x: vRaw.x * sX * taperScale,
            y: vRaw.y * sY,
            z: vRaw.z * sZ * taperScale
        };
        return transformVertexWithViewAngle(scaled, worldPos, rot, pState, c, s);
    });
    
    const faces = meshDef.f.map(fDef => {
        const n = rotatePointFast(fDef.n, c, s);
        const intensity = (n.x * LIGHT_DIR.x) + (n.y * LIGHT_DIR.y) + (n.z * LIGHT_DIR.z);
        const color = adjustColor(obj.color, intensity, obj.material);
        
        let z = 0;
        for(let i=0; i<fDef.idx.length; i++) {
            z += verts[fDef.idx[i]].z;
        }

        return { idx: fDef.idx, c: color, z: z / fDef.idx.length };
    });
    
    faces.sort((a, b) => a.z - b.z);
    drawMesh(ctx, verts, faces, cx, cy, isSelected, obj.material);
}


function drawBeam(ctx, p1, p2, radius, color, slack = 0, tension = 0) {
   const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.sqrt(dx * dx + dy * dy);
   if (len < 1) return;

   // Reduce slack based on tension (0 = full slack, 1 = no slack)
   const effectiveSlack = slack * (1 - tension);

   const g = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
   g.addColorStop(0, color); g.addColorStop(1, adjustColor(color, 0.5));
   ctx.strokeStyle = g; ctx.lineWidth = radius * 2; ctx.lineCap = 'round';
   ctx.beginPath(); ctx.moveTo(p1.x, p1.y);
   if (effectiveSlack > 0.01) {
      const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
      const hang = len * effectiveSlack;
      ctx.quadraticCurveTo(midX, midY + hang, p2.x, p2.y);
   } else { ctx.lineTo(p2.x, p2.y); }
   ctx.stroke();
   ctx.fillStyle = '#888';
   ctx.beginPath(); ctx.arc(p1.x, p1.y, radius, 0, Math.PI * 2); ctx.fill();
   ctx.beginPath(); ctx.arc(p2.x, p2.y, radius, 0, Math.PI * 2); ctx.fill();
}

function drawSkeleton(ctx, pState) {
   ctx.save();
   ctx.setLineDash([2, 2]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
   WORKSHOP_NODES.forEach(node => {
      if (node.parentId) {
         const parent = WORKSHOP_NODES.get(node.parentId);
         if (parent) {
            const p1 = project(node.worldTransform.pos.x, node.worldTransform.pos.y, node.worldTransform.pos.z, pState);
            const p2 = project(parent.worldTransform.pos.x, parent.worldTransform.pos.y, parent.worldTransform.pos.z, pState);
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            ctx.strokeRect(p2.x - 2, p2.y - 2, 4, 4);
         }
      }
   });
   ctx.restore();
}

function drawShadow(ctx, pos, scaleX, pState) {
   if (!WORKSHOP_DATA.showShadows) return;

   // [MODIFIED] Use global shadow opacity if available, else fallback to 0.4
   const baseOpacity = (typeof LIGHT_FX !== 'undefined') ? LIGHT_FX.SHADOW_OPACITY : 0.4;
   
   // If opacity is effectively zero, skip drawing
   if (baseOpacity < 0.01) return;

   const s = project(pos.x, 0, pos.z, pState);
   const radius = pState.ppu * WORKSHOP_CONFIG.NODE_RADIUS * scaleX * 1.5;
   
   // Fade shadow as object gets higher (height-based attenuation)
   const alpha = Math.max(0, baseOpacity - (pos.y * 0.1));
   
   ctx.save();
   ctx.fillStyle = `rgba(0,0,0,${alpha})`;
   ctx.beginPath();
   ctx.ellipse(s.x, s.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
   ctx.fill();
   ctx.restore();
}

function drawGizmo(ctx, pState, node) {
   if (!node) return;
   const wp = node.worldTransform.pos;
   const rot = node.worldTransform.rot;
   const s = project(wp.x, wp.y, wp.z, pState);
   const len = 0.5;
   const drawArm = (axisVec, color) => {
      const rv = rotatePoint(axisVec, rot);
      const tipW = { x: wp.x + rv.x * len, y: wp.y + rv.y * len, z: wp.z + rv.z * len };
      const tipS = project(tipW.x, tipW.y, tipW.z, pState);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tipS.x, tipS.y); ctx.stroke();
   };
   drawArm({ x: 1, y: 0, z: 0 }, '#f44');
   drawArm({ x: 0, y: 1, z: 0 }, '#4f4');
   drawArm({ x: 0, y: 0, z: 1 }, '#44f');
}

function drawGuides(ctx, pState) {
   if (!WORKSHOP_DATA.selectedNodeId || !WORKSHOP_DATA.axisLock) return;
   const node = WORKSHOP_NODES.get(WORKSHOP_DATA.selectedNodeId);
   if (!node) return;
   const wp = node.worldTransform.pos;
   const start = { ...wp };
   const end = { ...wp };
   const range = 20;
   if (WORKSHOP_DATA.axisLock === 'x') { start.x -= range; end.x += range; ctx.strokeStyle = '#f44'; }
   if (WORKSHOP_DATA.axisLock === 'y') { start.y -= range; end.y += range; ctx.strokeStyle = '#4f4'; }
   if (WORKSHOP_DATA.axisLock === 'z') { start.z -= range; end.z += range; ctx.strokeStyle = '#44f'; }
   const s1 = project(start.x, start.y, start.z, pState);
   const s2 = project(end.x, end.y, end.z, pState);
   ctx.save();
   ctx.lineWidth = 1;
   ctx.setLineDash([5, 5]);
   ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
   ctx.restore();
}

function solveDistanceConstraints(iterations = 2) {
   WORKSHOP_BEAMS.forEach(beam => {
      const n1 = WORKSHOP_NODES.get(beam.startNodeId);
      const n2 = WORKSHOP_NODES.get(beam.endNodeId);
      if (!n1 || !n2 || !n1.worldTransform || !n2.worldTransform) return;

      // Get actual cable endpoint positions
      const p1 = n1.worldTransform.pos;
      const p2 = n2.worldTransform.pos;

      const worldVec1 = rotatePoint(beam.anchorA || { x: 0, y: 0, z: 0 }, n1.worldTransform.rot);
      const worldVec2 = rotatePoint(beam.anchorB || { x: 0, y: 0, z: 0 }, n2.worldTransform.rot);

      const actualP1 = {
         x: p1.x + worldVec1.x,
         y: p1.y + worldVec1.y,
         z: p1.z + worldVec1.z
      };

      const actualP2 = {
         x: p2.x + worldVec2.x,
         y: p2.y + worldVec2.y,
         z: p2.z + worldVec2.z
      };

      // Calculate actual cable length
      const dx = actualP2.x - actualP1.x;
      const dy = actualP2.y - actualP1.y;
      const dz = actualP2.z - actualP1.z;
      const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Track minimum distance as true rest length
      if (!beam.restLength) {
         beam.restLength = currentDist;
      } else {
         // Slowly adjust rest length downward if we see shorter distances
         if (currentDist < beam.restLength) {
            beam.restLength = currentDist;
         }
      }

      const restLength = beam.restLength;
      const diff = currentDist - restLength;

      // Calculate tension
      if (diff > 0.001) {
         beam.tension = Math.min(1, Math.pow(diff / (restLength * 0.3), 0.7));
      } else {
         beam.tension = 0;
      }
   });
}

function updatePlantPhysics(deltaTime) {
   if (!WORKSHOP_DATA.physicsEnabled) return;
   const GRAVITY = -15.0, BOUNCE = 0.3, FLOOR_Y = 0;
   WORKSHOP_NODES.forEach(node => {
      if (node.parentId !== null) return;
      if (node.id === WORKSHOP_DATA.selectedNodeId && WORKSHOP_DATA.isDragging) {
         node.velocity = { x: 0, y: 0, z: 0 }; return;
      }
      if (!node.velocity) node.velocity = { x: 0, y: 0, z: 0 };
      node.velocity.y += GRAVITY * deltaTime;
      node.pos.y += node.velocity.y * deltaTime;
      let distToBottom = 0;
      if (node.type === 'node') distToBottom = WORKSHOP_CONFIG.NODE_RADIUS * node.scale.x;
      else distToBottom = (WORKSHOP_CONFIG.CUBE_SIZE * node.scale.y) / 2;
      const floorLevel = FLOOR_Y + distToBottom;
      if (node.pos.y < floorLevel) {
         node.pos.y = floorLevel;
         if (Math.abs(node.velocity.y) > 1.0) node.velocity.y *= -BOUNCE;
         else node.velocity.y = 0;
         node.velocity.x *= 0.9; node.velocity.z *= 0.9;
      }
   });
}

function updateHierarchyTransformsOnly() {
   // Quick propagation of world transforms without recalculating animations
   const childrenMap = new Map();
   const roots = [];

   WORKSHOP_NODES.forEach(n => {
      if (!n.parentId || !WORKSHOP_NODES.has(n.parentId)) {
         roots.push(n.id);
      } else {
         if (!childrenMap.has(n.parentId)) {
            childrenMap.set(n.parentId, []);
         }
         childrenMap.get(n.parentId).push(n.id);
      }
   });

   const queue = [...roots];
   let head = 0;

   while (head < queue.length) {
      const parentId = queue[head++];
      const p = WORKSHOP_NODES.get(parentId);

      if (!p || !childrenMap.has(parentId)) continue;

      for (const childId of childrenMap.get(parentId)) {
         const n = WORKSHOP_NODES.get(childId);
         if (!n) continue;

         const rPos = rotatePoint(n.localTransform.pos, p.worldTransform.rot);
         n.worldTransform.pos.x = p.worldTransform.pos.x + rPos.x;
         n.worldTransform.pos.y = p.worldTransform.pos.y + rPos.y;
         n.worldTransform.pos.z = p.worldTransform.pos.z + rPos.z;

         n.worldTransform.rot.x = p.worldTransform.rot.x + n.localTransform.rot.x;
         n.worldTransform.rot.y = p.worldTransform.rot.y + n.localTransform.rot.y;
         n.worldTransform.rot.z = p.worldTransform.rot.z + n.localTransform.rot.z;

         queue.push(childId);
      }
   }
}

// 8. MAIN LOOP
function drawPlantFollower(deltaTime) {
   setupWorkshopUI();
   const ctx = elements.ctx;

   // --- CREEPING LOGIC (Added) ---
   if (WORKSHOP_NODES.has('rug_master') && typeof character !== 'undefined') {
       const rug = WORKSHOP_NODES.get('rug_master');
       const targetX = (character.renderX ?? character.x) + 0.5;
       const targetZ = (character.renderY ?? character.y) + 0.5;

       // Calculate distance
       const dx = targetX - rug.pos.x;
       const dz = targetZ - rug.pos.z;
       
       // Move 1% of the distance per frame (Smooth damping)
       // Adjust 0.01 to make it faster or slower
       rug.pos.x += dx * 0.01;
       rug.pos.z += dz * 0.01;
       
       // Optional: Bob up and down slightly while moving (Ghostly float)
       rug.pos.y = Math.sin(Date.now() / 1000) * 0.05;
   }

   physicsFrameCount++;
   if (physicsFrameCount % 2 === 0) {
       updatePlantPhysics(deltaTime * 2);
       solveDistanceConstraints(1);
   }
   updateHierarchy(deltaTime);

   const pState = getProjectionState(viewport);
   if (WORKSHOP_BUFFER.width !== pState.width || WORKSHOP_BUFFER.height !== pState.height) {
      WORKSHOP_BUFFER.width = pState.width;
      WORKSHOP_BUFFER.height = pState.height;
      WB_CTX.imageSmoothingEnabled = false;
   }
   WB_CTX.clearRect(0, 0, pState.width, pState.height);
   const rect = elements.canvas.getBoundingClientRect();
   const scaleX = elements.canvas.width / rect.width;
   const scaleY = elements.canvas.height / rect.height;
   const mx = (mousePos.clientX - rect.left) * scaleX;
   const my = (mousePos.clientY - rect.top) * scaleY;
   const isMouseOver = (mousePos.clientX >= rect.left && mousePos.clientX <= rect.right && mousePos.clientY >= rect.top && mousePos.clientY <= rect.bottom);
   WORKSHOP_CURSOR.valid = isMouseOver;
   WORKSHOP_CURSOR.snapped = false;
   WORKSHOP_CURSOR.snapTargetId = null;
   if (isMouseOver) {
      const bufMX = mx * (pState.width / elements.canvas.width);
      const bufMY = my * (pState.height / elements.canvas.height);
      const wCursor = unproject(bufMX, bufMY, WORKSHOP_DATA.cursorY, pState);
      const tool = WORKSHOP_DATA.activeTool;
      const enableSnap = (tool === 'select' || tool === 'beam');
      let bestDist = 25 * (pState.width / 320);
      let snapNode = null;
      let snapOffset = { x: 0, y: 0, z: 0 };
      if (enableSnap) {
         WORKSHOP_NODES.forEach(node => {
            const wp = node.worldTransform.pos;
            const s = project(wp.x, wp.y, wp.z, pState);
            let dist = Math.hypot(bufMX - s.x, bufMY - s.y);
            if (dist < bestDist) { bestDist = dist; snapNode = node; snapOffset = { x: 0, y: 0, z: 0 }; }
         });
      }
      if (snapNode) {
         WORKSHOP_CURSOR.snapTargetId = snapNode.id;
         WORKSHOP_CURSOR.snapLocalOffset = snapOffset;
         WORKSHOP_CURSOR.snapped = true;
         const wp = snapNode.worldTransform.pos;
         const rOffset = rotatePoint(snapOffset, snapNode.worldTransform.rot);
         WORKSHOP_CURSOR.x = wp.x + rOffset.x;
         WORKSHOP_CURSOR.y = wp.y + rOffset.y;
         WORKSHOP_CURSOR.z = wp.z + rOffset.z;
      } else {
         WORKSHOP_CURSOR.x = wCursor.x;
         WORKSHOP_CURSOR.y = wCursor.y;
         WORKSHOP_CURSOR.z = wCursor.z;
      }
   }
   RENDER_QUEUE.length = 0;
   WORKSHOP_BEAMS.forEach(beam => {
      const n1 = WORKSHOP_NODES.get(beam.startNodeId);
      const n2 = WORKSHOP_NODES.get(beam.endNodeId);
      if (n1 && n2) {
         const wp1 = n1.worldTransform.pos;
         const wp2 = n2.worldTransform.pos;
         const worldVec1 = rotatePoint(beam.anchorA, n1.worldTransform.rot);
         const worldVec2 = rotatePoint(beam.anchorB, n2.worldTransform.rot);
         const w1 = { x: wp1.x + worldVec1.x, y: wp1.y + worldVec1.y, z: wp1.z + worldVec1.z };
         const w2 = { x: wp2.x + worldVec2.x, y: wp2.y + worldVec2.y, z: wp2.z + worldVec2.z };
         const s1 = project(w1.x, w1.y, w1.z, pState);
         const s2 = project(w2.x, w2.y, w2.z, pState);
         const slack = beam.slack !== undefined ? beam.slack : 0;
         const width = beam.width !== undefined ? beam.width : 1.0;
         const tension = beam.tension !== undefined ? beam.tension : 0;
         RENDER_QUEUE.push({
            z: (w1.z + w2.z) / 2,
            draw: () => drawBeam(WB_CTX, s1, s2, pState.ppu * WORKSHOP_CONFIG.BEAM_RADIUS * width, beam.color, slack, tension)
         });
      }
   });
   WORKSHOP_NODES.forEach(node => {
      const wp = node.worldTransform.pos;
      const s = project(wp.x, wp.y, wp.z, pState);
      const isSel = (node.id === WORKSHOP_DATA.selectedNodeId);
 const renderObj = {
         pos: wp,
         worldTransform: node.worldTransform,  // ADD THIS
         rot: node.worldTransform.rot,
         scale: node.scale, taper: node.taper, material: node.material,
         color: isSel ? WORKSHOP_CONFIG.COLORS.nodeSelected : node.color
      };
      RENDER_QUEUE.push({
         z: -9999 + wp.z,
         draw: () => drawShadow(WB_CTX, wp, node.scale.x, pState)
      });
      RENDER_QUEUE.push({
         z: wp.z,
         draw: () => {
            if (node.type === 'cube') drawOrientedCube(WB_CTX, s.x, s.y, renderObj, pState.ppu, isSel, pState);
            else if (node.type === 'cylinder') drawCylinder(WB_CTX, s.x, s.y, renderObj, pState.ppu, isSel, pState);
            else if (node.type === 'cone') drawCone(WB_CTX, s.x, s.y, renderObj, pState.ppu, isSel, pState);
            else if (node.type === 'wedge') drawWedge(WB_CTX, s.x, s.y, renderObj, pState.ppu, isSel, pState);
            else if (node.type === 'capsule') drawCapsule(WB_CTX, s.x, s.y, renderObj, pState.ppu, isSel, pState);
            else if (node.type === 'rock') drawRock(WB_CTX, s.x, s.y, renderObj, pState.ppu, isSel, pState);
            else {
               drawEllipsoid(WB_CTX, s.x, s.y, renderObj, pState.ppu, isSel, pState);
            }
         }
      });
   });
   if (WORKSHOP_CURSOR.valid) {
      const s = project(WORKSHOP_CURSOR.x, WORKSHOP_CURSOR.y, WORKSHOP_CURSOR.z, pState);
      RENDER_QUEUE.push({
         z: WORKSHOP_CURSOR.z + 100,
         draw: () => {
            if (WORKSHOP_CURSOR.snapped && WORKSHOP_CURSOR.snapLocalOffset.x !== 0) {
               WB_CTX.strokeStyle = '#ffff00'; WB_CTX.strokeRect(s.x - 2, s.y - 2, 4, 4);
            }
            if (WORKSHOP_CURSOR.snapped) {
               WB_CTX.fillStyle = '#ff0'; WB_CTX.fillRect(s.x - 1, s.y - 1, 3, 3);
            } else if (WORKSHOP_DATA.activeTool !== 'select') {
               WB_CTX.fillStyle = '#fff'; WB_CTX.fillRect(s.x - 1, s.y - 1, 3, 3);
            }
            if (WORKSHOP_DATA.pendingBeamStartId) {
               const startNode = WORKSHOP_NODES.get(WORKSHOP_DATA.pendingBeamStartId);
               if (startNode) {
                  let wStart = startNode.worldTransform.pos;
                  if (WORKSHOP_DATA.pendingBeamAnchor) {
                     const rOff = rotatePoint(WORKSHOP_DATA.pendingBeamAnchor, startNode.worldTransform.rot);
                     wStart = { x: wStart.x + rOff.x, y: wStart.y + rOff.y, z: wStart.z + rOff.z };
                  }
                  const s1 = project(wStart.x, wStart.y, wStart.z, pState);
                  WB_CTX.beginPath(); WB_CTX.moveTo(s1.x, s1.y); WB_CTX.lineTo(s.x, s.y);
                  WB_CTX.strokeStyle = '#0f0'; WB_CTX.stroke();
               }
            }
         }
      });
   }
   RENDER_QUEUE.sort((a, b) => b.z - a.z);
   RENDER_QUEUE.forEach(i => i.draw());
   drawGuides(WB_CTX, pState);
   if (WORKSHOP_DATA.showSkeleton) { drawSkeleton(WB_CTX, pState); }
   const selNode = WORKSHOP_NODES.get(WORKSHOP_DATA.selectedNodeId);
   if (selNode) drawGizmo(WB_CTX, pState, selNode);
   ctx.drawImage(WORKSHOP_BUFFER, 0, 0, elements.canvas.width, elements.canvas.height);
}

const RENDER_UNIT = WORKSHOP_CONFIG.CUBE_SIZE;
const HIDDEN_SCALE = { x: 0.001, y: 0.001, z: 0.001 };
const HIDDEN_MAT = 'ghost';
class ChainBuilder {
   constructor(rootId) {
      if (!WORKSHOP_NODES.has(rootId)) {
         this.cursor = 'ERROR_ROOT';
         WORKSHOP_NODES.set(this.cursor, {
            id: this.cursor, type: 'node',
            pos: { x: 0, y: 0, z: 0 },
            scale: HIDDEN_SCALE,
            material: HIDDEN_MAT
         });
      } else {
         this.cursor = rootId;
         const rootNode = WORKSHOP_NODES.get(rootId);
         if (rootNode.type === 'node') {
            rootNode.scale = HIDDEN_SCALE;
            rootNode.material = HIDDEN_MAT;
         }
      }
      this.depth = 0;
      this.idPrefix = Math.random().toString(36).substr(2, 4);
      this.history = [];
      this.pendingPos = { x: 0, y: 0, z: 0 };
      this.pendingRot = { x: 0, y: 0, z: 0 };
      this.pendingAnim = null;
   }

   _applyPendingState(nodeId) {
      const node = WORKSHOP_NODES.get(nodeId);
      if (!node) return;

      // FIX: Ensure pos and rot objects exist before attempting to modify them.
      if (!node.pos) node.pos = { x: 0, y: 0, z: 0 }; // <--- ADDED SAFEGUARD

      // 1. Apply accumulated position offset (SHIFT)
      node.pos.x += this.pendingPos.x;
      node.pos.y += this.pendingPos.y;
      node.pos.z += this.pendingPos.z;

      // 2. Apply accumulated rotation (TURN)
      if (!node.rot) node.rot = { x: 0, y: 0, z: 0 }; // <--- ADDED SAFEGUARD
      node.rot.x += this.pendingRot.x;
      node.rot.y += this.pendingRot.y;
      node.rot.z += this.pendingRot.z;

      // 3. Apply animation
      if (this.pendingAnim) { node.anim = this.pendingAnim; }

      // 4. Reset pending state
      this.pendingPos = { x: 0, y: 0, z: 0 };
      this.pendingRot = { x: 0, y: 0, z: 0 };
      this.pendingAnim = null;
   }

   add(length, options = {}) {
      const defaults = {
         width: 0.1, color: '#888', material: 'matte', taper: 1.0, type: 'cube',
         jointRot: { x: 0, y: 0, z: 0 }, shape: 'cube'
      };
      const opt = { ...defaults, ...options };
      const depth = this.depth++;
      const uid = `${this.idPrefix}_${depth}`;

      // 1. Pivot (The Joint)
      const pivotId = `j_${uid}`;
      WORKSHOP_NODES.set(pivotId, {
         id: pivotId, type: 'wireframe', parentId: this.cursor,
         pos: { x: 0, y: 0, z: 0 }, rot: opt.jointRot,
         scale: HIDDEN_SCALE, material: HIDDEN_MAT,
         color: '#000000', anim: { type: 'none' }
      });
      this._applyPendingState(pivotId);

      // 2. Visual (Bone)
      const boneId = `b_${uid}`;
      let geoType = opt.shape || opt.type;
      const sL = length / RENDER_UNIT;
      const sX = (options.widthX || opt.width) / RENDER_UNIT;
      const sZ = (options.widthZ || opt.width) / RENDER_UNIT;
      WORKSHOP_NODES.set(boneId, {
         id: boneId, type: geoType, parentId: pivotId,
         pos: { x: 0, y: -length / 2, z: 0 }, rot: { x: 0, y: 0, z: 0 },
         scale: { x: sX, y: sL, z: sZ },
         taper: opt.taper, color: opt.color, material: opt.material
      });

      // 3. Tip (Anchor for next link)
      const tipId = `t_${uid}`;
      WORKSHOP_NODES.set(tipId, {
         id: tipId, type: 'wireframe', parentId: pivotId,
         pos: { x: 0, y: -length, z: 0 }, rot: { x: 0, y: 0, z: 0 },
         scale: HIDDEN_SCALE, material: HIDDEN_MAT, color: '#000000'
      });
      this.cursor = tipId;
      this.history.push(tipId);
      return this;
   }

   fork(callback) {
      const savedCursor = this.cursor;
      const savedPendingPos = this.pendingPos;
      const savedPendingRot = this.pendingRot;
      const savedPendingAnim = this.pendingAnim;
      this.pendingPos = { x: 0, y: 0, z: 0 };
      this.pendingRot = { x: 0, y: 0, z: 0 };
      this.pendingAnim = null;
      callback(this);
      this.cursor = savedCursor;
      this.pendingPos = savedPendingPos;
      this.pendingRot = savedPendingRot;
      this.pendingAnim = savedPendingAnim;
      return this;
   }

   addHub(count, callback) {
      const center = this.cursor;
      for (let i = 0; i < count; i++) {
         this.cursor = center;
         const angle = (Math.PI * 2 / count) * i;
         const hubId = `h_${this.idPrefix}_${this.depth++}_${i}`;
         WORKSHOP_NODES.set(hubId, {
            id: hubId, type: 'node', parentId: center,
            pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: angle, z: 0 },
            scale: HIDDEN_SCALE, material: HIDDEN_MAT
         });
         this.cursor = hubId;
         callback(this, i, angle);
      }
      this.cursor = center;
      return this;
   }

   shift(x, y, z) {
      this.pendingPos.x += x;
      this.pendingPos.y += y;
      this.pendingPos.z += z;
      return this;
   }

   turn(x, y, z) {
      this.pendingRot.x += x;
      this.pendingRot.y += y;
      this.pendingRot.z += z;
      return this;
   }

   // pose() and swing() modify the *previous* joint's animation/rotation directly,
   // bypassing the pending state if the cursor points to a tip.
   pose(x, y, z) {
      const tip = WORKSHOP_NODES.get(this.cursor);

      if (!tip || tip.type !== 'wireframe' || !tip.parentId) {
         // If we are at the root, set the rotation for the next joint via pendingRot
         this.pendingRot.x = x;
         this.pendingRot.y = y;
         this.pendingRot.z = z;
         return this;
      }

      // If cursor is a TIP node, apply the pose directly to the parent PIVOT node.
      const pivot = WORKSHOP_NODES.get(tip.parentId);
      if (pivot) pivot.rot = { x, y, z };
      return this;
   }

   swing(axis, speed, amp, phase) {
      const anim = { type: 'wave', axis, speed, amp, phase };
      const tip = WORKSHOP_NODES.get(this.cursor);

      if (!tip || tip.type !== 'wireframe' || !tip.parentId) {
         this.pendingAnim = anim;
         return this;
      }

      const pivot = WORKSHOP_NODES.get(tip.parentId);
      if (pivot) pivot.anim = anim;
      return this;
   }

   spin(axis, speed) {
      const anim = { type: 'spin', axis, speed, amp: 1, phase: 0 };
      const tip = WORKSHOP_NODES.get(this.cursor);

      if (!tip || tip.type !== 'wireframe' || !tip.parentId) {
         this.pendingAnim = anim;
         return this;
      }

      const pivot = WORKSHOP_NODES.get(tip.parentId);
      if (pivot) pivot.anim = anim;
      return this;
   }

   cableTo(targetId, slack = 0.5, width = 1, color = '#555') {
      if (!WORKSHOP_NODES.has(targetId)) return this;
      WORKSHOP_BEAMS.push({
         id: `c_${this.idPrefix}_${this.depth++}`,
         startNodeId: this.cursor,
         endNodeId: targetId,
         anchorA: { x: 0, y: 0, z: 0 },
         anchorB: { x: 0, y: 0, z: 0 },
         length: 1,
         color,
         slack,
         width
      });
      return this;
   }

   addLink(l, w, c) { return this.add(l, { width: w, color: c, type: 'cube' }); }
   addCylinder(l, w, c) { return this.add(l, { width: w, color: c, type: 'cylinder' }); }
   addCone(l, w, c) { return this.add(l, { width: w, color: c, type: 'cone' }); }
   addCapsule(l, w, c) { return this.add(l, { width: w, color: c, type: 'capsule' }); }

   addArc(segments, totalLength, totalCurve, options = {}) {
      const segLen = totalLength / segments;
      const stepRot = totalCurve / segments;
      const sway = options.sway || { speed: 0, amp: 0, phase: 0, axis: 'z' };
      for (let i = 0; i < segments; i++) {
         // Use turn() instead of adding jointRot to options, as turn is now zero-cost
         this.turn(0, 0, stepRot);
         const iterOptions = { ...options, jointRot: undefined };
         this.add(segLen, iterOptions);
         if (sway.speed > 0) {
            // Apply swing to the newly created joint
            this.swing(sway.axis, sway.speed, sway.amp, i * sway.phase);
         }
      }
      return this;
   }

   bridgeTo(otherBuilder, dropDistance, plankOptions = {}) {
      const count = Math.min(this.history.length, otherBuilder.history.length);
      const col = plankOptions.color || '#864';
      const w = plankOptions.width || 3.0;
      const slack = plankOptions.slack || 0.05;
      const makeCable = (n1, n2, width, slk, clr) => {
         WORKSHOP_BEAMS.push({
            id: `br_${Math.random().toString(36).substr(2, 5)}`,
            startNodeId: n1, endNodeId: n2,
            anchorA: { x: 0, y: 0, z: 0 }, anchorB: { x: 0, y: 0, z: 0 },
            length: 1, color: clr, slack: slk, width: width,
            tension: 0
         });
      };
      for (let i = 0; i < count; i++) {
         const nodeA = this.history[i];
         const nodeB = otherBuilder.history[i];
         let anchorA = nodeA;
         let anchorB = nodeB;
         if (dropDistance > 0) {
            const dropA = `drop_A_${Math.random()}`;
            const dropB = `drop_B_${Math.random()}`;
            WORKSHOP_NODES.set(dropA, { id: dropA, type: 'node', parentId: nodeA, pos: { x: 0, y: -dropDistance, z: 0 } });
            WORKSHOP_NODES.set(dropB, { id: dropB, type: 'node', parentId: nodeB, pos: { x: 0, y: -dropDistance, z: 0 } });
            makeCable(nodeA, dropA, 0.2, 0.0, '#654');
            makeCable(nodeB, dropB, 0.2, 0.0, '#654');
            anchorA = dropA;
            anchorB = dropB;
         }
         makeCable(anchorA, anchorB, w, slack, col);
      }
   }
   ring(count, length, opts = {}) {
      const {
         type = 'capsule',
         thickness = 0.2,
         color = '#fff',
         material = 'matte'
      } = opts;
      const arcAngle = (2 * Math.PI) / count;
      for (let i = 0; i < count; i++) {
         this.turn(0, 0, arcAngle);
         this.add(length, {
            width: thickness,
            color: color,
            material: material,
            type: type,
            jointRot: { x: 0, y: 0, z: 0 },
            scale: { x: thickness, y: length, z: thickness }
         });
      }
      WORKSHOP_NODES.get(this.cursor).parentId = this.history[0] || this.cursor;
      return this;
   }
}

K_PRESETS["Kinematic Power Grid"] = function generateKinematicPowerGrid() {
   // Clear
   WORKSHOP_NODES.clear();
   WORKSHOP_BEAMS.length = 0;

   // Grid setup
   const NX = 5, NZ = 4;
   const SPACING = 1.8;

   // Pole config
   const poleHeight = 1.6, crossbarWidth = 0.45;
   const poleRadius = 0.13;
   const poleColor = '#a18262';
   const crossbarColor = '#efd94d';
   const cableColor = '#c8a055';
   const cableSlack = 0.40;
   const cableWidth = 0.55;
   const swingSpeed = 0.5;
   const swingAmp = 0.14;

   // Store tip ids for cable connection
   const tipIds = Array.from({ length: NX }, () => Array(NZ).fill(null));
   const poleBases = Array.from({ length: NX }, () => Array(NZ).fill(null));

   // 1. Build all poles as ChainBuilders, swaying at the base for kinetic cables
   for (let ix = 0; ix < NX; ix++) {
      for (let iz = 0; iz < NZ; iz++) {
         // Root node for each pole
         const baseId = `pole_root_${ix}_${iz}`;
         const wx = (ix - (NX - 1) / 2) * SPACING;
         const wz = (iz - (NZ - 1) / 2) * SPACING;
         WORKSHOP_NODES.set(baseId, {
            id: baseId, type: 'node', parentId: null,
            pos: { x: wx, y: 0, z: wz },
            rot: { x: Math.PI, y: 0, z: 0 },
            scale: { x: 0.001, y: 0.001, z: 0.001 },
            color: '#000',
            material: 'ghost'
         });

         // Build the pole via ChainBuilder
         const poleChain = new ChainBuilder(baseId);
         // Animate the pole's base joint on Z for wind sway!
         poleChain.swing('z', swingSpeed + Math.random() * 0.25, swingAmp + Math.random() * 0.03, Math.random() * 6.28);

         poleChain.add(poleHeight, {
            width: poleRadius,
            color: poleColor,
            material: 'metal',
            type: 'cylinder'
         });

         // Crossbar (cube)
         poleChain.add(0.08, {
            width: crossbarWidth,
            color: crossbarColor,
            material: 'metal',
            type: 'cube'
         });

         // Save tip for cables
         tipIds[ix][iz] = poleChain.cursor;
         poleBases[ix][iz] = baseId;
      }
   }

   // 2. Use ChainBuilder .cableTo() for N/S/E/W cables
   for (let ix = 0; ix < NX; ix++) {
      for (let iz = 0; iz < NZ; iz++) {
         const myTip = tipIds[ix][iz];

         // Cable east (along +X)
         if (ix < NX - 1) {
            const eastTip = tipIds[ix + 1][iz];
            const cb = new ChainBuilder(myTip);
            cb.cableTo(eastTip, cableSlack + Math.random() * 0.15, cableWidth, cableColor);
         }
         // Cable south (along +Z)
         if (iz < NZ - 1) {
            const southTip = tipIds[ix][iz + 1];
            const cb = new ChainBuilder(myTip);
            cb.cableTo(southTip, cableSlack + Math.random() * 0.15, cableWidth, cableColor);
         }
      }
   }

   // 3. CRITICAL: Update hierarchy once to get world positions, THEN set cable rest lengths
   updateHierarchy(0);

   WORKSHOP_BEAMS.forEach(beam => {
      const n1 = WORKSHOP_NODES.get(beam.startNodeId);
      const n2 = WORKSHOP_NODES.get(beam.endNodeId);
      if (!n1 || !n2 || !n1.worldTransform || !n2.worldTransform) return;

      const p1 = n1.worldTransform.pos;
      const p2 = n2.worldTransform.pos;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      beam.restLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
   });

   updatePropertiesPanel();
   return { nodes: [], beams: [] };
};

K_PRESETS["Kinematic Jellyfish"] = function generateKinematicJellyfish() {
   WORKSHOP_NODES.clear();
   WORKSHOP_BEAMS.length = 0;

   // Parametric design - all values derive from one base unit
   const baseSize = 0.3;
   const bellRadius = baseSize * 2;
   const bellHeight = baseSize * 1.5;
   const tentacleCount = 12;
   const tentacleSegments = 8;
   const tentacleLength = baseSize * 6;

   // Color palette
   const bellColor = '#e8b4f0';
   const tentacleColors = ['#c084fc', '#a855f7', '#9333ea', '#7e22ce'];

   // Root: Floating anchor with bob
   WORKSHOP_NODES.set('jelly_root', {
      id: 'jelly_root', type: 'node', parentId: null,
      pos: { x: 0, y: 2, z: 0 }, rot: { x: 0, y: 0, z: 0 },
      scale: { x: 0.001, y: 0.001, z: 0.001 }, color: '#000', material: 'ghost',
      anim: { type: 'bob', axis: 'y', speed: 0.8, amp: baseSize * 1.5, phase: 0 },
      anim2: { type: 'spin', axis: 'y', speed: 0.3, amp: 1, phase: 0 }
   });

   // Bell: Built with ChainBuilder
   const bellBuilder = new ChainBuilder('jelly_root');
   bellBuilder.add(bellHeight * 0.5, {
      width: bellRadius,
      color: bellColor,
      material: 'jelly',
      type: 'cylinder',
      taper: 0.6
   });

   const bellTop = bellBuilder.cursor;

   // Tentacles from bell bottom
   const tentacleBuilder = new ChainBuilder('jelly_root');
   tentacleBuilder.addHub(tentacleCount, (b, index, angle) => {
      // Each tentacle is a different length for organic look
      const lengthVariation = 0.7 + Math.random() * 0.6;
      const segLength = (tentacleLength * lengthVariation) / tentacleSegments;

      // Color cycles through palette
      const color = tentacleColors[index % tentacleColors.length];

      // Tentacles start angled outward
      const spreadAngle = Math.PI * 0.3;
      b.turn(spreadAngle, 0, 0);

      // Build segments with increasing sway toward tips
      for (let seg = 0; seg < tentacleSegments; seg++) {
         const progress = seg / tentacleSegments;
         const width = baseSize * (1 - progress * 0.7);

         b.add(segLength, {
            width: width,
            color: color,
            material: 'jelly',
            type: 'capsule',
            taper: 0.7
         });

         // Sway increases toward tip, each tentacle phase-shifted
         const swaySpeed = 2 + Math.random();
         const swayAmp = 0.2 + (progress * 0.4);
         const phase = index * (Math.PI * 2 / tentacleCount) + seg * 0.3;

         b.swing('z', swaySpeed, swayAmp, phase);
         b.swing('x', swaySpeed * 0.7, swayAmp * 0.5, phase + 1);
      }
   });

   updatePropertiesPanel();
   return { nodes: [], beams: [] };
};

K_PRESETS["Rocky Meadow"] = function generateRockyMeadow() {
    WORKSHOP_NODES.clear();
    WORKSHOP_BEAMS.length = 0;
    
    // Center field around character
    const centerX = (character.renderX ?? character.x) + 0.5;
    const centerZ = (character.renderY ?? character.y) + 0.5;
    
    const FIELD_RADIUS = 4.0;
    const GRASS_DENSITY = 16;
    const ROCK_COUNT = 12;
    const BLADE_SEGMENTS = 1 + Math.floor(Math.random() * 4);
    
    // Utility functions
    const rand = (min, max) => Math.random() * (max - min) + min;
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const PI = Math.PI;
    const HIDDEN_SCALE = {x:0.001, y:0.001, z:0.001};
    const HIDDEN_MAT = 'ghost';
    
    // Color palettes
    const GRASS_HUES = ['#8FBC8F', '#90EE90', '#ADFF2F', '#7CFC00', '#BDB76B'];
    const TIP_HUES = ['#FFC0CB', '#FFA07A', '#F0E68C'];
    const ROCK_COLORS = ['#78716c', '#57534e', '#6b7280', '#71717a', '#52525b'];
    
    // Ground hub for grass
    WORKSHOP_NODES.set('ground_hub', {
        id: 'ground_hub', type: 'node',
        parentId: null,
        pos: {x: centerX, y: 0, z: centerZ},
        rot: {x:0, y:0, z:0},
        scale: HIDDEN_SCALE,
        color: '#000000',
        material: HIDDEN_MAT,
        anim: { type: 'none' }
    });
    
    // Place rocks first (they're bigger, grass grows around them)
    const rockPositions = [];
    for (let i = 0; i < ROCK_COUNT; i++) {
        const angle = rand(0, 2 * PI);
        const dist = rand(0.5, FIELD_RADIUS);
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        
        const size = rand(0.4, 0.9);
        
        const rockId = `rock_${i}`;
        WORKSHOP_NODES.set(rockId, {
            id: rockId, type: 'rock', parentId: null,
            pos: {x: centerX + x, y: size * 0.4, z: centerZ + z},
            rot: {
                x: rand(0, 0.5),
                y: rand(0, PI * 2),
                z: rand(0, 0.5)
            },
            scale: {
                x: size * rand(0.9, 1.1),
                y: size * rand(0.7, 0.9),
                z: size * rand(0.9, 1.1)
            },
            color: ROCK_COLORS[i % ROCK_COLORS.length],
            material: 'smooth'
        });
        
        rockPositions.push({x, z, radius: size});
    }
    
    // Plant grass, avoiding rocks
    const BLADE_COUNT = Math.floor(PI * FIELD_RADIUS * FIELD_RADIUS * GRASS_DENSITY);
    
    for (let i = 0; i < BLADE_COUNT; i++) {
        const r_rand = rand(0, 1);
        const r = Math.sqrt(r_rand) * FIELD_RADIUS;
        const theta = rand(0, 2 * PI);
        const startX = Math.cos(theta) * r;
        const startZ = Math.sin(theta) * r;
        
        // Skip if too close to a rock
        let tooClose = false;
        for (const rock of rockPositions) {
            const dx = startX - rock.x;
            const dz = startZ - rock.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < rock.radius * 1.2) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;
        
        // Density falloff
        if (r_rand > 0.6) continue;
        
        const DIST_FACTOR = r / FIELD_RADIUS;
        const BASE_HEIGHT = rand(0.7, 1.2);
        const TOTAL_HEIGHT = BASE_HEIGHT * (1.0 - 0.5 * DIST_FACTOR) * rand(0.9, 1.1);
        
        const HUE_INDEX = Math.floor(GRASS_HUES.length * DIST_FACTOR * rand(0.5, 1.0));
        const baseColor = GRASS_HUES[Math.min(HUE_INDEX, GRASS_HUES.length - 1)];
        
        const BASE_WIDTH = rand(0.05, 0.1);
        const W_SPEED = rand(3.0, 5.0);
        const W_AMP = rand(0.01, 0.03);
        const W_PHASE = rand(0, 6.28);
        
        const mountId = `grass_mount_${i}`;
        WORKSHOP_NODES.set(mountId, {
            id: mountId, type: 'node', parentId: 'ground_hub',
            pos: {x: startX, y: 0.0, z: startZ},
            rot: {x: PI, y: rand(0, 6.28), z: 0},
            scale: HIDDEN_SCALE,
            color: '#000000',
            material: HIDDEN_MAT
        });
        
        const blade = new ChainBuilder(mountId);
        for (let j = 0; j < BLADE_SEGMENTS; j++) {
            const progress = j / BLADE_SEGMENTS;
            const segLen = (TOTAL_HEIGHT / BLADE_SEGMENTS) * rand(0.9, 1.1);
            const segWidth = BASE_WIDTH * (1.0 - (progress * 0.7));
            
            blade.add(segLen, {
                width: segWidth,
                color: baseColor,
                type: 'capsule',
                material: 'matte'
            });
            
            blade.swing('z', W_SPEED, W_AMP * (1 - progress), W_PHASE + j * 0.5);
            
            if (j === 0) blade.turn(0.1, 0, 0);
            
            if (j === BLADE_SEGMENTS - 1) {
                const tipColor = TIP_HUES[randInt(0, TIP_HUES.length - 1)];
                blade.add(0.15, {
                    width: segWidth * 1.2,
                    color: tipColor,
                    type: 'cone',
                    material: 'matte'
                });
                
                if (rand(0, 1) > 0.8 && DIST_FACTOR < 0.5) {
                    WORKSHOP_NODES.get(blade.cursor).material = 'glow';
                }
            }
        }
    }
    
    updatePropertiesPanel();
    return { nodes: [], beams: [] };
};

K_PRESETS["Grass Patch"] = function generateGrassPatch() {
   WORKSHOP_NODES.clear();
   WORKSHOP_BEAMS.length = 0;

   // --- CONFIGURATION ---
   const TILES_X = 3;
   const TILES_Y = 3;
   const TILE_SIZE = 1.5;
   const PADDING = 0.5;
   const DENSITY = 35;         
   const BASE_HEIGHT = 0.5;
   const BLADE_SEGMENTS = 3;   // 3 segments for fluid motion
   // ---------------------

   const centerX = (typeof character !== 'undefined' ? (character.renderX ?? character.x) : 0) + 0.5;
   const centerZ = (typeof character !== 'undefined' ? (character.renderY ?? character.y) : 0) + 0.5;

   const rand = (min, max) => Math.random() * (max - min) + min;
   
   // Alien Palette: White -> Lavender -> Neon Purple
   const PALETTE = ['#ffffff', '#f5f5f5', '#e6e6fa', '#d8bfd8', '#c471ed', '#a855f7', '#7c3aed'];
   const HIDDEN_SCALE = { x: 0.001, y: 0.001, z: 0.001 };

   const totalWidth = TILES_X * TILE_SIZE + (TILES_X - 1) * PADDING;
   const totalHeight = TILES_Y * TILE_SIZE + (TILES_Y - 1) * PADDING;
   
   const gridStartX = centerX - totalWidth / 2 + TILE_SIZE / 2;
   const gridStartZ = centerZ - totalHeight / 2 + TILE_SIZE / 2;

   for (let tx = 0; tx < TILES_X; tx++) {
      for (let ty = 0; ty < TILES_Y; ty++) {
         const tileCX = gridStartX + tx * (TILE_SIZE + PADDING);
         const tileCZ = gridStartZ + ty * (TILE_SIZE + PADDING);

         for (let i = 0; i < DENSITY; i++) {
            const id = `gp_${tx}_${ty}_${i}`;
            
            const lx = rand(-TILE_SIZE / 2, TILE_SIZE / 2);
            const lz = rand(-TILE_SIZE / 2, TILE_SIZE / 2);
            const wx = tileCX + lx;
            const wz = tileCZ + lz;

            WORKSHOP_NODES.set(id, {
               id: id, type: 'node', parentId: null,
               pos: { x: wx, y: 0, z: wz },
               rot: { x: Math.PI, y: rand(0, Math.PI * 2), z: 0 }, 
               scale: HIDDEN_SCALE,
               color: '#000', material: 'ghost'
            });

            const b = new ChainBuilder(id);
            const h = BASE_HEIGHT * rand(0.8, 1.4); // High height variance
            const col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
            
            // Reverted to randomized "organic" sway paramaters
            const speed = rand(1.5, 3.5);
            const phase = rand(0, Math.PI * 2); // Random start for wriggling look
            const ampBase = rand(0.1, 0.2);

            for(let s = 0; s < BLADE_SEGMENTS; s++) {
               const progress = s / BLADE_SEGMENTS;
               const segLen = h / BLADE_SEGMENTS;
               const width = 0.08 * (1.0 - progress * 0.6);

               b.add(segLen, {
                  width: width,
                  color: col,
                  type: 'capsule',
                  material: 'glow' // Adds a slight emissive look for the alien vibe
               });

               // Compound sway: Z is main motion, X adds the "wriggle"
               // Increasing amplitude higher up the chain
               b.swing('z', speed, ampBase * (s + 1), phase);
               b.swing('x', speed * 0.7, (ampBase * 0.5) * (s + 1), phase + 1.5);
            }
         }
      }
   }

   updatePropertiesPanel();
   return { nodes: [], beams: [] };
};

K_PRESETS["Shag Carpet"] = function generateShagCarpet() {
   WORKSHOP_NODES.clear();
   WORKSHOP_BEAMS.length = 0;

   // --- CONFIG ---
   const RUG_RADIUS = 0.5;
   const DENSITY = 750;
   const STRAND_LEN = 0.05;
   const SEGMENTS = 1;
   
   const COL_BG = '#1c1917';
   const COL_STAR = '#dc2626';
   const COL_BORDER = '#f59e0b';
   
   const HIDDEN_SCALE = { x: 0.001, y: 0.001, z: 0.001 };

   // Player Position (Spawn Origin)
   const cx = (typeof character !== 'undefined' ? (character.renderX ?? character.x) : 0) + 0.5;
   const cz = (typeof character !== 'undefined' ? (character.renderY ?? character.y) : 0) + 0.5;

   // [REMOVED] rug_master node. Fibers are now independent.

   const getFiberStyle = (rx, rz) => {
       const dist = Math.sqrt(rx*rx + rz*rz);
       const angle = Math.atan2(rz, rx) + Math.PI;

       if (dist > RUG_RADIUS * 0.9) return { color: COL_BORDER, mat: 'metal' };

       const sector = (Math.PI * 2) / 5;
       const localA = Math.abs((angle % sector) - (sector / 2));
       const starInnerR = RUG_RADIUS * 0.35;
       const starOuterR = RUG_RADIUS * 0.85;
       const starThreshold = starInnerR + (starOuterR - starInnerR) * Math.max(0, 1 - localA * 2.5);

       if (dist < starThreshold) return { color: COL_STAR, mat: 'glow' };
       return { color: COL_BG, mat: 'matte' };
   };

   for (let i = 0; i < DENSITY; i++) {
       const id = `rug_${i}`;
       
       let rx, rz, d;
       do {
           rx = (Math.random() * 2 - 1) * RUG_RADIUS;
           rz = (Math.random() * 2 - 1) * RUG_RADIUS;
           d = Math.sqrt(rx*rx + rz*rz);
       } while (d > RUG_RADIUS);

       // World Position
       const wx = cx + rx;
       const wz = cz + rz;

       const style = getFiberStyle(rx, rz);

       // [NEW] Random crawl speed for independent movement
       // Max is 0.005 (Half of previous 0.01). Min is 0.002 to keep them somewhat together.
       const mySpeed = 0.25 + Math.random() * 0.3;

       WORKSHOP_NODES.set(id, {
           id: id, type: 'node', 
           parentId: null,  // [CHANGED] No parent
           pos: { x: wx, y: 0, z: wz }, 
           rot: { x: 0, y: 0, z: 0 }, 
           scale: HIDDEN_SCALE,
           color: '#000', material: 'ghost',
           crawlSpeed: mySpeed // [NEW] Custom property for movement
       });

       const b = new ChainBuilder(id);
       b.turn(0.4, 0, 0); 

       for (let s = 0; s < SEGMENTS; s++) {
           const progress = s / SEGMENTS;
           const w = 0.035 * (1.0 - progress * 0.3);
           b.add(STRAND_LEN / SEGMENTS, {
               width: w, color: style.color, type: 'capsule', material: style.mat
           });
           
           const wavePhase = rx * 4 + rz * 4;
           b.swing('x', 3.0, 0.06, wavePhase + (s * 0.5));
       }
   }
   
   updatePropertiesPanel();
   return { nodes: [], beams: [] };
};