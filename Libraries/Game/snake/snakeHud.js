import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function mountSnakeHud(getSegmentCount, { getKineticSolverStats = null } = {}) {
    const stage = document.querySelector("#gameStage");
    if (!stage) return { update() {}, destroy() {} };
    const root = document.createElement("div");
    root.className = "snake-hud";
    root.innerHTML =
        '<div class="snake-hud-panel"><span class="snake-hud-label">Length</span><span class="snake-hud-value" data-snake-length>0</span></div>' +
        '<div class="snake-hud-panel"><span class="snake-hud-label">Best</span><span class="snake-hud-value" data-snake-best>0</span></div>' +
        (getKineticSolverStats ? '<div class="snake-hud-panel"><span class="snake-hud-label">Phys iters</span><span class="snake-hud-value" data-snake-phys-iters>—</span></div>' : "");
    stage.appendChild(root);
    const lengthEl = root.querySelector("[data-snake-length]");
    const bestEl = root.querySelector("[data-snake-best]");
    const physItersEl = getKineticSolverStats ? root.querySelector("[data-snake-phys-iters]") : null;
    const storageKey = getSnakeGameConfig().hudHighScoreStorageKey;
    let best = Number(sessionStorage.getItem(storageKey)) || 0;
    bestEl.textContent = String(best);
    return {
        update() {
            const length = getSegmentCount();
            lengthEl.textContent = String(length);
            if (physItersEl) {
                const stats = getKineticSolverStats();
                physItersEl.textContent = stats ? `${stats.outerIterations}/${stats.maxIterations}` : "—";
            }
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
