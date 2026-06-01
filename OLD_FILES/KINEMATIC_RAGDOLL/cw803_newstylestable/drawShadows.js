/**
 * =============================================================================
 * LIGHTING & SCENE RENDERER
 * =============================================================================
 * 
 * This module handles:
 * 1. Floor shadow/lighting with flashlight effect
 * 2. Pseudo-3D wall rendering with perspective projection
 * 3. Depth-sorted rendering of walls and actors (painter's algorithm)
 * 4. Post-processing effects (scanlines, vignette)
 * 
 * Key concepts:
 * - Camera is centered on the player character
 * - Walls "lean away" from camera using height-based perspective ratio
 * - Objects are sorted by distance from camera (far drawn first, near drawn last)
 */

const LIGHT_CONFIG = { distance: 32.0, resolution: 0.25 };
const LIGHT_FX = {
   SHADOW_RGB: '10, 12, 18',
   SHADOW_OPACITY: 0.55,
   AMBIENT_LIGHT: 0.45,
   SUNLIGHT_COLOR: 'rgba(220, 235, 255, 0.08)',
   HIGHLIGHT_BASE: 'rgba(200, 240, 255,',
   HIGHLIGHT_THRESHOLD: 0.9,
   HIGHLIGHT_POWER: 0.4,
   SCANLINE_OPACITY: 0.05,
   VIGNETTE_STRENGTH: 0.4,
   GRIT_AMOUNT: 0.05,
   HEIGHT_BLOCK: 0.5,
   HEIGHT_TREE: 0.25,
   HEIGHT_CAMERA: 16.0,
   HEIGHT_LIGHT_Z: 16.0,
   FORCE_WALL_HEIGHT: 16
};
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d');
const shadowCanvas = document.createElement('canvas');
const shadowCtx = shadowCanvas.getContext('2d');
const renderList = [];
const WALL_FACES = [
   { dim: 1, sgn: -1, dx: 0, dy: 1, c: [0, 1, 1, 1], l: [0, 1, 0.5, 1, 1, 1] },
   { dim: 0, sgn: -1, dx: 1, dy: 0, c: [1, 0, 1, 1], l: [1, 0, 1, 0.5, 1, 1] },
   { dim: 1, sgn: 1, dx: 0, dy: -1, c: [0, 0, 1, 0], l: [0, 0, 0.5, 0, 1, 0] },
   { dim: 0, sgn: 1, dx: -1, dy: 0, c: [0, 0, 0, 1], l: [0, 0, 0, 0.5, 0, 1] }
];
const VISIBLE_WALLS = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
const LIT_GRID = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
const RAY_BUFFER = new Array(10000).fill(null).map(() => ({ x: 0, y: 0, angle: 0 }));
let rayCount = 0;
const angleSet = new Set();
const angleBuffer = [];
const wallTextureCache = {};
let cameraWorldX, cameraWorldY;
let viewportX, viewportY;
let cellPixelW, cellPixelH;
let lightDistSq;
const flashlightTexture = (function () {
   const canvas = document.createElement('canvas');
   const ctx = canvas.getContext('2d');
   canvas.width = 512;
   canvas.height = 512;
   const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
   gradient.addColorStop(0, '#FFF');
   gradient.addColorStop(0.3, 'rgba(255,255,255,0.95)');
   gradient.addColorStop(0.6, 'rgba(255,255,255,0.5)');
   gradient.addColorStop(1, 'rgba(255,255,255,0)');
   ctx.fillStyle = gradient;
   ctx.fillRect(0, 0, 512, 512);
   ctx.strokeStyle = 'rgba(255,255,255,0.08)';
   ctx.lineWidth = 40;
   ctx.beginPath();
   ctx.arc(256, 256, 180, 0, Math.PI * 2);
   ctx.stroke();
   ctx.fillStyle = 'rgba(255,255,255,0.1)';
   ctx.beginPath();
   ctx.arc(256, 256, 50, 0, Math.PI * 2);
   ctx.fill();
   return canvas;
})();

function setGlobalBrightness(value) {
   const t = Math.max(0, Math.min(1, value));
   const lerp = (a, b) => a * (1 - t) + b * t;
   LIGHT_FX.SHADOW_OPACITY = lerp(0.98, 0.0);
   LIGHT_FX.AMBIENT_LIGHT = lerp(0.01, 1.15);
   LIGHT_FX.HIGHLIGHT_POWER = lerp(0.7, 0.0);
   LIGHT_FX.SUNLIGHT_COLOR = `rgba(220, 235, 255, ${lerp(0.0, 0.25).toFixed(2)})`;
   LIGHT_FX.VIGNETTE_STRENGTH = lerp(0.8, 0.0);
}

function getStackedWallTexture(baseTex, style, color, outline, regionId, stackCount) {
   const key = `${style}_${color}_${outline}_${regionId}_${stackCount}`;
   if (wallTextureCache[key]) return wallTextureCache[key];
   const canvas = document.createElement('canvas');
   const ctx = canvas.getContext('2d');
   canvas.width = baseTex.width;
   canvas.height = baseTex.height * stackCount;
   for (let i = 0; i < stackCount; i++) { ctx.drawImage(baseTex, 0, i * baseTex.height, baseTex.width, baseTex.height + 0.5); }
   wallTextureCache[key] = canvas;
   return canvas;
}

function computeVisibilityPolygon(entity, maxDistance) {
   VISIBLE_WALLS.fill(0);
   LIT_GRID.fill(0);
   const startX = (entity.renderX ?? entity.x) + 0.5;
   const startY = (entity.renderY ?? entity.y) + 0.5;
   const maxDistSq = maxDistance * maxDistance;
   angleSet.clear();
   angleBuffer.length = 0;
   // Add structural rays every ~7.5 degrees to guarantee full coverage
   // This prevents polygon collapse when no obstacles exist in certain directions
   /*
   for (let i = 0; i < 48; i++) {
      const angle = -Math.PI + (i * Math.PI * 2 / 48);
      angleSet.add(angle);
   }
   */
   const minX = Math.max(0, Math.floor(startX - maxDistance));
   const maxX = Math.min(GRID_WIDTH, Math.ceil(startX + maxDistance));
   const minY = Math.max(0, Math.floor(startY - maxDistance));
   const maxY = Math.min(GRID_HEIGHT, Math.ceil(startY + maxDistance));
   for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
         if (ObstacleGrid[x + y * GRID_WIDTH] === 0) continue;
         if (((x + 0.5) - startX) ** 2 + ((y + 0.5) - startY) ** 2 > maxDistSq) continue;
         [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].forEach(c => {
            const a = Math.atan2(c[1] - startY, c[0] - startX);
            angleSet.add(a);
            angleSet.add(a + 0.0001);
            angleSet.add(a - 0.0001);
         });
      }
   }
   for (const a of angleSet) angleBuffer.push(a);
   angleBuffer.sort((a, b) => a - b);
   if (angleBuffer.length && Math.abs(angleBuffer[0] - (angleBuffer[angleBuffer.length - 1] - Math.PI * 2)) > 1e-3) { angleBuffer.push(angleBuffer[0] + Math.PI * 2); }
   rayCount = 0;
   const maxRays = RAY_BUFFER.length;
   for (const angle of angleBuffer) {
      if (rayCount >= maxRays) break;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      let mapX = Math.floor(startX);
      let mapY = Math.floor(startY);
      let dist = 0;
      const deltaDistX = dirX === 0 ? 1e30 : Math.abs(1 / dirX);
      const deltaDistY = dirY === 0 ? 1e30 : Math.abs(1 / dirY);
      const stepX = dirX < 0 ? -1 : 1;
      const stepY = dirY < 0 ? -1 : 1;
      let sideDistX = (dirX < 0 ? startX - mapX : mapX + 1 - startX) * deltaDistX;
      let sideDistY = (dirY < 0 ? startY - mapY : mapY + 1 - startY) * deltaDistY;
      while (dist < maxDistance) {
         if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            dist = sideDistX - deltaDistX;
         } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            dist = sideDistY - deltaDistY;
         }
         if (mapX >= 0 && mapX < GRID_WIDTH && mapY >= 0 && mapY < GRID_HEIGHT) {
            const idx = mapX + mapY * GRID_WIDTH;
            LIT_GRID[idx] = 1;
            if (ObstacleGrid[idx] === 1 || ObstacleGrid[idx] === 3) {
               VISIBLE_WALLS[idx] = 1;
               break;
            }
         } else {
            break;
         }
      }
      RAY_BUFFER[rayCount].x = startX + dirX * dist;
      RAY_BUFFER[rayCount].y = startY + dirY * dist;
      RAY_BUFFER[rayCount].angle = angle;
      rayCount++;
   }
   return rayCount;
}

function isPointLit(testX, testY) {
   const gridX = Math.floor(testX);
   const gridY = Math.floor(testY);
   if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) return false;
   const idx = gridX + gridY * GRID_WIDTH;
   if (!LIT_GRID[idx] && !VISIBLE_WALLS[idx]) return false;
   const dx = testX - cameraWorldX;
   const dy = testY - cameraWorldY;
   const distSq = dx * dx + dy * dy;
   if (distSq > lightDistSq) return false;
   let theta = Math.atan2(dy, dx);
   const startAngle = RAY_BUFFER[0].angle;
   while (theta < startAngle) theta += Math.PI * 2;
   while (theta > startAngle + Math.PI * 2) theta -= Math.PI * 2;
   let low = 0, high = rayCount - 1, idx2 = -1;
   while (low <= high) {
      const mid = (low + high) >> 1;
      if (RAY_BUFFER[mid].angle <= theta) {
         idx2 = mid;
         low = mid + 1;
      } else {
         high = mid - 1;
      }
   }
   let p1, p2;
   if (idx2 === -1) {
      p1 = RAY_BUFFER[rayCount - 1];
      p2 = RAY_BUFFER[0];
   } else if (idx2 >= rayCount - 1) {
      p1 = RAY_BUFFER[rayCount - 1];
      p2 = RAY_BUFFER[0];
   } else {
      p1 = RAY_BUFFER[idx2];
      p2 = RAY_BUFFER[idx2 + 1];
   }
   const span = (idx2 === -1 || idx2 >= rayCount - 1) ? (p2.angle + Math.PI * 2 - p1.angle) : (p2.angle - p1.angle);
   if (span < 0.00001) return true;
   const t = (theta - p1.angle) / span;
   if (t < 0 || t > 1) return false;
   const r1Sq = (p1.x - cameraWorldX) ** 2 + (p1.y - cameraWorldY) ** 2;
   const r2Sq = (p2.x - cameraWorldX) ** 2 + (p2.y - cameraWorldY) ** 2;
   return distSq <= r1Sq + t * (r2Sq - r1Sq);
}

function renderFloorShadows(ctx, pointCount) {
   if (LIGHT_FX.SHADOW_OPACITY <= 0.01) return;
   const screenCamX = (cameraWorldX - viewportX) * cellPixelW + cellPixelW * 0.5;
   const screenCamY = (cameraWorldY - viewportY) * cellPixelH + cellPixelH * 0.5;
   const beamRadius = (LIGHT_CONFIG.distance) * Math.max(cellPixelW, cellPixelH);
   const width = ctx.canvas.width;
   const height = ctx.canvas.height;
   ctx.save();
   ctx.globalCompositeOperation = 'source-over';
   ctx.fillStyle = `rgba(${LIGHT_FX.SHADOW_RGB}, ${LIGHT_FX.SHADOW_OPACITY})`;
   ctx.fillRect(0, 0, width, height);
   ctx.beginPath();
   ctx.moveTo(screenCamX, screenCamY);
   for (let i = 0; i < pointCount; i++) {
      const px = (RAY_BUFFER[i].x - viewportX) * cellPixelW;
      const py = (RAY_BUFFER[i].y - viewportY) * cellPixelH;
      ctx.lineTo(px, py);
   }
   ctx.closePath();
   ctx.clip();
   ctx.globalCompositeOperation = 'destination-out';
   ctx.drawImage(flashlightTexture, screenCamX - beamRadius, screenCamY - beamRadius, beamRadius * 2, beamRadius * 2);
   ctx.restore();
}

function drawWallFace(ctx,
   baseX1, baseY1, baseX2, baseY2,    // Bottom edge (screen coords)
   topX1, topY1, topX2, topY2,        // Top edge (screen coords)
   biome, cellType,
   intensityLeft, intensityMid, intensityRight,
   stackHeight, worldX, worldY, regionId
) {
   let style, color, outline;
   if (cellType === 'tree') {
      style = biome.obstacle;
      color = biome.obstacleColor;
      outline = null;
   } else {
      style = biome.wall.style;
      color = biome.wall.color;
      outline = biome.wall.outline;
   }
   const baseTex = getWorldTile(worldX, worldY, cellType, style, color, outline, regionId, true);
   if (!baseTex || !baseTex.width) return;
   const stackCount = Math.max(1, Math.round(stackHeight));
   const texture = getStackedWallTexture(baseTex, style, color, outline, regionId, stackCount);
   const m11 = (topX2 - topX1) / texture.width;
   const m12 = (topY2 - topY1) / texture.width;
   const m21 = (baseX1 - topX1) / texture.height;
   const m22 = (baseY1 - topY1) / texture.height;
   ctx.save();
   ctx.beginPath();
   ctx.moveTo(baseX1, baseY1);
   ctx.lineTo(baseX2, baseY2);
   ctx.lineTo(topX2, topY2);
   ctx.lineTo(topX1, topY1);
   ctx.closePath();
   ctx.clip();
   ctx.transform(m11, m12, m21, m22, topX1, topY1);
   ctx.drawImage(texture, 0, -0.5, texture.width, texture.height + 1);
   ctx.setTransform(1, 0, 0, 1, 0, 0);
   const applyLightingGradient = (v1, vMid, v2, scale, colorPrefix, blendMode) => {
      if (v1 <= 0.01 && vMid <= 0.01 && v2 <= 0.01) return;
      const a = Math.max(0, v1 * scale);
      const m = Math.max(0, vMid * scale);
      const b = Math.max(0, v2 * scale);
      ctx.globalCompositeOperation = blendMode;
      if (Math.abs(a - b) < 0.15 && Math.abs(a - m) < 0.15) {
         ctx.fillStyle = `${colorPrefix} ${(a + b + m) / 3})`;
      } else {
         const gradient = ctx.createLinearGradient(baseX1, baseY1, baseX2, baseY2);
         gradient.addColorStop(0, `${colorPrefix} ${a})`);
         gradient.addColorStop(0.5, `${colorPrefix} ${m})`);
         gradient.addColorStop(1, `${colorPrefix} ${b})`);
         ctx.fillStyle = gradient;
      }
      ctx.fill();
   };
   if (LIGHT_FX.SHADOW_OPACITY > 0.01) { applyLightingGradient(1 - intensityLeft, 1 - intensityMid, 1 - intensityRight, LIGHT_FX.SHADOW_OPACITY, `rgba(${LIGHT_FX.SHADOW_RGB},`, 'source-over'); }
   if (LIGHT_FX.HIGHLIGHT_POWER > 0.01) {
      const th = LIGHT_FX.HIGHLIGHT_THRESHOLD;
      if (intensityLeft > th || intensityMid > th || intensityRight > th) { applyLightingGradient(intensityLeft - th, intensityMid - th, intensityRight - th, LIGHT_FX.HIGHLIGHT_POWER, LIGHT_FX.HIGHLIGHT_BASE, 'lighter'); }
   }
   ctx.restore();
}

function getWallHeight(gridX, gridY) {
   if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) return 0;
   const cell = cells[gridY * gridSize + gridX];
   if (!cell || cell.type !== 'wall') return 0;
   const z = LIGHT_FX.FORCE_WALL_HEIGHT > 0 ? LIGHT_FX.FORCE_WALL_HEIGHT : (cell.z || 1);
   return z * LIGHT_FX.HEIGHT_BLOCK;
}

function getCellHeight(cell) {
   if (cell?.type === 'tree') return LIGHT_FX.HEIGHT_TREE;
   if (cell?.type !== 'wall') return 0;
   const z = LIGHT_FX.FORCE_WALL_HEIGHT > 0 ? LIGHT_FX.FORCE_WALL_HEIGHT : (cell.z || 1);
   return z * LIGHT_FX.HEIGHT_BLOCK;
}

function getCellZ(cell) {
   if (cell?.type !== 'wall') return 1;
   return LIGHT_FX.FORCE_WALL_HEIGHT > 0 ? LIGHT_FX.FORCE_WALL_HEIGHT : (cell.z || 1);
}

function renderScene(ctx, actors, deltaTime) {
   let itemCount = 0;
   const camX = (character.renderX ?? character.x) + 0.5;
   const camY = (character.renderY ?? character.y) + 0.5;
   const screenCamX = (cameraWorldX - viewportX) * cellPixelW + cellPixelW * 0.5;
   const screenCamY = (cameraWorldY - viewportY) * cellPixelH + cellPixelH * 0.5;
   const startX = Math.floor(viewportX - 2);
   const startY = Math.floor(viewportY - 2);
   const endX = Math.ceil(viewportX + viewport.width + 2);
   const endY = Math.ceil(viewportY + viewport.height + 2);
   for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
         if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) continue;
         const cell = cells[y * gridSize + x];
         if (!cell || (cell.type !== 'wall' && cell.type !== 'tree')) continue;
         if (itemCount >= renderList.length) renderList.push({});
         const item = renderList[itemCount++];
         item.type = 'wall';
         item.gridX = x;
         item.gridY = y;
         item.cell = cell;
         const centerX = x + 0.5;
         const centerY = y + 0.5;
         const dx = centerX - camX;
         const dy = centerY - camY;
         item.distSq = dx * dx + dy * dy;
         item.worldY = centerY;
         item.screenX = (x - viewportX) * cellPixelW;
         item.screenY = (y - viewportY) * cellPixelH;
         item.height = getCellHeight(cell);
         item.z = getCellZ(cell);
      }
   }

   // --- COLLECT ACTORS ---
   // In 2.5D perspective, everything leans AWAY from camera center (player)
   // The anchor point (feet) is what determines depth - heads lean away from there
   // So we sort by distance from camera to feet, just like walls use closest edge
   if (actors) {
      for (const entity of actors) {
         const worldX = (entity.renderX ?? entity.x) + 0.5;
         const worldY = (entity.renderY ?? entity.y) + 0.5;
         if (worldX < startX || worldX > endX || worldY < startY || worldY > endY) continue;
         if (itemCount >= renderList.length) renderList.push({});
         const item = renderList[itemCount++];
         item.type = 'actor';
         item.entity = entity;
         item.worldY = worldY;
         // Calculate actor's current elevation (for vaulting/jumping)
         let elevation = 0;
         if (entity.isVaulting) {
            const totalTime = 0.35;
            const vaultTimer = entity.vaultTimer ?? 0;
            const progress = Math.max(0, Math.min(1, 1.0 - (vaultTimer / totalTime)));
            elevation = Math.sin(progress * Math.PI) * 0.4;
         }
         if (typeof entity.altitude === 'number' && entity.altitude > elevation) {
            elevation = entity.altitude;
         }
         item.elevation = elevation;
         // Distance from camera to actor's feet (anchor point)
         // This is the correct metric because the perspective system
         // leans everything away from the camera relative to feet
         const dx = worldX - camX;
         const dy = worldY - camY;
         item.distSq = dx * dx + dy * dy;
      }
   }
   for (let i = 0; i < itemCount; i++) {
      const item = renderList[i];
      if (item.type === 'wall') {
         item.elevation = 0;
      }
   }
   renderList.length = itemCount;
   renderList.sort((a, b) => {
      if (a.type === 'actor' && b.type === 'tree' && a.elevation > 0.1 && a.elevation > b.height) return -1;
      if (b.type === 'actor' && a.type === 'tree' && b.elevation > 0.1 && b.elevation > a.height) return 1;
      return b.distSq - a.distSq;
   });
   for (const item of renderList) {
      if (item.type === 'actor') { drawEntity(item.entity, deltaTime); continue; }
      const { gridX, gridY, cell, screenX, screenY, height, z } = item;
      const biome = getBiomeById(cell.regionId);
      const regionId = cell.regionId || 0;
      const ratio = height / Math.max(0.1, LIGHT_FX.HEIGHT_CAMERA - height);
      const rawDx = screenX + cellPixelW * 0.5 - screenCamX;
      const rawDy = screenY + cellPixelH * 0.5 - screenCamY;
      const shiftX = rawDx * ratio;
      const shiftY = rawDy * ratio;
      const projX = screenX + shiftX;
      const projY = screenY + shiftY;
      const projW = cellPixelW * (1 + ratio);
      const projH = cellPixelH * (1 + ratio);
      const dirX = shiftX / (ratio || 1);
      const dirY = shiftY / (ratio || 1);
      const dirs = [dirX, dirY];
      const bX = [screenX, screenX + cellPixelW];
      const bY = [screenY, screenY + cellPixelH];
      const pX = [projX, projX + projW];
      const pY = [projY, projY + projH];
      for (let i = 0; i < 4; i++) {
         const f = WALL_FACES[i];
         const val = dirs[f.dim];
         if ((f.sgn < 0 ? val < 0 : val > 0) && getWallHeight(gridX + f.dx, gridY + f.dy) < height) {
            drawWallFace(ctx,
               bX[f.c[0]], bY[f.c[1]], bX[f.c[2]], bY[f.c[3]],
               pX[f.c[0]], pY[f.c[1]], pX[f.c[2]], pY[f.c[3]],
               biome, cell.type,
               LIGHT_FX.AMBIENT_LIGHT,
               LIGHT_FX.AMBIENT_LIGHT,
               LIGHT_FX.AMBIENT_LIGHT,
               z, gridX, gridY, regionId
            );
         }
      }
      let style, color, outline;
      if (cell.type === 'tree') {
         style = biome.obstacle;
         color = biome.obstacleColor;
         outline = null;
      } else {
         style = biome.wall.style;
         color = biome.wall.color;
         outline = 'roof';
      }
      const roofTex = getWorldTile(gridX, gridY, cell.type, style, color, outline, regionId, true);
      const roofX = Math.round(projX);
      const roofY = Math.round(projY);
      const roofW = Math.round(projX + projW - roofX);
      const roofH = Math.round(projY + projH - roofY);
      ctx.drawImage(roofTex, roofX, roofY, roofW, roofH);
      const dist3D = Math.sqrt((cameraWorldX - (gridX + 0.5)) ** 2 + (cameraWorldY - (gridY + 0.5)) ** 2 + Math.max(1, LIGHT_FX.HEIGHT_LIGHT_Z - height) ** 2);
      let lightValue = 0;
      if (dist3D < LIGHT_CONFIG.distance && isPointLit(gridX + 0.5, gridY + 0.5)) { lightValue = (1 - dist3D / LIGHT_CONFIG.distance) ** 2 * (0.25 + LIGHT_FX.AMBIENT_LIGHT * 0.25); }
      const shade = (1 - Math.max(LIGHT_FX.AMBIENT_LIGHT, lightValue)) * LIGHT_FX.SHADOW_OPACITY;
      if (shade > 0.01) {
         ctx.fillStyle = `rgba(${LIGHT_FX.SHADOW_RGB}, ${shade})`;
         ctx.fillRect(roofX, roofY, roofW, roofH);
      }
   }
}

const LightingRenderer = {
   draw(mainCtx, actors, deltaTime) {
      viewportX = viewport.x;
      viewportY = viewport.y;
      lightDistSq = LIGHT_CONFIG.distance ** 2;
      cameraWorldX = (character.renderX ?? character.x) + 0.5;
      cameraWorldY = (character.renderY ?? character.y) + 0.5;

      // 1. SETUP SHADOW BUFFER
      const shadowW = Math.floor(mainCtx.canvas.width * LIGHT_CONFIG.resolution);
      const shadowH = Math.floor(mainCtx.canvas.height * LIGHT_CONFIG.resolution);
      if (shadowCanvas.width !== shadowW || shadowCanvas.height !== shadowH) {
         shadowCanvas.width = shadowW;
         shadowCanvas.height = shadowH;
      }
      
      // Calculate sizes for the Shadow Buffer
      cellPixelW = viewport.width > 0 ? shadowCanvas.width / viewport.width : 0;
      cellPixelH = viewport.height > 0 ? shadowCanvas.height / viewport.height : 0;

      // 2. RENDER SHADOWS
      const visPointCount = computeVisibilityPolygon({ x: cameraWorldX - 0.5, y: cameraWorldY - 0.5 }, LIGHT_CONFIG.distance);
      shadowCtx.clearRect(0, 0, shadowW, shadowH);
      renderFloorShadows(shadowCtx, visPointCount);

      // 3. DRAW FLOOR TINT
      if (LIGHT_FX.AMBIENT_LIGHT < 0.8) {
         const tintStrength = Math.min(0.7, 0.8 - LIGHT_FX.AMBIENT_LIGHT);
         mainCtx.fillStyle = `rgba(0, 0, 0, ${tintStrength})`;
         mainCtx.fillRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
      }

      // 4. RENDER SCENE
      cellPixelW = mainCtx.canvas.width / viewport.width;
      cellPixelH = mainCtx.canvas.height / viewport.height;
      renderScene(mainCtx, actors, deltaTime);

      // 5. DRAW SHADOW OVERLAY
      mainCtx.drawImage(shadowCanvas, 0, 0, mainCtx.canvas.width, mainCtx.canvas.height);

      // 6. POST
      const sunGradient = mainCtx.createLinearGradient(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
      sunGradient.addColorStop(0, LIGHT_FX.SUNLIGHT_COLOR);
      sunGradient.addColorStop(1, 'rgba(0,0,0,0)');
      mainCtx.fillStyle = sunGradient;
      mainCtx.fillRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);

      if (LIGHT_FX.SCANLINE_OPACITY > 0.01) {
         mainCtx.fillStyle = `rgba(0,0,0,${LIGHT_FX.SCANLINE_OPACITY})`;
         for (let y = 0; y < mainCtx.canvas.height; y += 4) { mainCtx.fillRect(0, y, mainCtx.canvas.width, 2); }
      }

      if (LIGHT_FX.VIGNETTE_STRENGTH > 0.01) {
         const cx = mainCtx.canvas.width / 2;
         const cy = mainCtx.canvas.height / 2;
         const radius = Math.hypot(cx, cy);
         const vignette = mainCtx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
         vignette.addColorStop(0, 'rgba(0,0,0,0)');
         vignette.addColorStop(1, `rgba(0,0,0,${LIGHT_FX.VIGNETTE_STRENGTH})`);
         mainCtx.fillStyle = vignette;
         mainCtx.fillRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
      }
   },
   setBrightness: setGlobalBrightness
};

function drawScene(actors, deltaTime) {
   maskCanvas.width = elements.canvas.width;
   maskCanvas.height = elements.canvas.height;
   LightingRenderer.draw(elements.ctx, actors, deltaTime);
}