import { gridSettings } from "../../Config/Config.js";
/** Square pixel size for WebM export (circular overlay viewport). */
export const exportOverlayPx = 384;
/** Max on-screen map preview box (CSS caps the stage; export uses exportOverlayPx). */
export const mapPreviewMaxPx = 420;
/** Same canvas footprint used for map spawn / node combat coords as a new game. */
export const mapGenCanvasBounds = { width: gridSettings.width, height: gridSettings.height };
