import { createRoguelikeWorldGenPort, roguelikeProceduralDesign } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { GUN_ID_TO_VISUAL } from "../../Assets/guns/visualMap.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { createWeaponVisuals } from "../../Libraries/Render/Characters/weapons/createWeaponVisuals.js";
import { getGameState } from "../../GameState/GameState.js";
import { pickupStates } from "../../Entities/PickupStates.js";
import { combatPickupStates } from "../../Entities/pickupCombatStates.js";
import { drawSandboxAssemblySurfaces } from "../../Libraries/Sandbox/assemblySurfaceDraw.js";
import { TileLabGameState, tilelabMapTopology } from "./state.js";
import { applyLabCanvasSize } from "./ui/labCanvas.js";
import { sandboxPathEffectPass } from "./render/sandboxPathEffectPass.js";
import { tilelabGroundZoneEffectPass } from "./groundZones.js";
import { sandboxVoidZoneEffectPass } from "./sandboxVoidZones.js";
/** Editor engine profile — render/sim/world-gen hooks for shared engine code. */
export const engine = {
    id: "editor",
    createGameState() {
        return new TileLabGameState();
    },
    /** Filled in by editorSimulation.js (after this module loads). */
    simulationPort: null,
    render: {
        ...createDefaultRenderPorts({ weaponVisuals: createWeaponVisuals(GUN_ID_TO_VISUAL) }),
        drawGroundOverlays: (state, viewport, ctx) => drawSandboxAssemblySurfaces(ctx, state, viewport),
        simulationEffectPasses: [sandboxVoidZoneEffectPass, tilelabGroundZoneEffectPass, sandboxPathEffectPass],
    },
    worldGen: createRoguelikeWorldGenPort({ topology: tilelabMapTopology }),
    worldSurface: { pixelsPerCell: 6 },
    proceduralDesign: roguelikeProceduralDesign,
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
/** @param {import("./state.js").TileLabGameState} state */
export function initEngineState(state) {
    state.entityLayers = state.entityLayers ?? [];
    state.combatParticles = state.combatParticles ?? [];
    state.projectiles = state.projectiles ?? [];
    state.activeLasers = state.activeLasers ?? [];
    state.floatingTexts = state.floatingTexts ?? [];
    if (!state.entityLayers.some((layer) => layer.key === "projectiles")) state.entityLayers.push({ key: "projectiles", zIndex: 20 });
    if (!state.entityLayers.some((layer) => layer.key === "floatingTexts")) state.entityLayers.push({ key: "floatingTexts", zIndex: 100 });
}
export function prepareEngine() {
    for (const key of Object.keys(pickupStates)) if (key !== "normal") delete pickupStates[key];
    Object.assign(pickupStates, combatPickupStates);
}
