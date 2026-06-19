import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function mountSnakeHud(getSegmentCount, { getCombatStatus = null, getFoodTimerFraction = null, getFsmDebugLine = null } = {}) {
    const stage = document.querySelector("#gameStage");
    const showCombat = getCombatStatus != null;
    const root = document.createElement("div");
    root.className = "snake-hud";
    root.innerHTML =
        '<div class="snake-hud-panel"><span class="snake-hud-label">Length</span><span class="snake-hud-value" data-snake-length>0</span></div>' +
        '<div class="snake-hud-panel"><span class="snake-hud-label">Best</span><span class="snake-hud-value" data-snake-best>0</span></div>' +
        (getFoodTimerFraction
            ? '<div class="snake-hud-panel snake-hud-food"><span class="snake-hud-label">Food</span><div class="snake-hud-food-track"><div class="snake-hud-food-fill" data-snake-food-fill></div></div></div>'
            : "") +
        (showCombat
            ? '<div class="snake-hud-panel snake-hud-combat"><span class="snake-hud-label">Status</span><div class="snake-hud-combat-row"><span class="snake-hud-chip snake-hud-chip-foraging" data-snake-foraging>Foraging</span><span class="snake-hud-chip snake-hud-chip-hunting" data-snake-hunting>Hunting</span><span class="snake-hud-chip snake-hud-chip-hunted" data-snake-hunted>Hunted</span></div></div>'
            : "") +
        (getFsmDebugLine ? '<div class="snake-hud-panel"><span class="snake-hud-label">FSM</span><span class="snake-hud-value" data-snake-fsm-debug>—</span></div>' : "");
    stage.appendChild(root);
    const lengthEl = root.querySelector("[data-snake-length]");
    const bestEl = root.querySelector("[data-snake-best]");
    const foodFillEl = getFoodTimerFraction ? root.querySelector("[data-snake-food-fill]") : null;
    const foragingEl = showCombat ? root.querySelector("[data-snake-foraging]") : null;
    const huntedEl = showCombat ? root.querySelector("[data-snake-hunted]") : null;
    const huntingEl = showCombat ? root.querySelector("[data-snake-hunting]") : null;
    const fsmDebugEl = getFsmDebugLine ? root.querySelector("[data-snake-fsm-debug]") : null;
    const storageKey = getSnakeGameConfig().hudHighScoreStorageKey;
    let best = Number(sessionStorage.getItem(storageKey)) || 0;
    bestEl.textContent = String(best);
    return {
        update() {
            const length = getSegmentCount();
            lengthEl.textContent = String(length);
            if (getFoodTimerFraction && foodFillEl) foodFillEl.style.width = `${Math.round(getFoodTimerFraction() * 100)}%`;
            if (getCombatStatus && foragingEl && huntedEl && huntingEl) {
                const { foraging, hunting, hunted } = getCombatStatus();
                foragingEl.classList.toggle("is-active", foraging);
                huntedEl.classList.toggle("is-active", hunted);
                huntingEl.classList.toggle("is-active", hunting);
            }
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
