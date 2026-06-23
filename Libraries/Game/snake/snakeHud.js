import { getSnakeGameConfig } from "./snakeGameConfig.js";
function hudToggleButton(label, dataAttr) {
    return `<button type="button" class="snake-hud-toggle" ${dataAttr}><span class="snake-hud-value" style="font-size: 16px;">${label}</span></button>`;
}
export function mountSnakeHud({ onCycleCamera = null, getFocusedSnakeName = null } = {}) {
    const stage = document.querySelector("#gameStage");
    const root = document.createElement("div");
    root.className = "snake-hud";
    const toggles = [];
    if (onCycleCamera) toggles.push(hudToggleButton("Switch Camera", "data-snake-camera-toggle"));
    toggles.push(hudToggleButton("Overlay", "data-snake-overlay-toggle"));
    root.innerHTML =
        '<div class="snake-hud-panel"><span class="snake-hud-label">Focused</span><span class="snake-hud-value" data-snake-name>—</span></div>' +
        (toggles.length ? `<div class="snake-hud-toggles">${toggles.join("")}</div>` : "");
    stage.appendChild(root);
    const nameEl = root.querySelector("[data-snake-name]");
    const cameraToggleEl = onCycleCamera ? root.querySelector("[data-snake-camera-toggle]") : null;
    const overlayToggleEl = root.querySelector("[data-snake-overlay-toggle]");
    if (cameraToggleEl && onCycleCamera) cameraToggleEl.addEventListener("click", onCycleCamera);
    function syncOverlayToggle() {
        const enabled = getSnakeGameConfig().showFocusedAgentDebug !== false;
        overlayToggleEl.classList.toggle("is-on", enabled);
        overlayToggleEl.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    overlayToggleEl.addEventListener("click", () => {
        const config = getSnakeGameConfig();
        config.showFocusedAgentDebug = config.showFocusedAgentDebug === false;
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
        },
        destroy() {
            root.remove();
        },
    };
}
