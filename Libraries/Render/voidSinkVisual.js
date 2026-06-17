import { clamp, lerp } from "../Math/Interpolate.js";
import { DEFAULT_PIT_DEPTH } from "../Spatial/zones/pit.js";
import { elevationCameraFromViewer } from "../Spatial/iso/ElevationCamera.js";
import { projectWorldPointAtHeight } from "../Spatial/iso/IsometricProjection.js";
/** @param {object} prop @param {object} viewport @returns {import("./spriteDrawModifier.js").SpriteDrawModifier | null} */
export function resolveVoidSinkDrawModifier(prop, viewport) {
    if (!prop.voidCaptured || prop.voidX == null || prop.voidY == null) return null;
    const voidDepth = prop.voidDepth ?? DEFAULT_PIT_DEPTH;
    const sinkZ = prop.voidSinkZ ?? 0;
    const sinkT = voidDepth > 0 ? clamp(sinkZ / voidDepth, 0, 1) : 0;
    const height = -sinkZ;
    const camera = elevationCameraFromViewer(viewport.x, viewport.y);
    const projected = projectWorldPointAtHeight(prop.x, prop.y, height, camera);
    const scale = camera.cameraHeight / (camera.cameraHeight - height);
    return { clipCircle: { cx: prop.voidX, cy: prop.voidY, r: prop.voidRadius }, alpha: lerp(1, 0, sinkT), scale, drawX: projected.x, drawY: projected.y };
}
