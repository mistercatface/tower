import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { createSandboxSession } from "../Libraries/Sandbox/sandboxSession.js";
import { createSandboxController } from "../Libraries/SandboxEditor/createSandboxController.js";
import { spawnPlaceableAt } from "../Libraries/Sandbox/sandboxScenePlaceables.js";
import { createSandboxSpawnSession } from "../Libraries/Sandbox/sandboxSpawnSession.js";
import { appendShapeFamilySelectedFields } from "../Libraries/SandboxEditor/ui/sandboxShapeFamilyUi.js";
import { setPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { setPropRadius } from "../Libraries/Props/props.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";

import propCatalog from "../Assets/props/index.js";
function createEditorTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 512, 512);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        viewport: { x: 128, y: 128, snapTo() {} },
        worldSurfaces: { settings: { maxWallHeightLevel: 8 } },
    };
}

class TestElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.className = "";
        this.style = {};
        this.textContent = "";
        this.hidden = false;
        this.type = "";
        this.value = "";
        this.checked = false;
        this.title = "";
        this.name = "";
        this.autocomplete = "";
        this.spellcheck = false;
    }
    appendChild(child) {
        this.children.push(child);
        return child;
    }
    append(...nodes) {
        for (const node of nodes) this.appendChild(node);
    }
    addEventListener() {}
    replaceChildren() {
        this.children.length = 0;
    }
    setAttribute() {}
    contains() {
        return false;
    }
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
    }
}

function installTestDocument() {
    if (globalThis.document?.createElement?.("div") instanceof TestElement) return;
    globalThis.document = {
        createElement(tag) {
            return new TestElement(tag);
        },
        createTextNode(text) {
            const node = new TestElement("#text");
            node.textContent = text;
            return node;
        },
    };
}

function mockPanelBody() {
    return new TestElement("div");
}

function spawnBall(state, x = 64, y = 64) {
    const prop = spawnPlacedSandboxProp(state, x, y, "ball", "neutral");
    setPropRadius(prop, 5);
    return prop;
}

describe("sandbox editor inspector wiring", () => {
    beforeEach(() => {
        installTestDocument();
    });

    it("appendShapeFamilySelectedFields builds ball fields without throwing", () => {
        const state = createEditorTestState();
        const prop = spawnBall(state);
        const body = mockPanelBody();
        assert.doesNotThrow(() => appendShapeFamilySelectedFields(body, prop));
        assert.ok(body.children.length > 0);
    });

    it("appendShapeFamilySelectedFields builds crate fields without throwing", () => {
        const state = createEditorTestState();
        const prop = spawnPlacedSandboxProp(state, 80, 80, "crate", "neutral");
        const body = mockPanelBody();
        assert.doesNotThrow(() => appendShapeFamilySelectedFields(body, prop));
        assert.ok(body.children.length > 0);
    });

    it("appendShapeFamilySelectedFields builds custom_box resizable fields", () => {
        const state = createEditorTestState();
        const prop = spawnPlacedSandboxProp(state, 96, 96, "custom_box", "neutral", 0, { x: 12, y: 16 });
        const body = mockPanelBody();
        assert.doesNotThrow(() => appendShapeFamilySelectedFields(body, prop));
        assert.ok(body.children.length > 0);
    });

    it("selected prop tint mutations apply to the live registry object", () => {
        const state = createEditorTestState();
        const prop = spawnBall(state);
        const session = createSandboxSession(state);
        session.select({ kind: "prop", ids: [prop.id] });
        const inspector = session.getSelectionInspector();
        assert.equal(inspector.kind, "prop");
        assert.equal(inspector.data, prop);
        setPropVisualTint(inspector.data, "#112233");
        assert.equal(prop.visualOverride.tint, "#112233");
        assert.equal(state.entityRegistry.getLive(prop.id), prop);
    });

    it("createSandboxController exposes getSelectedProp aligned with session", () => {
        const state = createEditorTestState();
        const prop = spawnBall(state);
        const canvas = { addEventListener() {}, removeEventListener() {} };
        const controller = createSandboxController(state, {
            getCanvas: () => canvas,
            clientToWorld: () => ({ x: 0, y: 0 }),
            behaviors: [],
        });
        assert.equal(typeof controller.getSelectedProp, "function");
        controller.select({ kind: "prop", ids: [prop.id] });
        assert.equal(controller.getSelectedProp(), prop);
        controller.select(null);
        assert.equal(controller.getSelectedProp(), null);
    });

    it("spawn with selectSpawned false leaves selection empty", () => {
        const state = createEditorTestState();
        let lastSelection = "unset";
        const session = createSandboxSpawnSession(state, {
            getSpawnPropId: () => "ball",
            pickSelection: (input) => {
                lastSelection = input;
            },
            notifyUi: () => {},
            placement: { touchPropPlacement: () => {} },
        });
        assert.equal(session.spawnAt(64, 64, { selectSpawned: false }), true);
        assert.equal(lastSelection, "unset");
        assert.equal(state.worldProps.length, 1);
    });

    it("spawn with default selectSpawned selects the new prop", () => {
        const state = createEditorTestState();
        let lastSelection = null;
        const session = createSandboxSpawnSession(state, {
            getSpawnPropId: () => "ball",
            pickSelection: (input) => {
                lastSelection = input;
            },
            notifyUi: () => {},
            placement: { touchPropPlacement: () => {} },
        });
        assert.equal(session.spawnAt(64, 64), true);
        assert.equal(lastSelection?.kind, "prop");
        assert.deepEqual(lastSelection.ids, [state.worldProps[0].id]);
    });

    it("spawnPlaceableAt honors selectSpawned false in spawn context", () => {
        const state = createEditorTestState();
        let pickCount = 0;
        const asset = propCatalog["ball"];
        const ctx = {
            spawnPropId: "ball",
            spawnFaction: "neutral",
            resolveSpawnPropTypeId: () => "ball",
            resolveSpawnVisualOverride: () => null,
            spawnBallRadius: 4,
            spawnBoxHalfExtents: { x: 8, y: 8 },
            pickSelection: () => {
                pickCount += 1;
            },
            placement: { touchPropPlacement: () => {} },
            selectSpawned: false,
        };
        assert.equal(spawnPlaceableAt(state, 48, 48, asset, ctx), true);
        assert.equal(pickCount, 0);
    });
});
