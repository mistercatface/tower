import fs from "node:fs";
import path from "node:path";

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
    const p = relPath.replace(/\\/g, "/");
    return p.startsWith("tests/") || p.includes("/tests/");
}

export function issue(ruleId, severity, file, message, line = null) {
    return { ruleId, severity, file, message, line };
}

const exportRe = /^export (?:async )?(?:function|const|class) (\w+)/gm;
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

export function scanTestLeaks(root, files) {
    const libFiles = files.filter((f) => rel(root, f).startsWith("Libraries/"));
    const exports = libraryExports(root, libFiles);
    const forbidden = [];
    for (const [symbol, defFiles] of exports) {
        if (forTestsNameRe.test(symbol)) forbidden.push({ symbol, defFiles });
    }
    return { forbidden };
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
