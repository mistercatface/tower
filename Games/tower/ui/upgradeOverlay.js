import { Events } from "../../../Core/EventSystem.js";
import { getShellElements } from "../../../UI/Core/shellElements.js";
function createButton(styles, innerHTML, onClick) {
    const btn = document.createElement("button");
    btn.style.cssText = styles;
    btn.innerHTML = innerHTML;
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
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
/** @param {import("../../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerUpgradeOverlayListener(eventBus) {
    eventBus.on(Events.UI_SHOW_UPGRADE_CHOICE, (data) => showUpgradeChoice(data.title, data.description, data.choices, data.upgrades, data.onPick));
}
