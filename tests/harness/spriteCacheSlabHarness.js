import { createSpriteCacheSlab } from "../../Core/engineMemory.js";
import { SpriteCacheSlab } from "../../Libraries/Canvas/canvas.js";

export function createTestSpriteCacheSlab(capacity) {
    const slab = createSpriteCacheSlab(capacity);
    Object.setPrototypeOf(slab, SpriteCacheSlab.prototype);
    return slab;
}
