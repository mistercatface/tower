export const TILELAB_UI_HTML = `
<div class="app">
    <div class="toolbar">
        <h1>Tile Lab</h1>
        <span class="sep"></span>
        <label class="check-inline"><input type="checkbox" id="showTopologyOverlayInput"> Topology overlay</label>
        <span class="hint-inline">Drag to launch beach ball</span>
        <span class="sep"></span>
        <label>Map seed <input id="mapSeedInput" type="number" value="42"></label>
        <button type="button" id="regenMapBtn" class="secondary">New map</button>
        <span id="surfaceToolbarGroup">
            <span class="sep"></span>
            <label>Floor seed <input id="seedInput" type="number" value="42" step="1"></label>
            <button type="button" id="randomSeedBtn" class="secondary">Rand</button>
            <span class="sep"></span>
            <span id="rangeMeta" class="range-meta"></span>
            <span class="sep"></span>
            <label class="check-inline"><input id="showRangeRingInput" type="checkbox" checked> Range ring</label>
            <label class="check-inline"><input id="showVignetteInput" type="checkbox"> Circular Overlay</label>
            <span class="sep"></span>
            <button type="button" id="regenerateBtn">Redraw</button>
        </span>
    </div>
    <div class="workspace">
        <aside class="col col-editor">
            <div id="surfaceEditorPanel" class="col-body">
                <div class="col-head">Profile editor</div>
                <div class="editor-tools">
                    <select id="presetSelect"></select>
                    <button type="button" id="loadPresetBtn">Load</button>
                    <select id="addMotifType"></select>
                    <button type="button" id="addMotifBtn" class="secondary">+ Motif</button>
                    <button type="button" id="copyExportBtn">Copy export</button>
                </div>
                <div class="editor-scroll">
                    <details class="editor-block" open>
                        <summary>Motifs</summary>
                        <div id="motifList"></div>
                    </details>
                    <details class="editor-block" open>
                        <summary>Selected</summary>
                        <div id="motifParamsPanel"></div>
                    </details>
                    <details class="editor-block" open>
                        <summary>Animation</summary>
                        <div id="animationParamsPanel"></div>
                    </details>
                    <details class="editor-block" open>
                        <summary>Global</summary>
                        <div id="globalParamsPanel"></div>
                    </details>
                    <div class="animation-stage" id="animationStage">
                        <div class="animation-stage-header">Animation Preview</div>
                        <div id="animationPreviewHost">
                            <canvas id="animationPreviewCanvas" width="256" height="256"></canvas>
                        </div>
                    </div>
                    <details class="editor-block" open>
                        <summary>Export</summary>
                        <textarea id="profileExport" readonly></textarea>
                    </details>
                </div>
            </div>
            <div id="topologyEditorPanel" class="col-body" style="display:none">
                <div class="col-head">Map inspector</div>
                <div class="editor-scroll">
                    <details class="editor-block" open>
                        <summary>Display Overlays</summary>
                        <div>
                            <label class="check-inline block-check"><input id="showNodesInput" type="checkbox" checked> Show Nodes &amp; Connections</label>
                            <label class="check-inline block-check"><input id="showRoomZonesInput" type="checkbox" checked> Show Room Exclusion Zones</label>
                            <label class="check-inline block-check"><input id="showWallsInput" type="checkbox" checked> Show Physics Walls</label>
                            <label class="check-inline block-check"><input id="showGridBoundsInput" type="checkbox" checked> Show Entity Grid Bounds</label>
                        </div>
                    </details>
                    <details class="editor-block" open>
                        <summary>Pathfinding Test</summary>
                        <div>
                            <label class="check-inline block-check"><input id="showPathDebugInput" type="checkbox" checked> Show HPA* Grid &amp; Regions</label>
                            <label class="check-inline block-check"><input id="showPathTestInput" type="checkbox" checked> Enable Pathing Test</label>
                            <div id="pathTestControls" style="display:none;margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
                                <div style="margin-bottom:8px"><strong>Click Action:</strong></div>
                                <label class="block-check"><input type="radio" name="clickAction" value="selectNode" checked> Select Node</label>
                                <label class="block-check"><input type="radio" name="clickAction" value="repositionPlayer"> Reposition Player</label>
                                <label class="block-check"><input type="radio" name="clickAction" value="setTarget"> Set Path Target</label>
                                <div id="pathStatus" class="path-status">No path calculated</div>
                            </div>
                        </div>
                    </details>
                    <details class="editor-block" open>
                        <summary>Generation Config</summary>
                        <div id="mapSettingsPanel"></div>
                    </details>
                    <details class="editor-block" open>
                        <summary>Node Info</summary>
                        <div id="nodeInfoPanel">Select a node from the map or list.</div>
                    </details>
                    <details class="editor-block" open>
                        <summary>Node List</summary>
                        <div id="nodeListPanel"></div>
                    </details>
                </div>
            </div>
        </aside>
        <div class="resizer" id="resizer"></div>
        <section class="col col-map">
            <div class="map-status" id="gameMetaLine">WASD move · drag · wheel zoom</div>
            <div class="map-status" id="mapStatusLine" style="display:none">WASD move · drag · wheel zoom</div>
            <div class="map-zoom-bar">
                <div id="labZoomControl"></div>
            </div>
            <div class="map-container">
                <div class="map-stage" id="mapStage"></div>
            </div>
        </section>
    </div>
</div>`;
