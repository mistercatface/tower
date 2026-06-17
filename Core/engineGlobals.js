import { SURFACE_PROFILE_ID } from "../Config/procedural/profileIds.js";
import { clearInteractionPairFilterCache } from "./interactionPairFilters.js";
import { applyGamePerspective } from "./GamePerspective.js";
import { applyGameProceduralDesign, resolveProceduralBakeSettings } from "./GameProceduralDesign.js";
import { applyGameCollisionSettings } from "./GameCollisionSettings.js";
import { applyGamePropPixelSize } from "./GamePropPixelSize.js";
import { applyGamePropQuantizeSettings } from "./GamePropQuantizeSettings.js";
import { installGameSurfaceProfileProvider } from "../Config/procedural/bootstrap.js";
import { getGameWorldSurfaceSettings, installGameWorldSurfaceSettings, TILE_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { configureTileWorkerCoordinator } from "../Libraries/WorldSurface/TileWorkerCoordinator.js";
const EDITOR_PIXELS_PER_CELL = 6;
const EDITOR_DEFAULT_SURFACE_PROFILE_ID = SURFACE_PROFILE_ID.toxicSludge;
let workersConfigured = false;
/** Editor boot — one place for app constants; writes shared module globals once. */
export function installEditorDefaults(state) {
    const profile = { id: "editor", worldSurface: { pixelsPerCell: EDITOR_PIXELS_PER_CELL }, proceduralDesign: { surfaceProfileId: EDITOR_DEFAULT_SURFACE_PROFILE_ID } };
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
        pixelsPerCell: EDITOR_PIXELS_PER_CELL,
        wallHeight: profile.worldSurface.wallHeight,
        ...resolveProceduralBakeSettings(profile),
    });
    applyGameCollisionSettings(profile);
    applyGamePropQuantizeSettings(profile);
    applyGamePropPixelSize(profile);
    const worldSurfaces = state.worldSurfaces;
    const settings = getGameWorldSurfaceSettings();
    const prev = worldSurfaces.settings;
    const keysToCheck = ["animationBakeMaxFrames", "pixelsPerCell", "wallHeight", "cameraHeight"];
    const bakeSettingsChanged = keysToCheck.some((key) => prev[key] !== settings[key]) || JSON.stringify(prev.roofZLevels ?? []) !== JSON.stringify(settings.roofZLevels ?? []);
    worldSurfaces.settings = settings;
    if (bakeSettingsChanged) worldSurfaces.clear();
}
