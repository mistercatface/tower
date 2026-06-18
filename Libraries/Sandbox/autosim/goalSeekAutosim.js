import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";

export function createGoalSeekAutosim(state, { getSeekerPropId, getGoalPropId, navBehaviorId, behaviorById, eatRadius, onConsume }) {
    let active = false;
    const meta = getSandboxEntityMeta(state);

    const resolveSeeker = () => state.entityRegistry.getLive(getSeekerPropId());
    const resolveGoal = () => state.entityRegistry.getLive(getGoalPropId());

    const refreshNavTarget = () => {
        const seeker = resolveSeeker();
        const goal = resolveGoal();
        if (!seeker || seeker.isDead || !goal || goal.isDead) return;
        const behavior = behaviorById.get(navBehaviorId);
        if (!behavior?.setMoveTarget) throw new Error(`Ground nav behavior missing setMoveTarget: ${navBehaviorId}`);
        meta.setActiveBehaviorId(seeker.id, navBehaviorId);
        behavior.setMoveTarget(seeker, { x: goal.x, y: goal.y });
    };

    return {
        start() {
            active = true;
            refreshNavTarget();
        },
        stop() {
            active = false;
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
                refreshNavTarget();
                return;
            }
            const dist = Math.hypot(goal.x - seeker.x, goal.y - seeker.y);
            if (dist <= eatRadius) {
                onConsume({ seeker, goal });
                refreshNavTarget();
                return;
            }
            refreshNavTarget();
        },
    };
}
