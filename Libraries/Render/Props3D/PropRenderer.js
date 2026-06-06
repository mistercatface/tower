/** @typedef {(ctx: CanvasRenderingContext2D, prop: object, px: number, py: number) => void} PropDrawRecipe */
import { blitAnchoredSprite, getOrBakePropSprite } from "../../Canvas/QuantizedSpriteCache.js";
export class PropRenderer {
    /** @param {Record<string, PropDrawRecipe>} [propRecipes] */
    constructor(propRecipes = {}) {
        this.propRecipes = propRecipes;
    }
    /** @param {Record<string, PropDrawRecipe>} propRecipes */
    setPropRecipes(propRecipes) {
        this.propRecipes = propRecipes ?? {};
    }
    drawProp(ctx, prop, px, py, options = {}) {
        const renderKey = prop.getRender3DKey?.() ?? prop.strategy?.render3DKey;
        const draw = this.propRecipes[renderKey];
        if (!draw) return;
        const animFrame = options.animFrame ?? 0;
        const sprite = getOrBakePropSprite({ prop, px, py, renderKey, draw, animFrame });
        blitAnchoredSprite(ctx, sprite, prop.x, prop.y, { opacity: prop.opacity ?? 1 });
    }
}
