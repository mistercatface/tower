export function createWallPlaceTool(session) {
    return {
        isActive: () => session.isWallPlaceMode(),
        blocksPlacement: () => session.isWallPlaceMode(),
        onPointerDown(world, e) {
            if (e.button === 2) {
                session.deleteWallAtWorld(world.x, world.y);
                return true;
            }
            if (e.button !== 0) return false;
            if (session.pickWallAtWorld(world.x, world.y)) return true;
            session.stampWallAtWorld(world.x, world.y);
            return true;
        },
    };
}
