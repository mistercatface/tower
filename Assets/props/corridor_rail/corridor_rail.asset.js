/** Spawn-only — corridor links live in `state.roomGraph`, not WorldProps. */
export default { id: "corridor_rail", sandbox: { spawnLabel: "Belt corridor", roomLink: true, corridorType: "conveyorOneWay" }, physics: { renderMode: "none" } };
