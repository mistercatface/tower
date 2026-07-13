import { issue, rel, scanInlineTestMocks, scanTestLeaks, walk } from "../audit-shared.mjs";

export const id = "test-production-boundary";
export const description = "No ForTests exports or inline test mocks";
export const severity = "fail";

export function run(ctx) {
    const findings = [];
    const libFiles = ctx.files.filter((f) => rel(ctx.root, f).startsWith("Libraries/"));
    const testFiles = walk(ctx.root, (p) => p.endsWith(".test.js") && isTestRel(rel(ctx.root, p)));
    const scopeFiles = [...new Set([...libFiles, ...testFiles, ...ctx.files])];
    const { forbidden } = scanTestLeaks(ctx.root, scopeFiles);
    for (const row of forbidden) {
        for (const defFile of row.defFiles) {
            findings.push(issue(id, severity, defFile, `ForTests export name: ${row.symbol}`));
        }
    }
    for (const row of scanInlineTestMocks(ctx.root, scopeFiles)) {
        findings.push(issue(id, severity, row.file, `inline mock factory ${row.fn} — move to tests/harness/`));
    }
    return findings;
}

function isTestRel(relPath) {
    return relPath.startsWith("tests/") || relPath.includes("/tests/");
}
