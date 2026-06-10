export const TILELAB_UI_HTML = `
<div class="app">
    <div class="toolbar">
        <h1>Tile Lab</h1>
        <span class="sep"></span>
        <button type="button" id="randomMapBtn" class="secondary">Random</button>
        <span class="sep"></span>
        <label class="check-inline"><input id="showVignetteInput" type="checkbox"> Circular Overlay</label>
        <span class="sep"></span>
        <button type="button" id="regenerateBtn">Redraw</button>
    </div>
    <div class="workspace">
        <aside class="col col-editor">
            <div class="editor-sidebar-head">
                <span class="editor-sidebar-title">Panels</span>
                <div class="editor-panel-toggles" role="group" aria-label="Sidebar panels">
                    <label class="editor-panel-toggle">
                        <input type="checkbox" id="showSandboxPanelInput" checked>
                        <span>Sandbox</span>
                    </label>
                    <label class="editor-panel-toggle">
                        <input type="checkbox" id="showProfilePanelInput" checked>
                        <span>Profile</span>
                    </label>
                    <label class="editor-panel-toggle">
                        <input type="checkbox" id="showTopologyOverlayInput">
                        <span>Map</span>
                    </label>
                </div>
            </div>
            <div class="editor-panels-stack">
                <div id="sandboxPanel" class="editor-panel-section is-visible" data-panel="sandbox">
                    <div class="editor-panel-head">Sandbox</div>
                    <div class="editor-panel-body sandbox-panel-body">
                        <div id="sandboxToyPanel"></div>
                        <p class="editor-hint">Add at camera · select a toy to interact · drag to launch · delete from list or right-click</p>
                    </div>
                </div>
                <div id="surfaceEditorPanel" class="editor-panel-section is-visible" data-panel="profile">
                    <div class="editor-panel-head">Profile editor</div>
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
                        <details class="editor-block" open>
                            <summary>Export</summary>
                            <textarea id="profileExport" readonly></textarea>
                        </details>
                    </div>
                </div>
                <div id="topologyEditorPanel" class="editor-panel-section" data-panel="map">
                    <div class="editor-panel-head">Map inspector</div>
                    <div class="editor-scroll">
                        <details class="editor-block" open>
                            <summary>Display Overlays</summary>
                            <div>
                                <label class="check-inline block-check"><input id="showNodesInput" type="checkbox" checked> Show Nodes &amp; Connections</label>
                                <label class="check-inline block-check"><input id="showRoomZonesInput" type="checkbox" checked> Show Room Exclusion Zones</label>
                                <label class="check-inline block-check"><input id="showWallsInput" type="checkbox" checked> Show Physics Walls</label>
                                <label class="check-inline block-check"><input id="showGridBoundsInput" type="checkbox" checked> Show Entity Grid Bounds</label>
                                <label class="check-inline block-check"><input id="showPathDebugInput" type="checkbox" checked> Show HPA* Grid &amp; Regions</label>
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
            </div>
        </aside>
        <div class="resizer" id="resizer"></div>
        <section class="col col-map">
            <div class="map-status" id="mapStatusLine" style="display:none">WASD move · drag · wheel zoom</div>
            <div class="map-container">
                <div class="map-viewport-column">
                    <div class="map-stage" id="mapStage"></div>
                    <div class="animation-stage" id="animationStage">
                        <div class="animation-stage-header">Animation Preview</div>
                        <div id="animationPreviewHost">
                            <canvas id="animationPreviewCanvas"></canvas>
                        </div>
                    </div>
                    <div id="labZoomControl" class="map-viewport-control"></div>
                    <div id="labSpeedControl" class="map-viewport-control"></div>
                </div>
            </div>
        </section>
    </div>
</div>`;
