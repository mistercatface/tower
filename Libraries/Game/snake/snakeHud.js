import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function mountSnakeHud(getSegmentCount, { getFoodTimerFraction = null, getFsmDebugLine = null, onToggleCameraFocus = null } = {}) {
    const stage = document.querySelector("#gameStage");
    const root = document.createElement("div");
    root.className = "snake-hud";
    root.innerHTML =
        '<div class="snake-hud-panel"><span class="snake-hud-label">Length</span><span class="snake-hud-value" data-snake-length>0</span></div>' +
        '<div class="snake-hud-panel"><span class="snake-hud-label">Best</span><span class="snake-hud-value" data-snake-best>0</span></div>' +
        (getFoodTimerFraction
            ? '<div class="snake-hud-panel snake-hud-food"><span class="snake-hud-label">Food</span><div class="snake-hud-food-track"><div class="snake-hud-food-fill" data-snake-food-fill></div></div></div>'
            : "") +
        (getFsmDebugLine ? '<div class="snake-hud-panel"><span class="snake-hud-label">FSM</span><span class="snake-hud-value" data-snake-fsm-debug>—</span></div>' : "") +
        (onToggleCameraFocus
            ? '<button type="button" class="snake-hud-camera-toggle" data-snake-camera-toggle><span class="snake-hud-label">Camera</span><span class="snake-hud-value" data-snake-camera-label>Snake</span></button>'
            : "");
    stage.appendChild(root);
    const lengthEl = root.querySelector("[data-snake-length]");
    const bestEl = root.querySelector("[data-snake-best]");
    const foodFillEl = getFoodTimerFraction ? root.querySelector("[data-snake-food-fill]") : null;
    const fsmDebugEl = getFsmDebugLine ? root.querySelector("[data-snake-fsm-debug]") : null;
    const cameraLabelEl = onToggleCameraFocus ? root.querySelector("[data-snake-camera-label]") : null;
    const cameraToggleEl = onToggleCameraFocus ? root.querySelector("[data-snake-camera-toggle]") : null;
    if (cameraToggleEl) cameraToggleEl.addEventListener("click", onToggleCameraFocus);
    const storageKey = getSnakeGameConfig().hudHighScoreStorageKey;
    let best = Number(sessionStorage.getItem(storageKey)) || 0;
    bestEl.textContent = String(best);
    return {
        update() {
            const length = getSegmentCount();
            lengthEl.textContent = String(length);
            if (getFoodTimerFraction && foodFillEl) foodFillEl.style.transform = `scaleX(${getFoodTimerFraction()})`;
            if (fsmDebugEl) fsmDebugEl.textContent = getFsmDebugLine();
            if (length <= best) return;
            best = length;
            sessionStorage.setItem(storageKey, String(best));
            bestEl.textContent = String(best);
        },
        setCameraFocus(target) {
            if (!cameraLabelEl || !cameraToggleEl) return;
            const onBall = target === "ball";
            cameraLabelEl.textContent = onBall ? "Ball" : "Snake";
            cameraToggleEl.classList.toggle("is-ball-focus", onBall);
        },
        destroy() {
            root.remove();
        },
    };
}
