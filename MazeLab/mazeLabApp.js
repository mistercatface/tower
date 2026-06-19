import { SNAKE_GAME_DEFAULTS } from "../Config/games/snake.js";
import { bakeSnakeSplitLayoutPreview } from "../Libraries/Procedural/Mazes/snakeSplitLayout.js";
import { autoPxPerCell, drawSnakeSplitLayout, layoutStats } from "./mazeRenderer.js";

const PLAY_AREA_OPTIONS = [64, 128, 256];
const PX_AUTO = "auto";
const defaultLayers = { zones: true, voxels: true, rails: true, northReserve: true, walkable: false, belts: true };

let preview = null;
let pxPerCell = 8;
let pxMode = PX_AUTO;
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

function resolvePx(cols, rows) {
    if (pxMode === PX_AUTO) return autoPxPerCell(cols, rows);
    const n = Number(pxMode);
    return n > 0 ? n : autoPxPerCell(cols, rows);
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
        stats.beltCells > 0
            ? ` · belts ${stats.beltCells} (${stats.beltStraight} s / ${stats.beltElbows} elbow${stats.beltValid === false ? " INVALID" : stats.beltValid ? " OK" : ""})`
            : "";
    const pxLabel = pxMode === PX_AUTO ? `auto→${pxPerCell}px` : `${pxPerCell}px`;
    els.stats.textContent = `seed ${stats.seed} · ${stats.playArea} · ${pxLabel}/cell · walls ${stats.voxelCells} · rails ${stats.railEdges}${beltPart}`;
}

async function generate() {
    const token = ++generateToken;
    pxMode = els.pxPerCell.value;
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

function buildPxSelect() {
    const opts = [
        { v: PX_AUTO, label: "Auto (fill screen)" },
        { v: "8", label: "8 px/cell" },
        { v: "10", label: "10 px/cell" },
        { v: "12", label: "12 px/cell" },
        { v: "16", label: "16 px/cell" },
        { v: "20", label: "20 px/cell" },
    ];
    els.pxPerCell.innerHTML = opts.map((o) => `<option value="${o.v}"${o.v === PX_AUTO ? " selected" : ""}>${o.label}</option>`).join("");
}

els.generate.addEventListener("click", () => generate());
els.randomSeed.addEventListener("click", () => {
    els.seed.value = String((Math.random() * 0x7fffffff) | 0);
    generate();
});
els.pxPerCell.addEventListener("change", () => {
    pxMode = els.pxPerCell.value;
    render();
});
window.addEventListener("resize", () => {
    if (!preview || pxMode !== PX_AUTO) return;
    render();
});

for (const el of [els.seed, els.playArea, els.fillChance, els.iterations, els.openBoundaryRows, els.regionPadding, els.corridorWidthMin, els.corridorWidthMax, els.extraLinkRatio])
    el.addEventListener("change", () => generate());

bindLayerToggles();
buildPxSelect();

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
