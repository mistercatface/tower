import { Actor } from "./Actor.js";
import { NAV_PROFILES, navigationSettings, sidekickBaseStats } from "../Config/Config.js";
import { barryStartGunId } from "../Config/gunDefinitions.js";
import { createEntityBars } from "./EntityBars.js";
import { advanceActorKinematics, renderActorKinematicsBody } from "../Render/Kinematics/PlayerKinematicsRenderer.js";

const sidekickBars = createEntityBars({ healthWidth: 40, healthHeight: 4, healthBorderRadius: 2 });

const LEADER_EDGE_GAP = 16;

export class Sidekick extends Actor {
    static healthBar = sidekickBars.healthBar;

    static create(x, y, radius) {
        const sidekick = new Sidekick(x, y, radius);
        sidekick.applyWeaponLoadout([barryStartGunId]);
        sidekick.health = sidekick.maxHealth;
        return sidekick;
    }

    constructor(x, y, radius) {
        super(x, y, radius, sidekickBaseStats.speed, sidekickBaseStats.maxHealth, "#00BCD4", "companion", 3.0, false);
        this.teamId = 0;
        this.alwaysRunsTurretCombat = true;
        this.usesKinematicsBody = true;
        this.healthBar = Sidekick.healthBar;
        this.setupCombatant(sidekickBaseStats);
        this.initCombatWeapon();
        this.spawnX = x;
        this.spawnY = y;
        this.leader = null;
    }

    spawnAt(x, y, leader) {
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
        this.vx = 0;
        this.vy = 0;
        this.isDead = false;
        this.fullHeal();
        this.changeState("navigating");
        this.resetTurretCombatState();
        if (leader) {
            this.leader = leader;
            this.teamId = leader.teamId ?? 0;
        }
    }

    onSectorEnter(state) {
        if (this.isDead) return;
        this.changeState("navigating");
        this.resetTurretCombatState();
    }

    getMinLeaderDistance(leader) {
        return leader.radius + this.radius + LEADER_EDGE_GAP;
    }

    holdPosition() {
        this.desiredX = 0;
        this.desiredY = 0;
        this.vx = 0;
        this.vy = 0;
    }

    enforceLeaderClearance(leader) {
        const minDist = this.getMinLeaderDistance(leader);
        let dx = this.x - leader.x;
        let dy = this.y - leader.y;
        let dist = Math.hypot(dx, dy);

        if (dist >= minDist) return;

        if (dist < 0.001) {
            const angle = leader.angle + Math.PI;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 1;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        this.x = leader.x + nx * minDist;
        this.y = leader.y + ny * minDist;

        const towardLeader = this.vx * nx + this.vy * ny;
        if (towardLeader > 0) {
            this.vx -= towardLeader * nx;
            this.vy -= towardLeader * ny;
        }

        this.holdPosition();
    }

    updateLocomotion(dt, state, spatialFrame, options = {}) {
        const leader = this.leader ?? state.getLeader?.() ?? state.player;
        if (!leader || leader.isDead) {
            this.holdPosition();
            this.applyLocomotion(dt, spatialFrame, { ...options, state });
            return;
        }

        const minLeaderDist = this.getMinLeaderDistance(leader);
        const leaderDist = Math.hypot(this.x - leader.x, this.y - leader.y);
        const baseSpeed = this.speed;
        const arriveDist = navigationSettings.arrivalDistance + minLeaderDist;

        if (leaderDist > arriveDist) {
            state.navigation.steerTo(this, leader.x, leader.y, NAV_PROFILES.sidekickFollow, state.flowFieldGrid);
        } else if (leaderDist < minLeaderDist) {
            const dx = this.x - leader.x;
            const dy = this.y - leader.y;
            const len = Math.hypot(dx, dy) || 1;
            this.desiredX = dx / len;
            this.desiredY = dy / len;
            this.speed = baseSpeed * 0.35;
        } else {
            this.holdPosition();
        }

        this.applyLocomotion(dt, spatialFrame, { ...options, state });
        this.speed = baseSpeed;
        this.enforceLeaderClearance(leader);

        const camera = { x: leader.x, y: leader.y };
        advanceActorKinematics(this, dt, camera);
    }

    getKinematicsCamera() {
        const leader = this.leader;
        return leader ? { x: leader.x, y: leader.y } : { x: this.x, y: this.y };
    }

    renderBody(ctx, _renderer) {
        renderActorKinematicsBody(ctx, this, this.getKinematicsCamera());
    }
}
