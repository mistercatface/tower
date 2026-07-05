import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenImport = /from\s+["'][^"']*Sandbox\/sandbox\.js["']/;

const sessionOnlyOnController = /\bcontroller\.(getPlacePaletteKey|getSpawnPropId|getSelection|spawnAt|getSelectedProp|getWallHeightLevel|setWallHeightLevel|listPlacedSceneItems|buildSelectionInspector|deleteSelectedProps)\s*\(/;

function walkJsFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walkJsFiles(path, out);
        else if (name.endsWith(".js")) out.push(path);
    }
    return out;
}

describe("sandbox import guard", () => {
    for (const rel of ["Libraries/Props/props.js", "Libraries/Render/render.js", "Libraries/Physics/physics.js"]) {
        it(`${rel} must not import sandbox.js`, () => {
            const source = readFileSync(join(root, rel), "utf8");
            assert.equal(forbiddenImport.test(source), false, `${rel} imports sandbox.js — breaks render/props ↔ sandbox cycle isolation`);
        });
    }

    it("render.js must not import props.js (one-way props → render only)", () => {
        const source = readFileSync(join(root, "Libraries/Render/render.js"), "utf8");
        assert.equal(/from\s+["'][^"']*Props\/props\.js["']/.test(source), false, "render.js imports props.js — circular dependency");
    });

    it("Apps/Editor must not call session-only APIs on controller (use controller.session)", () => {
        const editorDir = join(root, "Apps", "Editor");
        const offenders = [];
        for (const file of walkJsFiles(editorDir)) {
            const source = readFileSync(file, "utf8");
            if (sessionOnlyOnController.test(source)) offenders.push(file.slice(root.length + 1));
        }
        assert.deepEqual(offenders, [], `session-only APIs on controller:\n${offenders.join("\n")}`);
    });
});
