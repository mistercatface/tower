import {
    ACTOR_PUSHABLE_PAIR,
    CHARGE_IMPACT,
    COMBAT_SEPARATION,
    COMBATANT_PAIR,
    PROJECTILE_HIT_ACTOR,
    PROJECTILE_HIT_PICKUP,
    PUSHABLE_PAIR,
    PUSHABLE_SLEEP_BLOCKER,
} from "../tower/presets/combat.js";
import * as targeting from "./targeting.js";
import { getWorldPropRecipes } from "../../Libraries/Content/PropCatalog.js";
import { GUN_ID_TO_VISUAL } from "../../Assets/guns/visualMap.js";
import { towerAppearanceOverrides } from "../../Assets/characters/index.js";
import { createDefaultKinematicsPorts } from "../../Libraries/Kinematics/kinematicsPorts.js";

/** @type {import("../../Core/GameDefinitionTypes.js").CombatPairsPort} */
export const yardballCombatPairs = {
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
export const yardballTargeting = {
    inferFaction: targeting.inferFaction,
    areHostile: targeting.areHostile,
    getPlayerActors: targeting.getPlayerActors,
    getHostiles: targeting.getHostiles,
    getNearestHostile: targeting.getNearestHostile,
    isValidTurretTarget: targeting.isValidTurretTarget,
};

/** @type {import("../../Core/GameDefinitionTypes.js").RenderPorts} */
export const yardballRenderPorts = {
    get world3dPropRecipes() {
        return getWorldPropRecipes();
    },
    kinematicsPorts: createDefaultKinematicsPorts({
        appearanceOverrides: towerAppearanceOverrides,
        gunIdToVisual: GUN_ID_TO_VISUAL,
    }),
};
