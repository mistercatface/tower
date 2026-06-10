/**
 * Pool table assembly — runtime module mirror of {@link ./poolTable.assembly.json}.
 * Export/import and future UI authoring use the JSON file; keep both in sync.
 *
 * @typedef {import("./assemblyManifest.js").AssemblyManifest} AssemblyManifest
 * @type {AssemblyManifest}
 */
const poolTableAssembly = {
    id: "poolTable",
    version: 1,
    props: { cueBall: "pool_cue_ball", objectBall: "pool_ball" },
    link: { groupField: "sandboxGroupId" },
    layout: { referenceBallRadius: 8, ballRadius: 2, cols: 24, rows: 44, railCells: 2, wallPocketSegmentSize: 6, pocketCornerRadiusFactor: 2.15, pocketSideRadiusFactor: 1.75, pocketDepthFactor: 3 },
    behaviors: {
        pool_cue_ball: {
            cueStrike: { minDrag: 3, maxPull: 75, pullScale: 0.5, minPower: 16, maxPower: 1200, powerCurve: 2.5 },
            inputGates: {
                cueStrike: [
                    { scope: "self", until: "atRest" },
                    { scope: "groupPickups", link: "sandboxGroupId", until: "allAtRest", excludeStates: ["voidSink"] },
                ],
            },
        },
    },
    spawn: ["walls", "voidPockets", "rack"],
};
export default poolTableAssembly;
