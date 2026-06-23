/** @typedef {(ctx: CanvasRenderingContext2D, prop: object, px: number, py: number) => void} PropDrawRecipe */
import { blitAnchoredSprite, getOrBakePropSprite } from "../../Canvas/QuantizedSpriteCache.js";
import { resolveSpriteDrawModifier } from "../spriteDrawModifier.js";
export class PropRenderer {
    /** @param {Record<string, PropDrawRecipe>} [propRecipes] */
    constructor(propRecipes = {}) {
        this.propRecipes = propRecipes;
    }
    /** @param {Record<string, PropDrawRecipe>} propRecipes */
    setPropRecipes(propRecipes) {
        this.propRecipes = propRecipes ?? {};
    }
    drawProp(ctx, prop, px, py, zoom = 1, animFrame = 0) {
        const renderKey = prop.getRender3DKey?.() ?? prop.strategy?.render3DKey;
        const draw = this.propRecipes[renderKey];
        if (!draw) return;
        const sprite = getOrBakePropSprite({ prop, px, py, renderKey, draw, propRecipes: this.propRecipes, animFrame, zoom });
        const modifier = resolveSpriteDrawModifier(prop, px, py);
        blitAnchoredSprite(ctx, sprite, prop.x, prop.y, modifier);
    }
}
