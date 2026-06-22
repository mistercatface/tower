export function mountSnakeHud({ onCycleCamera = null, getFocusedSnakeName = null } = {}) {
    const stage = document.querySelector("#gameStage");
    const root = document.createElement("div");
    root.className = "snake-hud";
    root.innerHTML =
        '<div class="snake-hud-panel"><span class="snake-hud-label">Focused</span><span class="snake-hud-value" data-snake-name>—</span></div>' +
        (onCycleCamera ? '<button type="button" class="snake-hud-camera-toggle" data-snake-camera-toggle><span class="snake-hud-value" style="font-size: 16px;">Switch Camera</span></button>' : "");
    stage.appendChild(root);
    const nameEl = root.querySelector("[data-snake-name]");
    const cameraToggleEl = onCycleCamera ? root.querySelector("[data-snake-camera-toggle]") : null;
    if (cameraToggleEl && onCycleCamera) cameraToggleEl.addEventListener("click", onCycleCamera);
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
