/**
 * ArnesViz v2.5 – Módulo de renderizado (App.Render)
 * Renderiza la tabla de datos, el canvas SVG, la vista de catálogos
 * (con acordeones funcionales y editor de catálogos mejorado) y el panel lateral.
 */

App.Render = {
    FIELD_OPTIONS: {
        gender: ['male', 'female'],
        mountType: ['fixed', 'flying'],
        edgeSide: ['left', 'right', 'top', 'bottom'],
        pinMapping: ['direct', 'reversed', 'null'],
        type: ['system', 'enclosure', 'pcb'],
        signalType: ['power', 'ground', 'data', 'communication', 'analog'],
        gaugeUnit: ['AWG', 'mm2']
    },

    renderAll() {
        this.renderTable();
        this.renderSVG();
    },

    /* ───────── SVG ───────── */
    renderSVG() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
        const { data } = App.state;
        viewport.innerHTML = '';

        viewport.setAttribute('transform', `translate(${App.state.panX}, ${App.state.panY}) scale(${App.state.zoom})`);

        const containersGroup = this._createGroup('svg-containers');
        const connectorsGroup = this._createGroup('svg-connectors');
        const wiresGroup = this._createGroup('svg-wires');
        const selectionGroup = this._createGroup('svg-selection');

        viewport.appendChild(containersGroup);
        viewport.appendChild(connectorsGroup);
        viewport.appendChild(wiresGroup);
        viewport.appendChild(selectionGroup);

        const sortedContainers = [...data.containers].sort((a, b) => this._getDepth(a.id) - this._getDepth(b.id));
        for (const container of sortedContainers) {
            this.renderContainer(container, containersGroup);
        }

        const validFlyingIds = new Set();
        for (const mate of data.mates) {
            const fromConn = data.connectors.find(c => c.id === mate.from?.connector);
            const toConn = data.connectors.find(c => c.id === mate.to?.connector);
            if (fromConn?.mountType === 'flying') validFlyingIds.add(fromConn.id);
            if (toConn?.mountType === 'flying') validFlyingIds.add(toConn.id);
        }

        for (const conn of data.connectors) {
            if (conn.mountType === 'flying' && !validFlyingIds.has(conn.id)) continue;
            this.renderConnector(conn, connectorsGroup);
        }

        for (const wire of data.wires) {
            this.renderWire(wire, wiresGroup);
        }

        if (App.state.selectedEntityId) {
            this.renderSelection(selectionGroup);
        }
    },

    _createGroup(id) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.id = id;
        return g;
    },

    _getDepth(containerId) {
        let depth = 0, currentId = containerId;
        while (currentId) {
            const c = App.state.data.containers.find(cont => cont.id === currentId);
            if (!c || !c.parent_id) break;
            currentId = c.parent_id;
            depth++;
            if (depth > 10) break;
        }
        return depth;
    },

    renderContainer(container, group) {
        const pos = App.Data.getContainerAbsolutePosition(container.id);
        const { width, height } = container.size || { width: 200, height: 150 };
        const isSelected = App.state.selectedEntityId === container.id;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', pos.x);
        rect.setAttribute('y', pos.y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('rx', 8);
        rect.setAttribute('ry', 8);
        rect.setAttribute('fill', 'rgba(40,40,56,0.9)');
        rect.setAttribute('stroke', isSelected ? '#fbbf24' : '#5a5a6a');
        rect.setAttribute('stroke-width', isSelected ? 2.5 : 2);
        rect.setAttribute('data-id', container.id);
        rect.setAttribute('data-type', 'container');
        rect.classList.add('draggable');
        if (isSelected) rect.setAttribute('filter', 'url(#glow-selection)');
        group.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pos.x + 10);
        text.setAttribute('y', pos.y + 25);
        text.setAttribute('fill', '#f0f0f0');
        text.setAttribute('font-family', 'Inter, sans-serif');
        text.setAttribute('font-size', '14');
        text.setAttribute('font-weight', '600');
        text.textContent = `${container.id} ${container.name || ''}`;
        group.appendChild(text);

        if (container.designator) {
            const desText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            desText.setAttribute('x', pos.x + 10);
            desText.setAttribute('y', pos.y + 45);
            desText.setAttribute('fill', '#9ca3af');
            desText.setAttribute('font-size', '11');
            desText.textContent = container.designator;
            group.appendChild(desText);
        }

        if (App.state.editMode) {
            const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            handle.setAttribute('x', pos.x + width - 12);
            handle.setAttribute('y', pos.y + height - 12);
            handle.setAttribute('width', 12);
            handle.setAttribute('height', 12);
            handle.setAttribute('fill', '#6366f1');
            handle.setAttribute('rx', 3);
            handle.setAttribute('cursor', 'nwse-resize');
            handle.setAttribute('data-id', container.id);
            handle.setAttribute('data-type', 'resize-handle');
            handle.classList.add('resizable');
            group.appendChild(handle);
        }
    },

    renderConnector(conn, group) {
        const pos = App.Data.getConnectorAbsolutePosition(conn.id);
        if (!pos) return;
        const { width, height } = conn.size || { width: App.CONST.CONNECTOR_WIDTH, height: App.CONST.CONNECTOR_HEIGHT };
        const isSelected = App.state.selectedEntityId === conn.id;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', pos.x);
        rect.setAttribute('y', pos.y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('rx', 4);
        rect.setAttribute('ry', 4);
        rect.setAttribute('fill', 'rgba(50,50,70,0.95)');
        rect.setAttribute('stroke', isSelected ? '#fbbf24' : '#7a7a8a');
        rect.setAttribute('stroke-width', isSelected ? 2.5 : 1.8);
        rect.setAttribute('data-id', conn.id);
        rect.setAttribute('data-type', 'connector');
        if (conn.mountType === 'fixed') rect.classList.add('draggable');
        if (isSelected) rect.setAttribute('filter', 'url(#glow-selection)');
        group.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pos.x + 5);
        text.setAttribute('y', pos.y + 18);
        text.setAttribute('fill', '#f0f0f0');
        text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', '500');
        text.textContent = `${conn.id} ${conn.designator || ''}`;
        group.appendChild(text);

        const totalPins = conn.pins || 0;
        for (let i = 1; i <= totalPins; i++) {
            const frontPinPos = App.Data.getPinPosition(conn.id, i, 'front');
            if (frontPinPos) {
                const frontCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                frontCircle.setAttribute('cx', frontPinPos.x);
                frontCircle.setAttribute('cy', frontPinPos.y);
                frontCircle.setAttribute('r', App.CONST.PIN_RADIUS);
                frontCircle.setAttribute('fill', '#c9c9d0');
                frontCircle.setAttribute('stroke', '#3a3a4a');
                frontCircle.setAttribute('stroke-width', 1);
                frontCircle.setAttribute('data-connector', conn.id);
                frontCircle.setAttribute('data-pin', i);
                frontCircle.setAttribute('data-side', 'front');
                frontCircle.setAttribute('data-type', 'pin');
                frontCircle.classList.add('pin');
                group.appendChild(frontCircle);
            }

            const backPinPos = App.Data.getPinPosition(conn.id, i, 'back');
            if (backPinPos) {
                const backCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                backCircle.setAttribute('cx', backPinPos.x);
                backCircle.setAttribute('cy', backPinPos.y);
                backCircle.setAttribute('r', App.CONST.PIN_RADIUS);
                backCircle.setAttribute('fill', '#a0a0b0');
                backCircle.setAttribute('stroke', '#3a3a4a');
                backCircle.setAttribute('stroke-width', 1);
                backCircle.setAttribute('data-connector', conn.id);
                backCircle.setAttribute('data-pin', i);
                backCircle.setAttribute('data-side', 'back');
                backCircle.setAttribute('data-type', 'pin');
                backCircle.classList.add('pin');
                group.appendChild(backCircle);
            }
        }
    },

    renderWire(wire, group) {
        const fromPinPos = App.Data.getPinPosition(wire.from?.connector, wire.from?.pin, 'back');
        const toPinPos = App.Data.getPinPosition(wire.to?.connector, wire.to?.pin, 'back');
        if (!fromPinPos || !toPinPos) return;

        const colorPalette = App.state.metadata?.catalogs?.colorPalette || {};
        const strokeColor = colorPalette[wire.color] || App.CONST.DEFAULT_COLOR;
        const x1 = fromPinPos.x, y1 = fromPinPos.y;
        const x2 = toPinPos.x, y2 = toPinPos.y;
        const dx = Math.abs(x2 - x1) * 0.4;
        const cx = Math.max(50, dx);
        const fromConn = App.state.data.connectors.find(c => c.id === wire.from.connector);
        const toConn = App.state.data.connectors.find(c => c.id === wire.to.connector);
        let cx1 = x1, cx2 = x2;
        if (fromConn) {
            if (fromConn.edgeSide === 'right') cx1 = x1 + cx;
            else if (fromConn.edgeSide === 'left') cx1 = x1 - cx;
        }
        if (toConn) {
            if (toConn.edgeSide === 'right') cx2 = x2 + cx;
            else if (toConn.edgeSide === 'left') cx2 = x2 - cx;
        }

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${x1},${y1} C ${cx1},${y1} ${cx2},${y2} ${x2},${y2}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', wire.thickness || 3.5);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('data-id', wire.id);
        path.setAttribute('data-type', 'wire');
        if (App.state.selectedEntityId === wire.id) {
            path.setAttribute('stroke', '#fbbf24');
            path.setAttribute('stroke-width', 5.5);
            path.setAttribute('filter', 'url(#glow-selection)');
        }
        group.appendChild(path);

        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', mx);
        label.setAttribute('y', my - 8);
        label.setAttribute('fill', '#9ca3af');
        label.setAttribute('font-size', '10');
        label.setAttribute('text-anchor', 'middle');
        label.textContent = `${wire.id} (${wire.net || '?'})`;
        group.appendChild(label);
    },

    renderSelection(group) {
        const { selectedEntityId, selectedEntityType } = App.state;
        if (!selectedEntityId) return;
        let pos, size;
        if (selectedEntityType === 'container') {
            const container = App.state.data.containers.find(c => c.id === selectedEntityId);
            if (!container) return;
            pos = App.Data.getContainerAbsolutePosition(selectedEntityId);
            size = container.size;
        } else if (selectedEntityType === 'connector') {
            const conn = App.state.data.connectors.find(c => c.id === selectedEntityId);
            if (!conn) return;
            pos = App.Data.getConnectorAbsolutePosition(selectedEntityId);
            size = conn.size;
        }
        if (!pos || !size) return;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', pos.x - 3);
        rect.setAttribute('y', pos.y - 3);
        rect.setAttribute('width', (size.width || 100) + 6);
        rect.setAttribute('height', (size.height || 50) + 6);
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#fbbf24');
        rect.setAttribute('stroke-width', 2.5);
        rect.setAttribute('filter', 'url(#glow-selection)');
        rect.setAttribute('pointer-events', 'none');
        group.appendChild(rect);
    },

    /* ───────── TABLA ───────── */
    renderTable() {
        if (App.state.inlineEditing) return;
        const tableWrapper = document.getElementById('table-wrapper');
        if (!tableWrapper) return;

        if (App.state.activeTableEntity === 'catalogs') {
            const dataTable = document.getElementById('data-table');
            if (dataTable) dataTable.style.display = 'none';
            this.renderCatalogTables(tableWrapper);
            return;
        }

        const dataTable = document.getElementById('data-table');
        if (dataTable) dataTable.style.display = '';
        const catalogView = document.getElementById('catalog-view');
        if (catalogView) catalogView.remove();

        const thead = document.getElementById('data-table-head');
        const tbody = document.getElementById('data-table-body');
        if (!thead || !tbody) return;

        const activeEntity = App.state.activeTableEntity || 'containers';
        const dataArray = App.state.data[activeEntity] || [];
        const filters = App.state.filters;

        const filtered = dataArray.filter(entity => {
            if (filters.search) {
                const s = filters.search.toLowerCase();
                if (!entity.id?.toLowerCase().includes(s) &&
                    !entity.name?.toLowerCase().includes(s) &&
                    !entity.designator?.toLowerCase().includes(s)) return false;
            }
            if (filters.type !== 'all' && activeEntity !== filters.type) return false;
            if (filters.net !== 'all' && entity.net && entity.net !== filters.net) return false;
            if (filters.section !== 'all') {
                let section = null;
                if (activeEntity === 'containers') section = entity.sectionRef;
                else if (activeEntity === 'connectors') section = App.Data.getConnectorSection(entity.id);
                if (section !== filters.section) return false;
            }
            return true;
        });

        document.getElementById('filter-counter').textContent = `Mostrando ${filtered.length} de ${dataArray.length}`;

        let columns = ['id', 'name'];
        if (activeEntity === 'containers') columns = ['id', 'name', 'type', 'designator', 'parent_id', 'sectionRef', 'owner'];
        else if (activeEntity === 'connectors') columns = ['id', 'name', 'designator', 'parent_id', 'pins', 'gender', 'mountType', 'matedId', 'owner'];
        else if (activeEntity === 'wires') columns = ['id', 'net', 'from', 'to', 'length', 'gauge', 'color', 'owner'];
        else if (activeEntity === 'mates') columns = ['id', 'net', 'from', 'to', 'pinMapping', 'owner'];

        thead.innerHTML = `<tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr>`;
        tbody.innerHTML = filtered.map(entity => {
            const isSelected = App.state.selectedEntityId === entity.id;
            const hasError = App.state.logEntries.some(e => e.entityId === entity.id && e.level === 'error');
            const hasWarning = App.state.logEntries.some(e => e.entityId === entity.id && e.level === 'warning');
            let rowClass = '';
            if (isSelected) rowClass += ' selected';
            if (hasError) rowClass += ' error-row';
            else if (hasWarning) rowClass += ' warning-row';

            const cells = columns.map(col => {
                let value = entity[col];
                if (col === 'from' || col === 'to') {
                    value = entity[col] ? `${entity[col].connector}:${entity[col].pin}` : '';
                }
                return `<td class="editable-cell" data-field="${col}">${App.Utils.escapeHtml(String(value ?? ''))}</td>`;
            }).join('');
            return `<tr class="${rowClass}" data-id="${entity.id}" data-type="${activeEntity.slice(0, -1)}">${cells}</tr>`;
        }).join('');
    },

    /* ───────── VISTA DE CATÁLOGOS ───────── */
    renderCatalogTables(tableWrapper) {
        const oldCatalogView = document.getElementById('catalog-view');
        if (oldCatalogView) oldCatalogView.remove();

        const catalogView = document.createElement('div');
        catalogView.id = 'catalog-view';
        catalogView.style.width = '100%';
        catalogView.style.height = '100%';
        catalogView.style.overflow = 'auto';
        tableWrapper.appendChild(catalogView);

        const catalogs = App.state.metadata?.catalogs || {};

        const catalogDefs = [
            { key: 'people', title: 'Personas', columns: ['id', 'name'] },
            { key: 'sections', title: 'Secciones', columns: ['id', 'name'] },
            { key: 'connectorModels', title: 'Modelos de conectores', columns: ['id', 'name', 'manufacturer', 'partNumber', 'pins', 'gender'] },
            { key: 'wireTypes', title: 'Tipos de cable', columns: ['id', 'unit', 'shielded', 'insulationType'] },
            { key: 'nets', title: 'Redes', columns: ['id', 'name', 'signalType', 'voltage', 'colorCode'] },
            { key: 'colorPalette', title: 'Paleta de colores', columns: ['name', 'hex'] }
        ];

        const activeSection = App.state.activeCatalogSection;

        let html = '';
        for (const def of catalogDefs) {
            const data = catalogs[def.key] || {};
            const entries = Object.entries(data);
            const isActive = def.key === activeSection;
            html += `<div class="catalog-section" data-catalog="${def.key}" style="margin-bottom: 8px; border: 1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-subtle)'}; border-radius: var(--radius-md); overflow: hidden; width: 100%;">`;
            html += `<div class="catalog-section-header" style="display:flex; align-items:center; padding: 10px 14px; background: ${isActive ? 'rgba(99,102,241,0.1)' : 'var(--bg-tertiary)'}; cursor:pointer; user-select:none;">
                <span style="font-size:13px; font-weight:600; flex:1;">${def.title} (${entries.length})</span>
                ${App.state.editMode ? `<button class="catalog-add-btn" data-catalog="${def.key}" style="font-size:11px; padding:4px 10px; background:var(--accent-primary); color:#fff; border:none; border-radius:var(--radius-sm); cursor:pointer; margin-right:8px;">+ Añadir</button>` : ''}
                <span class="accordion-arrow" style="transition:transform 0.2s;">▼</span>
            </div>`;
            html += `<div class="catalog-section-body" style="display:none; max-height: 300px; overflow-y: auto; width: 100%;">`;
            if (entries.length === 0) {
                html += '<div style="font-size:11px; color:var(--text-muted); padding:12px;">Vacío</div>';
            } else {
                html += '<table style="width:100%; border-collapse:collapse; font-size:11px;">';
                html += '<thead><tr>';
                for (const col of def.columns) {
                    html += `<th style="text-align:left; padding:8px 12px; border-bottom:2px solid var(--border-medium); color:var(--text-muted); position:sticky; top:0; background:var(--bg-secondary);">${col}</th>`;
                }
                html += '</tr></thead><tbody>';
                for (const [id, entry] of entries) {
                    html += `<tr class="catalog-row" data-catalog="${def.key}" data-id="${id}" style="cursor:pointer; transition: background var(--transition-fast);">
                        ${def.columns.map(col => {
                            let val = '';
                            if (col === 'id') val = id;
                            else if (col === 'name' && def.key === 'colorPalette') val = id;
                            else if (col === 'hex' && def.key === 'colorPalette') val = entry;
                            else if (typeof entry === 'object' && entry !== null) val = entry[col] ?? '';
                            else val = entry;
                            return `<td style="padding:8px 12px; border-bottom:1px solid var(--border-subtle);">${App.Utils.escapeHtml(String(val))}</td>`;
                        }).join('')}
                    </tr>`;
                }
                html += '</tbody></table>';
            }
            html += '</div></div>';
        }

        catalogView.innerHTML = html;

        catalogView.addEventListener('click', (e) => {
            const header = e.target.closest('.catalog-section-header');
            if (header) {
                if (e.target.classList.contains('catalog-add-btn')) {
                    const catalogKey = e.target.dataset.catalog;
                    App.state.activeCatalogSection = catalogKey;
                    App.Interaction.openCatalogEditor(catalogKey, null);
                    return;
                }
                const section = header.parentElement;
                const catalogKey = section.dataset.catalog;
                const body = section.querySelector('.catalog-section-body');
                const arrow = header.querySelector('.accordion-arrow');

                if (App.state.activeCatalogSection !== catalogKey) {
                    const prevActive = catalogView.querySelector('.catalog-section.active');
                    if (prevActive) {
                        prevActive.classList.remove('active');
                        const prevHeader = prevActive.querySelector('.catalog-section-header');
                        if (prevHeader) prevHeader.style.background = 'var(--bg-tertiary)';
                        const prevBody = prevActive.querySelector('.catalog-section-body');
                        if (prevBody) prevBody.style.display = 'none';
                        const prevArrow = prevActive.querySelector('.accordion-arrow');
                        if (prevArrow) prevArrow.style.transform = 'rotate(0deg)';
                        prevActive.style.borderColor = 'var(--border-subtle)';
                    }
                    section.classList.add('active');
                    header.style.background = 'rgba(99,102,241,0.1)';
                    section.style.borderColor = 'var(--accent-primary)';
                    if (body) {
                        body.style.display = 'block';
                        if (arrow) arrow.style.transform = 'rotate(180deg)';
                    }
                    App.state.activeCatalogSection = catalogKey;
                } else {
                    if (body) {
                        const isOpen = body.style.display !== 'none';
                        body.style.display = isOpen ? 'none' : 'block';
                        if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
                    }
                }
                return;
            }

            const row = e.target.closest('.catalog-row');
            if (row && App.state.editMode) {
                const catalogKey = row.dataset.catalog;
                const id = row.dataset.id;
                App.state.activeCatalogSection = catalogKey;
                App.Interaction.openCatalogEditor(catalogKey, id);
                return;
            }
        });
    },

    /* ───────── SIDEBAR ───────── */
    renderSidebar(state, entityId = null, extraData = null) {
        const content = document.getElementById('sidebar-content');
        const title = document.getElementById('sidebar-title');
        const actions = document.getElementById('sidebar-actions');
        if (!content || !title) return;

        if (state === 'config') {
            title.textContent = 'Configuración';
            actions.innerHTML = '';
            this._renderConfigPanel(content);
        } else if (state === 'catalog-editor') {
            title.textContent = extraData.isNew ? 'Nueva entrada de catálogo' : `Editar: ${extraData.entryId}`;
            this._renderCatalogEditor(content, extraData);
            actions.innerHTML = `
                <button class="btn-save" id="catalog-save-btn">Guardar</button>
                <button class="btn-duplicate" id="catalog-cancel-btn" style="background:transparent; color:var(--text-secondary); border:1px solid var(--border-medium);">Cancelar</button>
                ${!extraData.isNew ? `<button class="btn-delete" id="catalog-delete-btn">Eliminar</button>` : ''}
            `;
            document.getElementById('catalog-save-btn')?.addEventListener('click', () => App.Interaction.saveCatalogChanges(extraData));
            document.getElementById('catalog-cancel-btn')?.addEventListener('click', () => App.Interaction.closeSidebar());
            document.getElementById('catalog-delete-btn')?.addEventListener('click', () => App.Interaction.deleteCatalogFromSidebar(extraData));
        } else if (state === 'details' && entityId) {
            const result = App.Utils.findEntityById(entityId);
            if (!result) return;
            title.textContent = `Detalles: ${result.entity.id}`;
            this._renderDetailPanel(content, result.entity, result.type);
            actions.innerHTML = '';
            if (App.state.editMode) {
                const saveBtn = document.createElement('button');
                saveBtn.className = 'btn-save';
                saveBtn.textContent = 'Guardar cambios';
                saveBtn.addEventListener('click', () => App.Interaction.saveDetailChanges());
                actions.appendChild(saveBtn);
                const dupBtn = document.createElement('button');
                dupBtn.className = 'btn-duplicate';
                dupBtn.textContent = 'Duplicar';
                dupBtn.addEventListener('click', () => {
                    const newEntity = App.Data.duplicateEntity(entityId, result.type);
                    if (newEntity) {
                        App.state.selectedEntityId = newEntity.id;
                        App.state.selectedEntityType = result.type;
                        App.Render.renderAll();
                        App.Render.renderSidebar('details', newEntity.id);
                        App.Utils.showToast('Duplicado correctamente', 'success');
                    }
                });
                actions.appendChild(dupBtn);
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-delete';
                delBtn.textContent = 'Eliminar';
                delBtn.addEventListener('click', async () => {
                    const idx = await App.Utils.showModal(
                        'Eliminar entidad',
                        `¿Seguro que deseas eliminar ${result.entity.id}? Esta acción no se puede deshacer.`,
                        [
                            { label: 'Eliminar', cls: 'btn-danger' },
                            { label: 'Cancelar', cls: 'btn-cancel' },
                        ]
                    );
                    if (idx === 0) {
                        App.Data.deleteEntity(entityId, result.type);
                        App.state.selectedEntityId = null;
                        App.state.selectedEntityType = null;
                        App.Render.renderAll();
                        App.Interaction.closeSidebar();
                        App.Data.runValidation();
                        App.Utils.showToast('Eliminado', 'warning');
                    }
                });
                actions.appendChild(delBtn);
            }
        }
    },

    // ─── EDITOR DE CATÁLOGO MEJORADO ───
    _renderCatalogEditor(container, { catalogKey, entryId, isNew }) {
        const catalogs = App.state.metadata.catalogs;
        const entry = isNew ? {} : (catalogs[catalogKey]?.[entryId] || {});
        let html = '<div class="section-title">Información de la entrada</div>';

        const addField = (label, fieldWidget) => {
            return `<div class="field-group"><label>${label}</label>${fieldWidget}</div>`;
        };

        if (catalogKey === 'people') {
            html += addField('Nombre', this._renderFieldWidget('name', entry.name || '', null, true));
        } else if (catalogKey === 'sections') {
            html += addField('Nombre', this._renderFieldWidget('name', entry.name || '', null, true));
        } else if (catalogKey === 'connectorModels') {
            html += addField('Fabricante', this._renderFieldWidget('manufacturer', entry.manufacturer || '', null, true));
            html += addField('Nº de parte', this._renderFieldWidget('partNumber', entry.partNumber || '', null, true));
            html += addField('Pines', this._renderFieldWidget('pins', entry.pins || '', 'number', true));
            html += addField('Género', this._renderFieldWidget('gender', entry.gender || '', null, true));
        } else if (catalogKey === 'wireTypes') {
            html += addField('Unidad', this._renderFieldWidget('unit', entry.unit || 'mm2', null, true));
            html += addField('Apantallado', this._renderFieldWidget('shielded', entry.shielded || false, 'boolean', true));
            html += addField('Aislamiento', this._renderFieldWidget('insulationType', entry.insulationType || '', null, true));
        } else if (catalogKey === 'nets') {
            html += addField('Nombre', this._renderFieldWidget('name', entry.name || '', null, true));
            html += addField('Tipo de señal', this._renderFieldWidget('signalType', entry.signalType || 'data', null, true));
            html += addField('Voltaje', this._renderFieldWidget('voltage', entry.voltage || '', null, true));
            html += addField('Color', this._renderFieldWidget('colorCode', entry.colorCode || '', null, true));
        } else if (catalogKey === 'colorPalette') {
            html += `<div class="field-group"><label>Nombre</label><input type="text" id="catalog-color-name" value="${App.Utils.escapeHtml(entryId || '')}" ${isNew ? '' : 'disabled'}></div>`;
            html += `<div class="field-group"><label>Color (hex)</label><input type="text" id="catalog-color-hex" value="${App.Utils.escapeHtml(entry || '')}"></div>`;
        }
        container.innerHTML = html;
    },

    _renderDetailPanel(container, entity, type) {
        const fields = Object.keys(entity).filter(k => !['notes', 'from', 'to'].includes(k));
        let html = '';

        if (entity.position) {
            html += '<div class="section-title">Posición</div>';
            if (entity.parent_id === null) {
                html += this._renderFieldInput('position.x', entity.position.x, 'number', App.state.editMode);
                html += this._renderFieldInput('position.y', entity.position.y, 'number', App.state.editMode);
            } else {
                html += this._renderFieldInput('position.offsetX', entity.position.offsetX, 'number', App.state.editMode);
                html += this._renderFieldInput('position.offsetY', entity.position.offsetY, 'number', App.state.editMode);
            }
        }
        if (entity.size) {
            html += '<div class="section-title">Tamaño</div>';
            html += this._renderFieldInput('size.width', entity.size.width, 'number', App.state.editMode);
            html += this._renderFieldInput('size.height', entity.size.height, 'number', App.state.editMode);
        }

        if (type === 'wire' || type === 'mate') {
            html += '<div class="section-title">Conexiones</div>';
            if (entity.from) {
                html += '<div class="field-group"><label>From (Conector:Pin)</label>';
                html += this._renderConnectorPinWidget('from', entity.from, App.state.editMode);
                html += '</div>';
            }
            if (entity.to) {
                html += '<div class="field-group"><label>To (Conector:Pin)</label>';
                html += this._renderConnectorPinWidget('to', entity.to, App.state.editMode);
                html += '</div>';
            }
        }

        for (const field of fields) {
            if (field === 'position' || field === 'size') continue;
            html += '<div class="field-group">';
            html += `<label>${field}</label>`;
            html += this._renderFieldWidget(field, entity[field], type, App.state.editMode);
            html += '</div>';
        }

        html += `<div class="section-title">Notas</div>`;
        const notes = entity.notes || [];
        html += notes.map(n => `<div style="font-size:11px;color:#9ca3af;margin:4px 0;">[${n.date}] ${n.user}: ${App.Utils.escapeHtml(n.text)}</div>`).join('');
        if (App.state.editMode) {
            html += `<div class="field-group" style="margin-top:8px;">
                <textarea id="new-note-text" placeholder="Añadir nota..."></textarea>
                <button id="add-note-btn" style="margin-top:4px;padding:4px 10px;border-radius:8px;background:#6366f1;color:#fff;border:none;cursor:pointer;">Añadir</button>
            </div>`;
        }
        container.innerHTML = html;

        if (App.state.editMode) {
            document.getElementById('add-note-btn')?.addEventListener('click', () => {
                const textarea = document.getElementById('new-note-text');
                if (textarea && textarea.value.trim()) {
                    if (!entity.notes) entity.notes = [];
                    entity.notes.push({
                        date: new Date().toISOString(),
                        user: App.state.metadata?.savedBy || 'anon',
                        text: textarea.value.trim()
                    });
                    App.state.isDirty = true;
                    App.Render.renderSidebar('details', entity.id);
                    App.Utils.showToast('Nota añadida', 'success');
                }
            });
        }
    },

    _renderFieldWidget(field, value, entityType, editMode) {
        const strValue = value === null || value === undefined ? '' : String(value);
        const disabled = editMode ? '' : 'disabled';

        if (this.FIELD_OPTIONS[field]) {
            const options = this.FIELD_OPTIONS[field];
            return `<select data-field="${field}" ${disabled}>
                ${options.map(opt => `<option value="${opt}" ${strValue === opt ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>`;
        }

        if (this._isCatalogField(field)) {
            const catalogOptions = this._getCatalogOptions(field, entityType);
            return `<select data-field="${field}" ${disabled}>
                <option value="">-- Ninguno --</option>
                ${catalogOptions.map(opt => `<option value="${opt.id}" ${strValue === opt.id ? 'selected' : ''}>${opt.label}</option>`).join('')}
            </select>`;
        }

        if (['pins', 'length', 'gauge', 'offset'].includes(field)) {
            return `<input type="number" data-field="${field}" value="${App.Utils.escapeHtml(strValue)}" ${disabled}>`;
        }

        return `<input type="text" data-field="${field}" value="${App.Utils.escapeHtml(strValue)}" ${disabled}>`;
    },

    _renderFieldInput(fieldPath, value, type = 'number', editMode) {
        const disabled = editMode ? '' : 'disabled';
        const safeValue = value === null || value === undefined ? '' : value;
        return `<div class="field-group">
            <label>${fieldPath}</label>
            <input type="${type}" data-field="${fieldPath}" value="${App.Utils.escapeHtml(String(safeValue))}" ${disabled}>
        </div>`;
    },

    _renderConnectorPinWidget(prefix, connection, editMode) {
        const connId = connection?.connector || '';
        const pin = connection?.pin || 1;
        const disabled = editMode ? '' : 'disabled';
        const connectorOptions = App.state.data.connectors.map(c => `<option value="${c.id}" ${connId === c.id ? 'selected' : ''}>${c.id} (${c.name || ''})</option>`).join('');
        return `
            <select data-field="${prefix}.connector" ${disabled} style="width:auto;">
                <option value="">-- Conector --</option>
                ${connectorOptions}
            </select>
            <input type="number" data-field="${prefix}.pin" value="${pin}" ${disabled} style="width:60px; margin-left:4px;">
        `;
    },

    _isCatalogField(field) {
        const catalogFields = [
            'owner', 'parent_id', 'modelRef', 'wireTypeRef', 'net',
            'sectionRef', 'matedId', 'color', 'from.connector', 'to.connector'
        ];
        return catalogFields.includes(field);
    },

    _getCatalogOptions(field, entityType) {
        const catalogs = App.state.metadata?.catalogs || {};
        const data = App.state.data;
        switch (field) {
            case 'owner':
                return Object.entries(catalogs.people || {}).map(([id, p]) => ({ id, label: p.name }));
            case 'parent_id':
                return data.containers.map(c => ({ id: c.id, label: `${c.id} ${c.name || ''}` }));
            case 'modelRef':
                return Object.keys(catalogs.connectorModels || {}).map(id => ({ id, label: id }));
            case 'wireTypeRef':
                return Object.keys(catalogs.wireTypes || {}).map(id => ({ id, label: id }));
            case 'net':
                return Object.keys(catalogs.nets || {}).map(id => ({ id, label: id }));
            case 'sectionRef':
                return Object.entries(catalogs.sections || {}).map(([id, s]) => ({ id, label: s.name }));
            case 'matedId':
                return data.mates.map(m => ({ id: m.id, label: m.id }));
            case 'color':
                return Object.keys(catalogs.colorPalette || {}).map(id => ({ id, label: id }));
            default:
                return [];
        }
    },

    _renderConfigPanel(container) {
        const catalogs = App.state.metadata?.catalogs || {};
        const people = catalogs.people || {};
        container.innerHTML = `
            <div class="section-title">Usuario actual</div>
            <div class="field-group">
                <label>Usuario</label>
                <select id="config-current-user">
                    <option value="">-- Seleccionar --</option>
                    ${Object.entries(people).map(([id, p]) => `<option value="${id}" ${App.state.metadata?.savedBy === id ? 'selected' : ''}>${p.name}</option>`).join('')}
                </select>
            </div>
            <div class="section-title">Gestión de datos</div>
            <div class="field-group" style="display:flex; gap:8px; flex-wrap:wrap;">
                <button id="config-import-btn" class="btn-save" style="flex:1;">📂 Importar JSON</button>
                <button id="config-export-btn" class="btn-primary" style="flex:1;">💾 Exportar JSON</button>
            </div>
            <button id="config-delete-all-btn" class="btn-delete" style="width:100%; margin-top:8px;">🗑 Eliminar todo</button>
        `;

        document.getElementById('config-current-user')?.addEventListener('change', e => {
            App.state.metadata.savedBy = e.target.value || null;
            App.state.isDirty = true;
        });
        document.getElementById('config-import-btn')?.addEventListener('click', () => App.Interaction.importJSON());
        document.getElementById('config-export-btn')?.addEventListener('click', () => App.Data.exportProject());
        document.getElementById('config-delete-all-btn')?.addEventListener('click', () => App.Interaction.deleteAllData());
    }
};