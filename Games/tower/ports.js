import {
    ACTOR_PUSHABLE_PAIR,
    CHARGE_IMPACT,
    COMBAT_SEPARATION,
    COMBATANT_PAIR,
    PROJECTILE_HIT_ACTOR,
    PROJECTILE_HIT_PICKUP,
    PUSHABLE_PAIR,
    PUSHABLE_SLEEP_BLOCKER,
} from "./presets/combat.js";
import * as targeting from "./targeting.js";
import { defaultWorldPropRecipes } from "../../Libraries/Props/defaultWorldPropRecipes.js";
import { towerKinematicsPorts } from "./kinematics/ports.js";

/** @type {import("../../Core/GameDefinitionTypes.js").CombatPairsPort} */
export const towerCombatPairs = {
    separation: COMBAT_SEPARATION,
    chargeImpact: CHARGE_IMPACT,
    projectileHitActor: PROJECTILE_HIT_ACTOR,
    projectileHitPickup: PROJECTILE_HIT_PICKUP,
    combatant: COMBATANT_PAIR,
    actorPushable: ACTOR_PUSHABLE_PAIR,
    pushable: PUSHABLE_PAIR,
    pushableSleepBlocker: PUSHABLE_SLEEP_BLOCKER,
};

/** @type {import("../../Core/GameDefinitionTypes.js").TargetingPort} */
export const towerTargeting = {
    inferFaction: targeting.inferFaction,
    areHostile: targeting.areHostile,
    getPlayerActors: targeting.getPlayerActors,
    getHostiles: targeting.getHostiles,
    getNearestHostile: targeting.getNearestHostile,
    isValidTurretTarget: targeting.isValidTurretTarget,
};

/** @type {import("../../Core/GameDefinitionTypes.js").RenderPorts} */
export const towerRenderPorts = {
    world3dPropRecipes: defaultWorldPropRecipes,
    kinematicsPorts: towerKinematicsPorts,
};
