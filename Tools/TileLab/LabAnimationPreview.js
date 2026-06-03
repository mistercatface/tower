import { paintPixelArea } from "../../Render/Floor/FloorTilePainter.js";
import { resolveBakeProfile, getAnimationDuration } from "../../Render/Floor/ProfileBakeResolver.js";
import { RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";

let rafId = null;
let currentProfileConfig = null;
let lastGameTime = 0;
let lastDrawTime = 0;
let isAnimationEnabled = false;

export function initAnimationPreview(canvas, getProfileConfig) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // A simple ticker that advances gameTime based on elapsed real time.
    function tick(timestamp) {
        rafId = requestAnimationFrame(tick);
        
        const profile = getProfileConfig();
        if (!profile) return;
        
        const enabled = Boolean(profile.animation?.enabled);
        if (enabled !== isAnimationEnabled) {
            isAnimationEnabled = enabled;
            // Force redraw immediately when animation is toggled
            lastDrawTime = 0; 
        }

        if (!isAnimationEnabled) {
            // Draw once and stop ticking if no animation
            if (lastDrawTime === 0) {
                drawFrame(profile, 0);
                lastDrawTime = timestamp;
            }
            return;
        }

        const delta = timestamp - lastDrawTime;
        // Cap updates to ~30fps to save resources (or 60fps if desired, 30fps is ~33ms)
        if (delta > 32 || lastDrawTime === 0) {
            const duration = getAnimationDuration(profile.animation);
            // Advance gameTime
            lastGameTime = (lastGameTime + delta) % duration;
            drawFrame(profile, lastGameTime);
            lastDrawTime = timestamp;
        }
    }

    function drawFrame(baseProfile, gameTime) {
        // Resolve interpolated values for this frame based on gameTime
        // We use an isolated profileKey so we don't clobber the main map's scratch cache.
        const resolvedProfile = resolveBakeProfile(baseProfile, "__labAnimPreview__", { gameTime });
        
        // Draw the isolated 256x256 floor directly to our secondary canvas.
        // We set pixelsPerUnit to 2 so the preview focuses on a smaller patch of tiles
        // rather than rendering 1000+ world units of the map.
        paintPixelArea(
            ctx, 
            canvas.width, 
            canvas.height, 
            0, 
            0, 
            42, // seed
            { pixelsPerUnit: 2 }, // options
            resolvedProfile
        );
    }

    if (rafId !== null) {
        cancelAnimationFrame(rafId);
    }
    
    // Reset timers
    lastDrawTime = performance.now();
    lastGameTime = 0;
    
    // Start loop
    rafId = requestAnimationFrame(tick);
}
