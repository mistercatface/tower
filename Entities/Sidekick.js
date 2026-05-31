import { Actor } from "./Actor.js";
import { NAV_PROFILES, navigationSettings, sidekickBaseStats } from "../Config/Config.js";
import { defaultGunId } from "../Config/gunDefinitions.js";
import { createEntityBars } from "./EntityBars.js";
import { GhostTrail } from "../Render/GhostTrail.js";

const sidekickBars = createEntityBars({ healthWidth: 40, healthHeight: 4, healthBorderRadius: 2 });

const LEADER_EDGE_GAP = 16;
const APPROACH_SLOW_RADIUS = 48;

export class Sidekick extends Actor {
    static healthBar = sidekickBars.healthBar;

    static create(x, y, radius) {
        const sidekick = new Sidekick(x, y, radius);
        sidekick.applyWeaponLoadout([defaultGunId]);
        sidekick.health = sidekick.maxHealth;
        return sidekick;
    }

    constructor(x, y, radius) {
        super(x, y, radius, sidekickBaseStats.speed, sidekickBaseStats.maxHealth, "#00BCD4", "companion", 3.0, false);
        this.faction = "player";
        this.teamId = 0;
        this.alwaysRunsTurretCombat = true;
        this.healthBar = Sidekick.healthBar;
        this.setupCombatant(sidekickBaseStats);
        this.initCombatWeapon();
        this.followOffset = 48;
        this.spawnX = x;
        this.spawnY = y;
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

    getFollowPoint(leader) {
        const angle = leader.angle;
        const offset = Math.max(this.followOffset, this.getMinLeaderDistance(leader));
        return { x: leader.x - Math.cos(angle) * offset, y: leader.y - Math.sin(angle) * offset };
    }

    isAtFollowSlot(leader) {
        const { x, y } = this.getFollowPoint(leader);
        return Math.hypot(this.x - x, this.y - y) <= navigationSettings.arrivalDistance + 8;
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

    updateCombat(dt, state, spatialHash, options = {}) {
        this.ghostTrail?.update(dt, this.x, this.y, this.angle);
        const leader = state.player;
        if (!leader || leader.isDead) {
            this.holdPosition();
            this.applyLocomotion(dt, spatialHash, { ...options, state });
            this.updateTurretCombat(dt, state, options);
            return;
        }

        const minLeaderDist = this.getMinLeaderDistance(leader);
        const leaderDist = Math.hypot(this.x - leader.x, this.y - leader.y);
        const { x: followX, y: followY } = this.getFollowPoint(leader);
        const followDist = Math.hypot(this.x - followX, this.y - followY);
        const baseSpeed = this.speed;

        if (leaderDist <= minLeaderDist) {
            if (leaderDist < minLeaderDist) {
                const dx = this.x - leader.x;
                const dy = this.y - leader.y;
                const len = Math.hypot(dx, dy) || 1;
                this.desiredX = dx / len;
                this.desiredY = dy / len;
                this.speed = baseSpeed * 0.35;
            } else {
                this.holdPosition();
            }
        } else if (followDist > navigationSettings.arrivalDistance + 8 && leaderDist > minLeaderDist + 6) {
            state.navigation.steerTo(this, followX, followY, NAV_PROFILES.sidekickFollow, state.flowFieldGrid);

            if (leaderDist < minLeaderDist + APPROACH_SLOW_RADIUS) {
                const t = (leaderDist - minLeaderDist) / APPROACH_SLOW_RADIUS;
                this.speed = baseSpeed * Math.max(0.25, t);
            }
        } else {
            this.holdPosition();
        }

        this.applyLocomotion(dt, spatialHash, { ...options, state });
        this.speed = baseSpeed;
        this.enforceLeaderClearance(leader);
        this.updateTurretCombat(dt, state, options);
    }
}
