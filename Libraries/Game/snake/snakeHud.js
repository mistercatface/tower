import { applyZoomControl, directZoomMapping } from "../../Viewport/index.js";
import { applySpeedControl } from "../../Playback/speedControl.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
function hudToggleButton(label, dataAttr) {
    return `<button type="button" class="snake-hud-toggle" ${dataAttr}><span class="snake-hud-value" style="font-size: 16px;">${label}</span></button>`;
}
function formatShadowStrengthLabel(strength) {
    if (strength <= 0) return "Off";
    return `${Math.round(strength * 100)}%`;
}
export function mountSnakeHud({
    onCycleCamera = null,
    getFocusedSnakeName = null,
    renderModeControl = null,
    shadowSliderControl = null,
    blurToggleControl = null,
    hpaDebugToggleControl = null,
    zoomControl = null,
    playbackHandlers = null,
    gameState = null,
    onVisualSettingChange = null,
    debugInspectControl = null,
} = {}) {
    const stage = document.querySelector("#gameStage");
    const root = document.createElement("div");
    root.className = "snake-hud";
    const toggles = [];
    if (renderModeControl) toggles.push(hudToggleButton("2D", "data-snake-render-mode-toggle"));
    if (blurToggleControl) toggles.push(hudToggleButton("Blur", "data-snake-blur-toggle"));
    if (onCycleCamera) toggles.push(hudToggleButton("Switch Camera", "data-snake-camera-toggle"));
    toggles.push(hudToggleButton("Overlay", "data-snake-overlay-toggle"));
    if (hpaDebugToggleControl) toggles.push(hudToggleButton("HPA Debug", "data-snake-hpa-debug-toggle"));
    if (debugInspectControl) toggles.push(hudToggleButton("Debug Inspect", "data-snake-debug-inspect-toggle"));
    const shadowPanel = shadowSliderControl
        ? '<div class="snake-hud-panel snake-hud-slider-panel"><span class="snake-hud-label">Shadows</span><div class="snake-hud-slider-row"><input type="range" class="snake-hud-slider" data-snake-shadow-slider min="0" max="100" step="1" value="0" aria-label="Shadow darkness"><span class="snake-hud-slider-value" data-snake-shadow-value>Off</span></div></div>'
        : "";
    const zoomPanel = zoomControl ? '<div class="snake-hud-panel snake-hud-slider-panel snake-hud-zoom-panel" data-snake-zoom-host></div>' : "";
    const speedPanel = playbackHandlers ? '<div class="snake-hud-panel snake-hud-slider-panel snake-hud-speed-panel" data-snake-speed-host></div>' : "";
    root.innerHTML =
        '<div class="snake-hud-panel"><span class="snake-hud-label">Focused</span><span class="snake-hud-value" data-snake-name>—</span></div>' +
        shadowPanel +
        zoomPanel +
        speedPanel +
        (toggles.length ? `<div class="snake-hud-toggles">${toggles.join("")}</div>` : "");
    stage.appendChild(root);
    const debugPanel = document.createElement("div");
    debugPanel.className = "snake-hud-panel snake-debug-panel";
    debugPanel.style.display = "none";
    debugPanel.style.flexDirection = "column";
    debugPanel.style.gap = "4px";
    debugPanel.style.marginTop = "8px";
    debugPanel.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
    debugPanel.style.border = "1px solid #555";
    debugPanel.style.borderRadius = "4px";
    debugPanel.style.padding = "8px";
    debugPanel.style.fontFamily = "monospace";
    debugPanel.style.fontSize = "11px";
    debugPanel.style.color = "#ccc";
    root.appendChild(debugPanel);
    const nameEl = root.querySelector("[data-snake-name]");
    const renderModeToggleEl = renderModeControl ? root.querySelector("[data-snake-render-mode-toggle]") : null;
    const renderModeLabelEl = renderModeToggleEl?.querySelector(".snake-hud-value") ?? null;
    const blurToggleEl = blurToggleControl ? root.querySelector("[data-snake-blur-toggle]") : null;
    const shadowSliderEl = shadowSliderControl ? root.querySelector("[data-snake-shadow-slider]") : null;
    const shadowValueEl = shadowSliderControl ? root.querySelector("[data-snake-shadow-value]") : null;
    const cameraToggleEl = onCycleCamera ? root.querySelector("[data-snake-camera-toggle]") : null;
    const overlayToggleEl = root.querySelector("[data-snake-overlay-toggle]");
    const hpaDebugToggleEl = hpaDebugToggleControl ? root.querySelector("[data-snake-hpa-debug-toggle]") : null;
    const debugInspectToggleEl = debugInspectControl ? root.querySelector("[data-snake-debug-inspect-toggle]") : null;
    if (cameraToggleEl && onCycleCamera) cameraToggleEl.addEventListener("click", onCycleCamera);
    function notifyVisualChange() {
        onVisualSettingChange?.();
    }
    function syncRenderModeToggle() {
        if (!renderModeToggleEl || !renderModeControl || !renderModeLabelEl) return;
        const mode = renderModeControl.get();
        renderModeLabelEl.textContent = renderModeControl.label(mode);
        renderModeToggleEl.classList.toggle("is-on", mode === "flat2d");
        renderModeToggleEl.setAttribute("aria-pressed", mode === "flat2d" ? "true" : "false");
    }
    if (renderModeToggleEl && renderModeControl) {
        renderModeToggleEl.addEventListener("click", () => {
            renderModeControl.cycle();
            syncRenderModeToggle();
            notifyVisualChange();
        });
        syncRenderModeToggle();
    }
    function syncBlurToggle() {
        if (!blurToggleEl || !blurToggleControl) return;
        const enabled = blurToggleControl.get() === true;
        blurToggleEl.classList.toggle("is-on", enabled);
        blurToggleEl.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    if (blurToggleEl && blurToggleControl) {
        blurToggleEl.addEventListener("click", () => {
            blurToggleControl.set(!blurToggleControl.get());
            syncBlurToggle();
            notifyVisualChange();
        });
        syncBlurToggle();
    }
    function syncShadowSlider() {
        if (!shadowSliderEl || !shadowValueEl || !shadowSliderControl) return;
        const strength = shadowSliderControl.get();
        shadowSliderEl.value = String(Math.round(strength * 100));
        shadowValueEl.textContent = formatShadowStrengthLabel(strength);
        shadowSliderEl.classList.toggle("is-off", strength <= 0);
    }
    function applyShadowSlider(value) {
        if (!shadowSliderControl) return;
        const strength = Math.max(0, Math.min(1, value / 100));
        shadowSliderControl.set(strength);
        syncShadowSlider();
        notifyVisualChange();
    }
    if (shadowSliderEl && shadowSliderControl) {
        shadowSliderEl.addEventListener("input", () => applyShadowSlider(Number(shadowSliderEl.value)));
        syncShadowSlider();
    }
    const zoomHost = zoomControl ? root.querySelector("[data-snake-zoom-host]") : null;
    const zoomControlHandle =
        zoomHost && zoomControl
            ? applyZoomControl(zoomHost, {
                  inject: true,
                  prefix: "Zoom",
                  ...directZoomMapping({ min: zoomControl.min, max: zoomControl.max, step: 0.05 }),
                  getZoom: zoomControl.getZoom,
                  setZoom: (value) => {
                      zoomControl.setZoom(value);
                      onVisualSettingChange?.();
                  },
              })
            : null;
    zoomControlHandle?.refresh();
    const speedHost = playbackHandlers ? root.querySelector("[data-snake-speed-host]") : null;
    const speedControlHandle =
        speedHost && playbackHandlers && gameState
            ? applySpeedControl(speedHost, { inject: true, playbackHandlers })
            : null;
    speedControlHandle?.refresh(gameState);
    function syncOverlayToggle() {
        const enabled = getSnakeGameConfig().showFocusedAgentDebug === true;
        overlayToggleEl.classList.toggle("is-on", enabled);
        overlayToggleEl.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    overlayToggleEl.addEventListener("click", () => {
        const config = getSnakeGameConfig();
        config.showFocusedAgentDebug = config.showFocusedAgentDebug !== true;
        syncOverlayToggle();
        notifyVisualChange();
    });
    syncOverlayToggle();
    function syncHpaDebugToggle() {
        if (!hpaDebugToggleEl || !hpaDebugToggleControl) return;
        const enabled = hpaDebugToggleControl.get() === true;
        hpaDebugToggleEl.classList.toggle("is-on", enabled);
        hpaDebugToggleEl.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    if (hpaDebugToggleEl && hpaDebugToggleControl) {
        hpaDebugToggleEl.addEventListener("click", () => {
            hpaDebugToggleControl.set(!hpaDebugToggleControl.get());
            syncHpaDebugToggle();
            notifyVisualChange();
        });
        syncHpaDebugToggle();
    }
    function syncDebugInspectToggle() {
        if (!debugInspectToggleEl || !debugInspectControl) return;
        const enabled = debugInspectControl.get() === true;
        debugInspectToggleEl.classList.toggle("is-on", enabled);
        debugInspectToggleEl.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    if (debugInspectToggleEl && debugInspectControl) {
        debugInspectToggleEl.addEventListener("click", () => {
            debugInspectControl.set(!debugInspectControl.get());
            syncDebugInspectToggle();
            notifyVisualChange();
        });
        syncDebugInspectToggle();
    }
    let lastName = undefined;
    return {
        update() {
            if (nameEl && getFocusedSnakeName) {
                const name = getFocusedSnakeName();
                if (name !== lastName) {
                    nameEl.textContent = name;
                    lastName = name;
                }
            }
            zoomControlHandle?.refresh();
            if (gameState) speedControlHandle?.refresh(gameState);
            if (debugInspectControl && debugInspectControl.get() && gameState.debugSelectedProp) {
                const prop = gameState.debugSelectedProp;
                debugPanel.style.display = "flex";
                debugPanel.innerHTML = `
                    <div style="font-weight: bold; border-bottom: 1px solid #444; padding-bottom: 2px; color: #fff; margin-bottom: 4px;">Inspect: ${prop.type}</div>
                    <div>Phys ID: ${prop._physId !== undefined ? prop._physId : "none"}</div>
                    <div>Active Slot: ${prop._activeSlot !== undefined ? prop._activeSlot : "none"}</div>
                    <div>Sleeping: ${prop.isSleeping ? "true" : "false"} (${prop._sleepFrames ?? 0}f)</div>
                    <div>Vel: (${prop.vx?.toFixed(2) ?? 0}, ${prop.vy?.toFixed(2) ?? 0})</div>
                    <div>Ang Vel: ${prop.angularVelocity?.toFixed(4) ?? 0}</div>
                    <div>Shape: ${prop.shape?.type ?? "none"} (r: ${prop.radius?.toFixed(2) ?? 0})</div>
                    ${prop.shape?.type === "Polygon" ? `<div>Verts: ${prop.shape.vertices.length / 2}</div>` : ""}
                `;
            } else {
                debugPanel.style.display = "none";
            }
        },
        destroy() {
            root.remove();
        },
    };
}
