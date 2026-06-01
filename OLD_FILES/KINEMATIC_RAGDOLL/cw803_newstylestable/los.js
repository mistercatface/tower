function computeLineOfSightRay() {
   const radius = character.sightRadius;
   const px = character.endTile.x + 0.5;
   const py = character.endTile.y + 0.5;
   lastVisible.fill(0);
   lastVisible[getIndex(Math.floor(px), Math.floor(py))] = 1;
   const startX = px;
   const startY = py;
   for (let tx = Math.floor(px - radius); tx <= Math.floor(px + radius); tx++) {
      for (let ty = Math.floor(py - radius); ty <= Math.floor(py + radius); ty++) {
         if (!inBounds(tx, ty)) continue;
         const centerX = tx + 0.5;
         const centerY = ty + 0.5;
         const dx = centerX - startX;
         const dy = centerY - startY;
         const dist = Math.hypot(dx, dy);
         if (dist > radius) continue;
         let blocked = false;
         let prevTileX = Math.floor(startX);
         let prevTileY = Math.floor(startY);
         for (let i = 1; i <= dist; i++) {
            const wx = startX + (dx / dist) * i;
            const wy = startY + (dy / dist) * i;
            const tileX = Math.floor(wx);
            const tileY = Math.floor(wy);
            const key = getIndex(tileX, tileY);
            const col = ObstacleGrid[key];
            if (col) {
               lastVisible[key] = 1;
               cells[key].explored = true;
               blocked = true;
               break;
            }
            const deltaX = tileX - prevTileX;
            const deltaY = tileY - prevTileY;
            if (deltaX !== 0 && deltaY !== 0) {
               const neighbor1 = ObstacleGrid[getIndex(prevTileX + deltaX, prevTileY)];
               const neighbor2 = ObstacleGrid[getIndex(prevTileX, prevTileY + deltaY)];
               if (neighbor1 === 1 && neighbor2 === 1) {
                  blocked = true;
                  break;
               }
            }
            lastVisible[key] = 1;
            cells[key].explored = true;
            prevTileX = tileX;
            prevTileY = tileY;
         }
      }
   }
}
