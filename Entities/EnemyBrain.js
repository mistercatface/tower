import { gridSettings } from "../Config/Config.js";
import { normalizeAngle } from "../Math/Angle.js";
import { getNearestHostile } from "../Combat/Targeting.js";

/** BOIDS_STRIPPED vision ranges are in ~1 tile units; scale to world pixels. */
const TILE = gridSettings.cellSize;

const VISION_PROFILES = {
    CASUAL: { fov: 1.05, range: 3 * TILE },
    COMBAT: { fov: 1.15, range: 16 * TILE },
};

const ALERT_DURATION_MS = 1000;

function isInVisionCone(enemy, target, profile) {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const angleToTarget = Math.atan2(dy, dx);
    const angleDiff = normalizeAngle(angleToTarget - enemy.angle);
    return Math.abs(angleDiff) <= profile.fov / 2;
}

export class EnemyBrain {
    constructor(enemy) {
        this.enemy = enemy;
        this.personalTarget = null;
        this.lookTargetX = null;
        this.lookTargetY = null;
    }

    processVision(state) {
        if (this.enemy.isPassive || state.startNodeIntroActive) {
            this.personalTarget = null;
            return;
        }

        const enemy = this.enemy;
        const patrol = enemy.patrolController;

        let profileKey = "CASUAL";
        if (patrol.state === "chase" || patrol.state === "alert") {
            profileKey = "COMBAT";
        }
        const profile = VISION_PROFILES[profileKey];

        let detectedHostile = null;
        const nearest = getNearestHostile(state, enemy, profile.range, null, { requireLos: true });

        if (nearest && isInVisionCone(enemy, nearest, profile)) {
            detectedHostile = nearest;
        }

        if (detectedHostile) {
            this.personalTarget = detectedHostile;

            if (patrol.state === "chase" || state.alertState?.isChaseActive(state)) {
                state.alertState?.startChase(detectedHostile.x, detectedHostile.y, state);
            } else if (patrol.state !== "alert") {
                patrol.alertParams.x = detectedHostile.x;
                patrol.alertParams.y = detectedHostile.y;
                patrol.alertParams.type = "VISUAL";
                patrol.alertParams.target = detectedHostile;
                patrol.alertParams.duration = ALERT_DURATION_MS;
                patrol.transitionTo("alert");
            } else {
                patrol.alertParams.target = detectedHostile;
                patrol.alertParams.type = "VISUAL";
            }
        } else {
            this.personalTarget = null;
        }
    }

    hearSound(x, y, state) {
        const enemy = this.enemy;
        if (enemy.isPassive || state.startNodeIntroActive) return;

        const patrol = enemy.patrolController;
        if (patrol.state === "chase" || patrol.state === "alert" || this.personalTarget) return;

        patrol.alertParams.x = x;
        patrol.alertParams.y = y;
        patrol.alertParams.type = "AUDITORY";
        patrol.alertParams.target = null;
        patrol.alertParams.duration = ALERT_DURATION_MS;
        patrol.transitionTo("alert");
    }
}
