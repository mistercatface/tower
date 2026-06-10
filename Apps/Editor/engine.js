import { createRoguelikeWorldGenPort, roguelikeProceduralDesign } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { GUN_ID_TO_VISUAL } from "../../Assets/guns/visualMap.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { createWeaponVisuals } from "../../Libraries/Render/Characters/weapons/createWeaponVisuals.js";
import { getGameState } from "../../GameState/GameState.js";
import { drawSandboxAssemblySurfaces } from "../../Libraries/Sandbox/assemblySurfaceDraw.js";
import { TileLabGameState, tilelabMapTopology } from "./state.js";
import { applyLabCanvasSize } from "./ui/labCanvas.js";
import { sandboxPathEffectPass } from "./render/sandboxPathEffectPass.js";
import { tilelabGroundZoneEffectPass } from "./groundZones.js";
import { sandboxVoidZoneEffectPass } from "./sandboxVoidZones.js";
/** Editor engine profile — hooks for shared render/sim/world-gen code (`GamePorts`). */
export const engine = {
    id: "editor",
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
};
