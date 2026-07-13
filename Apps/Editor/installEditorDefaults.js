import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { replaceRecordContents } from "../../Libraries/Config/mergeConfig.js";
import { DEFAULT_CAMERA_HEIGHT, DEFAULT_PERSPECTIVE_STRENGTH } from "../../Libraries/Viewport/Viewport.js";
import { collisionSettings, LIBRARY_COLLISION_DEFAULTS, physicsSettings, LIBRARY_PHYSICS_DEFAULTS } from "../../Libraries/Physics/physics.js";
import { propQuantizeSteps, LIBRARY_PROP_QUANTIZE_STEPS } from "../../Libraries/Props/props.js";
import { gameWorldSurfaceSettings, replaceGameWorldSurfaceSettings, TILE_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { configureTileWorkerCoordinator, TileWorkerCoordinator } from "../../Libraries/WorldSurface/worldSurface.js";
import { clearPropSpriteCache } from "../../Libraries/Canvas/canvas.js";
const EDITOR_DEFAULT_SURFACE_PROFILE_ID = SURFACE_PROFILE_ID.tomatoGarden;
let workersConfigured = false;
/** Editor boot — reset module settings and wire live worldSurfaces. */
export function installEditorDefaults(state) {
    if (!workersConfigured) {
        configureTileWorkerCoordinator({ workerUrl: TILE_WORKER_URL });
        workersConfigured = true;
    }
    const prevCameraHeight = state.viewport.cameraHeight;
    state.viewport.applyPerspective(DEFAULT_CAMERA_HEIGHT, DEFAULT_PERSPECTIVE_STRENGTH);
    replaceGameWorldSurfaceSettings({});
    replaceRecordContents(collisionSettings, structuredClone(LIBRARY_COLLISION_DEFAULTS));
    replaceRecordContents(physicsSettings, structuredClone(LIBRARY_PHYSICS_DEFAULTS));
    replaceRecordContents(propQuantizeSteps, structuredClone(LIBRARY_PROP_QUANTIZE_STEPS));
    clearPropSpriteCache();
    const worldSurfaces = state.worldSurfaces;
    const settings = gameWorldSurfaceSettings;
    const prev = worldSurfaces.settings;
    const keysToCheck = ["animationBakeMaxFrames", "surfaceBakeScale", "wallHeightCells", "cellSize", "cellsPerChunk", "surfaceTilePeriodCells", "surfaceTilePeriodPx"];
    const bakeSettingsChanged = keysToCheck.some((key) => prev[key] !== settings[key]) || prevCameraHeight !== state.viewport.cameraHeight || JSON.stringify(prev.roofZLevels ?? []) !== JSON.stringify(settings.roofZLevels ?? []);
    worldSurfaces.settings = settings;
    worldSurfaces.activeSurfaceProfileId = EDITOR_DEFAULT_SURFACE_PROFILE_ID;
    void TileWorkerCoordinator.syncBakeConstants(settings);
    if (bakeSettingsChanged) worldSurfaces.clearBakeCache();
}
