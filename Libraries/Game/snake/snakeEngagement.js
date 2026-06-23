export function deriveSnakeEngagementState(blackboard, chosenIntent) {
    const visible = blackboard.facts.visible;
    const remembered = blackboard.facts.remembered;
    const salience = [];
    if (visible.threat || remembered.threat) salience.push("threat");
    if (visible.prey || remembered.prey) salience.push("prey");
    if (visible.food || remembered.food) salience.push("food");
    const mode = chosenIntent?.mode ?? null;
    if (mode === "explore" || mode === "seek_ally" || salience.length === 0) return { active: false, salience, mode };
    const acting =
        (mode === "seek_food" && (visible.food || remembered.food)) || (mode === "seek_prey" && (visible.prey || remembered.prey)) || (mode === "flee" && (visible.threat || remembered.threat));
    return { active: !!acting, salience, mode };
}
