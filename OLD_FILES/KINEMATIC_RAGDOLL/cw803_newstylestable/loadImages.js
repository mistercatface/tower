let images = {};
//let grassImages = [];

//const def = (path, base) => ({ path, base });

const ASSET_DEFINITIONS = {
   //grass: def('sprites/grass.png'),
   //grasses:    def('sprites/dirt_walls.png'),
};

const texturePaths = Object.fromEntries(Object.entries(ASSET_DEFINITIONS).map(([key, d]) => [key, d.path]));

function sliceSpriteSheet(sheetImage, tileWidth, tileHeight) {
    const sprites = [];
    const numberOfSprites = Math.floor(sheetImage.width / tileWidth);
    for (let i = 0; i < numberOfSprites; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = tileWidth;
        canvas.height = tileHeight;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sheetImage, i * tileWidth, 0, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight );
        sprites.push(canvas);
    }
    return sprites;
}

function initializeImages(imgs) {
   images = imgs;
   elements.ctx.imageSmoothingEnabled = false;
   //if (images.grasses) { grassImages = sliceSpriteSheet(images.grasses, TILE_SIZE, TILE_SIZE); }
}

async function loadImages(imagePaths) {
   const promises = Object.entries(imagePaths).map(([key, src]) =>
      new Promise(resolve => {
         const img = new Image();
         img.onload = () => resolve([key, img]);
         img.src = src;
      })
   );
   return Promise.all(promises).then(Object.fromEntries);
}
