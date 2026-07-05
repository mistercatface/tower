import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenImport = /from\s+["'][^"']*Sandbox\/sandbox\.js["']/;

describe("sandbox import guard", () => {
    for (const rel of ["Libraries/Props/props.js", "Libraries/Render/render.js"]) {
        it(`${rel} must not import sandbox.js`, () => {
            const source = readFileSync(join(root, rel), "utf8");
            assert.equal(forbiddenImport.test(source), false, `${rel} imports sandbox.js — breaks render/props ↔ sandbox cycle isolation`);
        });
    }
});
