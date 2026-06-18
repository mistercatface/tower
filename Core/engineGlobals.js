import { SURFACE_PROFILE_ID } from "../Config/procedural/profileIds.js";
import { applyGamePerspective, getActivePerspective } from "./GamePerspective.js";
import { applyGameProceduralDesign, resolveProceduralBakeSettings } from "./GameProceduralDesign.js";
import { applyGameCollisionSettings } from "./GameCollisionSettings.js";
import { applyGamePropPixelSize } from "./GamePropPixelSize.js";
import { applyGamePropQuantizeSettings } from "./GamePropQuantizeSettings.js";
import { installGameSurfaceProfileProvider } from "../Config/procedural/bootstrap.js";
import { getGameWorldSurfaceSettings, installGameWorldSurfaceSettings, TILE_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { configureTileWorkerCoordinator, TileWorkerCoordinator } from "../Libraries/WorldSurface/TileWorkerCoordinator.js";
const EDITOR_DEFAULT_SURFACE_PROFILE_ID = SURFACE_PROFILE_ID.tomatoGarden;
let workersConfigured = false;
/** Editor boot — one place for app constants; writes shared module globals once. */
export function installEditorDefaults(state) {
    const profile = { id: "editor", proceduralDesign: { surfaceProfileId: EDITOR_DEFAULT_SURFACE_PROFILE_ID } };
    installGameSurfaceProfileProvider(profile);
    if (!workersConfigured) {
        configureTileWorkerCoordinator({ workerUrl: TILE_WORKER_URL });
        workersConfigured = true;
    }
    applyGameProceduralDesign(profile);
    const prevCameraHeight = getActivePerspective().cameraHeight;
    applyGamePerspective(profile);
    installGameWorldSurfaceSettings({ wallHeightCells: profile.worldSurface?.wallHeightCells, ...resolveProceduralBakeSettings(profile) });
    applyGameCollisionSettings(profile);
    applyGamePropQuantizeSettings(profile);
    applyGamePropPixelSize(profile);
    const worldSurfaces = state.worldSurfaces;
    const settings = getGameWorldSurfaceSettings();
    const prev = worldSurfaces.settings;
    const keysToCheck = ["animationBakeMaxFrames", "surfaceBakeScale", "wallHeightCells", "cellSize", "cellsPerChunk"];
    const bakeSettingsChanged =
        keysToCheck.some((key) => prev[key] !== settings[key]) ||
        prevCameraHeight !== getActivePerspective().cameraHeight ||
        JSON.stringify(prev.roofZLevels ?? []) !== JSON.stringify(settings.roofZLevels ?? []);
    worldSurfaces.settings = settings;
    void TileWorkerCoordinator.syncBakeConstants(settings);
    if (bakeSettingsChanged) worldSurfaces.clear();
}
