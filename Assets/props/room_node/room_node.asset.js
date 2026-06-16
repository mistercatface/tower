/** Spawn-only — room nodes live in `state.roomGraph`, not WorldProps. */
export default { id: "room_node", sandbox: { spawnLabel: "Room node", roomNode: true, tags: ["rooms"] }, physics: { renderMode: "none" } };
