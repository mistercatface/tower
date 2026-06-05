/** @typedef {(ctx: CanvasRenderingContext2D, prop: object, px: number, py: number) => void} PropDrawRecipe */

export class PropRenderer {
    /** @param {Record<string, PropDrawRecipe>} [propRecipes] */
    constructor(propRecipes = {}) {
        this.propRecipes = propRecipes;
    }

    /** @param {Record<string, PropDrawRecipe>} propRecipes */
    setPropRecipes(propRecipes) {
        this.propRecipes = propRecipes ?? {};
    }

    drawProp(ctx, prop, px, py) {
        const renderKey = prop.getRender3DKey?.() ?? prop.strategy?.render3DKey;
        const draw = this.propRecipes[renderKey];
        if (!draw) return;

        ctx.save();
        draw(ctx, prop, px, py);
        ctx.restore();
    }
}
