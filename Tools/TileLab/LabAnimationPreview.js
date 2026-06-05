import { paintPixelArea } from "../../Render/WorldSurface/WorldSurfacePainter.js";
import { resolveBakeProfile, getAnimationDuration } from "../../Render/WorldSurface/ProfileBakeResolver.js";
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
            // Draw once and stop ticking if no animation
            if (forceDraw || lastDrawTime === 0) {
                drawFrame(profile, 0);
                lastDrawTime = timestamp;
            }
            return;
        }

        const delta = timestamp - lastDrawTime;
        // Cap updates to ~30fps to save resources (or 60fps if desired, 30fps is ~33ms)
        if (forceDraw || delta > 32 || lastDrawTime === 0) {
            const duration = getAnimationDuration(profile.animation);
            // Advance gameTime only by actual elapsed time, not full timestamp
            if (!forceDraw || delta <= 32) {
                lastGameTime = (lastGameTime + delta) % duration;
            }
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
