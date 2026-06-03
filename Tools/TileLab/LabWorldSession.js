import { createLabMapWorld, focusLabNode, listLabMapNodes } from "./map/LabMapWorld.js";
import { invalidateMapPreviewBakes } from "./map/LabMapPreview.js";

/** @type {import("../../GameState/GameState.js").GameState | null} */
let labWorld = null;
let labWorldMapSeed = null;

export function getLabWorld() {
    return labWorld;
}

export function resetLabWorld() {
    labWorld = null;
}

export function getLabWorldMapSeed() {
    return labWorldMapSeed;
}

function populateNodeSelect(state) {
    const select = document.getElementById("mapNodeSelect");
    if (!select || !state) {
        return;
    }
    const prev = Number(select.value) || 0;
    select.innerHTML = "";
    for (const node of listLabMapNodes(state)) {
        const opt = document.createElement("option");
        opt.value = String(node.id);
        opt.textContent = `${node.id}·L${node.layer}`;
        select.appendChild(opt);
    }
    select.value = state.getMapNode(prev) ? String(prev) : "0";
}

/**
 * @param {{ seed: number }} ctrl
 * @param {boolean} [forceRegen]
 */
export function ensureLabWorld(ctrl, forceRegen = false) {
    const mapSeed = Number(document.getElementById("mapSeedInput")?.value) || 1;
    if (!labWorld || forceRegen || labWorldMapSeed !== mapSeed) {
        labWorld = createLabMapWorld({
            mapSeed,
            floorTileSeed: ctrl.seed,
        });
        labWorldMapSeed = mapSeed;
        populateNodeSelect(labWorld);
    } else if (labWorld.floorTileSeed !== ctrl.seed) {
        labWorld.floorTileSeed = ctrl.seed;
        labWorld.floorTiles.clear();
        invalidateMapPreviewBakes();
    }

    const nodeId = Number(document.getElementById("mapNodeSelect")?.value) || 0;
    if (labWorld.currentNodeId !== nodeId || forceRegen) {
        focusLabNode(labWorld, nodeId);
    }

    labWorld.gameTime = 0;
    return labWorld;
}
