/** Hide the combat player for arena games that use props/balls instead. */
export function hideArenaPlayer(player) {
    player.render = () => {};
    player.renderCombatHudClassic = () => {};
    player.desiredX = 0;
    player.desiredY = 0;
    player.vx = 0;
    player.vy = 0;
    player.isMoving = false;
    player.turrets = [];
    player.weaponLoadout = [];
}
