import { installTestDocument, mockPanelBody } from "./harness/sandboxInspectorHarness.js";
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../Libraries/Sandbox/sandbox.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { createSandboxSession, spawnPlacedSandboxProp, createSandboxController, appendShapeFamilySelectedFields } from "../Libraries/Sandbox/sandbox.js";
import { setPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
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

function spawnBall(state, x = 64, y = 64) {
    const prop = spawnPlacedSandboxProp(state, x, y, "ball", "neutral");
    setCirclePropRadius(prop, 5);
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
        assert.equal(typeof controller.session.getSelectedProp, "function");
        controller.session.select({ kind: "prop", ids: [prop.id] });
        assert.equal(controller.session.getSelectedProp(), prop);
        controller.session.select(null);
        assert.equal(controller.session.getSelectedProp(), null);
    });

    it("spawn with selectSpawned false leaves selection empty", () => {
        const state = createEditorTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:ball");
        assert.equal(session.spawnAt(64, 64, { selectSpawned: false }), true);
        assert.equal(session.getSelection(), null);
        assert.equal(state.worldProps.length, 1);
    });

    it("spawn with default selectSpawned selects the new prop", () => {
        const state = createEditorTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:ball");
        assert.equal(session.spawnAt(64, 64), true);
        const selection = session.getSelection();
        assert.equal(selection?.kind, "prop");
        assert.ok(selection.ids.has(state.worldProps[0].id));
    });

    it("spawnAt honors selectSpawned false in spawn context", () => {
        const state = createEditorTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:ball");
        session.setSpawnBallRadius(4);
        assert.equal(session.spawnAt(48, 48, { selectSpawned: false }), true);
        assert.equal(state.worldProps.length, 1);
        assert.equal(session.getSelection(), null);
    });
});
