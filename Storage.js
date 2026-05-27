const SAVE_VERSION = 2;

export function loadProgress(state, upgrades) {
    const versionStr = localStorage.getItem("tower_save_version");
    const version = versionStr ? parseInt(versionStr) : 0;

    if (version < 2) {
        localStorage.removeItem("tower_save_version");
        localStorage.removeItem("tower_upgrades");
        localStorage.removeItem("tower_highest_level");
        localStorage.removeItem("tower_claimed_milestones");
        localStorage.removeItem("tower_discovered_abilities");

        state.wavesCompleted = 0;
        state.highestLevelReached = 0;
        state.claimedPerkMilestones = [];
        state.discoveredAbilities = new Set();
        state.resetUpgradesToDefault();
        return;
    }

    const savedUpgrades = localStorage.getItem("tower_upgrades");
    if (savedUpgrades) {
        const parsed = JSON.parse(savedUpgrades);
        for (const key in parsed) {
            if (state.upgrades[key]) {
                const upgDef = upgrades.find((u) => u.id === key);
                const maxLevel = upgDef ? upgDef.maxLevel : Infinity;
                state.upgrades[key].baseLevel = Math.min(parsed[key].baseLevel, maxLevel);
            }
        }
    }

    const savedHighestLevel = localStorage.getItem("tower_highest_level");
    state.highestLevelReached = savedHighestLevel ? parseInt(savedHighestLevel) : 0;

    const savedMilestones = localStorage.getItem("tower_claimed_milestones");
    state.claimedPerkMilestones = savedMilestones ? JSON.parse(savedMilestones) : [];

    const savedDiscovered = localStorage.getItem("tower_discovered_abilities");
    state.discoveredAbilities = savedDiscovered ? new Set(JSON.parse(savedDiscovered)) : new Set();
}

export function saveProgress(state) {
    localStorage.setItem("tower_save_version", SAVE_VERSION);
    localStorage.setItem("tower_upgrades", JSON.stringify(state.upgrades));
    localStorage.setItem("tower_highest_level", state.highestLevelReached.toString());
    localStorage.setItem("tower_claimed_milestones", JSON.stringify(state.claimedPerkMilestones));
    localStorage.setItem("tower_discovered_abilities", JSON.stringify(Array.from(state.discoveredAbilities)));
}

export function hardResetProgress(state, resetGameCallback) {
    localStorage.removeItem("tower_save_version");
    localStorage.removeItem("tower_upgrades");
    localStorage.removeItem("tower_highest_level");
    localStorage.removeItem("tower_claimed_milestones");
    localStorage.removeItem("tower_discovered_abilities");

    state.discoveredAbilities = new Set();
    state.wavesCompleted = 0;
    state.highestLevelReached = 0;
    state.claimedPerkMilestones = [];
    state.resetUpgradesToDefault();

    resetGameCallback();
}