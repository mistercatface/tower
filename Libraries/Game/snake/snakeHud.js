import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { applyZoomControl, directZoomMapping } from "../../Viewport/index.js";
function hudToggleButton(label, dataAttr) {
    return `<button type="button" class="snake-hud-toggle" ${dataAttr}><span class="snake-hud-value" style="font-size: 16px;">${label}</span></button>`;
}
function formatShadowStrengthLabel(strength) {
    if (strength <= 0) return "Off";
    return `${Math.round(strength * 100)}%`;
}
export function mountSnakeHud({ onCycleCamera = null, getFocusedSnakeName = null, renderModeControl = null, shadowSliderControl = null, blurToggleControl = null, zoomControl = null, onVisualSettingChange = null } = {}) {
    const stage = document.querySelector("#gameStage");
    const root = document.createElement("div");
    root.className = "snake-hud";
    const toggles = [];
    if (renderModeControl) toggles.push(hudToggleButton("2D", "data-snake-render-mode-toggle"));
    if (blurToggleControl) toggles.push(hudToggleButton("Blur", "data-snake-blur-toggle"));
    if (onCycleCamera) toggles.push(hudToggleButton("Switch Camera", "data-snake-camera-toggle"));
    toggles.push(hudToggleButton("Overlay", "data-snake-overlay-toggle"));
    const shadowPanel = shadowSliderControl
        ? '<div class="snake-hud-panel snake-hud-slider-panel"><span class="snake-hud-label">Shadows</span><div class="snake-hud-slider-row"><input type="range" class="snake-hud-slider" data-snake-shadow-slider min="0" max="100" step="1" value="0" aria-label="Shadow darkness"><span class="snake-hud-slider-value" data-snake-shadow-value>Off</span></div></div>'
        : "";
    const zoomPanel = zoomControl ? '<div class="snake-hud-panel snake-hud-slider-panel snake-hud-zoom-panel" data-snake-zoom-host></div>' : "";
    root.innerHTML =
        '<div class="snake-hud-panel"><span class="snake-hud-label">Focused</span><span class="snake-hud-value" data-snake-name>—</span></div>' +
        shadowPanel +
        zoomPanel +
        (toggles.length ? `<div class="snake-hud-toggles">${toggles.join("")}</div>` : "");
    stage.appendChild(root);
    const nameEl = root.querySelector("[data-snake-name]");
    const renderModeToggleEl = renderModeControl ? root.querySelector("[data-snake-render-mode-toggle]") : null;
    const renderModeLabelEl = renderModeToggleEl?.querySelector(".snake-hud-value") ?? null;
    const blurToggleEl = blurToggleControl ? root.querySelector("[data-snake-blur-toggle]") : null;
    const shadowSliderEl = shadowSliderControl ? root.querySelector("[data-snake-shadow-slider]") : null;
    const shadowValueEl = shadowSliderControl ? root.querySelector("[data-snake-shadow-value]") : null;
    const cameraToggleEl = onCycleCamera ? root.querySelector("[data-snake-camera-toggle]") : null;
    const overlayToggleEl = root.querySelector("[data-snake-overlay-toggle]");
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
    function syncOverlayToggle() {
        const enabled = getSnakeGameConfig().showFocusedAgentDebug === true;
        overlayToggleEl.classList.toggle("is-on", enabled);
        overlayToggleEl.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    overlayToggleEl.addEventListener("click", () => {
        const config = getSnakeGameConfig();
        config.showFocusedAgentDebug = config.showFocusedAgentDebug !== true;
        syncOverlayToggle();
    });
    syncOverlayToggle();
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
        },
        destroy() {
            root.remove();
        },
    };
}
