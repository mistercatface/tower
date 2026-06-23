const SPRINT_RULES = {
    always: () => true,
    severeOrLethalThreat(ctx, sprintConfig) {
        const threat = ctx.threatState;
        if (!threat) return false;
        return threat.lethal || threat.severity >= sprintConfig.fleeSeverity;
    },
    severeNonLethalThreat(ctx, sprintConfig) {
        const threat = ctx.threatState;
        if (!threat || threat.lethal) return false;
        return threat.severity >= sprintConfig.fleeSeverity;
    },
};
function guardBlocks(guardId, ctx, sprintConfig) {
    if (guardId === "minHunger") {
        const min = sprintConfig.sprintFleeMinHunger ?? 0.1;
        const fraction = ctx.foodFraction ?? 1;
        if (fraction < min) return "starving";
    }
    if (guardId === "bandDesperate" && ctx.hungerTier !== "desperate") return "none";
    return null;
}
function passesGuards(guards, ctx, sprintConfig) {
    if (!guards?.length) return null;
    for (let i = 0; i < guards.length; i++) {
        const blocked = guardBlocks(guards[i], ctx, sprintConfig);
        if (blocked) return blocked;
    }
    return null;
}
export function deriveSprintIntent(mode, ctx, sprintConfig) {
    const rules = sprintConfig?.rules;
    if (!rules?.length) return { want: false, reason: "none" };
    for (let i = 0; i < rules.length; i++) {
        const row = rules[i];
        if (row.mode !== mode) continue;
        const blockedReason = passesGuards(row.guards, ctx, sprintConfig);
        if (blockedReason) return { want: false, reason: blockedReason };
        const ruleFn = SPRINT_RULES[row.rule];
        if (!ruleFn?.(ctx, sprintConfig)) continue;
        return { want: row.want ?? true, reason: row.reason ?? "none" };
    }
    return { want: false, reason: "none" };
}
