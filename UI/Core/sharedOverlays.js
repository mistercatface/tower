import { Events } from "../../Core/EventSystem.js";
import { getShellElements } from "./shellElements.js";
const DEFAULT_GAME_OVER_COPY = { title: "GAME OVER", buttonLabel: "NEW RUN", titleColor: "#F44336" };
export function showGameOverScreen() {
    const elements = getShellElements();
    if (elements.gameOverTitle) {
        elements.gameOverTitle.innerText = DEFAULT_GAME_OVER_COPY.title;
        elements.gameOverTitle.style.color = DEFAULT_GAME_OVER_COPY.titleColor;
    }
    if (elements.restartBtn) elements.restartBtn.innerText = DEFAULT_GAME_OVER_COPY.buttonLabel;
    if (elements.gameOverUI) elements.gameOverUI.style.display = "flex";
}
export function hideGameOverScreen() {
    const elements = getShellElements();
    if (elements.gameOverUI) elements.gameOverUI.style.display = "none";
    if (elements.gameOverTitle) {
        elements.gameOverTitle.innerText = DEFAULT_GAME_OVER_COPY.title;
        elements.gameOverTitle.style.color = DEFAULT_GAME_OVER_COPY.titleColor;
    }
    if (elements.restartBtn) elements.restartBtn.innerText = DEFAULT_GAME_OVER_COPY.buttonLabel;
}
/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerSharedOverlayListeners(eventBus) {
    eventBus.on(Events.UI_SHOW_GAME_OVER, () => showGameOverScreen());
    eventBus.on(Events.UI_HIDE_GAME_OVER, () => hideGameOverScreen());
}
