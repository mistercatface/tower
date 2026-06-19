import { SNAKE_GAME_DEFAULTS } from "../Config/games/snake.js";
import { bakeSnakeSplitLayoutPreview } from "../Libraries/Procedural/Mazes/snakeSplitLayout.js";
import { drawSnakeSplitLayout, layoutStats } from "./mazeRenderer.js";
const PLAY_AREA_OPTIONS = [64, 128, 256];
const defaultLayers = { zones: true, voxels: true, rails: true, northReserve: true, walkable: true, belts: true };
let preview = null;
let pxPerCell = 2;
let generateToken = 0;
const els = {
    canvas: document.getElementById("maze-canvas"),
    stats: document.getElementById("stats"),
    timing: document.getElementById("timing"),
    seed: document.getElementById("seed"),
    playArea: document.getElementById("play-area"),
    fillChance: document.getElementById("fill-chance"),
    iterations: document.getElementById("iterations"),
    openBoundaryRows: document.getElementById("open-boundary-rows"),
    regionPadding: document.getElementById("region-padding"),
    corridorWidthMin: document.getElementById("corridor-width-min"),
    corridorWidthMax: document.getElementById("corridor-width-max"),
    extraLinkRatio: document.getElementById("extra-link-ratio"),
    pxPerCell: document.getElementById("px-per-cell"),
    generate: document.getElementById("generate"),
    randomSeed: document.getElementById("random-seed"),
};
function readConfig() {
    const cavernDefaults = SNAKE_GAME_DEFAULTS.cavern;
    const railDefaults = SNAKE_GAME_DEFAULTS.rail;
    return {
        mapSeed: Number(els.seed.value) || 1,
        playAreaCols: Number(els.playArea.value),
        playAreaRows: Number(els.playArea.value),
        cavern: {
            fillChance: Number(els.fillChance.value),
            iterations: Number(els.iterations.value),
            openBoundaryRows: Number(els.openBoundaryRows.value),
            regionPaddingCells: Number(els.regionPadding.value),
            wallHeightLevel: cavernDefaults.wallHeightLevel,
        },
        rail: {
            wallHeightLevel: railDefaults.wallHeightLevel,
            edgeThickness: railDefaults.edgeThickness,
            corridorWidthMin: Number(els.corridorWidthMin.value),
            corridorWidthMax: Number(els.corridorWidthMax.value),
            extraLinkRatio: Number(els.extraLinkRatio.value),
        },
    };
}
function readLayers() {
    const layers = { ...defaultLayers };
    for (const key of Object.keys(layers)) {
        const input = document.getElementById(`layer-${key}`);
        if (input) layers[key] = input.checked;
    }
    return layers;
}
function resizeCanvas(playAreaCols, playAreaRows) {
    const width = playAreaCols * pxPerCell;
    const height = playAreaRows * pxPerCell;
    els.canvas.width = width;
    els.canvas.height = height;
    els.canvas.style.width = `${Math.min(width, window.innerWidth - 320)}px`;
    els.canvas.style.height = `${Math.min(height, window.innerHeight - 120)}px`;
}
function render() {
    if (!preview) return;
    const ctx = els.canvas.getContext("2d");
    const beltInvalidKeys = preview.beltPlan?.validation?.ok === false ? preview.beltPlan.validation.footprint : null;
    drawSnakeSplitLayout(ctx, preview, { pxPerCell, layers: readLayers(), beltInvalidKeys });
    const stats = layoutStats(preview);
    const beltPart =
        stats.beltCells > 0
            ? ` · belts ${stats.beltCells} (${stats.beltStraight} straight, ${stats.beltElbows} elbows, ${stats.beltPaths} paths${stats.beltValid === false ? ` · INVALID: ${stats.beltError}` : stats.beltValid ? " · chain OK" : ""})`
            : "";
    els.stats.textContent = `seed ${stats.seed} · ${stats.playArea} · voxels ${stats.voxelCells} · open ${stats.openCells} · rails ${stats.railEdges} · nav-walkable ${stats.navWalkable}${beltPart}`;
}
async function generate() {
    const token = ++generateToken;
    const config = readConfig();
    pxPerCell = Number(els.pxPerCell.value);
    resizeCanvas(config.playAreaCols, config.playAreaRows);
    els.timing.textContent = "generating…";
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (token !== generateToken) return;
    preview = bakeSnakeSplitLayoutPreview(config);
    const elapsed = performance.now() - started;
    if (token !== generateToken) return;
    els.timing.textContent = `${elapsed.toFixed(1)} ms`;
    render();
}
function bindLayerToggles() {
    for (const key of Object.keys(defaultLayers)) {
        const input = document.getElementById(`layer-${key}`);
        if (input) input.addEventListener("change", render);
    }
}
function seedFromForm() {
    return Number(els.seed.value) || 1;
}
els.generate.addEventListener("click", () => generate());
els.randomSeed.addEventListener("click", () => {
    els.seed.value = String((Math.random() * 0x7fffffff) | 0);
    generate();
});
els.pxPerCell.addEventListener("change", () => generate());
for (const el of [els.seed, els.playArea, els.fillChance, els.iterations, els.openBoundaryRows, els.regionPadding, els.corridorWidthMin, els.corridorWidthMax, els.extraLinkRatio])
    el.addEventListener("change", () => generate());
bindLayerToggles();
const cavern = SNAKE_GAME_DEFAULTS.cavern;
const rail = SNAKE_GAME_DEFAULTS.rail;
els.seed.value = "42";
els.playArea.innerHTML = PLAY_AREA_OPTIONS.map((n) => `<option value="${n}"${n === 256 ? " selected" : ""}>${n}×${n}</option>`).join("");
els.fillChance.value = String(cavern.fillChance);
els.iterations.value = String(cavern.iterations);
els.openBoundaryRows.value = String(cavern.openBoundaryRows);
els.regionPadding.value = String(cavern.regionPaddingCells);
els.corridorWidthMin.value = String(rail.corridorWidthMin);
els.corridorWidthMax.value = String(rail.corridorWidthMax);
els.extraLinkRatio.value = String(rail.extraLinkRatio);
els.pxPerCell.value = "2";
generate();
