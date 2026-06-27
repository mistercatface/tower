import { SURFACE_PROFILE_ID } from "../Config/procedural/profileIds.js";
import { mergeObjectTree, replaceRecordContents } from "../Libraries/Config/mergeConfig.js";
import { resolvePerspectiveConfig } from "./GamePerspective.js";
import { activeProceduralDesign, resolveProceduralDesignConfig, resolveProceduralBakeSettings } from "./GameProceduralDesign.js";
import { collisionSettings, LIBRARY_COLLISION_DEFAULTS } from "../Libraries/Collision/collisionDefaults.js";
import { physicsSettings, LIBRARY_PHYSICS_DEFAULTS } from "../Libraries/Motion/physicsDefaults.js";
import { setPropPixelSize, resolvePropPixelSize } from "./GamePropPixelSize.js";
import { propQuantizeSteps, LIBRARY_PROP_QUANTIZE_STEPS } from "../Libraries/Props/propRenderDefaults.js";
import { gameWorldSurfaceSettings, replaceGameWorldSurfaceSettings, TILE_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { configureTileWorkerCoordinator, TileWorkerCoordinator } from "../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { clearPropSpriteCache } from "../Libraries/Canvas/QuantizedSpriteCache.js";
const EDITOR_DEFAULT_SURFACE_PROFILE_ID = SURFACE_PROFILE_ID.tomatoGarden;
let workersConfigured = false;
/** Editor boot — merges editor profile into module-level settings, then wires live worldSurfaces. */
export function installEditorDefaults(state) {
    const profile = { id: "editor", proceduralDesign: { surfaceProfileId: EDITOR_DEFAULT_SURFACE_PROFILE_ID } };
    if (!workersConfigured) {
        configureTileWorkerCoordinator({ workerUrl: TILE_WORKER_URL });
        workersConfigured = true;
    }
    activeProceduralDesign.current = resolveProceduralDesignConfig(profile);
    const activeSurfaceProfileId = activeProceduralDesign.current?.defaultSurfaceProfileId ?? EDITOR_DEFAULT_SURFACE_PROFILE_ID;
    const perspective = resolvePerspectiveConfig(profile);
    const prevCameraHeight = state.viewport.cameraHeight;
    state.viewport.applyPerspectiveConfig(perspective);
    replaceGameWorldSurfaceSettings({ wallHeightCells: profile.worldSurface?.wallHeightCells, ...resolveProceduralBakeSettings(profile) });
    replaceRecordContents(collisionSettings, mergeObjectTree(LIBRARY_COLLISION_DEFAULTS, profile?.collisionSettings));
    replaceRecordContents(physicsSettings, mergeObjectTree(LIBRARY_PHYSICS_DEFAULTS, profile?.physicsSettings));
    const facing = profile?.propQuantizeSteps?.facing;
    replaceRecordContents(propQuantizeSteps, { facing: facing != null ? facing : LIBRARY_PROP_QUANTIZE_STEPS.facing });
    setPropPixelSize(resolvePropPixelSize(profile));
    clearPropSpriteCache();
    const worldSurfaces = state.worldSurfaces;
    const settings = gameWorldSurfaceSettings;
    const prev = worldSurfaces.settings;
    const keysToCheck = ["animationBakeMaxFrames", "surfaceBakeScale", "wallHeightCells", "cellSize", "cellsPerChunk", "surfaceTilePeriodCells", "surfaceTilePeriodPx"];
    const bakeSettingsChanged =
        keysToCheck.some((key) => prev[key] !== settings[key]) ||
        prevCameraHeight !== state.viewport.cameraHeight ||
        JSON.stringify(prev.roofZLevels ?? []) !== JSON.stringify(settings.roofZLevels ?? []);
    worldSurfaces.settings = settings;
    worldSurfaces.activeSurfaceProfileId = activeSurfaceProfileId;
    void TileWorkerCoordinator.syncBakeConstants(settings);
    if (bakeSettingsChanged) worldSurfaces.clearBakeCache();
}
