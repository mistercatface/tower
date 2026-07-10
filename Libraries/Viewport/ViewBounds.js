import { aabbOverlapF32, centerHalfExtentsAabbF32, circleIntersectsAabbF32 } from "../Math/math.js";
export const VIEW_BOUNDS_PROPS_PAD_PX = 20;
/** @typedef {"clip" | "props" | "structure" | "chunks"} ViewBoundsTier */
const VIEW_BOUNDS_TIER_ORDER = ["clip", "props", "structure", "chunks"];
const VIEW_BOUNDS_TIER_OFFSET = { clip: 0, props: 4, structure: 8, chunks: 12 };
const VIEW_BOUNDS_TIER_PAD = { clip: () => 0, props: () => VIEW_BOUNDS_PROPS_PAD_PX, structure: (viewBounds) => viewBounds.viewQueryPadPx, chunks: (viewBounds) => viewBounds.viewPaddingPx };
export class ViewBounds {
    constructor() {
        this.viewQueryPadPx = 0;
        this.viewPaddingPx = 0;
        this._bounds = new Float32Array(16);
    }
    configurePads(viewQueryPadPx, viewPaddingPx) {
        if (this.viewQueryPadPx === viewQueryPadPx && this.viewPaddingPx === viewPaddingPx) return false;
        this.viewQueryPadPx = viewQueryPadPx;
        this.viewPaddingPx = viewPaddingPx;
        return true;
    }
    recompute(centerX, centerY, halfW, halfH) {
        for (let i = 0; i < VIEW_BOUNDS_TIER_ORDER.length; i++) {
            const tier = VIEW_BOUNDS_TIER_ORDER[i];
            const o = VIEW_BOUNDS_TIER_OFFSET[tier];
            centerHalfExtentsAabbF32(this._bounds, o, centerX, centerY, halfW, halfH, VIEW_BOUNDS_TIER_PAD[tier](this));
        }
    }
    boundsF32(tier) {
        return { buf: this._bounds, o: VIEW_BOUNDS_TIER_OFFSET[tier] };
    }
    circleInBoundsF32(worldX, worldY, radius = 0, tier = "props") {
        return circleIntersectsAabbF32(worldX, worldY, radius, this._bounds, VIEW_BOUNDS_TIER_OFFSET[tier]);
    }
    aabbInBoundsF32(buf, o, tier = "clip") {
        return aabbOverlapF32(buf, o, this._bounds, VIEW_BOUNDS_TIER_OFFSET[tier]);
    }
}
