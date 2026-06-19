import { SNAKE_GAME_DEFAULTS } from "../Config/games/snake.js";
import { bakeSnakeSplitLayoutPreview } from "../Libraries/Procedural/Mazes/snakeSplitLayout.js";
import { autoPxPerCell, drawSnakeSplitLayout, layoutStats } from "./mazeRenderer.js";
const PLAY_AREA_OPTIONS = [64, 128, 256];
const defaultLayers = { zones: true, voxels: true, rails: true, northReserve: true, walkable: false, belts: true };
let preview = null;
let pxPerCell = 8;
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
    zoomAuto: document.getElementById("zoom-auto"),
    zoomVal: document.getElementById("zoom-val"),
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
function resolvePx(cols, rows) {
    const isAuto = els.zoomAuto.checked;
    if (isAuto) {
        const autoVal = autoPxPerCell(cols, rows);
        els.pxPerCell.value = String(autoVal);
        els.zoomVal.textContent = "Auto";
        els.pxPerCell.disabled = true;
        return autoVal;
    } else {
        els.pxPerCell.disabled = false;
        const val = Number(els.pxPerCell.value);
        els.zoomVal.textContent = `${val}px`;
        return val;
    }
}
function applyCanvasSize(cols, rows) {
    pxPerCell = resolvePx(cols, rows);
    els.canvas.width = cols * pxPerCell;
    els.canvas.height = rows * pxPerCell;
    els.canvas.style.width = `${cols * pxPerCell}px`;
    els.canvas.style.height = `${rows * pxPerCell}px`;
}
function render() {
    if (!preview) return;
    applyCanvasSize(preview.playableBounds.boundsCols, preview.playableBounds.boundsRows);
    const ctx = els.canvas.getContext("2d");
    drawSnakeSplitLayout(ctx, preview, { pxPerCell, layers: readLayers() });
    const stats = layoutStats(preview);
    const beltPart =
        stats.beltCells > 0 ? ` · belts ${stats.beltCells} (${stats.beltStraight} s / ${stats.beltElbows} elbow${stats.beltValid === false ? " INVALID" : stats.beltValid ? " OK" : ""})` : "";
    const isAuto = els.zoomAuto.checked;
    const pxLabel = isAuto ? `auto→${pxPerCell}px` : `${pxPerCell}px`;
    els.stats.textContent = `seed ${stats.seed} · ${stats.playArea} · ${pxLabel}/cell · walls ${stats.voxelCells} · rails ${stats.railEdges}${beltPart}`;
}
async function generate() {
    const token = ++generateToken;
    const config = readConfig();
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
els.generate.addEventListener("click", () => generate());
els.randomSeed.addEventListener("click", () => {
    els.seed.value = String((Math.random() * 0x7fffffff) | 0);
    generate();
});
// Zoom sliders events
els.pxPerCell.addEventListener("input", render);
els.zoomAuto.addEventListener("change", render);
window.addEventListener("resize", () => {
    if (!preview || !els.zoomAuto.checked) return;
    render();
});
for (const el of [els.seed, els.playArea, els.fillChance, els.iterations, els.openBoundaryRows, els.regionPadding, els.corridorWidthMin, els.corridorWidthMax, els.extraLinkRatio])
    el.addEventListener("change", () => generate());
// Mouse Drag-to-Pan implementation
const stage = document.querySelector(".stage");
let isPanning = false;
let startX = 0;
let startY = 0;
let scrollLeft = 0;
let scrollTop = 0;
stage.addEventListener("mousedown", (e) => {
    // Only pan on left-click
    if (e.button !== 0) return;
    isPanning = true;
    stage.classList.add("panning");
    startX = e.pageX - stage.offsetLeft;
    startY = e.pageY - stage.offsetTop;
    scrollLeft = stage.scrollLeft;
    scrollTop = stage.scrollTop;
});
stage.addEventListener("mouseleave", () => {
    isPanning = false;
    stage.classList.remove("panning");
});
stage.addEventListener("mouseup", () => {
    isPanning = false;
    stage.classList.remove("panning");
});
stage.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    e.preventDefault();
    const x = e.pageX - stage.offsetLeft;
    const y = e.pageY - stage.offsetTop;
    const walkX = (x - startX) * 1.5;
    const walkY = (y - startY) * 1.5;
    stage.scrollLeft = scrollLeft - walkX;
    stage.scrollTop = scrollTop - walkY;
});
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
generate();
