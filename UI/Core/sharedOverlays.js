import { Events } from "../../Core/EventSystem.js";
import { getShellElements } from "./shellElements.js";
const DEFAULT_GAME_OVER_COPY = { title: "GAME OVER", buttonLabel: "NEW RUN", titleColor: "#F44336" };
function createButton(styles, innerHTML, onClick, id = "") {
    const btn = document.createElement("button");
    if (id) btn.id = id;
    btn.style.cssText = styles;
    btn.innerHTML = innerHTML;
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
}
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
export function showUpgradeChoice(title, description, choices, upgrades, onPick) {
    const elements = getShellElements();
    if (elements.upgradeChoiceTitle) elements.upgradeChoiceTitle.innerText = title;
    if (elements.upgradeChoiceDesc) elements.upgradeChoiceDesc.innerText = description;
    if (!elements.upgradeChoicesContainer || !elements.upgradeChoiceModal) return;
    elements.upgradeChoicesContainer.innerHTML = "";
    choices.forEach((choiceId) => {
        const upg = upgrades.find((u) => u.id === choiceId);
        if (!upg) return;
        const styles =
            "padding: 10px; background: #333; color: white; border: 1px solid #FFEB3B; cursor: pointer; font-family: monospace; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px;";
        const html = `<span style="font-weight: bold; color: #FFEB3B;">${upg.name}</span><span style="font-size: 12px; color: #CCC; line-height: 1.2;">${upg.description}</span>`;
        const btn = createButton(styles, html, () => {
            elements.upgradeChoiceModal.style.display = "none";
            onPick(choiceId);
        });
        elements.upgradeChoicesContainer.appendChild(btn);
    });
    elements.upgradeChoiceModal.style.display = "flex";
}
/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerSharedOverlayListeners(eventBus) {
    eventBus.on(Events.UI_SHOW_UPGRADE_CHOICE, (data) => showUpgradeChoice(data.title, data.description, data.choices, data.upgrades, data.onPick));
    eventBus.on(Events.UI_SHOW_GAME_OVER, () => showGameOverScreen());
    eventBus.on(Events.UI_HIDE_GAME_OVER, () => hideGameOverScreen());
}
