/** @typedef {(ctx: CanvasRenderingContext2D, prop: object, px: number, py: number) => void} PropDrawRecipe */
import { worldPropRecipes } from "../../Props/PropCatalog.js";
import { drawCachedPropSprite } from "../../Canvas/QuantizedSpriteCache.js";
export class PropRenderer {
    drawProp(ctx, prop, px, py, zoom = 1, animFrame = 0) {
        const renderKey = prop.getRender3DKey?.() ?? prop.strategy?.render3DKey;
        const draw = worldPropRecipes[renderKey];
        if (!draw) return;
        drawCachedPropSprite(ctx, prop, px, py, renderKey, draw, animFrame, zoom);
    }
}
