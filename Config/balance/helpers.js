import { progressionSettings } from "./progression.js";

export function xpForLevel(level, settings = progressionSettings) {
    return Math.floor(settings.xpBase * Math.pow(settings.xpExponent, level));
}

export function nextUpgradeCost(currentCost, settings = progressionSettings) {
    return Math.floor(currentCost * settings.upgradeCostMultiplier);
}

export function upgradeCostAtLevel(baseCost, purchasedLevels, settings = progressionSettings) {
    let cost = baseCost;
    for (let i = 0; i < purchasedLevels; i++) {
        cost = nextUpgradeCost(cost, settings);
    }
    return cost;
}
