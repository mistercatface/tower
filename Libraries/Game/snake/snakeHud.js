import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function mountSnakeHud(getSegmentCount, { getFoodTimerFraction = null, getFsmDebugLine = null } = {}) {
    const stage = document.querySelector("#gameStage");
    const root = document.createElement("div");
    root.className = "snake-hud";
    root.innerHTML =
        '<div class="snake-hud-panel"><span class="snake-hud-label">Length</span><span class="snake-hud-value" data-snake-length>0</span></div>' +
        '<div class="snake-hud-panel"><span class="snake-hud-label">Best</span><span class="snake-hud-value" data-snake-best>0</span></div>' +
        (getFoodTimerFraction
            ? '<div class="snake-hud-panel snake-hud-food"><span class="snake-hud-label">Food</span><div class="snake-hud-food-track"><div class="snake-hud-food-fill" data-snake-food-fill></div></div></div>'
            : "") +
        (getFsmDebugLine ? '<div class="snake-hud-panel"><span class="snake-hud-label">FSM</span><span class="snake-hud-value" data-snake-fsm-debug>—</span></div>' : "");
    stage.appendChild(root);
    const lengthEl = root.querySelector("[data-snake-length]");
    const bestEl = root.querySelector("[data-snake-best]");
    const foodFillEl = getFoodTimerFraction ? root.querySelector("[data-snake-food-fill]") : null;
    const fsmDebugEl = getFsmDebugLine ? root.querySelector("[data-snake-fsm-debug]") : null;
    const storageKey = getSnakeGameConfig().hudHighScoreStorageKey;
    let best = Number(sessionStorage.getItem(storageKey)) || 0;
    bestEl.textContent = String(best);
    return {
        update() {
            const length = getSegmentCount();
            lengthEl.textContent = String(length);
            if (getFoodTimerFraction && foodFillEl) foodFillEl.style.width = `${Math.round(getFoodTimerFraction() * 100)}%`;
            if (fsmDebugEl) fsmDebugEl.textContent = getFsmDebugLine();
            if (length <= best) return;
            best = length;
            sessionStorage.setItem(storageKey, String(best));
            bestEl.textContent = String(best);
        },
        destroy() {
            root.remove();
        },
    };
}
