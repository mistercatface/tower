/** Spawn-only — locked room nodes live in `state.roomGraph` with `kind: "locked"`. */
export default { id: "locked_room", sandbox: { spawnLabel: "Locked room", roomNode: true, lockedRoom: true, tags: ["rooms"] }, physics: { renderMode: "none" } };
