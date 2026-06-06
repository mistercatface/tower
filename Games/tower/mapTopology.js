/** @typedef {import("../../Libraries/WorldGen/topology.js").RoguelikeMapTopology} RoguelikeMapTopology */
/** Tower roguelike map graph + backdrop — tune here, not in shared Config. */
export const TOWER_MAP_TOPOLOGY = /** @type {RoguelikeMapTopology} */ ({
    numLayers: 5,
    layerSpacing: 170,
    xSpacing: 170,
    nodeJitter: 0,
    extraConnectionChance: 0.3,
    backdropMargin: 800,
    roomZoneRadius: 548,
    caFillChance: 0.45,
    caIterations: 3,
    nodeRoomSerializeRadius: 480,
});
