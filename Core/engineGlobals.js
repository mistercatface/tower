import { clearInteractionPairFilterCache } from "./interactionPairFilters.js";
import { applyGamePerspective } from "./GamePerspective.js";
import { applyGameProceduralDesign, resolveProceduralBakeSettings } from "./GameProceduralDesign.js";
import { applyGameCollisionSettings } from "./GameCollisionSettings.js";
import { applyGamePropPixelSize } from "./GamePropPixelSize.js";
import { applyGamePropQuantizeSettings } from "./GamePropQuantizeSettings.js";
import { installGameSurfaceProfileProvider } from "../Config/procedural/bootstrap.js";
import { getGameWorldSurfaceSettings, installGameWorldSurfaceSettings, TILE_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { configureTileWorkerCoordinator } from "../Libraries/WorldSurface/TileWorkerCoordinator.js";
let workersConfigured = false;
/**
 * Configure shared engine module globals from the editor profile (once per boot).
 *
 * @param {import("./GameDefinitionTypes.js").EngineProfile} profile
 * @param {object | null} [state]
 */
export function installEngineGlobals(profile, state = null) {
    clearInteractionPairFilterCache();
    installGameSurfaceProfileProvider(profile);
    if (!workersConfigured) {
        configureTileWorkerCoordinator({ workerUrl: TILE_WORKER_URL });
        workersConfigured = true;
    }
    applyGameProceduralDesign(profile);
    const perspective = applyGamePerspective(profile);
    installGameWorldSurfaceSettings({
        cameraHeight: perspective.cameraHeight,
        pixelsPerCell: profile.worldSurface?.pixelsPerCell,
        wallHeight: profile.worldSurface?.wallHeight,
        ...resolveProceduralBakeSettings(profile),
    });
    applyGameCollisionSettings(profile);
    applyGamePropQuantizeSettings(profile);
    applyGamePropPixelSize(profile);
    if (!state?.worldSurfaces) return;
    const worldSurfaces = state.worldSurfaces;
    const settings = getGameWorldSurfaceSettings();
    const prev = worldSurfaces.settings;
    const keysToCheck = ["animationBakeMaxFrames", "pixelsPerCell", "wallHeight", "cameraHeight"];
    const bakeSettingsChanged = keysToCheck.some((key) => prev[key] !== settings[key]) || JSON.stringify(prev.roofZLevels ?? []) !== JSON.stringify(settings.roofZLevels ?? []);
    worldSurfaces.settings = settings;
    if (bakeSettingsChanged) worldSurfaces.clear();
}
