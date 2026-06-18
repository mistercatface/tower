import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
export function createGoalSeekAutosim(state, { getSeekerPropId, getGoalPropId, navBehaviorId, behaviorById, eatRadius, onConsume }) {
    let active = false;
    let trackedGoalPropId = null;
    const meta = getSandboxEntityMeta(state);
    const resolveSeeker = () => state.entityRegistry.getLive(getSeekerPropId());
    const resolveGoal = () => state.entityRegistry.getLive(getGoalPropId());
    const navBehavior = () => behaviorById.get(navBehaviorId);
    const refreshNavTarget = () => {
        const seeker = resolveSeeker();
        const goal = resolveGoal();
        if (!seeker || seeker.isDead || !goal || goal.isDead) return;
        const behavior = navBehavior();
        if (!behavior?.setMoveTarget) throw new Error(`Ground nav behavior missing setMoveTarget: ${navBehaviorId}`);
        meta.setActiveBehaviorId(seeker.id, navBehaviorId);
        behavior.setMoveTarget(seeker, { x: goal.x, y: goal.y });
        trackedGoalPropId = goal.id;
    };
    return {
        start() {
            active = true;
            trackedGoalPropId = null;
            refreshNavTarget();
        },
        stop() {
            active = false;
            trackedGoalPropId = null;
        },
        isActive() {
            return active;
        },
        tick(_dt) {
            if (!active) return;
            const seeker = resolveSeeker();
            const goal = resolveGoal();
            if (!seeker || seeker.isDead) return;
            if (!goal || goal.isDead) {
                trackedGoalPropId = null;
                refreshNavTarget();
                return;
            }
            const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
            if (dist <= eatRadius) {
                onConsume({ seeker, goal });
                trackedGoalPropId = null;
                refreshNavTarget();
                return;
            }
            const behavior = navBehavior();
            if (goal.id !== trackedGoalPropId) refreshNavTarget();
            else if (behavior?.hasMoveTarget && !behavior.hasMoveTarget(seeker)) refreshNavTarget();
        },
    };
}
