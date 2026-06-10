import { createRoguelikeWorldGenPort, roguelikeProceduralDesign, ROGUELIKE_MAP_TOPOLOGY } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { emptyRunBootstrap } from "../../Libraries/RunBootstrap/phases.js";
import { GUN_ID_TO_VISUAL } from "../../Assets/guns/visualMap.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { createWeaponVisuals } from "../../Libraries/Render/Characters/weapons/createWeaponVisuals.js";
import { getGameState } from "../../GameState/GameState.js";
import { createCombatWallResolver } from "../../Systems/Motion/createCombatWallResolver.js";
import { applyLabCanvasSize } from "./ui/labCanvas.js";
import { createSandboxCombatFeature } from "../../Libraries/Combat/createSandboxCombatFeature.js";
import { createFloatingTextFeature } from "../../Libraries/Render/createFloatingTextFeature.js";
import { SharedGameState } from "../../GameState/SharedGameState.js";
import { createRoguelikeNavRuntime } from "../../Libraries/Navigation/createRoguelikeNavRuntime.js";
import { createRoguelikeMapSession } from "../../Libraries/WorldGen/session/index.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";
import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { gameSceneTickPhase, pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { tilelabGroundZoneEffectPass, tilelabGroundZonePhase } from "./groundZones.js";
import { sandboxVoidZoneEffectPass, sandboxVoidZonePhase } from "./sandboxVoidZones.js";
import { getTilelabSandboxController } from "./world/tilelabSandbox.js";
import { requestUiUpdate } from "../../Core/EventSystem.js";
import { getRunScenePort, getSimulationPort } from "../../Core/GamePorts.js";
import { registerEditorProfiles, renderTilelabPreview } from "./ui/preview.js";
import { readControls, syncPreviewZoomToStage } from "./ui/toolbar.js";
import { initEmptyTilelabMap } from "./world/mapWorld.js";
import { mergePairFilter } from "../../Libraries/Interaction/pairRules.js";
import { excludeDeadOther, excludeActorOther, requirePickupOnHit } from "../../Libraries/Interaction/pairRuleClauses.js";
import { tilelabUiPort } from "./ui/tilelabUiPort.js";
import { sandboxPathEffectPass } from "./render/sandboxPathEffectPass.js";
import { drawSandboxAssemblySurfaces } from "../../Libraries/Sandbox/assemblySurfaceDraw.js";
export const LAB_PREVIEW_RANGE = 160;
export const TILELAB_SANDBOX_SPAWN_PROP = "beach_ball";
export const tilelabMapTopology = { ...ROGUELIKE_MAP_TOPOLOGY };
const SANDBOX_PROJECTILE_HIT_PICKUP = mergePairFilter(excludeDeadOther, excludeActorOther, requirePickupOnHit);
export const tilelabInteractionPairs = { projectileHitPickup: SANDBOX_PROJECTILE_HIT_PICKUP };
const sandboxTickPhase = {
    id: "sandboxTick",
    run(ctx, dt) {
        getTilelabSandboxController()?.tick(dt);
    },
};
export const tilelabSimulation = createSimulationPort([sandboxTickPhase, pushablePhysicsPhase, sandboxVoidZonePhase, tilelabGroundZonePhase, gameSceneTickPhase]);
/** @type {import("../../Core/GameDefinitionTypes.js").RunScenePort} */
export const tilelabRunScenePort = {
    getLayout: () => null,
    onSimulationEnter(ctx) {
        const { state } = ctx;
        initEmptyTilelabMap(state);
        registerEditorProfiles(state).then(() => {
            syncPreviewZoomToStage(state);
        });
    },
    onTick() {},
};
export class TileLabGameState extends SharedGameState {
    constructor() {
        super();
        createRoguelikeNavRuntime(this);
        const rand = Math.floor(1 + Math.random() * 1000000000);
        this.mapSeed = rand;
        this.floorSeed = rand;
        this._pendingProfileRefresh = false;
        this.labShowSandboxPanel = true;
        this.labShowProfilePanel = true;
        this.labShowTopologyOverlay = false;
        this.labShowAnimationPreview = true;
        this.viewport = new Viewport(0, 0, 1);
        this.labCanvas = null;
        this.groundZones = [];
        this.sandboxVoidZones = [];
        this.sandboxSurfaceProfileZones = [];
        this.sandboxAssemblyInstances = [];
        this.roguelikeMapSession = createRoguelikeMapSession();
        this.wallResolver = createCombatWallResolver(() => getGameState());
    }
}
export class TileLabSimulationState {
    onEnter(ctx) {
        getRunScenePort().onSimulationEnter(ctx);
        requestUiUpdate();
    }
    update(dt, ctx) {
        if (ctx.state.isPaused) return;
        getSimulationPort().runTick(ctx, dt);
    }
    render(ctx) {
        renderTilelabPreview(ctx.state, readControls(ctx.state));
    }
}
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
export const editorGame = {
    id: "editor",
    canvasId: "gameCanvas",
    features: [...createSandboxCombatFeature(), createFloatingTextFeature()],
    createGameState() {
        return new TileLabGameState();
    },
    states: { simulation: TileLabSimulationState },
    initialState: "simulation",
    simulationPort: tilelabSimulation,
    uiPort: tilelabUiPort,
    render: {
        ...createDefaultRenderPorts({ weaponVisuals: createWeaponVisuals(GUN_ID_TO_VISUAL) }),
        drawGroundOverlays: (state, viewport, ctx) => drawSandboxAssemblySurfaces(ctx, state, viewport),
        simulationEffectPasses: [sandboxVoidZoneEffectPass, tilelabGroundZoneEffectPass, sandboxPathEffectPass],
    },
    worldGen: createRoguelikeWorldGenPort({ topology: tilelabMapTopology }),
    worldSurface: { pixelsPerCell: 6 },
    proceduralDesign: roguelikeProceduralDesign,
    runBootstrapPort: emptyRunBootstrap,
    runScenePort: tilelabRunScenePort,
    viewPort: {
        getViewCenter(state) {
            const viewport = state.viewport;
            return viewport ? { x: viewport.x, y: viewport.y } : null;
        },
    },
    onCanvasResize() {
        const state = getGameState();
        const canvas = state?.labCanvas;
        if (!canvas) return;
        applyLabCanvasSize(state, canvas.width, canvas.height);
    },
    prepare() {
        document.title = "Editor";
        document.body.classList.add("shell-tilelab");
        if (!document.getElementById("tilelab-css")) {
            const link = document.createElement("link");
            link.id = "tilelab-css";
            link.rel = "stylesheet";
            link.href = new URL("./tilelab.css", import.meta.url).href;
            document.head.appendChild(link);
        }
    },
};
