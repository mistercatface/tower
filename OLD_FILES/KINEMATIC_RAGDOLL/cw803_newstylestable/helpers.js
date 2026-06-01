function getIndex(x, y) {
   return y * GRID_WIDTH + x;
}

function getXY(index) {
   const x = index % GRID_WIDTH;
   const y = Math.floor(index / GRID_WIDTH);
   return [x, y];
}

function getCell(x, y) {
   return cells[getIndex(x, y)];
}

function inBounds(x, y) { 
   return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

function randInt(min, max) {
   return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomArray(arr) {
    const randomIndex = Math.floor(Math.random() * arr.length);
    return arr[randomIndex];
}