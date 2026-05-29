import { projectVertical, setCameraHeight } from "./Render/3D/Projection3D.js";
import { drawTree, drawBarrel, drawCrate, drawLampPost, drawFireBarrel } from "./Render/3D/PropRecipes.js";
import { 
    drawExtrudedRadial, 
    drawRadialBand, 
    drawRadialRibs, 
    drawRadialCap, 
    drawExtrudedBox,
    drawBarkLines
} from "./Render/3D/SolidDraw.js";

// Canvas and UI Selection
const canvas = document.getElementById("viewportCanvas");
const ctx = canvas.getContext("2d");

const assetSelector = document.getElementById("assetSelector");
const viewerDistInput = document.getElementById("viewerDist");
const viewerAngleInput = document.getElementById("viewerAngle");
const autoOrbitCheck = document.getElementById("autoOrbit");
const cameraHeightInput = document.getElementById("cameraHeight");
const assetFacingInput = document.getElementById("assetFacing");
const dynamicParamsContainer = document.getElementById("dynamicParamsContainer");
const mathOutput = document.getElementById("mathOutput");

// Labels
const valViewerDist = document.getElementById("val_viewerDist");
const valViewerAngle = document.getElementById("val_viewerAngle");
const valCameraHeight = document.getElementById("val_cameraHeight");
const valAssetFacing = document.getElementById("val_assetFacing");

// Setup state
const state = {
    centerX: canvas.width / 2,
    centerY: canvas.height / 2 + 50, // shifted down slightly to show height extrusion better
    customRadius: 8,
    customHeight: 54,
    customT: 0.5,
    lastTime: 0,
};

// Generate dynamic parameter controls based on selected asset
function rebuildDynamicSliders() {
    const asset = assetSelector.value;
    dynamicParamsContainer.innerHTML = "";

    if (asset === "tree") {
        createSlider("trunkRadius", "Trunk Radius", 2, 20, 5, "px");
        createSlider("trunkHeight", "Trunk Height", 10, 150, 54, "px");
    } else if (asset === "barrel" || asset === "fire_barrel") {
        createSlider("radius", "Radius", 4, 30, 8, "px");
        createSlider("height", "Height", 5, 60, 14, "px");
    } else if (asset === "crate") {
        createSlider("halfSize", "Half Size (radius)", 4, 30, 8, "px");
        createSlider("height", "Height", 5, 60, 14, "px");
    } else if (asset === "lampPost") {
        createSlider("poleRadius", "Pole Radius", 1, 10, 2.2, "px", 0.1);
        createSlider("poleHeight", "Pole Height", 15, 120, 46, "px");
        createSlider("lanternSize", "Lantern Size", 2, 15, 4, "px");
    } else if (asset === "primitives") {
        createSlider("radius", "Base Radius", 2, 50, 15, "px");
        createSlider("topRadius", "Top Radius", 0, 50, 15, "px");
        createSlider("height", "Height", 5, 120, 40, "px");
        createSlider("t", "Cap / Band Height (t)", 0, 1, 0.5, "", 0.01);
    }
}

function createSlider(id, labelText, min, max, defaultValue, unit, step = 1) {
    const group = document.createElement("div");
    group.className = "control-group";

    const label = document.createElement("label");
    label.htmlFor = id;
    label.innerHTML = `${labelText} <span id="val_${id}" class="val">${defaultValue}${unit}</span>`;

    const input = document.createElement("input");
    input.type = "range";
    input.id = id;
    input.min = min;
    input.max = max;
    input.value = defaultValue;
    input.step = step;

    input.addEventListener("input", (e) => {
        document.getElementById(`val_${id}`).textContent = `${e.target.value}${unit}`;
        state[id] = parseFloat(e.target.value);
        requestRender();
    });

    // Store value initially
    state[id] = defaultValue;

    group.appendChild(label);
    group.appendChild(input);
    dynamicParamsContainer.appendChild(group);
}

// Draw clean oscilloscope-like background grid
function drawGrid() {
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 0.5;

    // Grid size
    const step = 40;
    
    // Draw vertical lines
    for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // Highlight Center Base Coordinate
    ctx.strokeStyle = "rgba(0, 229, 255, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(state.centerX, state.centerY, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(state.centerX - 15, state.centerY);
    ctx.lineTo(state.centerX + 15, state.centerY);
    ctx.moveTo(state.centerX, state.centerY - 15);
    ctx.lineTo(state.centerX, state.centerY + 15);
    ctx.stroke();
}

function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply values to UI text labels
    const dist = parseFloat(viewerDistInput.value);
    const angleDeg = parseFloat(viewerAngleInput.value);
    const angleRad = (angleDeg * Math.PI) / 180;
    const camHeight = parseFloat(cameraHeightInput.value);
    const facingDeg = parseFloat(assetFacingInput.value);
    const facingRad = (facingDeg * Math.PI) / 180;

    valViewerDist.textContent = `${dist}px`;
    valViewerAngle.textContent = `${angleDeg}°`;
    valCameraHeight.textContent = camHeight;
    valAssetFacing.textContent = `${facingDeg}°`;

    // Apply camera height
    setCameraHeight(camHeight);

    // Compute player (viewer) coordinates in world space relative to center
    // We assume the asset is at (state.centerX, state.centerY)
    // The player coordinates (px, py) are:
    const px = state.centerX + Math.cos(angleRad) * dist;
    const py = state.centerY + Math.sin(angleRad) * dist;

    // Draw Grid behind asset
    drawGrid();

    // Create Prop Draw Context
    const fakeProp = {
        x: state.centerX,
        y: state.centerY,
        facing: facingRad,
        radius: state.radius ?? state.trunkRadius ?? state.halfSize ?? 8,
    };

    const pc = {
        prop: fakeProp,
        x: fakeProp.x,
        y: fakeProp.y,
        facing: fakeProp.facing,
        px: px,
        py: py,
        project(height) {
            return projectVertical(this.x, this.y, this.px, this.py, height);
        }
    };

    // Draw Player Target Vector & Player Indicator
    ctx.strokeStyle = "rgba(244, 67, 54, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(state.centerX, state.centerY);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);

    // Player node circle
    ctx.fillStyle = "#f44336";
    ctx.shadowColor = "#f44336";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Label Player
    ctx.fillStyle = "#f44336";
    ctx.font = "bold 9px monospace";
    ctx.fillText("PLAYER", px + 10, py - 4);

    // Call selected asset drawing routine
    const asset = assetSelector.value;
    try {
        if (asset === "tree") {
            // Override recipes tree height and trunk parameters temporarily
            // (normally these are defined statically, but we can override drawTree parameters)
            const oldRadius = pc.prop.radius;
            pc.prop.radius = state.trunkRadius;
            drawTree(ctx, pc);
            pc.prop.radius = oldRadius;
        } else if (asset === "barrel") {
            drawBarrel(ctx, pc);
        } else if (asset === "fire_barrel") {
            drawFireBarrel(ctx, pc);
        } else if (asset === "crate") {
            drawCrate(ctx, pc);
        } else if (asset === "lampPost") {
            drawLampPost(ctx, pc);
        } else if (asset === "primitives") {
            renderPrimitivesPlayground(ctx, pc);
        }
    } catch (err) {
        console.error(err);
        ctx.fillStyle = "#ff5252";
        ctx.font = "14px monospace";
        ctx.fillText(`Error: ${err.message}`, 20, 40);
    }

    // Update debug output with projection data for 10px height
    const proj = pc.project(state.customHeight ?? 54);
    mathOutput.textContent = `cx: ${proj.cx.toFixed(2)}
cy: ${proj.cy.toFixed(2)}
dx: ${proj.dx.toFixed(2)}
dy: ${proj.dy.toFixed(2)}
dist: ${proj.dist.toFixed(2)}
alpha: ${proj.alpha.toFixed(4)}
topX: ${proj.topX.toFixed(2)}
topY: ${proj.topY.toFixed(2)}
viewAngle: ${proj.viewAngle.toFixed(3)} rad`;
}

function renderPrimitivesPlayground(ctx, pc) {
    const radius = state.radius ?? 15;
    const topRadius = state.topRadius ?? 15;
    const height = state.height ?? 40;
    const t = state.t ?? 0.5;

    // Draw cylinder base
    const { projection } = drawExtrudedRadial(ctx, pc, {
        baseRadius: radius,
        topRadius: topRadius,
        height,
        colors: { shadow: "#1e293b", mid: "#334155", highlight: "#64748b" },
        stroke: "#0f172a",
        bodyMode: "faceted"
    });

    // Draw a ribs layer
    drawRadialRibs(ctx, pc, {
        baseRadius: radius,
        topRadius: topRadius,
        height,
        ts: [t],
        stroke: "rgba(0, 229, 255, 0.8)",
    });

    // Draw a band layer
    drawRadialBand(ctx, pc, {
        baseRadius: radius,
        topRadius: topRadius,
        height,
        t0: Math.max(0, t - 0.1),
        t1: Math.min(1, t + 0.1),
        fill: "rgba(0, 229, 255, 0.2)",
        stroke: "#00e5ff"
    });

    // Draw cap
    drawRadialCap(ctx, pc, {
        radius,
        height,
        topRadius,
        capColors: { inner: "#64748b", mid: "#475569", outer: "#334155" },
        stroke: "#0f172a"
    });
}

let renderRequested = false;
function requestRender() {
    if (!renderRequested) {
        renderRequested = true;
        requestAnimationFrame(() => {
            render();
            renderRequested = false;
        });
    }
}

// Animation / Orbit Loop
function update(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const dt = (timestamp - state.lastTime) / 1000;
    state.lastTime = timestamp;

    if (autoOrbitCheck.checked) {
        // Orbit speed: 15 degrees per second
        let currentAngle = parseFloat(viewerAngleInput.value);
        currentAngle = (currentAngle + 18 * dt) % 360;
        viewerAngleInput.value = currentAngle.toFixed(1);
        render();
    }

    requestAnimationFrame(update);
}

// Event Listeners
assetSelector.addEventListener("change", () => {
    rebuildDynamicSliders();
    requestRender();
});
viewerDistInput.addEventListener("input", requestRender);
viewerAngleInput.addEventListener("input", requestRender);
cameraHeightInput.addEventListener("input", requestRender);
assetFacingInput.addEventListener("input", requestRender);

// Run initial configurations
rebuildDynamicSliders();
requestRender();
requestAnimationFrame(update);
