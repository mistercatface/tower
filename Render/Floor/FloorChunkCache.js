import { floorTileSettings } from "../../Config/Config.js";
import { BakedFrameCache } from "./BakedFrameCache.js";

/** Floor chunk variant of the shared baked-frame cache (sized from config). */
export class FloorChunkCache extends BakedFrameCache {
    constructor(maxEntries = floorTileSettings.maxCachedChunks) {
        super(maxEntries);
    }
}
