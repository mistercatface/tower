import { installGameSurfaceProfileProvider } from "../Config/procedural/bootstrap.js";
import { getGameWorldSurfaceSettings, installGameWorldSurfaceSettings, TILE_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { configureTileWorkerCoordinator } from "../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { clearInteractionPairFilterCache } from "./GamePorts.js";
import { peekGameState } from "../GameState/GameState.js";
import { applyGamePerspective } from "./GamePerspective.js";
import { applyGameProceduralDesign, resolveProceduralBakeSettings } from "./GameProceduralDesign.js";
/** @typedef {import("./GameDefinitionTypes.js").EngineProfile} EngineProfile */
let workersConfigured = false;
/**
 * Single engine bootstrap: surface profiles, workers, procedural defaults, perspective, world-surface settings.
 * Called from editor boot (`createEditorApp`) after `installGameState`.
 *
 * @param {EngineProfile} profile
 */
export function bootstrapEngine(profile) {
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
        pixelsPerCell: profile?.worldSurface?.pixelsPerCell,
        wallHeight: profile?.worldSurface?.wallHeight,
        ...resolveProceduralBakeSettings(profile),
    });
    const state = peekGameState();
    if (state) syncWorldSurfaceEngineSettings(state);
}
/** @param {import("../GameState/GameState.js").GameState} state */
function syncWorldSurfaceEngineSettings(state) {
    const engine = state.worldSurfaces;
    if (!engine) return;
    const settings = getGameWorldSurfaceSettings();
    const prev = engine.settings;
    const keysToCheck = ["animationBakeMaxFrames", "pixelsPerCell", "wallHeight", "cameraHeight"];
    const bakeSettingsChanged = keysToCheck.some((key) => prev[key] !== settings[key]) || JSON.stringify(prev.roofZLevels ?? []) !== JSON.stringify(settings.roofZLevels ?? []);
    engine.settings = settings;
    if (bakeSettingsChanged) engine.clear();
}
