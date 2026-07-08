const fs = require("fs");
const path = require("path");

const navDir = "c:/Users/mrjbl/Desktop/tower/Libraries/Navigation";

// Read current NavCore.js and NavHPA.js
const coreContent = fs.readFileSync(path.join(navDir, "NavCore.js"), "utf8");
const hpaContent = fs.readFileSync(path.join(navDir, "NavHPA.js"), "utf8");

// Split by // --- filename ---
function extractBlocks(content) {
    const blocks = {};
    const parts = content.split(/\/\/ ---\s+(.*?)\s+---\r?\n/g);
    // parts[0] is imports
    blocks["imports"] = parts[0];
    for (let i = 1; i < parts.length; i += 2) {
        blocks[parts[i]] = parts[i + 1];
    }
    return blocks;
}

const coreBlocks = extractBlocks(coreContent);
const hpaBlocks = extractBlocks(hpaContent);

const allBlocks = { ...coreBlocks, ...hpaBlocks };

// We want to reorganize them to fix circular dependency:
// NavCore.js (Base tools, Math, Search)
const newCoreGroups = ["NavMath.js", "NavSearch.js", "NavUtils.js", "CorridorPathfinder.js", "NavRuntime.js", "NavReplanPolicy.js"];

// NavHPA.js (HPA Region, HPA Navigation, NavTopology)
const newHpaGroups = ["NavTopology.js", "HpaRegion.js", "HpaNavigation.js"];

// Wait, does NavRuntime.js depend on NavTopology?
// Let's just bundle everything into NavCore.js as ONE FILE, and NavHPA.js just exports from it!
// This avoids ALL circular dependencies and preserves the 3 files!
let allCode = "";
for (const file of [...newCoreGroups, ...newHpaGroups]) {
    if (allBlocks[file]) {
        allCode += "\n// --- " + file + " ---\n" + allBlocks[file];
    }
}

// We need to re-run the import resolver for this single file.
const importRegex = /import\s+({[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]\.\/([^'"]+)['"];?\r?\n/g;
const externalImportRegex = /import\s+({[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"](\.\.\/[^'"]+)['"];?\r?\n/g;

let externalImports = new Map();
let localImports = new Map();

allCode = allCode.replace(importRegex, (match, names, importFile) => {
    if (importFile === "PathfindingWorkerClient.js" || importFile === "HpaPathWorker.js" || importFile === "NavFlowField.js") {
        if (!localImports.has(importFile)) localImports.set(importFile, new Set());
        names.replace(/[{}]/g, "").split(",").forEach(n => localImports.get(importFile).add(n.trim()));
    }
    return "";
});

allCode = allCode.replace(externalImportRegex, (match, names, importPath) => {
    if (!externalImports.has(importPath)) externalImports.set(importPath, new Set());
    names.replace(/[{}]/g, "").split(",").forEach(n => externalImports.get(importPath).add(n.trim()));
    return "";
});

let importBlock = "";
for (const [importPath, namesSet] of externalImports.entries()) {
    const names = Array.from(namesSet).filter(Boolean);
    if (names.length > 0) importBlock += "import { " + names.join(", ") + " } from \"" + importPath + "\";\n";
}
for (const [importFile, namesSet] of localImports.entries()) {
    const names = Array.from(namesSet).filter(Boolean);
    if (names.length > 0) importBlock += "import { " + names.join(", ") + " } from \"./" + importFile + "\";\n";
}

fs.writeFileSync(path.join(navDir, "NavCore.js"), importBlock + allCode);
fs.writeFileSync(path.join(navDir, "NavHPA.js"), "export * from \"./NavCore.js\";\n");

console.log("Fixed TDZ by merging into NavCore and re-exporting in NavHPA");
