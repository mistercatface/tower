import { Actor } from "./Actor.js";
import { navigationSettings } from "../../../Libraries/Navigation/createRoguelikeNavRuntime.js";
import { NAV_PROFILES } from "../config/towerConfig.js";
import { createEntityBars } from "./EntityBars.js";
import { renderActorKinematicsBody } from "../../../Libraries/Render/Characters/actorKinematicsRenderer.js";
const sidekickBars = createEntityBars({ healthWidth: 40, healthHeight: 4, healthBorderRadius: 2 });
/** @typedef {import("./EntityRegistryTypes.js").AllyEntityDefinition} AllyEntityDefinition */
export class Sidekick extends Actor {
    static healthBar = sidekickBars.healthBar;
    /** @param {number} x @param {number} y @param {AllyEntityDefinition} definition */
    static create(x, y, definition) {
        const sidekick = new Sidekick(x, y, definition);
        sidekick.applyWeaponLoadout([definition.startGunId]);
        sidekick.health = sidekick.maxHealth;
        return sidekick;
    }
    /** @param {number} x @param {number} y @param {AllyEntityDefinition} definition */
    constructor(x, y, definition) {
        const stats = definition.stats;
        super(x, y, definition.radius, stats.speed, stats.maxHealth, definition.color, definition.actorType ?? "companion", 3.0, false);
        this.teamId = 0;
        this.alwaysRunsTurretCombat = true;
        this.usesKinematicsBody = true;
        this.healthBar = Sidekick.healthBar;
        this.leaderEdgeGap = definition.leaderEdgeGap ?? 16;
        this.setupCombatant(stats);
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
    onCombatReenter(state) {
        if (this.isDead) return;
        this.changeState("navigating");
        this.resetTurretCombatState();
    }
    getMinLeaderDistance(leader) {
        return leader.radius + this.radius + this.leaderEdgeGap;
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
        if (leaderDist > arriveDist) state.navigation.steerTo(this, leader.x, leader.y, NAV_PROFILES.sidekickFollow, state.flowFieldGrid, state);
        else if (leaderDist < minLeaderDist) {
            const dx = this.x - leader.x;
            const dy = this.y - leader.y;
            const len = Math.hypot(dx, dy) || 1;
            this.desiredX = dx / len;
            this.desiredY = dy / len;
            this.speed = baseSpeed * 0.35;
        } else this.holdPosition();
        this.applyLocomotion(dt, spatialFrame, { ...options, state });
        this.speed = baseSpeed;
        this.enforceLeaderClearance(leader);
    }
    getKinematicsCamera(state) {
        const leader = this.leader ?? state?.getLeader?.() ?? state?.player;
        return leader ? { x: leader.x, y: leader.y } : { x: this.x, y: this.y };
    }
    renderBody(ctx, _renderer) {
        renderActorKinematicsBody(ctx, this, this._kinematicsCamera ?? { x: this.x, y: this.y });
    }
}
