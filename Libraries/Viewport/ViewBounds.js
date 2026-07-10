import { aabbOverlapF32, centerHalfExtentsAabbF32, circleIntersectsAabbF32 } from "../Math/math.js";
export const VIEW_BOUNDS_PROPS_PAD_PX = 20;
export const VIEW_TIER = Object.freeze({ CLIP: 0, PROPS: 4, STRUCTURE: 8, CHUNKS: 12 });
export const VIEW_TIER_COUNT = 4;
export class ViewBounds {
    constructor() {
        this.buf = new Float32Array(VIEW_TIER_COUNT * 4);
        this.pad = new Float32Array(VIEW_TIER_COUNT);
        this.pad[1] = VIEW_BOUNDS_PROPS_PAD_PX;
    }
    configurePads(viewQueryPadPx, viewPaddingPx) {
        if (this.pad[2] === viewQueryPadPx && this.pad[3] === viewPaddingPx) return false;
        this.pad[2] = viewQueryPadPx;
        this.pad[3] = viewPaddingPx;
        return true;
    }
    recompute(centerX, centerY, halfW, halfH) {
        for (let i = 0; i < VIEW_TIER_COUNT; i++) centerHalfExtentsAabbF32(this.buf, i * 4, centerX, centerY, halfW, halfH, this.pad[i]);
    }
    circleInBounds(worldX, worldY, radius = 0, tierO = VIEW_TIER.PROPS) {
        return circleIntersectsAabbF32(worldX, worldY, radius, this.buf, tierO);
    }
    aabbInBounds(buf, o, tierO = VIEW_TIER.CLIP) {
        return aabbOverlapF32(buf, o, this.buf, tierO);
    }
}
