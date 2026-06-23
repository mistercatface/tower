export function deriveSnakeEngagementState(ctx, chosenIntent) {
    const { known, remembered } = ctx;
    const salience = [];
    if (known.threat || remembered.threat) salience.push("threat");
    if (known.prey || remembered.prey) salience.push("prey");
    if (known.food || remembered.food) salience.push("food");
    const mode = chosenIntent?.mode ?? null;
    if (mode === "explore" || mode === "seek_ally" || salience.length === 0) return { active: false, salience, mode };
    const acting = (mode === "seek_food" && (known.food || remembered.food)) || (mode === "seek_prey" && (known.prey || remembered.prey)) || (mode === "flee" && (known.threat || remembered.threat));
    return { active: !!acting, salience, mode };
}
