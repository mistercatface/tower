export function mountSnakeHud({ getFoodTimerFraction = null, getFsmDebugLine = null, onCycleCamera = null, getFocusedSnakeName = null } = {}) {
    const stage = document.querySelector("#gameStage");
    const root = document.createElement("div");
    root.className = "snake-hud";
    root.innerHTML =
        '<div class="snake-hud-panel"><span class="snake-hud-label">Focused</span><span class="snake-hud-value" data-snake-name>—</span></div>' +
        (getFoodTimerFraction
            ? '<div class="snake-hud-panel snake-hud-food"><span class="snake-hud-label">Food</span><div class="snake-hud-food-track"><div class="snake-hud-food-fill" data-snake-food-fill></div></div></div>'
            : "") +
        (getFsmDebugLine ? '<div class="snake-hud-panel"><span class="snake-hud-label">FSM</span><span class="snake-hud-value" data-snake-fsm-debug>—</span></div>' : "") +
        (onCycleCamera ? '<button type="button" class="snake-hud-camera-toggle" data-snake-camera-toggle><span class="snake-hud-value" style="font-size: 16px;">Switch Camera</span></button>' : "");
    stage.appendChild(root);
    const nameEl = root.querySelector("[data-snake-name]");
    const foodFillEl = getFoodTimerFraction ? root.querySelector("[data-snake-food-fill]") : null;
    const fsmDebugEl = getFsmDebugLine ? root.querySelector("[data-snake-fsm-debug]") : null;
    const cameraToggleEl = onCycleCamera ? root.querySelector("[data-snake-camera-toggle]") : null;
    if (cameraToggleEl && onCycleCamera) cameraToggleEl.addEventListener("click", onCycleCamera);
    return {
        update() {
            if (nameEl && getFocusedSnakeName) nameEl.textContent = getFocusedSnakeName();
            if (getFoodTimerFraction && foodFillEl) foodFillEl.style.transform = `scaleX(${getFoodTimerFraction()})`;
            if (fsmDebugEl) fsmDebugEl.textContent = getFsmDebugLine();
        },
        destroy() {
            root.remove();
        },
    };
}
