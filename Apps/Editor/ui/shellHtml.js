export const WORLD_RENDER_CONTROLS_HTML = `
        <label class="toolbar-select">
            Render mode
            <select id="worldRenderModeSelect">
                <option value="radial">Radial</option>
                <option value="flat2d">2D</option>
            </select>
        </label>`;
export const TILELAB_UI_HTML = `
<div class="app">
    <div class="toolbar">
        <h1>Editor</h1>
        <span class="sep"></span>
        <label class="check-inline"><input id="showPathDebugInput" type="checkbox"> HPA* Grid</label>
        ${WORLD_RENDER_CONTROLS_HTML}
        <label class="check-inline"><input id="showVignetteInput" type="checkbox"> Circular Overlay</label>
        <label class="check-inline"><input id="showAnimationPreviewInput" type="checkbox"> Animation Preview</label>
        <label class="check-inline"><input id="showMapOverviewInput" type="checkbox" checked> Map Overview</label>
        <label class="check-inline"><input id="showSelectionRingsInput" type="checkbox"> Selection rings</label>
        <label class="check-inline"><input id="showPropTileCellsInput" type="checkbox"> Prop tile cells</label>
        <label class="check-inline"><input id="showRoomNodesAlwaysInput" type="checkbox"> Show nodes always</label>
        <span class="sep"></span>
        <span id="playAreaColsToolbar"></span>
        <span id="playAreaRowsToolbar"></span>
        <span class="sep"></span>
        <button type="button" id="regenerateBtn">Redraw</button>
    </div>
    <div class="workspace">
        <aside class="col col-editor">
            <div class="editor-sidebar-head">
                <span class="editor-sidebar-title">Panels</span>
                <div class="editor-panel-toggles" role="radiogroup" aria-label="Sidebar panels">
                    <label class="editor-panel-toggle">
                        <input type="radio" name="editorSidebarPanel" id="showSandboxPanelInput" value="sandbox" checked>
                        <span>Props</span>
                    </label>
                    <label class="editor-panel-toggle">
                        <input type="radio" name="editorSidebarPanel" id="showProfilePanelInput" value="profile">
                        <span>Profile</span>
                    </label>
                    <label class="editor-panel-toggle">
                        <input type="radio" name="editorSidebarPanel" id="showJsonPanelInput" value="json">
                        <span>JSON</span>
                    </label>
                </div>
            </div>
            <div class="editor-panels-stack">
                <div id="sandboxPanel" class="editor-panel-section is-visible" data-panel="sandbox">
                    <div class="editor-panel-head">Props</div>
                    <div class="editor-panel-body sandbox-panel-body editor-scroll">
                        <div id="sandboxToyPanel"></div>
                    </div>
                </div>
                <div id="surfaceEditorPanel" class="editor-panel-section" data-panel="profile">
                    <div class="editor-panel-head">Profile editor</div>
                    <div class="editor-tools">
                        <div class="editor-tools-row">
                            <select id="presetSelect"></select>
                            <button type="button" id="loadPresetBtn">Load</button>
                            <button type="button" id="copyExportBtn">Copy export</button>
                        </div>
                        <div class="editor-tools-row">
                            <select id="addMotifType"></select>
                            <button type="button" id="addMotifBtn" class="secondary">+ Motif</button>
                        </div>
                    </div>
                    <div class="editor-scroll">
                        <details class="editor-block editor-block-motifs" open>
                            <summary>Motifs</summary>
                            <div class="motif-list-host">
                                <div id="motifList"></div>
                            </div>
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
                <div id="jsonPanel" class="editor-panel-section" data-panel="json">
                    <div class="editor-panel-head">Scene JSON</div>
                    <div class="editor-scroll sandbox-panel-body">
                        <div id="sceneJsonPanel"></div>
                    </div>
                </div>
            </div>
        </aside>
        <div class="resizer" id="resizer"></div>
        <section class="col col-map">
            <div class="map-container">
                <div class="map-viewport-column">
                    <div class="animation-stage" id="animationStage" hidden>
                        <div id="animationPreviewHost">
                            <canvas id="animationPreviewCanvas"></canvas>
                        </div>
                    </div>
                    <div class="map-overview-stage" id="mapOverviewStage">
                        <div id="mapOverviewHost">
                            <canvas id="mapOverviewCanvas"></canvas>
                        </div>
                    </div>
                    <div class="map-stage" id="mapStage"></div>
                    <div id="labZoomControl" class="map-viewport-control"></div>
                    <div id="labSpeedControl" class="map-viewport-control"></div>
                </div>
            </div>
        </section>
    </div>
</div>`;
