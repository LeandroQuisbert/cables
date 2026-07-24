/**
 * ArnesViz v2.5 – Módulo de interacción (App.Interaction)
 * Corrección: eliminada restricción de tamaño mínimo por conectores flying.
 *              Los flying no están físicamente dentro del contenedor.
 */

App.Interaction = {
    init() {
        this.bindHeaderEvents();
        this.bindToolbarEvents();
        this.bindTableEvents();
        this.bindSVGEvents();
        this.bindSidebarEvents();
        this.bindLogPanelEvents();
        this.bindKeyboardShortcuts();
        this.bindBeforeUnload();
    },

    /* ───────── HEADER ───────── */
    bindHeaderEvents() {
        document.getElementById('tab-table-btn')?.addEventListener('click', () => this.switchView('table'));
        document.getElementById('tab-visual-btn')?.addEventListener('click', () => this.switchView('visual'));

        const toggleLabel = document.getElementById('edit-toggle-label');
        const toggleTrack = document.getElementById('edit-toggle-track');
        if (toggleLabel && toggleTrack) {
            toggleLabel.addEventListener('click', () => {
                App.state.editMode = !App.state.editMode;
                toggleTrack.classList.toggle('active', App.state.editMode);
                App.Render.renderAll();
                if (App.state.sidebarState) App.Render.renderSidebar(App.state.sidebarState, App.state.lastDetailEntityId);
                App.Utils.showToast(App.state.editMode ? 'Modo edición activado' : 'Modo solo lectura', 'info');
            });
        }

        document.getElementById('config-btn')?.addEventListener('click', () => {
            if (App.state.sidebarState === 'config') this.closeSidebar();
            else this.openSidebar('config');
        });
    },

    switchView(view) {
        App.state.activeView = view;
        document.getElementById('table-view').classList.toggle('hidden', view !== 'table');
        document.getElementById('visual-view').classList.toggle('hidden', view !== 'visual');
        document.getElementById('tab-table-btn').classList.toggle('active', view === 'table');
        document.getElementById('tab-visual-btn').classList.toggle('active', view === 'visual');

        this.updateToolbarForView(view);
        this.updateRouteDropdowns(); // reiniciar dropdowns sin filtro

        App.Utils.saveToStorage('arnesviz.activeView', view);
        if (view === 'visual') App.Render.renderSVG();
        else App.Render.renderTable();
    },

    updateToolbarForView(view) {
        const entityBtns = document.getElementById('toolbar-entity-btns');
        const counter = document.getElementById('filter-counter');
        const addBtn = document.getElementById('toolbar-add-btn');
        const routeFilters = document.getElementById('route-filters');

        if (view === 'visual') {
            // Ocultar botones de entidad y contador, pero NO el botón añadir
            if (entityBtns) entityBtns.style.display = 'none';
            if (counter) counter.style.display = 'none';
            if (addBtn) addBtn.style.display = ''; // siempre visible
            if (routeFilters) routeFilters.classList.add('visible');
        } else {
            if (entityBtns) entityBtns.style.display = '';
            if (counter) counter.style.display = '';
            if (addBtn) addBtn.style.display = '';
            if (routeFilters) routeFilters.classList.remove('visible');
        }
    },

    /* ───────── TOOLBAR UNIFICADO ───────── */
    bindToolbarEvents() {
        // Botones de entidad
        const entityButtons = document.querySelectorAll('#toolbar-entity-btns .entity-type-btn');
        entityButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                entityButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                App.state.activeTableEntity = btn.dataset.entity;
                if (App.state.activeTableEntity !== 'catalogs') {
                    App.state.activeCatalogSection = null;
                }
                App.Render.renderTable();
            });
        });

        // Buscador general
        const searchInput = document.getElementById('filter-search');
        const applySearch = App.Utils.debounce(() => {
            App.state.filters.search = searchInput?.value || '';
            App.Utils.saveToStorage('arnesviz.filters', App.state.filters);
            App.Render.renderAll();
        }, 200);
        searchInput?.addEventListener('input', applySearch);

        // Botón Añadir (siempre visible)
        document.getElementById('toolbar-add-btn')?.addEventListener('click', () => {
            if (!App.state.editMode) {
                App.Utils.showToast('Activa el modo edición para añadir entidades', 'warning');
                return;
            }
            const activeEntity = App.state.activeTableEntity || 'containers';
            if (activeEntity === 'catalogs') {
                const section = App.state.activeCatalogSection;
                if (!section) {
                    App.Utils.showToast('Selecciona una sección de catálogo primero', 'warning');
                    return;
                }
                App.Interaction.openCatalogEditor(section, null);
                return;
            }
            const entityTypeMap = { containers: 'container', connectors: 'connector', wires: 'wire', mates: 'mate' };
            const type = entityTypeMap[activeEntity];
            const newEntity = App.Data.createEntity(type);
            App.state.selectedEntityId = newEntity.id;
            App.state.selectedEntityType = type;
            App.Render.renderAll();
            this.openSidebar('details', newEntity.id);
            App.Data.runValidation();
        });

        // Filtros de ruta inteligentes
        const routeFrom = document.getElementById('route-from');
        const routeTo = document.getElementById('route-to');
        const routeNet = document.getElementById('route-net'); // nuevo dropdown de señal

        routeFrom?.addEventListener('change', (e) => {
            const fromId = e.target.value;
            App.state.routeFrom = fromId;
            if (fromId) {
                const connected = this.getConnectedConnectors(fromId);
                this.updateRouteDropdowns('to', connected);
                // Si el destino actual no está conectado, limpiarlo
                if (App.state.routeTo && !connected.has(App.state.routeTo)) {
                    routeTo.value = '';
                    App.state.routeTo = '';
                }
            } else {
                this.updateRouteDropdowns(); // mostrar todos
            }
            App.Render.renderSVG();
        });

        routeTo?.addEventListener('change', (e) => {
            const toId = e.target.value;
            App.state.routeTo = toId;
            if (toId) {
                const connected = this.getConnectedConnectors(toId);
                this.updateRouteDropdowns('from', connected);
                if (App.state.routeFrom && !connected.has(App.state.routeFrom)) {
                    routeFrom.value = '';
                    App.state.routeFrom = '';
                }
            } else {
                this.updateRouteDropdowns(); // mostrar todos
            }
            App.Render.renderSVG();
        });

        routeNet?.addEventListener('change', (e) => {
            App.state.routeNet = e.target.value || ''; // '' = Todas las señales
            App.Render.renderSVG();
        });
    },

    // Devuelve un Set con IDs de conectores conectados directa/indirectamente al conector dado
    getConnectedConnectors(connectorId) {
        const connected = new Set();
        const queue = [connectorId];
        const visited = new Set();
        const { wires, mates } = App.state.data;

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);
            connected.add(current);

            // A través de wires
            for (const wire of wires) {
                if (wire.from?.connector === current && wire.to?.connector) {
                    if (!visited.has(wire.to.connector)) queue.push(wire.to.connector);
                }
                if (wire.to?.connector === current && wire.from?.connector) {
                    if (!visited.has(wire.from.connector)) queue.push(wire.from.connector);
                }
            }

            // A través de mates (acoples)
            for (const mate of mates) {
                if (mate.from?.connector === current && mate.to?.connector) {
                    if (!visited.has(mate.to.connector)) queue.push(mate.to.connector);
                }
                if (mate.to?.connector === current && mate.from?.connector) {
                    if (!visited.has(mate.from.connector)) queue.push(mate.from.connector);
                }
            }
        }

        return connected;
    },

    updateRouteDropdowns(target = 'both', connectedIds = null) {
        const fromSelect = document.getElementById('route-from');
        const toSelect = document.getElementById('route-to');
        const netSelect = document.getElementById('route-net');
        if (!fromSelect || !toSelect) return;

        const connectors = App.state.data.connectors || [];
        const allOptions = connectors.map(c => ({
            id: c.id,
            label: `${c.id} ${c.name || ''}`
        }));

        const getFilteredOptions = () => {
            if (!connectedIds || connectedIds.size === 0) {
                return allOptions;
            }
            return allOptions.filter(opt => connectedIds.has(opt.id));
        };

        if (target === 'from' || target === 'both') {
            const options = getFilteredOptions();
            const currentVal = fromSelect.value;
            fromSelect.innerHTML = '<option value="">Origen</option>' +
                options.map(opt => `<option value="${opt.id}" ${currentVal === opt.id ? 'selected' : ''}>${opt.label}</option>`).join('');
        }

        if (target === 'to' || target === 'both') {
            const options = getFilteredOptions();
            const currentVal = toSelect.value;
            toSelect.innerHTML = '<option value="">Destino</option>' +
                options.map(opt => `<option value="${opt.id}" ${currentVal === opt.id ? 'selected' : ''}>${opt.label}</option>`).join('');
        }

        // Actualizar dropdown de señales (nets)
        if (netSelect && (target === 'both')) {
            const nets = App.state.metadata?.catalogs?.nets || {};
            const currentVal = netSelect.value;
            netSelect.innerHTML = '<option value="">Todas las señales</option>' +
                Object.keys(nets).map(id => `<option value="${id}" ${currentVal === id ? 'selected' : ''}>${id}</option>`).join('');
        }
    },

    /* ───────── TABLA ───────── */
    bindTableEvents() {
        document.getElementById('data-table-body')?.addEventListener('click', e => {
            if (App.state.inlineEditing) return;
            const row = e.target.closest('tr');
            if (!row) return;
            const id = row.dataset.id;
            const type = row.dataset.type;
            if (id) {
                App.state.selectedEntityId = id;
                App.state.selectedEntityType = type;
                App.Render.renderAll();
                this.openSidebar('details', id);
            }
        });

        document.getElementById('data-table-body')?.addEventListener('dblclick', e => {
            if (!App.state.editMode || App.state.inlineEditing) return;
            const td = e.target.closest('td.editable-cell');
            if (!td) return;
            const row = td.closest('tr');
            const id = row.dataset.id;
            const field = td.dataset.field;
            const currentValue = td.textContent;

            App.state.inlineEditing = true;
            const input = document.createElement('input');
            input.value = currentValue;
            input.style.width = '100%';
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    const newValue = input.value;
                    const result = App.Utils.findEntityById(id);
                    if (result) {
                        result.entity[field] = isNaN(newValue) ? newValue : Number(newValue);
                        App.state.isDirty = true;
                    }
                    App.state.inlineEditing = false;
                    App.Render.renderTable();
                    App.Utils.showToast('Campo actualizado', 'success');
                } else if (ev.key === 'Escape') {
                    App.state.inlineEditing = false;
                    App.Render.renderTable();
                }
            });
            input.addEventListener('blur', () => {
                if (App.state.inlineEditing) {
                    const newValue = input.value;
                    const result = App.Utils.findEntityById(id);
                    if (result) {
                        result.entity[field] = isNaN(newValue) ? newValue : Number(newValue);
                        App.state.isDirty = true;
                    }
                    App.state.inlineEditing = false;
                    App.Render.renderTable();
                }
            });
            input.addEventListener('click', e => e.stopPropagation());
            td.innerHTML = '';
            td.appendChild(input);
            input.focus();
            input.select();
        });
    },

    /* ───────── SVG ───────── */
    bindSVGEvents() {
        const svg = document.getElementById('svg-canvas');
        const viewport = document.getElementById('viewport');
        if (!svg || !viewport) return;

        let dragStart = null, dragEntity = null, dragType = null;

        svg.addEventListener('click', e => {
            if (App.state.panning || App.state.dragging) return;
            const target = e.target;
            const dataId = target.getAttribute('data-id');
            const dataType = target.getAttribute('data-type');
            if (dataId && dataType) {
                if (dataType === 'pin') {
                    const connId = target.getAttribute('data-connector');
                    if (connId) {
                        App.state.selectedEntityId = connId;
                        App.state.selectedEntityType = 'connector';
                    }
                } else {
                    App.state.selectedEntityId = dataId;
                    App.state.selectedEntityType = dataType;
                }
                App.Render.renderAll();
                this.openSidebar('details', App.state.selectedEntityId);
            } else if (e.target === svg || e.target.id === 'svg-background') {
                App.state.selectedEntityId = null;
                App.state.selectedEntityType = null;
                App.Render.renderAll();
                this.closeSidebar();
            }
        });

        svg.addEventListener('mousedown', e => {
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                App.state.panning = true;
                App.state.panStart = { x: e.clientX, y: e.clientY };
                svg.classList.add('panning');
                e.preventDefault();
                return;
            }
            if (e.button !== 0) return;
            const target = e.target;
            if (target.classList.contains('draggable') && App.state.editMode) {
                dragEntity = target;
                dragType = target.getAttribute('data-type');
                dragStart = { x: e.clientX, y: e.clientY };
                App.state.dragging = { entity: dragEntity, type: dragType };
                e.preventDefault();
            } else if (target.classList.contains('resizable') && App.state.editMode) {
                dragEntity = target;
                dragType = 'resize-handle';
                dragStart = { x: e.clientX, y: e.clientY };
                App.state.resizing = { entity: dragEntity, startSize: null };
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', e => {
            if (App.state.panning) {
                const dx = e.clientX - App.state.panStart.x;
                const dy = e.clientY - App.state.panStart.y;
                App.state.panX += dx;
                App.state.panY += dy;
                App.state.panStart = { x: e.clientX, y: e.clientY };
                App.Render.renderSVG();
                return;
            }

            if (App.state.dragging && dragStart) {
                const dx = (e.clientX - dragStart.x) / App.state.zoom;
                const dy = (e.clientY - dragStart.y) / App.state.zoom;
                dragStart = { x: e.clientX, y: e.clientY };
                const entityId = dragEntity.getAttribute('data-id');

                if (dragType === 'container') {
                    const container = App.state.data.containers.find(c => c.id === entityId);
                    if (container) {
                        if (container.parent_id === null) {
                            container.position.x = (container.position.x || 0) + dx;
                            container.position.y = (container.position.y || 0) + dy;
                        } else {
                            const parent = App.state.data.containers.find(c => c.id === container.parent_id);
                            if (parent) {
                                const pw = parent.size?.width || 0;
                                const ph = parent.size?.height || 0;
                                const cw = container.size?.width || 100;
                                const ch = container.size?.height || 100;
                                let newOffsetX = (container.position.offsetX || 0) + dx;
                                let newOffsetY = (container.position.offsetY || 0) + dy;
                                newOffsetX = Math.max(0, Math.min(newOffsetX, pw - cw));
                                newOffsetY = Math.max(0, Math.min(newOffsetY, ph - ch));
                                container.position.offsetX = newOffsetX;
                                container.position.offsetY = newOffsetY;
                            } else {
                                container.position.offsetX = (container.position.offsetX || 0) + dx;
                                container.position.offsetY = (container.position.offsetY || 0) + dy;
                            }
                        }
                        App.state.isDirty = true;
                        App.Render.renderSVG();
                    }
                } else if (dragType === 'connector') {
                    const conn = App.state.data.connectors.find(c => c.id === entityId);
                    if (conn && conn.mountType === 'fixed') {
                        const parent = App.state.data.containers.find(c => c.id === conn.parent_id);
                        if (parent) {
                            const pw = parent.size?.width || 0;
                            const ph = parent.size?.height || 0;
                            const cw = conn.size?.width || App.CONST.CONNECTOR_WIDTH;
                            const ch = conn.size?.height || App.CONST.CONNECTOR_HEIGHT;
                            let newOffset = (conn.offset || 0);
                            if (conn.edgeSide === 'left' || conn.edgeSide === 'right') {
                                newOffset += dy;
                                newOffset = Math.max(0, Math.min(newOffset, ph - ch));
                            } else {
                                newOffset += dx;
                                newOffset = Math.max(0, Math.min(newOffset, pw - cw));
                            }
                            conn.offset = newOffset;
                        } else {
                            conn.offset = (conn.offset || 0) + (conn.edgeSide === 'left' || conn.edgeSide === 'right' ? dy : dx);
                        }
                        App.state.isDirty = true;
                        App.Render.renderSVG();
                    }
                }
            }

            if (App.state.resizing && dragStart) {
                const entityId = dragEntity.getAttribute('data-id');
                const container = App.state.data.containers.find(c => c.id === entityId);
                if (container) {
                    const dx = (e.clientX - dragStart.x) / App.state.zoom;
                    const dy = (e.clientY - dragStart.y) / App.state.zoom;
                    let newW = Math.max(50, (container.size?.width || 100) + dx);
                    let newH = Math.max(50, (container.size?.height || 100) + dy);

                    if (container.parent_id) {
                        const parent = App.state.data.containers.find(c => c.id === container.parent_id);
                        if (parent) {
                            const pw = parent.size?.width || 0;
                            const ph = parent.size?.height || 0;
                            const ox = container.position?.offsetX || 0;
                            const oy = container.position?.offsetY || 0;
                            newW = Math.min(newW, pw - ox);
                            newH = Math.min(newH, ph - oy);
                        }
                    }

                    const minSize = this.getContainerMinSize(container);
                    newW = Math.max(newW, minSize.minWidth);
                    newH = Math.max(newH, minSize.minHeight);

                    if (!container.size) container.size = {};
                    container.size.width = newW;
                    container.size.height = newH;
                    dragStart = { x: e.clientX, y: e.clientY };
                    App.state.isDirty = true;
                    App.Render.renderSVG();
                }
            }
        });

        window.addEventListener('mouseup', () => {
            App.state.panning = false;
            App.state.dragging = null;
            App.state.resizing = null;
            dragStart = null;
            dragEntity = null;
            svg.classList.remove('panning');
        });

        svg.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const zoomFactor = e.deltaY < 0 ? 1 + App.CONST.ZOOM_STEP : 1 - App.CONST.ZOOM_STEP;
            const newZoom = Math.min(App.CONST.ZOOM_MAX, Math.max(App.CONST.ZOOM_MIN, App.state.zoom * zoomFactor));
            const scaleChange = newZoom / App.state.zoom;
            App.state.panX = mouseX - scaleChange * (mouseX - App.state.panX);
            App.state.panY = mouseY - scaleChange * (mouseY - App.state.panY);
            App.state.zoom = newZoom;
            App.Render.renderSVG();
        });
    },

    /* ───────── TAMAÑO MÍNIMO DE CONTENEDOR (CORREGIDO) ───────── */
    getContainerMinSize(container) {
        const margin = 1.05;
        let minWidth = 50;
        let minHeight = 50;

        // Solo conectores fijos directos
        const childConnectors = App.state.data.connectors.filter(
            c => c.parent_id === container.id && c.mountType === 'fixed'
        );
        for (const conn of childConnectors) {
            const cw = conn.size?.width || App.CONST.CONNECTOR_WIDTH;
            const ch = conn.size?.height || App.CONST.CONNECTOR_HEIGHT;
            const offset = conn.offset || 0;
            let reqW, reqH;
            if (conn.edgeSide === 'left' || conn.edgeSide === 'right') {
                reqW = cw;
                reqH = offset + ch;
            } else { // top o bottom
                reqW = offset + cw;
                reqH = ch;
            }
            minWidth = Math.max(minWidth, Math.ceil(reqW * margin));
            minHeight = Math.max(minHeight, Math.ceil(reqH * margin));
        }

        // Conectores en lados opuestos
        const leftConnectors = childConnectors.filter(c => c.edgeSide === 'left');
        const rightConnectors = childConnectors.filter(c => c.edgeSide === 'right');
        if (leftConnectors.length > 0 && rightConnectors.length > 0) {
            const maxLeftWidth = Math.max(...leftConnectors.map(c => c.size?.width || App.CONST.CONNECTOR_WIDTH));
            const maxRightWidth = Math.max(...rightConnectors.map(c => c.size?.width || App.CONST.CONNECTOR_WIDTH));
            minWidth = Math.max(minWidth, Math.ceil((maxLeftWidth + maxRightWidth) * margin));
        }
        const topConnectors = childConnectors.filter(c => c.edgeSide === 'top');
        const bottomConnectors = childConnectors.filter(c => c.edgeSide === 'bottom');
        if (topConnectors.length > 0 && bottomConnectors.length > 0) {
            const maxTopHeight = Math.max(...topConnectors.map(c => c.size?.height || App.CONST.CONNECTOR_HEIGHT));
            const maxBottomHeight = Math.max(...bottomConnectors.map(c => c.size?.height || App.CONST.CONNECTOR_HEIGHT));
            minHeight = Math.max(minHeight, Math.ceil((maxTopHeight + maxBottomHeight) * margin));
        }

        // Contenedores hijos
        const childContainers = App.state.data.containers.filter(
            c => c.parent_id === container.id
        );
        for (const child of childContainers) {
            const offsetX = child.position?.offsetX || 0;
            const offsetY = child.position?.offsetY || 0;
            const cw = child.size?.width || 100;
            const ch = child.size?.height || 100;
            minWidth = Math.max(minWidth, Math.ceil((offsetX + cw) * margin));
            minHeight = Math.max(minHeight, Math.ceil((offsetY + ch) * margin));
        }

        return { minWidth, minHeight };
    },

    /* ───────── SIDEBAR ───────── */
    bindSidebarEvents() {
        document.getElementById('sidebar-close-btn')?.addEventListener('click', () => this.closeSidebar());
    },

    openSidebar(state, entityId = null, extraData = null) {
        const panel = document.getElementById('sidebar-panel');
        if (!panel) return;

        App.state.sidebarState = state;
        if (state === 'details' && entityId) App.state.lastDetailEntityId = entityId;
        if (state === 'catalog-editor') App.state.lastCatalogEditorData = extraData;

        panel.classList.add('open');
        App.Render.renderSidebar(state, entityId, extraData);
    },

    closeSidebar() {
        const panel = document.getElementById('sidebar-panel');
        if (panel) panel.classList.remove('open');

        App.state.sidebarState = null;
        App.state.lastCatalogEditorData = null;
    },

    saveDetailChanges() {
        const content = document.getElementById('sidebar-content');
        if (!content) return;
        const entityId = App.state.lastDetailEntityId;
        if (!entityId) return;
        const result = App.Utils.findEntityById(entityId);
        if (!result) return;

        const inputs = content.querySelectorAll('input[data-field], select[data-field]');
        inputs.forEach(input => {
            const fieldPath = input.dataset.field;
            let value = input.value;
            if (input.tagName === 'SELECT') {
                // mantener string
            } else if (input.type === 'number') {
                value = value === '' ? null : Number(value);
            } else {
                if (!isNaN(value) && value.trim() !== '') value = Number(value);
                else if (value === 'null') value = null;
                else if (value === 'true') value = true;
                else if (value === 'false') value = false;
            }
            if (fieldPath.includes('.')) {
                const parts = fieldPath.split('.');
                let obj = result.entity;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!obj[parts[i]]) obj[parts[i]] = {};
                    obj = obj[parts[i]];
                }
                obj[parts[parts.length - 1]] = value;
            } else {
                result.entity[fieldPath] = value;
            }
        });
        App.state.isDirty = true;
        App.Utils.showToast('Cambios guardados', 'success');
        App.Render.renderAll();
        App.Data.runValidation();
    },

    /* ─── Edición de catálogos ─── */
    openCatalogEditor(catalogKey, entryId) {
        if (!App.state.editMode && entryId !== null) {
            const extraData = { catalogKey, entryId, isNew: false };
            this.openSidebar('catalog-editor', null, extraData);
            return;
        }
        if (!App.state.editMode && entryId === null) {
            App.Utils.showToast('Activa el modo edición para añadir entradas', 'warning');
            return;
        }
        const isNew = entryId === null;
        const extraData = { catalogKey, entryId, isNew };
        this.openSidebar('catalog-editor', null, extraData);
    },

    saveCatalogChanges(extraData) {
        if (!App.state.editMode) return;
        const content = document.getElementById('sidebar-content');
        if (!content || !extraData) return;
        const { catalogKey, entryId, isNew } = extraData;

        if (catalogKey === 'colorPalette') {
            const nameInput = document.getElementById('catalog-color-name');
            const hexInput = document.getElementById('catalog-color-hex');
            if (!nameInput || !hexInput) return;
            const name = nameInput.value.trim();
            const hex = hexInput.value.trim();
            if (!name || !hex) {
                App.Utils.showToast('Nombre y hex son obligatorios', 'error');
                return;
            }
            if (isNew) {
                App.Data.createCatalogEntry(catalogKey, name, hex);
            } else {
                if (name !== entryId) {
                    App.Data.deleteCatalogEntry(catalogKey, entryId);
                    App.Data.createCatalogEntry(catalogKey, name, hex);
                } else {
                    App.Data.updateCatalogEntry(catalogKey, entryId, hex);
                }
            }
        } else {
            const inputs = content.querySelectorAll('input[data-field], select[data-field]');
            const newData = {};
            let newId = entryId;
            inputs.forEach(input => {
                const field = input.dataset.field;
                let value = input.value;
                if (input.type === 'number') value = value === '' ? null : Number(value);
                else if (value === 'true') value = true;
                else if (value === 'false') value = false;
                if (field === 'id') {
                    newId = value.trim();
                } else {
                    newData[field] = value;
                }
            });

            if (!newId) {
                App.Utils.showToast('El ID no puede estar vacío', 'error');
                return;
            }

            if (isNew) {
                if (App.state.metadata.catalogs[catalogKey]?.[newId]) {
                    App.Utils.showToast('Ese ID ya existe', 'error');
                    return;
                }
                App.Data.createCatalogEntry(catalogKey, newId, newData);
            } else {
                if (newId !== entryId) {
                    if (App.state.metadata.catalogs[catalogKey]?.[newId]) {
                        App.Utils.showToast('El nuevo ID ya existe', 'error');
                        return;
                    }
                    App.Data.deleteCatalogEntry(catalogKey, entryId);
                    App.Data.createCatalogEntry(catalogKey, newId, newData);
                } else {
                    App.Data.updateCatalogEntry(catalogKey, entryId, newData);
                }
            }
        }

        App.state.isDirty = true;
        App.Utils.showToast('Catálogo actualizado', 'success');
        this.closeSidebar();
        if (App.state.activeTableEntity === 'catalogs') {
            if (!App.state.expandedCatalogs) App.state.expandedCatalogs = new Set();
            App.state.expandedCatalogs.add(catalogKey);
            App.Render.renderTable();
        }
        App.Render.renderAll();
    },

    async deleteCatalogFromSidebar(extraData) {
        if (!App.state.editMode) return;
        const { catalogKey, entryId, isNew } = extraData;
        if (isNew || !entryId) return;
        const refs = App.Data.getCatalogReferences(catalogKey, entryId);
        if (refs.length > 0) {
            await App.Utils.showModal('No se puede eliminar',
                `La entrada "${entryId}" está siendo usada por ${refs.length} entidades: ${refs.slice(0,5).join(', ')}${refs.length>5?'...':''}`,
                [{ label: 'Entendido', cls: 'btn-primary' }]
            );
            return;
        }
        const idx = await App.Utils.showModal('Eliminar entrada', `¿Eliminar "${entryId}" del catálogo?`, [
            { label: 'Eliminar', cls: 'btn-danger' },
            { label: 'Cancelar', cls: 'btn-cancel' }
        ]);
        if (idx === 0) {
            App.Data.deleteCatalogEntry(catalogKey, entryId);
            App.Utils.showToast('Entrada eliminada', 'warning');
            this.closeSidebar();
            if (App.state.activeTableEntity === 'catalogs') {
                App.Render.renderTable();
            }
            App.Render.renderAll();
        }
    },

    /* ───────── LOG PANEL ───────── */
    bindLogPanelEvents() {
        const logHeader = document.getElementById('log-header-toggle');
        const logPanel = document.getElementById('log-panel');
        if (logHeader && logPanel) {
            logHeader.addEventListener('click', () => logPanel.classList.toggle('collapsed'));
        }
        document.getElementById('log-copy-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const logBody = document.getElementById('log-body');
            if (logBody) {
                const text = logBody.innerText;
                navigator.clipboard.writeText(text).then(() => {
                    App.Utils.showToast('Log copiado al portapapeles', 'success');
                }).catch(() => {
                    App.Utils.showToast('Error al copiar', 'error');
                });
            }
        });
        document.getElementById('log-filter-errors')?.addEventListener('click', e => { e.stopPropagation(); App.state.logShowErrors = !App.state.logShowErrors; this.updateLogPanel(); });
        document.getElementById('log-filter-warnings')?.addEventListener('click', e => { e.stopPropagation(); App.state.logShowWarnings = !App.state.logShowWarnings; this.updateLogPanel(); });
        document.getElementById('log-filter-info')?.addEventListener('click', e => { e.stopPropagation(); App.state.logShowInfo = !App.state.logShowInfo; this.updateLogPanel(); });
        document.getElementById('log-clear-btn')?.addEventListener('click', e => { e.stopPropagation(); App.Utils.clearLogs(); });
    },

    updateLogPanel() {
        const logBody = document.getElementById('log-body');
        const counterError = document.getElementById('counter-error');
        const counterWarning = document.getElementById('counter-warning');
        const counterInfo = document.getElementById('counter-info');
        if (!logBody) return;

        const filtered = App.state.logEntries.filter(entry => {
            if (entry.level === 'error' && !App.state.logShowErrors) return false;
            if (entry.level === 'warning' && !App.state.logShowWarnings) return false;
            if (entry.level === 'info' && !App.state.logShowInfo) return false;
            return true;
        });

        const errors = App.state.logEntries.filter(e => e.level === 'error').length;
        const warnings = App.state.logEntries.filter(e => e.level === 'warning').length;
        const infos = App.state.logEntries.filter(e => e.level === 'info').length;
        if (counterError) counterError.textContent = errors;
        if (counterWarning) counterWarning.textContent = warnings;
        if (counterInfo) counterInfo.textContent = infos;

        if (filtered.length === 0) {
            logBody.innerHTML = '<div class="log-empty">Sin mensajes</div>';
            return;
        }
        logBody.innerHTML = filtered.map(entry => `
            <div class="log-entry ${entry.level}">
                <span class="log-time">${App.Utils.formatTime(entry.timestamp)}</span>
                <span>${entry.entityId ? `<strong>${entry.entityId}:</strong> ` : ''}${entry.message}</span>
            </div>
        `).join('');
        logBody.scrollTop = logBody.scrollHeight;
    },

    /* ───────── IMPORT / EXPORT / DELETE ALL ───────── */
    async importJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            if (App.state.isDirty) {
                const idx = await App.Utils.showModal(
                    'Cambios sin guardar',
                    'Hay cambios sin guardar. ¿Deseas exportar antes de importar?',
                    [
                        { label: 'Exportar y continuar', cls: 'btn-primary' },
                        { label: 'Descartar y continuar', cls: 'btn-secondary' },
                        { label: 'Cancelar', cls: 'btn-cancel' },
                    ]
                );
                if (idx === 2) return;
                if (idx === 0) App.Data.exportProject();
            }
            const success = await App.Data.loadProject(file);
            if (success) {
                App.Data.runValidation();
                App.Render.renderAll();
                this.closeSidebar();
                App.state.selectedEntityId = null;
                this.updateRouteDropdowns();
            }
        };
        input.click();
    },

    async deleteAllData() {
        const idx1 = await App.Utils.showModal('Eliminar todo', '¿Estás seguro de que deseas eliminar todos los datos actuales?', [
            { label: 'Sí, eliminar', cls: 'btn-danger' },
            { label: 'Cancelar', cls: 'btn-cancel' }
        ]);
        if (idx1 !== 0) return;
        const idx2 = await App.Utils.showModal('Copia de seguridad', '¿Quieres exportar una copia de seguridad antes de eliminar?', [
            { label: 'Exportar y eliminar', cls: 'btn-primary' },
            { label: 'Eliminar sin guardar', cls: 'btn-secondary' },
            { label: 'Cancelar', cls: 'btn-cancel' }
        ]);
        if (idx2 === 2) return;
        if (idx2 === 0) App.Data.exportProject();
        const empty = App.Data.getEmptyProject();
        App.state.metadata = empty.metadata;
        App.state.data = empty.data;
        App.state.isDirty = false;
        App.state.selectedEntityId = null;
        App.Utils.clearLogs();
        App.Render.renderAll();
        this.closeSidebar();
        App.Utils.showToast('Todos los datos eliminados', 'warning');
    },

    /* ───────── KEYBOARD SHORTCUTS ───────── */
    bindKeyboardShortcuts() {
        window.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.key === 'E') {
                e.preventDefault();
                document.getElementById('edit-toggle-label')?.click();
            } else if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                App.Data.exportProject();
            } else if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                this.importJSON();
            } else if (e.key === 'Escape') {
                App.state.selectedEntityId = null;
                App.state.selectedEntityType = null;
                this.closeSidebar();
                App.Render.renderAll();
            } else if (e.key === 'f' && !e.ctrlKey) {
                e.preventDefault();
                document.getElementById('filter-search')?.focus();
            }
        });
    },

    bindBeforeUnload() {
        window.addEventListener('beforeunload', e => {
            if (App.state.isDirty) {
                e.preventDefault();
                e.returnValue = 'Hay cambios sin guardar.';
            }
        });
    },

    /* ───────── INICIALIZACIÓN GLOBAL ───────── */
    async startApp() {
        const savedView = App.Utils.loadFromStorage('arnesviz.activeView', 'table');
        App.state.activeView = savedView;
        document.getElementById('table-view').classList.toggle('hidden', savedView !== 'table');
        document.getElementById('visual-view').classList.toggle('hidden', savedView !== 'visual');
        document.getElementById('tab-table-btn').classList.toggle('active', savedView === 'table');
        document.getElementById('tab-visual-btn').classList.toggle('active', savedView === 'visual');

        this.updateToolbarForView(savedView);

        const savedFilters = App.Utils.loadFromStorage('arnesviz.filters');
        if (savedFilters) {
            App.state.filters = savedFilters;
            document.getElementById('filter-search').value = savedFilters.search || '';
        }

        App.state.zoom = App.Utils.loadFromStorage('arnesviz.zoom', 1);
        const pan = App.Utils.loadFromStorage('arnesviz.pan', { x: 0, y: 0 });
        App.state.panX = pan.x;
        App.state.panY = pan.y;

        if (!App.state.expandedCatalogs) App.state.expandedCatalogs = new Set();

        try {
            const response = await fetch('db.json');
            if (response.ok) {
                const json = await response.json();
                const success = await App.Data.loadProject(json);
                if (success) {
                    App.Data.runValidation();
                    App.Render.renderAll();
                }
            } else {
                await App.Data.checkAutosave();
                if (!App.state.metadata) {
                    const empty = App.Data.getEmptyProject();
                    App.state.metadata = empty.metadata;
                    App.state.data = empty.data;
                    App.Render.renderAll();
                    App.Utils.addLog('info', 'Nuevo proyecto creado. Importa un JSON o comienza a añadir entidades.');
                }
            }
        } catch (err) {
            console.warn('No se pudo cargar db.json:', err.message);
            await App.Data.checkAutosave();
            if (!App.state.metadata) {
                const empty = App.Data.getEmptyProject();
                App.state.metadata = empty.metadata;
                App.state.data = empty.data;
                App.Render.renderAll();
                App.Utils.addLog('info', 'Nuevo proyecto creado.');
            }
        }

        this.updateRouteDropdowns();

        App.state.autosaveTimer = setInterval(() => {
            if (App.state.isDirty) App.Data.autosave();
        }, App.CONST.AUTOSAVE_INTERVAL);

        App.Render.renderAll();
        console.log('ArnesViz v2.5 inicializado con mejoras UX.');
    }
};

App.init = function() {
    App.Interaction.init();
    App.Interaction.startApp();
};
