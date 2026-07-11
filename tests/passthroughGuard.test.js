import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const scanRoots = [
    "Libraries/Sandbox/sandbox.js",
    "Libraries/Props/props.js",
    "Libraries/Physics/physics.js",
    "Libraries/Spatial/spatial.js",
    "Libraries/Navigation/navigation.js",
];

const deletedPassthroughExports = [
    "getChainMemberIds",
    "isSpawnerWorldProp",
    "applyFractureGeometryToProp",
    "applyChunkGeometryToProp",
    "localBoxOutline",
    "momentOfInertiaFromBody",
    "createDragLaunchWaitBehavior",
    "createDragLaunchFacingBehavior",
    "createCueStrikeBehavior",
    "createSpawnerBehavior",
    "createDirectGroundNavBehavior",
    "createFlowGroundNavBehavior",
    "createHpaGroundNavBehavior",
    "expandNavTopologyBakeBounds",
    "isNavWalkableCellAtIndex",
    "kineticTickFromState",
    "worldSimFromState",
    "createKineticTick",
    "isEntityAtRest",
    "isEntityAsleep",
    "removeSandboxWorldProp",
    "isShapeFamilyAsset",
    "getPropRadius",
    "setPropRadius",
    "inverseMassFromBody",
    "integrateRollOrientation",
    "isKinetic",
    "radiusAtT",
    "scaleAtHeight",
    "snapshotWorldCol",
    "snapshotWorldRow",
    "mapGenerationCellBounds",
    "agentPose",
    "SCRATCH_PATH_STEERING",
    "SCRATCH_AGENT_POSE",
    "writeStaticKineticSlabSlot",
    "syncEntitySlotPoseFromRef",
    "kineticSleepScratch",
    "writebackActiveKineticBodySlab",
    "writebackEntitySlotPoseToRef",
    "sleepContactBuffer",
    "buildAdjacency",
    "addAdjacencyEdge",
    "getKineticConstraintGraph",
];

function walkGameStateJs(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walkGameStateJs(path, out);
        else if (name.endsWith(".js")) out.push(path);
    }
    return out;
}

function scanDeletedPassthroughs(source, relPath) {
    const offenders = [];
    for (const name of deletedPassthroughExports) {
        if (new RegExp(`\\bexport\\s+(?:function|const|class|let|var)\\s+${name}\\b|\\bexport\\s*\\{[^}]*\\b${name}\\b`).test(source)) {
            offenders.push(`${relPath}: deleted passthrough ${name} reintroduced`);
        }
    }
    return offenders;
}

describe("passthrough guard", () => {
    it("deleted glue modules must stay removed", () => {
        assert.equal(existsSync(join(root, "GameState/KineticTick.js")), false);
        assert.equal(existsSync(join(root, "GameState/WorldSim.js")), false);
    });

    it("deleted alias exports must not reappear in monolith modules", () => {
        const offenders = [];
        for (const rel of scanRoots) {
            offenders.push(...scanDeletedPassthroughs(readFileSync(join(root, rel), "utf8"), rel));
        }
        for (const file of walkGameStateJs(join(root, "GameState"))) {
            const rel = file.slice(root.length + 1).replace(/\\/g, "/");
            offenders.push(...scanDeletedPassthroughs(readFileSync(file, "utf8"), rel));
        }
        assert.deepEqual(offenders, [], offenders.join("\n"));
    });
});
