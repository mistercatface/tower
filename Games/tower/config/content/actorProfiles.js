import { projectilePresets } from "./guns.js";
const allyStatusBarOffset = (radius) => radius + 14;
const enemyStatusBarOffset = () => 14;
export const actorProfiles = {
    player: { faction: "player", statusBarOffset: allyStatusBarOffset, projectileColor: projectilePresets.playerStandard.color },
    companion: { faction: "player", statusBarOffset: allyStatusBarOffset, projectileColor: projectilePresets.playerStandard.color },
    enemy: { faction: "enemy", statusBarOffset: enemyStatusBarOffset, projectileColor: projectilePresets.enemyStandard.color },
};
export function getActorProfileForType(type) {
    if (type === "player" || type === "companion") return actorProfiles[type];
    return actorProfiles.enemy;
}
export function getActorProfileForActor(actor) {
    if (actor?.type === "player" || actor?.type === "companion") return actorProfiles[actor.type];
    return actorProfiles.enemy;
}
