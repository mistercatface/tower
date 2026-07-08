const fs = require("fs");
const path = require("path");

const navDir = "c:/Users/mrjbl/Desktop/tower/Libraries/Navigation";

const groups = {
    "NavCore.js": ["NavTopology.js", "NavSearch.js", "NavRuntime.js", "NavMath.js", "CorridorPathfinder.js", "NavUtils.js", "NavReplanPolicy.js"],
    "NavHPA.js": ["HpaRegion.js", "HpaNavigation.js"]
};

const fileToGroup = {};
for (const [group, files] of Object.entries(groups)) {
    for (const file of files) {
        fileToGroup[file] = group;
    }
}

// match import { A } from "./file.js"
const importRegex = /import\s+({[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]\.\/([^'"]+)['"];?\r?\n/g;
// match import { A } from "../file.js"
const externalImportRegex = /import\s+({[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"](\.\.\/[^'"]+)['"];?\r?\n/g;

for (const [out, ins] of Object.entries(groups)) {
    let combinedCode = "";
    let externalImports = new Map();
    let localImports = new Map();

    for (const file of ins) {
        const filePath = path.join(navDir, file);
        if (!fs.existsSync(filePath)) {
            console.log("Missing " + filePath);
            continue;
        }
        
        let content = fs.readFileSync(filePath, "utf8");
        
        content = content.replace(importRegex, (match, names, importFile) => {
            const targetGroup = fileToGroup[importFile];
            if (targetGroup === out) {
                return "";
            } else if (targetGroup) {
                if (!localImports.has(targetGroup)) localImports.set(targetGroup, new Set());
                names.replace(/[{}]/g, "").split(",").forEach(n => localImports.get(targetGroup).add(n.trim()));
                return "";
            } else {
                if (!localImports.has(importFile)) localImports.set(importFile, new Set());
                names.replace(/[{}]/g, "").split(",").forEach(n => localImports.get(importFile).add(n.trim()));
                return "";
            }
        });

        content = content.replace(externalImportRegex, (match, names, importPath) => {
            if (!externalImports.has(importPath)) externalImports.set(importPath, new Set());
            names.replace(/[{}]/g, "").split(",").forEach(n => externalImports.get(importPath).add(n.trim()));
            return "";
        });
        
        combinedCode += "\n// --- " + file + " ---\n" + content;
    }
    
    let importBlock = "";
    for (const [importPath, namesSet] of externalImports.entries()) {
        const names = Array.from(namesSet).filter(Boolean);
        if (names.length > 0) importBlock += "import { " + names.join(", ") + " } from \"" + importPath + "\";\n";
    }
    for (const [importFile, namesSet] of localImports.entries()) {
        const names = Array.from(namesSet).filter(Boolean);
        if (names.length > 0) importBlock += "import { " + names.join(", ") + " } from \"./" + importFile + "\";\n";
    }
    
    fs.writeFileSync(path.join(navDir, out), importBlock + combinedCode);
}
console.log("Merged files");
