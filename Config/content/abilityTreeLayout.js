function getAbilityUpgrades(upgradeDefs) {
    return upgradeDefs.filter((upgrade) => upgrade.isAbility && upgrade.category === "abilities");
}
export function computeAbilityDepths(upgradeDefs) {
    const abilities = getAbilityUpgrades(upgradeDefs);
    const abilityIds = new Set(abilities.map((upgrade) => upgrade.id));
    const depthById = new Map();
    function depthFor(id, visiting = new Set()) {
        if (depthById.has(id)) return depthById.get(id);
        const upgrade = abilities.find((entry) => entry.id === id);
        if (!upgrade) {
            depthById.set(id, 0);
            return 0;
        }
        const parentIds = (upgrade.requires ?? []).filter((requiredId) => abilityIds.has(requiredId));
        if (parentIds.length === 0) {
            depthById.set(id, 0);
            return 0;
        }
        if (visiting.has(id)) {
            depthById.set(id, 0);
            return 0;
        }
        visiting.add(id);
        const depth = 1 + Math.max(...parentIds.map((parentId) => depthFor(parentId, visiting)));
        depthById.set(id, depth);
        return depth;
    }
    for (const upgrade of abilities) depthFor(upgrade.id);
    return depthById;
}
/**
 * Builds ability shop layout from upgrade definitions.
 * - depth comes from `requires` (longest ability-parent chain)
 * - root branch order follows ability order in upgradeDefs
 * - each root is followed by direct ability children, in upgradeDefs order
 */
export function buildAbilityTreeLayout(upgradeDefs) {
    const abilities = getAbilityUpgrades(upgradeDefs);
    const depthById = computeAbilityDepths(upgradeDefs);
    const layout = [];
    const added = new Set();
    for (const upgrade of abilities) {
        if (added.has(upgrade.id)) continue;
        if ((depthById.get(upgrade.id) ?? 0) !== 0) continue;
        layout.push({ id: upgrade.id, depth: 0 });
        added.add(upgrade.id);
        for (const child of abilities) {
            if (added.has(child.id)) continue;
            if (!(child.requires ?? []).includes(upgrade.id)) continue;
            layout.push({ id: child.id, depth: depthById.get(child.id) ?? 1 });
            added.add(child.id);
        }
    }
    for (const upgrade of abilities) {
        if (added.has(upgrade.id)) continue;
        layout.push({ id: upgrade.id, depth: depthById.get(upgrade.id) ?? 0 });
    }
    return layout;
}
export function getAbilityTreeDepth(upgradeDefs, abilityId) {
    return computeAbilityDepths(upgradeDefs).get(abilityId) ?? 0;
}
