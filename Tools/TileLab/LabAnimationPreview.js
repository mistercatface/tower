import { paintPixelArea } from "../../Libraries/WorldSurface/WorldSurfacePainter.js";
import { resolveBakeProfile, getAnimationDuration } from "../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
let rafId = null;
let currentProfileConfig = null;
let lastGameTime = 0;
let lastDrawTime = 0;
let isAnimationEnabled = false;
export function initAnimationPreview(canvas, getProfileConfig) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    let currentProfileStr = null;
    function tick(timestamp) {
        rafId = requestAnimationFrame(tick);
        const profile = getProfileConfig();
        if (!profile) return;
        let forceDraw = false;
        const profileStr = JSON.stringify(profile);
        if (profileStr !== currentProfileStr) {
            currentProfileStr = profileStr;
            isAnimationEnabled = Boolean(profile.animation);
            forceDraw = true;
        }
        if (!isAnimationEnabled) {
            if (forceDraw || lastDrawTime === 0) {
                drawFrame(profile, 0);
                lastDrawTime = timestamp;
            }
            return;
        }
        const delta = timestamp - lastDrawTime;
        if (forceDraw || delta > 32 || lastDrawTime === 0) {
            const duration = getAnimationDuration(profile.animation);
            if (!forceDraw || delta <= 32) lastGameTime = (lastGameTime + delta) % duration;
            drawFrame(profile, lastGameTime);
            lastDrawTime = timestamp;
        }
    }
    function drawFrame(baseProfile, gameTime) {
        const resolvedProfile = resolveBakeProfile(baseProfile, "__labAnimPreview__", { gameTime });
        const { cellSize } = getGameWorldSurfaceSettings();
        paintPixelArea(ctx, canvas.width, canvas.height, 0, 0, 42, { pixelsPerUnit: 2, cellSize }, resolvedProfile);
    }
    if (rafId !== null) cancelAnimationFrame(rafId);
    // Reset timers
    lastDrawTime = performance.now();
    lastGameTime = 0;
    // Start loop
    rafId = requestAnimationFrame(tick);
}
