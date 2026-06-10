export const TILELAB_UI_HTML = `
<div class="app">
    <div class="toolbar">
        <h1>Editor</h1>
        <span class="sep"></span>
        <label class="check-inline"><input id="showWallsInput" type="checkbox"> Physics Walls</label>
        <label class="check-inline"><input id="showPathDebugInput" type="checkbox"> HPA* Grid</label>
        <label class="check-inline"><input id="showVignetteInput" type="checkbox"> Circular Overlay</label>
        <label class="check-inline"><input id="showAnimationPreviewInput" type="checkbox"> Animation Preview</label>
        <label class="check-inline"><input id="showMapOverviewInput" type="checkbox"> Map Overview</label>
        <label class="check-inline"><input id="showMapOverviewViewportInput" type="checkbox" checked> Overview Viewport</label>
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
                        <input type="checkbox" id="showMapPanelInput">
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
                <div id="mapPanel" class="editor-panel-section" data-panel="map">
                    <div class="editor-panel-head">Map</div>
                    <div class="editor-scroll">
                        <p class="editor-hint">Caverns generate around the current camera center.</p>
                        <div id="mapSettingsPanel"></div>
                    </div>
                </div>
            </div>
        </aside>
        <div class="resizer" id="resizer"></div>
        <section class="col col-map">
            <div class="map-container">
                <div class="map-viewport-column">
                    <div class="animation-stage is-visible" id="animationStage">
                        <div class="animation-stage-header">Animation Preview</div>
                        <div id="animationPreviewHost">
                            <canvas id="animationPreviewCanvas"></canvas>
                        </div>
                    </div>
                    <div class="map-overview-stage" id="mapOverviewStage">
                        <div class="map-overview-header">Map Overview</div>
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
