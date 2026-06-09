import { installGameSurfaceProfileProvider } from "../Config/procedural/bootstrap.js";
import { getGameWorldSurfaceSettings, installGameWorldSurfaceSettings, TILE_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { configureTileWorkerCoordinator } from "../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { clearInteractionPairFilterCache } from "./GamePorts.js";
import { peekGameState } from "../GameState/GameState.js";
import { resolvePerspectiveConfig, setCameraHeight, setPerspectiveStrength } from "./GamePerspective.js";
import { applyGameProceduralDesign, resolveProceduralAnimationSettings, resolveProceduralBakeSettings } from "./GameProceduralDesign.js";
/** @typedef {import("./GameDefinitionTypes.js").GameDefinition} GameDefinition */
let workersConfigured = false;
/**
 * Single engine bootstrap: surface profiles, workers, procedural defaults, perspective, world-surface settings.
 * Called from createGame (and dev tools that skip createGame).
 *
 * @param {GameDefinition} definition
 */
export function bootstrapEngine(definition) {
    clearInteractionPairFilterCache();
    installGameSurfaceProfileProvider(definition);
    if (!workersConfigured) {
        configureTileWorkerCoordinator({ workerUrl: TILE_WORKER_URL });
        workersConfigured = true;
    }
    applyGameProceduralDesign(definition);
    const perspective = resolvePerspectiveConfig(definition);
    setCameraHeight(perspective.cameraHeight);
    setPerspectiveStrength(perspective.strength);
    installGameWorldSurfaceSettings({
        cameraHeight: perspective.cameraHeight,
        pixelsPerCell: definition?.worldSurface?.pixelsPerCell,
        wallHeight: definition?.worldSurface?.wallHeight,
        ...resolveProceduralAnimationSettings(definition),
        ...resolveProceduralBakeSettings(definition),
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
    const keysToCheck = ["groundChunkAnimationsOn", "wallAnimationsOn", "animationBakeMaxFrames", "animationFrameBatchSize", "pixelsPerCell", "wallHeight", "cameraHeight"];
    const bakeSettingsChanged = keysToCheck.some((key) => prev[key] !== settings[key]) || JSON.stringify(prev.roofZLevels ?? []) !== JSON.stringify(settings.roofZLevels ?? []);
    engine.settings = settings;
    if (bakeSettingsChanged) engine.clear();
}
