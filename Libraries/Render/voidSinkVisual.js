import { clamp, lerp } from "../Math/Interpolate.js";
import { DEFAULT_PIT_DEPTH } from "../Spatial/zones/pit.js";
import { CAMERA_HEIGHT, PERSPECTIVE_STRENGTH, projectWorldPointAtHeight } from "../Spatial/iso/IsometricProjection.js";
/** @type {import("../Spatial/iso/ElevationCamera.js").ElevationCamera} */
const sVoidSinkCamera = { viewerX: 0, viewerY: 0, cameraHeight: CAMERA_HEIGHT, strength: PERSPECTIVE_STRENGTH };
/** @param {object} pickup @param {object} viewport @returns {import("./spriteDrawModifier.js").SpriteDrawModifier | null} */
export function resolveVoidSinkDrawModifier(pickup, viewport) {
    if (!pickup.voidCaptured || pickup.voidX == null || pickup.voidY == null) return null;
    const voidDepth = pickup.voidDepth ?? DEFAULT_PIT_DEPTH;
    const sinkZ = pickup.voidSinkZ ?? 0;
    const sinkT = voidDepth > 0 ? clamp(sinkZ / voidDepth, 0, 1) : 0;
    const height = -sinkZ;
    sVoidSinkCamera.viewerX = viewport.x;
    sVoidSinkCamera.viewerY = viewport.y;
    const projected = projectWorldPointAtHeight(pickup.x, pickup.y, height, sVoidSinkCamera);
    const scale = CAMERA_HEIGHT / (CAMERA_HEIGHT - height);
    return { clipCircle: { cx: pickup.voidX, cy: pickup.voidY, r: pickup.voidRadius }, alpha: lerp(1, 0, sinkT), scale, drawX: projected.x, drawY: projected.y };
}
