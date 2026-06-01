const CHUNK_SIZE = 8;

let chunkCanvases = {};
let cachedBiome = {};

function renderWorldToCanvas() {
   chunkCanvases = {};
   cachedBiome = {};
}

function drawBackgroundChunks() {
   const ctx = elements.ctx;
   const { x: vx, y: vy, width: vw, height: vh } = viewport;
   const screenWidth = elements.canvas.width;
   const screenHeight = elements.canvas.height;
   const cellSizeX = screenWidth / vw;
   const cellSizeY = screenHeight / vh;
   const startChunkX = Math.floor(vx / CHUNK_SIZE);
   const startChunkY = Math.floor(vy / CHUNK_SIZE);
   const endChunkX = Math.ceil((vx + vw) / CHUNK_SIZE);
   const endChunkY = Math.ceil((vy + vh) / CHUNK_SIZE);
   for (let cy = startChunkY; cy < endChunkY; cy++) {
      for (let cx = startChunkX; cx < endChunkX; cx++) {
         const key = getIndex(cx, cy);
         if (!chunkCanvases[key]) { generateChunkCanvas(cx, cy); }
         const chunk = chunkCanvases[key];
         if (!chunk) continue;
         const sx = (cx * CHUNK_SIZE - vx) * cellSizeX;
         const sy = (cy * CHUNK_SIZE - vy) * cellSizeY;
         const sWidth = Math.ceil(CHUNK_SIZE * cellSizeX) + 1;
         const sHeight = Math.ceil(CHUNK_SIZE * cellSizeY) + 1;
         ctx.drawImage(chunk, sx, sy, sWidth, sHeight);
      }
   }
}

function generateChunkCanvas(cx, cy) {
   const key = getIndex(cx, cy);
   let chunkCanvas = chunkCanvases[key];
   if (!chunkCanvas) {
      chunkCanvas = document.createElement('canvas');
      chunkCanvas.width = CHUNK_SIZE * TILE_SIZE;
      chunkCanvas.height = CHUNK_SIZE * TILE_SIZE;
      chunkCanvases[key] = chunkCanvas;
   }
   const ctx = chunkCanvas.getContext('2d');
   ctx.imageSmoothingEnabled = false;
   const startX = cx * CHUNK_SIZE;
   const startY = cy * CHUNK_SIZE;
   ctx.clearRect(0, 0, chunkCanvas.width, chunkCanvas.height);
   ctx.fillStyle = '#050505';
   ctx.fillRect(0, 0, chunkCanvas.width, chunkCanvas.height);
   DRAW_LAYERS.forEach((layer, i) => {
      for (let y = 0; y < CHUNK_SIZE; y++) {
         for (let x = 0; x < CHUNK_SIZE; x++) {
            const wx = startX + x;
            const wy = startY + y;
            if (wx >= gridSize || wy >= gridSize) continue;
            const cell = cells[getIndex(wx, wy)];
            if (!cell) continue;
            const regionId = cell.regionId || 0;
            if (!cachedBiome[regionId]) cachedBiome[regionId] = getBiomeById(regionId);
            const biome = cachedBiome[regionId];
            const dx = x * TILE_SIZE;
            const dy = y * TILE_SIZE;
            if (i === 0 || cell.type === 'grass') {
               const tex = getWorldTile(wx, wy, 'floor', biome.grass.style, biome.grass.color, null, regionId, false);
               ctx.save();
               ctx.translate(dx + TILE_SIZE / 2, dy + TILE_SIZE / 2);
               if (wx % 2 === 0) ctx.rotate(Math.PI / 2);
               if (wy % 2 !== 0) ctx.scale(-1, 1);
               ctx.drawImage(tex, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
               ctx.restore();
            }
            else if (layer.includes('tree') && cell.type === 'tree') {
               if (!cell.treeDesign) {
                  if (biome.obstacle) {
                     cell.treeDesign = biome.obstacle;
                  } else {
                     const randIndex = Math.floor(Math.random() * ObstacleList.length);
                     cell.treeDesign = ObstacleList[randIndex];
                  }
               }
               let treeColor = null;
               if (biome.obstacle && cell.treeDesign === biome.obstacle && biome.obstacleColor) { treeColor = biome.obstacleColor; }
               const tex = getWorldTile(wx, wy, 'tree', cell.treeDesign, treeColor, null, regionId, false);
               ctx.drawImage(tex, dx, dy, TILE_SIZE, TILE_SIZE);
            }
            else if (layer.includes(cell.type) && images[cell.type]) {
               ctx.drawImage(images[cell.type], dx, dy, TILE_SIZE, TILE_SIZE);
            }
         }
      }
   });
}

function bakeRagdollToChunk(entity, sourceCanvas, offsetConfig) {
   if (!sourceCanvas || sourceCanvas.width === 0) return;
   
   const rigSize = offsetConfig.size; 
   const scale = TILE_SIZE / rigSize;
   
   let srcAnchorY;
   if (sourceCanvas.verticalShift !== undefined) {
      srcAnchorY = (sourceCanvas.height / 2) + sourceCanvas.verticalShift;
   } else {
      const padding = offsetConfig.padding || 0;
      const anchorYVal = offsetConfig.anchorY || 0.9;
      srcAnchorY = padding + (anchorYVal * rigSize);
   }
   
   const srcAnchorX = sourceCanvas.width / 2;
   const worldPixelX = (entity.renderX ?? entity.x) * TILE_SIZE + (TILE_SIZE / 2);
   const worldPixelY = (entity.renderY ?? entity.y) * TILE_SIZE + (TILE_SIZE / 2);
   
   const destGlobalX = Math.round(worldPixelX - (srcAnchorX * scale));
   const destGlobalY = Math.round(worldPixelY - (srcAnchorY * scale));
   
   // FIX 1: Round the width and height to integers to prevent sub-pixel scaling blur
   const drawWidth = Math.round(sourceCanvas.width * scale);
   const drawHeight = Math.round(sourceCanvas.height * scale);
   
   const chunkPixelSize = CHUNK_SIZE * TILE_SIZE;
   const startChunkX = Math.floor(destGlobalX / chunkPixelSize);
   const endChunkX = Math.floor((destGlobalX + drawWidth) / chunkPixelSize);
   const startChunkY = Math.floor(destGlobalY / chunkPixelSize);
   const endChunkY = Math.floor((destGlobalY + drawHeight) / chunkPixelSize);
   
   for (let cy = startChunkY; cy <= endChunkY; cy++) {
      for (let cx = startChunkX; cx <= endChunkX; cx++) {
         const key = getIndex(cx, cy);
         if (!chunkCanvases[key]) generateChunkCanvas(cx, cy);
         const chunk = chunkCanvases[key];
         const ctx = chunk.getContext('2d');
         
         // FIX 2: Disable smoothing specifically for this operation
         ctx.imageSmoothingEnabled = false; 
         
         const chunkX = cx * chunkPixelSize;
         const chunkY = cy * chunkPixelSize;
         
         ctx.drawImage(sourceCanvas, destGlobalX - chunkX, destGlobalY - chunkY, drawWidth, drawHeight);
      }
   }
}