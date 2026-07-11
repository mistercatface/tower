import fs from "node:fs";
import path from "node:path";

export const DELETED_PASSTHROUGH_EXPORTS = [
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

export const LEGACY_SCALAR_SYMBOLS = [
    { pattern: /neighborGridDims/, label: "neighborGridDims" },
    { pattern: /gridToWorldByIdx/, label: "gridToWorldByIdx" },
    { pattern: /gridToWorldInCenteredFrame/, label: "gridToWorldInCenteredFrame" },
    { pattern: /worldToGridInCenteredFrame/, label: "worldToGridInCenteredFrame" },
    { pattern: /CARDINAL_OFFSETS/, label: "CARDINAL_OFFSETS" },
    { pattern: /gridSideOutwardVector/, label: "gridSideOutwardVector" },
    { pattern: /cellBoundsScratch/, label: "cellBoundsScratch" },
    { pattern: /ENTITY_AABB_SCRATCH/, label: "ENTITY_AABB_SCRATCH" },
    { pattern: /readSlabIntoBounds/, label: "readSlabIntoBounds" },
    { pattern: /\bSLAB_SCRATCH/, label: "SLAB_SCRATCH" },
    { pattern: /seenPrimaryScratch/, label: "seenPrimaryScratch" },
    { pattern: /wallBestScratch/, label: "wallBestScratch" },
    { pattern: /\bposScratch\b/, label: "posScratch" },
    { pattern: /COMPOUND_BOUNDS_SCRATCH/, label: "COMPOUND_BOUNDS_SCRATCH" },
    { pattern: /pairBroadphaseBoundsOverlap/, label: "pairBroadphaseBoundsOverlap" },
    { pattern: /\bpairBroadphaseOverlap\b/, label: "pairBroadphaseOverlap" },
    { pattern: /getBroadphaseBounds/, label: "getBroadphaseBounds" },
    { pattern: /writeBroadphaseFromBounds/, label: "writeBroadphaseFromBounds" },
    { pattern: /broadphaseBounds/, label: "broadphaseBounds" },
    { pattern: /getCircleSegmentPenetration/, label: "getCircleSegmentPenetration" },
    { pattern: /manifoldPoints/, label: "manifoldPoints" },
];

export const LEGACY_SANDBOX_DRAG_PATTERNS = [
    { pattern: /\bresolveSandboxBehaviors\b/, label: "resolveSandboxBehaviors" },
    { pattern: /\bsetBehaviorOverrides\b/, label: "setBehaviorOverrides" },
    { pattern: /\bgetBehaviorOverrides\b/, label: "getBehaviorOverrides" },
    { pattern: /behaviors:\s*\[/, label: "sandbox.behaviors array in asset" },
];

export function rel(root, filePath) {
    return path.relative(root, filePath).replace(/\\/g, "/");
}

export function walk(dir, pred) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".cursor") continue;
            out.push(...walk(p, pred));
        } else if (pred(p)) out.push(p);
    }
    return out;
}

export function collectJsFiles(root, pathFilter = null) {
    const all = walk(root, (p) => p.endsWith(".js") && !p.includes("node_modules"));
    if (!pathFilter) return all;
    const normalized = pathFilter.replace(/\\/g, "/").replace(/\/$/, "");
    return all.filter((file) => {
        const r = rel(root, file);
        return r === normalized || r.startsWith(`${normalized}/`);
    });
}

export function isTestFile(relPath) {
    return relPath.replace(/\\/g, "/").includes("/tests/");
}

export function isProdConsumer(relPath) {
    if (isTestFile(relPath)) return false;
    const prodRoots = ["Apps", "Assets", "GameState", "Libraries", "Config", "Core"];
    return prodRoots.some((r) => relPath.startsWith(`${r}/`) || relPath === r);
}

export function issue(ruleId, severity, file, message, line = null) {
    return { ruleId, severity, file, message, line };
}

const exportRe = /^export (?:async )?(?:function|const|class) (\w+)/gm;
const importNamedRe = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
const importDefaultRe = /import\s+(\w+)\s+from\s*["']([^"']+)["']/g;
const forTestsNameRe = /ForTests?$/;
const mockFnRe = /^function (mock\w+|createMock\w*)\s*\(/gm;

export function libraryExports(root, files) {
    const map = new Map();
    for (const file of files) {
        const relPath = rel(root, file);
        if (!relPath.startsWith("Libraries/")) continue;
        const src = fs.readFileSync(file, "utf8");
        exportRe.lastIndex = 0;
        let m;
        while ((m = exportRe.exec(src))) {
            const list = map.get(m[1]) ?? [];
            list.push(relPath);
            map.set(m[1], list);
        }
    }
    return map;
}

export function collectImports(root, files) {
    const records = [];
    for (const file of files) {
        const relPath = rel(root, file);
        const src = fs.readFileSync(file, "utf8");
        importNamedRe.lastIndex = 0;
        let m;
        while ((m = importNamedRe.exec(src))) {
            for (const part of m[1].split(",")) {
                const name = part.trim().split(/\s+as\s+/)[0].trim();
                if (name) records.push({ name, from: m[2], file: relPath, default: false });
            }
        }
        importDefaultRe.lastIndex = 0;
        while ((m = importDefaultRe.exec(src))) {
            records.push({ name: m[1], from: m[2], file: relPath, default: true });
        }
    }
    return records;
}

export function importsLibrary(from) {
    return from.includes("/Libraries/") || from.startsWith("../Libraries/") || from.startsWith("../../Libraries/");
}

export function scanTestLeaks(root, files) {
    const libFiles = files.filter((f) => rel(root, f).startsWith("Libraries/"));
    const exports = libraryExports(root, libFiles);
    const importRecords = collectImports(root, files).filter((r) => importsLibrary(r.from));
    const forbidden = [];
    const leaks = [];
    for (const [symbol, defFiles] of exports) {
        if (forTestsNameRe.test(symbol)) {
            forbidden.push({ symbol, defFiles });
            continue;
        }
        const users = importRecords.filter((r) => !r.default && r.name === symbol);
        if (users.length === 0) continue;
        const testUsers = users.filter((u) => isTestFile(u.file));
        const prodUsers = users.filter((u) => isProdConsumer(u.file));
        if (testUsers.length > 0 && prodUsers.length === 0) {
            leaks.push({ symbol, defFiles, testUsers: [...new Set(testUsers.map((u) => u.file))] });
        }
    }
    return { forbidden, leaks };
}

export function scanInlineTestMocks(root, files) {
    const mocks = [];
    for (const file of files) {
        const relPath = rel(root, file);
        if (!relPath.endsWith(".test.js") || !isTestFile(relPath)) continue;
        const src = fs.readFileSync(file, "utf8");
        mockFnRe.lastIndex = 0;
        let m;
        while ((m = mockFnRe.exec(src))) mocks.push({ file: relPath, fn: m[1] });
    }
    return mocks;
}
