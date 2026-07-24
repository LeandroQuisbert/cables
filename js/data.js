/**
 * ArnesViz v2.5 – Módulo de datos (App.Data)
 * Carga, guardado, validación, creación/eliminación de entidades,
 * autocomplete, cálculo de posiciones, referencias de catálogos,
 * manipulación de catálogos, duplicación inteligente,
 * y búsqueda de rutas entre conectores (con filtro de señal).
 */

App.Data = {
    getEmptyProject() {
        return {
            metadata: {
                projectInfo: { name: 'Nuevo Proyecto', description: '', date: new Date().toISOString().split('T')[0], model: '' },
                lastSave: new Date().toISOString(),
                savedBy: null,
                version: 1,
                schema: {
                    containers: { required: ['id', 'type', 'position', 'size'], recommended: ['name', 'owner', 'sectionRef'] },
                    connectors: { required: ['id', 'type', 'gender', 'mountType', 'edgeSide', 'parent_id', 'pins'], recommended: ['name', 'owner', 'modelRef'] },
                    wires: { required: ['id', 'type', 'from', 'to', 'net'], recommended: ['name', 'owner', 'gauge', 'color', 'wireTypeRef'] },
                    mates: { required: ['id', 'type', 'from', 'to', 'net'], recommended: ['name', 'owner', 'pinMapping'] },
                    rules: {
                        id: { unique: true, pattern: '^[TCWM]\\d{3}$' },
                        'containers.parent_id': { ref: 'containers' },
                        'connectors.parent_id': { ref: 'containers' },
                        'connectors.modelRef': { ref: 'connectorModels' },
                        'connectors.owner': { ref: 'people' },
                        'wires.from.connector': { ref: 'connectors' },
                        'wires.to.connector': { ref: 'connectors' },
                        'wires.net': { ref: 'nets' },
                        'wires.wireTypeRef': { ref: 'wireTypes' },
                        'wires.owner': { ref: 'people' },
                        'mates.from.connector': { ref: 'connectors' },
                        'mates.to.connector': { ref: 'connectors' },
                        'mates.net': { ref: 'nets' },
                        'mates.owner': { ref: 'people' }
                    }
                },
                catalogs: {
                    people: {},
                    sections: {},
                    connectorModels: {},
                    wireTypes: {},
                    nets: {},
                    colorPalette: {
                        black: '#000000',
                        red: '#dc2626',
                        blue: '#2563eb',
                        green: '#16a34a',
                        yellow: '#eab308',
                        orange: '#ea580c',
                        white: '#f5f5f5',
                        gray: '#6b7280',
                        brown: '#92400e',
                        violet: '#7c3aed'
                    }
                }
            },
            data: {
                containers: [],
                connectors: [],
                wires: [],
                mates: []
            }
        };
    },

    async loadProject(source) {
        try {
            let json;
            if (typeof source === 'string') {
                const response = await fetch(source);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                json = await response.json();
            } else if (source instanceof File) {
                const text = await source.text();
                json = JSON.parse(text);
            } else {
                json = source;
            }

            if (!json.metadata || !json.data) {
                throw new Error('Estructura inválida: faltan metadata o data');
            }
            if (!json.data.containers || !json.data.connectors || !json.data.wires || !json.data.mates) {
                throw new Error('Faltan arrays de datos requeridos');
            }

            if (json.data.connectors && json.data.connectors.some(c => c.hasOwnProperty('sectionRef'))) {
                throw new Error('Formato incompatible: el archivo parece ser de una versión anterior. Actualízalo manualmente al formato V2.5.');
            }

            App.state.metadata = json.metadata;
            App.state.data = json.data;
            App.state.isDirty = false;
            App.state.currentFileName = source instanceof File ? source.name : (typeof source === 'string' ? source.split('/').pop() : 'proyecto.json');
            document.getElementById('header-file-name').textContent = App.state.currentFileName || 'Sin archivo';
            App.Utils.clearLogs();
            App.Utils.addLog('info', `Proyecto cargado: ${App.state.metadata.projectInfo?.name || 'Sin nombre'}`);
            return true;
        } catch (err) {
            App.Utils.addLog('error', `Error al cargar proyecto: ${err.message}`);
            App.Utils.showToast(`Error: ${err.message}`, 'error');
            return false;
        }
    },

    exportProject() {
        App.state.metadata.lastSave = new Date().toISOString();
        App.state.metadata.version = (App.state.metadata.version || 0) + 1;
        const project = { metadata: App.state.metadata, data: App.state.data };
        const jsonStr = JSON.stringify(project, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = App.state.currentFileName || 'db.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        App.state.isDirty = false;
        App.Utils.addLog('info', 'Proyecto exportado correctamente.');
        App.Utils.showToast('Exportado correctamente', 'success');
        App.Utils.saveToStorage('arnesviz.autosave', project);
    },

    autosave() {
        const project = { metadata: App.state.metadata, data: App.state.data };
        App.Utils.saveToStorage('arnesviz.autosave', project);
    },

    async checkAutosave() {
        const saved = App.Utils.loadFromStorage('arnesviz.autosave');
        if (saved && saved.data) {
            const hasData = saved.data.containers?.length > 0 || saved.data.connectors?.length > 0;
            if (hasData) {
                const idx = await App.Utils.showModal(
                    'Recuperar sesión',
                    'Hay una copia de seguridad local. ¿Deseas restaurarla?',
                    [
                        { label: 'Restaurar', cls: 'btn-primary' },
                        { label: 'Ignorar', cls: 'btn-secondary' },
                    ]
                );
                if (idx === 0) {
                    await App.Data.loadProject(saved);
                    App.Utils.showToast('Sesión restaurada', 'info');
                } else {
                    App.Utils.saveToStorage('arnesviz.autosave', null);
                }
            }
        }
    },

    validateProject() {
        const errors = [];
        const warnings = [];
        const infos = [];
        const { data, metadata } = App.state;
        const schema = metadata?.schema;
        if (!schema) return { errors, warnings, infos };

        const add = (level, msg, entityId) => {
            if (level === 'error') errors.push({ level, message: msg, entityId });
            else if (level === 'warning') warnings.push({ level, message: msg, entityId });
            else infos.push({ level: 'info', message: msg, entityId });
        };

        const entityTypes = [
            { key: 'containers', schema: schema.containers },
            { key: 'connectors', schema: schema.connectors },
            { key: 'wires', schema: schema.wires },
            { key: 'mates', schema: schema.mates }
        ];

        for (const { key, schema: subSchema } of entityTypes) {
            const arr = data[key];
            if (!arr) continue;
            for (const entity of arr) {
                if (subSchema?.required) {
                    for (const field of subSchema.required) {
                        if (!(field in entity) || entity[field] === null || entity[field] === undefined || entity[field] === '') {
                            add('error', `Campo requerido '${field}' faltante en ${entity.id}`, entity.id);
                        }
                    }
                }
                if (subSchema?.recommended) {
                    for (const field of subSchema.recommended) {
                        if (!(field in entity) || entity[field] === null || entity[field] === undefined || entity[field] === '') {
                            add('warning', `Campo recomendado '${field}' faltante en ${entity.id}`, entity.id);
                        }
                    }
                }
            }
        }

        const allEntities = [...data.containers, ...data.connectors, ...data.wires, ...data.mates];
        const idPattern = new RegExp(schema.rules?.id?.pattern || '^[TCWM]\\d{3}$');
        const idCounts = {};
        for (const entity of allEntities) {
            if (!idPattern.test(entity.id)) {
                add('error', `ID inválido: ${entity.id} no cumple el patrón`, entity.id);
            }
            idCounts[entity.id] = (idCounts[entity.id] || 0) + 1;
        }
        for (const [id, count] of Object.entries(idCounts)) {
            if (count > 1) add('error', `ID duplicado: ${id} aparece ${count} veces`, id);
        }

        const refRules = schema.rules || {};
        for (const [rulePath, rule] of Object.entries(refRules)) {
            if (!rule.ref) continue;
            const parts = rulePath.split('.');
            if (parts[0] === 'id') continue;
            const entityType = parts[0];
            const field = parts[1];
            if (!data[entityType]) continue;
            for (const entity of data[entityType]) {
                let value = entity[field];
                if (value === null || value === undefined) continue;
                if (rulePath.includes('.')) {
                    const pathParts = rulePath.split('.');
                    let val = entity;
                    for (const p of pathParts) val = val?.[p];
                    value = val;
                }
                if (!value) continue;
                const targetCatalog = rule.ref;
                let valid = false;
                if (['containers', 'connectors', 'wires', 'mates'].includes(targetCatalog)) {
                    valid = data[targetCatalog]?.some(e => e.id === value);
                } else if (metadata.catalogs?.[targetCatalog]) {
                    valid = value in metadata.catalogs[targetCatalog];
                }
                if (!valid) add('error', `Referencia rota: ${entity.id}.${field}='${value}' no existe en ${targetCatalog}`, entity.id);
            }
        }

        // Reglas de negocio
        for (const mate of data.mates) {
            const fromConn = data.connectors.find(c => c.id === mate.from?.connector);
            const toConn = data.connectors.find(c => c.id === mate.to?.connector);
            if (fromConn && toConn && fromConn.gender === toConn.gender)
                add('error', `Acople ${mate.id}: géneros iguales`, mate.id);
            if (fromConn && toConn) {
                const types = [fromConn.mountType, toConn.mountType];
                if (!((types[0] === 'fixed' && types[1] === 'flying') || (types[0] === 'flying' && types[1] === 'fixed')))
                    add('error', `Acople ${mate.id}: debe conectar fijo con volante`, mate.id);
            }
            if (fromConn && mate.from?.pin > fromConn.pins) add('error', `Pin excede pines de ${fromConn.id}`, mate.id);
            if (toConn && mate.to?.pin > toConn.pins) add('error', `Pin excede pines de ${toConn.id}`, mate.id);
        }

        const getAncestorChain = (containerId) => {
            const chain = [];
            let currentId = containerId;
            let depth = 0;
            while (currentId && depth < App.CONST.MAX_HIERARCHY_DEPTH) {
                chain.push(currentId);
                const cont = data.containers.find(c => c.id === currentId);
                if (!cont || !cont.parent_id) break;
                if (chain.includes(cont.parent_id)) {
                    add('error', `Ciclo jerárquico en ${currentId}`, currentId);
                    break;
                }
                currentId = cont.parent_id;
                depth++;
            }
            return chain;
        };

        const getConnectorContainer = (connId) => data.connectors.find(c => c.id === connId)?.parent_id;

        for (const wire of data.wires) {
            const c1 = getConnectorContainer(wire.from?.connector);
            const c2 = getConnectorContainer(wire.to?.connector);
            if (c1 && c2) {
                const chain1 = getAncestorChain(c1);
                const chain2 = getAncestorChain(c2);
                if (!chain1.find(id => chain2.includes(id)))
                    add('error', `Cable ${wire.id}: sin ancestro común`, wire.id);
            }
        }
        for (const mate of data.mates) {
            const c1 = getConnectorContainer(mate.from?.connector);
            const c2 = getConnectorContainer(mate.to?.connector);
            if (c1 && c2) {
                const chain1 = getAncestorChain(c1);
                const chain2 = getAncestorChain(c2);
                if (!chain1.find(id => chain2.includes(id)))
                    add('error', `Acople ${mate.id}: sin ancestro común`, mate.id);
            }
        }

        for (const conn of data.connectors) {
            if (conn.mountType === 'flying' && (!conn.matedId || !data.mates.some(m => m.id === conn.matedId)))
                add('error', `Conector volante ${conn.id} sin pareja válida`, conn.id);
            if (conn.mountType === 'fixed' && !conn.matedId)
                add('info', `Conector fijo ${conn.id} sin pareja (puede ser intencional)`, conn.id);
        }

        for (const container of data.containers) {
            let current = container;
            let depth = 0;
            const visited = new Set();
            while (current.parent_id) {
                if (visited.has(current.id)) {
                    add('error', `Ciclo jerárquico detectado en ${container.id}`, container.id);
                    break;
                }
                visited.add(current.id);
                current = data.containers.find(c => c.id === current.parent_id);
                if (!current) break;
                depth++;
                if (depth > App.CONST.MAX_HIERARCHY_DEPTH) {
                    add('error', `Jerarquía demasiado profunda en ${container.id}`, container.id);
                    break;
                }
            }
        }

        for (const conn of data.connectors) {
            if (conn.matedId) {
                const mate = data.mates.find(m => m.id === conn.matedId);
                if (!mate) add('error', `matedId de ${conn.id} apunta a M inexistente`, conn.id);
                else if (mate.from?.connector !== conn.id && mate.to?.connector !== conn.id)
                    add('error', `M ${mate.id} no contiene a ${conn.id}`, conn.id);
            }
        }
        for (const mate of data.mates) {
            const fromConn = data.connectors.find(c => c.id === mate.from?.connector);
            const toConn = data.connectors.find(c => c.id === mate.to?.connector);
            if (fromConn && fromConn.matedId !== mate.id) add('error', `Conector ${fromConn.id} debería tener matedId=${mate.id}`, fromConn.id);
            if (toConn && toConn.matedId !== mate.id) add('error', `Conector ${toConn.id} debería tener matedId=${mate.id}`, toConn.id);
        }

        return { errors, warnings, infos };
    },

    runValidation() {
        App.state.logEntries = [];
        const { errors, warnings, infos } = this.validateProject();
        for (const e of errors) App.Utils.addLog('error', e.message, e.entityId);
        for (const w of warnings) App.Utils.addLog('warning', w.message, w.entityId);
        for (const i of infos) App.Utils.addLog('info', i.message, i.entityId);
    },

    autocompleteEntity(entity, type) {
        const catalogs = App.state.metadata?.catalogs || {};
        if (type === 'connector' && entity.modelRef) {
            const model = catalogs.connectorModels?.[entity.modelRef];
            if (model) {
                if (model.pins !== undefined && (entity.pins === undefined || entity.pins === null)) entity.pins = model.pins;
                if (model.gender && !entity.gender) entity.gender = model.gender;
            }
        }
        if (type === 'wire') {
            if (entity.wireTypeRef) {
                const wt = catalogs.wireTypes?.[entity.wireTypeRef];
                if (wt?.unit && !entity.gaugeUnit) entity.gaugeUnit = wt.unit;
            }
            if (!entity.gaugeUnit) entity.gaugeUnit = 'mm2';
            if (entity.net) {
                const net = catalogs.nets?.[entity.net];
                if (net?.colorCode) entity.color = net.colorCode;
            }
            if (!entity.color) entity.color = 'black';
        }
        if (type === 'mate' && (entity.pinMapping === undefined || entity.pinMapping === null)) {
            entity.pinMapping = 'direct';
        }
        return entity;
    },

    createEntity(type, overrides = {}) {
        const map = {
            container: { prefix: 'T', array: 'containers', template: { type: 'enclosure', name: '', parent_id: null, designator: '', position: { x: 100, y: 100 }, size: { width: 300, height: 200 }, owner: null, sectionRef: null, notes: [] } },
            connector: { prefix: 'C', array: 'connectors', template: { type: 'connector', name: '', parent_id: null, designator: '', pins: 2, gender: 'male', mountType: 'fixed', edgeSide: 'right', offset: 50, size: { width: App.CONST.CONNECTOR_WIDTH, height: App.CONST.CONNECTOR_HEIGHT }, matedId: null, modelRef: null, owner: null, notes: [] } },
            wire: { prefix: 'W', array: 'wires', template: { type: 'wired', from: { connector: null, pin: 1 }, to: { connector: null, pin: 1 }, net: null, length: 0, gauge: null, gaugeUnit: null, color: 'black', thickness: 3.5, wireTypeRef: null, owner: null, notes: [] } },
            mate: { prefix: 'M', array: 'mates', template: { type: 'mated', from: { connector: null, pin: 1 }, to: { connector: null, pin: 1 }, net: null, pinMapping: 'direct', owner: null, notes: [] } }
        };
        const cfg = map[type];
        const existingIds = App.state.data[cfg.array].map(e => e.id);
        const newId = App.Utils.generateId(cfg.prefix, existingIds);
        let entity = App.Utils.clone(cfg.template);
        entity.id = newId;
        Object.assign(entity, overrides);
        entity = this.autocompleteEntity(entity, type);

        if (type === 'connector' && !entity.matedId && !overrides.matedId) {
            const complement = App.Utils.clone(cfg.template);
            const complementExistingIds = [...existingIds, newId];
            complement.id = App.Utils.generateId('C', complementExistingIds);
            complement.mountType = entity.mountType === 'fixed' ? 'flying' : 'fixed';
            complement.gender = entity.gender === 'male' ? 'female' : 'male';
            const oppositeEdge = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
            complement.edgeSide = oppositeEdge[entity.edgeSide] || 'left';
            complement.parent_id = entity.parent_id;
            complement.pins = entity.pins;
            complement.size = entity.size ? App.Utils.clone(entity.size) : { width: App.CONST.CONNECTOR_WIDTH, height: App.CONST.CONNECTOR_HEIGHT };
            complement.offset = entity.offset || 50;
            complement = this.autocompleteEntity(complement, 'connector');
            App.state.data.connectors.push(complement);

            const mateTemplate = map['mate'].template;
            const mateExistingIds = App.state.data.mates.map(e => e.id);
            const newMate = App.Utils.clone(mateTemplate);
            newMate.id = App.Utils.generateId('M', mateExistingIds);
            newMate.from = { connector: entity.mountType === 'fixed' ? newId : complement.id, pin: 1 };
            newMate.to = { connector: entity.mountType === 'fixed' ? complement.id : newId, pin: 1 };
            newMate.net = entity.net || null;
            newMate.pinMapping = 'direct';
            App.state.data.mates.push(newMate);

            entity.matedId = newMate.id;
            complement.matedId = newMate.id;

            App.Utils.addLog('info', `Creada pareja automática: ${newId} ↔ ${complement.id} (${newMate.id})`);
        }

        App.state.data[cfg.array].push(entity);
        App.state.isDirty = true;
        App.Utils.addLog('info', `Creado ${type} ${newId}`);
        return entity;
    },

    deleteEntity(id, type) {
        const arrayName = { container: 'containers', connector: 'connectors', wire: 'wires', mate: 'mates' }[type];
        if (!arrayName) return false;
        const idx = App.state.data[arrayName].findIndex(e => e.id === id);
        if (idx === -1) return false;
        App.state.data[arrayName].splice(idx, 1);
        App.state.isDirty = true;
        App.Utils.addLog('info', `Eliminado ${type} ${id}`);
        return true;
    },

    duplicateEntity(id, type) {
        const arrayName = { container: 'containers', connector: 'connectors', wire: 'wires', mate: 'mates' }[type];
        const original = App.state.data[arrayName].find(e => e.id === id);
        if (!original) return null;
        const copy = App.Utils.clone(original);
        const prefix = id.charAt(0);
        const existingIds = App.state.data[arrayName].map(e => e.id);
        copy.id = App.Utils.generateId(prefix, existingIds);

        if (type === 'connector') {
            copy.matedId = null;
            if (original.matedId) {
                const originalMate = App.state.data.mates.find(m => m.id === original.matedId);
                if (originalMate) {
                    const partnerId = originalMate.from.connector === original.id ? originalMate.to.connector : originalMate.from.connector;
                    const partnerConn = App.state.data.connectors.find(c => c.id === partnerId);
                    if (partnerConn) {
                        const partnerCopy = App.Utils.clone(partnerConn);
                        const partnerExistingIds = [...App.state.data.connectors.map(e => e.id), copy.id];
                        partnerCopy.id = App.Utils.generateId('C', partnerExistingIds);
                        partnerCopy.matedId = null;
                        App.state.data.connectors.push(partnerCopy);

                        const newMate = App.Utils.clone(originalMate);
                        const mateExistingIds = App.state.data.mates.map(e => e.id);
                        newMate.id = App.Utils.generateId('M', mateExistingIds);
                        if (originalMate.from.connector === original.id) {
                            newMate.from = { connector: copy.id, pin: originalMate.from.pin };
                            newMate.to = { connector: partnerCopy.id, pin: originalMate.to.pin };
                        } else {
                            newMate.from = { connector: partnerCopy.id, pin: originalMate.from.pin };
                            newMate.to = { connector: copy.id, pin: originalMate.to.pin };
                        }
                        App.state.data.mates.push(newMate);

                        copy.matedId = newMate.id;
                        partnerCopy.matedId = newMate.id;

                        App.Utils.addLog('info', `Duplicado acople ${originalMate.id} -> ${newMate.id} (${partnerCopy.id} ↔ ${copy.id})`);
                    } else {
                        App.Utils.addLog('warning', `No se encontró el conector compañero de ${original.id} para duplicar el acople.`);
                    }
                }
            }
        } else if (type === 'mate') {
            const fromConn = App.state.data.connectors.find(c => c.id === original.from?.connector);
            const toConn = App.state.data.connectors.find(c => c.id === original.to?.connector);
            if (fromConn && toConn) {
                const fromCopy = App.Utils.clone(fromConn);
                const toCopy = App.Utils.clone(toConn);
                const connExistingIds = [...App.state.data.connectors.map(e => e.id)];
                fromCopy.id = App.Utils.generateId('C', connExistingIds);
                connExistingIds.push(fromCopy.id);
                toCopy.id = App.Utils.generateId('C', connExistingIds);
                fromCopy.matedId = null;
                toCopy.matedId = null;
                App.state.data.connectors.push(fromCopy, toCopy);

                const newMate = App.Utils.clone(original);
                const mateExistingIds = App.state.data.mates.map(e => e.id);
                newMate.id = App.Utils.generateId('M', mateExistingIds);
                newMate.from = { connector: fromCopy.id, pin: original.from.pin };
                newMate.to = { connector: toCopy.id, pin: original.to.pin };
                App.state.data.mates.push(newMate);

                fromCopy.matedId = newMate.id;
                toCopy.matedId = newMate.id;

                App.Utils.addLog('info', `Duplicado M ${original.id} -> ${newMate.id} con conectores ${fromCopy.id} y ${toCopy.id}`);
            } else {
                copy.from = { connector: null, pin: 1 };
                copy.to = { connector: null, pin: 1 };
                App.Utils.addLog('warning', `No se encontraron los conectores del M ${original.id}; se creó un M vacío.`);
            }
        } else if (type === 'wire') {
            copy.from = { connector: null, pin: 1 };
            copy.to = { connector: null, pin: 1 };
        }

        App.state.data[arrayName].push(copy);
        App.state.isDirty = true;
        App.Utils.addLog('info', `Duplicado ${type} ${id} -> ${copy.id}`);
        return copy;
    },

    getConnectorSection(connectorId) {
        const conn = App.state.data.connectors.find(c => c.id === connectorId);
        if (!conn) return null;
        let currentId = conn.parent_id;
        let depth = 0;
        while (currentId && depth < App.CONST.MAX_HIERARCHY_DEPTH) {
            const container = App.state.data.containers.find(c => c.id === currentId);
            if (!container) break;
            if (container.sectionRef) return container.sectionRef;
            currentId = container.parent_id;
            depth++;
        }
        return null;
    },

    getContainerAbsolutePosition(containerId) {
        let x = 0, y = 0;
        let currentId = containerId;
        let depth = 0;
        const visited = new Set();
        while (currentId && depth < App.CONST.MAX_HIERARCHY_DEPTH) {
            if (visited.has(currentId)) {
                App.Utils.addLog('error', `Ciclo en cálculo de posición para ${containerId}`);
                return { x: 0, y: 0 };
            }
            visited.add(currentId);
            const container = App.state.data.containers.find(c => c.id === currentId);
            if (!container) break;
            if (container.position) {
                if (container.parent_id === null) {
                    x += container.position.x || 0;
                    y += container.position.y || 0;
                } else {
                    x += container.position.offsetX || 0;
                    y += container.position.offsetY || 0;
                }
            }
            currentId = container.parent_id;
            depth++;
        }
        return { x, y };
    },

    getConnectorAbsolutePosition(connectorId) {
        const conn = App.state.data.connectors.find(c => c.id === connectorId);
        if (!conn) return { x: 0, y: 0 };
        if (conn.mountType === 'flying') {
            if (!conn.matedId) return null;
            const mate = App.state.data.mates.find(m => m.id === conn.matedId);
            if (!mate) return null;
            const partnerId = mate.from.connector === conn.id ? mate.to.connector : mate.from.connector;
            const partnerConn = App.state.data.connectors.find(c => c.id === partnerId);
            if (!partnerConn || partnerConn.mountType !== 'fixed') return null;
            const partnerPos = this.getConnectorAbsolutePosition(partnerId);
            if (!partnerPos) return null;
            const pw = partnerConn.size?.width || App.CONST.CONNECTOR_WIDTH;
            const ph = partnerConn.size?.height || App.CONST.CONNECTOR_HEIGHT;
            const fw = conn.size?.width || App.CONST.CONNECTOR_WIDTH;
            const fh = conn.size?.height || App.CONST.CONNECTOR_HEIGHT;
            let fx = partnerPos.x, fy = partnerPos.y;
            switch (partnerConn.edgeSide) {
                case 'left': fx = partnerPos.x - fw; break;
                case 'right': fx = partnerPos.x + pw; break;
                case 'top': fy = partnerPos.y - fh; break;
                case 'bottom': fy = partnerPos.y + ph; break;
            }
            return { x: fx, y: fy };
        }
        const parentPos = this.getContainerAbsolutePosition(conn.parent_id);
        const parent = App.state.data.containers.find(c => c.id === conn.parent_id);
        if (!parent) return parentPos;
        const pw = parent.size?.width || 0;
        const ph = parent.size?.height || 0;
        const cw = conn.size?.width || App.CONST.CONNECTOR_WIDTH;
        const ch = conn.size?.height || App.CONST.CONNECTOR_HEIGHT;
        const offset = conn.offset || 0;
        let x = parentPos.x, y = parentPos.y;
        switch (conn.edgeSide) {
            case 'left': x = parentPos.x; y = parentPos.y + offset; break;
            case 'right': x = parentPos.x + pw - cw; y = parentPos.y + offset; break;
            case 'top': x = parentPos.x + offset; y = parentPos.y; break;
            case 'bottom': x = parentPos.x + offset; y = parentPos.y + ph - ch; break;
        }
        return { x, y };
    },

    getPinPosition(connectorId, pinNumber, side = 'front') {
        const conn = App.state.data.connectors.find(c => c.id === connectorId);
        if (!conn || !conn.pins) return null;
        const pos = this.getConnectorAbsolutePosition(connectorId);
        if (!pos) return null;
        const w = conn.size?.width || App.CONST.CONNECTOR_WIDTH;
        const h = conn.size?.height || App.CONST.CONNECTOR_HEIGHT;
        const totalPins = conn.pins;

        let effectiveEdge;
        if (conn.mountType === 'flying') {
            const mate = App.state.data.mates.find(m => m.id === conn.matedId);
            if (mate) {
                const partnerId = mate.from.connector === conn.id ? mate.to.connector : mate.from.connector;
                const partner = App.state.data.connectors.find(c => c.id === partnerId);
                if (partner) {
                    effectiveEdge = side === 'front' ? this._oppositeEdge(partner.edgeSide) : partner.edgeSide;
                } else {
                    effectiveEdge = conn.edgeSide;
                }
            } else {
                effectiveEdge = conn.edgeSide;
            }
        } else {
            effectiveEdge = side === 'back' ? this._oppositeEdge(conn.edgeSide) : conn.edgeSide;
        }

        const isVertical = effectiveEdge === 'left' || effectiveEdge === 'right';
        let px, py;
        if (isVertical) {
            const spacing = h / (totalPins + 1);
            py = pos.y + spacing * pinNumber;
            px = effectiveEdge === 'left' ? pos.x : pos.x + w;
        } else {
            const spacing = w / (totalPins + 1);
            px = pos.x + spacing * pinNumber;
            py = effectiveEdge === 'top' ? pos.y : pos.y + h;
        }
        return { x: px, y: py };
    },

    _oppositeEdge(edgeSide) {
        const map = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
        return map[edgeSide] || edgeSide;
    },

    getCatalogReferences(catalogKey, entryId) {
        const refs = [];
        const { data } = App.state;
        if (catalogKey === 'people') {
            if (App.state.metadata?.savedBy === entryId) refs.push('metadata.savedBy');
            for (const arr of [data.containers, data.connectors, data.wires, data.mates]) {
                for (const entity of arr) {
                    if (entity.owner === entryId) refs.push(entity.id);
                }
            }
        } else if (catalogKey === 'sections') {
            for (const container of data.containers) {
                if (container.sectionRef === entryId) refs.push(container.id);
            }
        } else if (catalogKey === 'connectorModels') {
            for (const conn of data.connectors) {
                if (conn.modelRef === entryId) refs.push(conn.id);
            }
        } else if (catalogKey === 'wireTypes') {
            for (const wire of data.wires) {
                if (wire.wireTypeRef === entryId) refs.push(wire.id);
            }
        } else if (catalogKey === 'nets') {
            for (const wire of data.wires) {
                if (wire.net === entryId) refs.push(wire.id);
            }
            for (const mate of data.mates) {
                if (mate.net === entryId) refs.push(mate.id);
            }
        } else if (catalogKey === 'colorPalette') {
            for (const wire of data.wires) {
                if (wire.color === entryId) refs.push(wire.id);
            }
            const nets = App.state.metadata?.catalogs?.nets || {};
            for (const [netId, net] of Object.entries(nets)) {
                if (net.colorCode === entryId) refs.push(`net:${netId}`);
            }
        }
        return refs;
    },

    createCatalogEntry(catalogKey, entryId, data) {
        const catalogs = App.state.metadata.catalogs;
        if (!catalogs[catalogKey]) catalogs[catalogKey] = {};
        if (catalogs[catalogKey][entryId]) return false;
        catalogs[catalogKey][entryId] = data;
        App.state.isDirty = true;
        App.Utils.addLog('info', `Entrada ${entryId} añadida a ${catalogKey}`);
        return true;
    },

    updateCatalogEntry(catalogKey, entryId, newData) {
        const catalogs = App.state.metadata.catalogs;
        if (!catalogs[catalogKey] || !catalogs[catalogKey][entryId]) return false;
        if (catalogKey === 'colorPalette') {
            catalogs[catalogKey][entryId] = newData;
        } else {
            Object.assign(catalogs[catalogKey][entryId], newData);
        }
        App.state.isDirty = true;
        App.Utils.addLog('info', `Entrada ${entryId} actualizada en ${catalogKey}`);
        return true;
    },

    deleteCatalogEntry(catalogKey, entryId) {
        const refs = this.getCatalogReferences(catalogKey, entryId);
        if (refs.length > 0) return false;
        const catalogs = App.state.metadata.catalogs;
        if (!catalogs[catalogKey] || !catalogs[catalogKey][entryId]) return false;
        delete catalogs[catalogKey][entryId];
        App.state.isDirty = true;
        App.Utils.addLog('info', `Entrada ${entryId} eliminada de ${catalogKey}`);
        return true;
    },

    // ─── Búsqueda de rutas ───
    /**
     * Devuelve los IDs de conectores, wires y mates que están en algún camino
     * entre fromId y toId, respetando opcionalmente un filtro de señal.
     * @param {string} fromId - ID del conector origen
     * @param {string} toId - ID del conector destino
     * @param {string} [netFilter] - ID de la señal (net) a filtrar, o vacío para todas
     * @returns {{ connectorIds: Set<string>, wireIds: Set<string>, mateIds: Set<string> }}
     */
    getPathElements(fromId, toId, netFilter = '') {
        const forward = this._bfsCollect(fromId, netFilter);
        const backward = this._bfsCollect(toId, netFilter);

        // Intersección de conjuntos
        const connectorIds = new Set([...forward.connectorIds].filter(id => backward.connectorIds.has(id)));
        const wireIds = new Set([...forward.wireIds].filter(id => backward.wireIds.has(id)));
        const mateIds = new Set([...forward.mateIds].filter(id => backward.mateIds.has(id)));

        return { connectorIds, wireIds, mateIds };
    },

    /**
     * Realiza un BFS desde un conector dado, recolectando todos los conectores,
     * wires y mates alcanzables respetando el filtro de señal.
     * @param {string} startId - ID del conector de inicio
     * @param {string} netFilter - ID de la señal a filtrar (vacío = todas)
     * @returns {{ connectorIds: Set<string>, wireIds: Set<string>, mateIds: Set<string> }}
     */
    _bfsCollect(startId, netFilter) {
        const connectorIds = new Set();
        const wireIds = new Set();
        const mateIds = new Set();
        const queue = [startId];
        const visitedConnectors = new Set();
        const { wires, mates } = App.state.data;

        while (queue.length > 0) {
            const current = queue.shift();
            if (visitedConnectors.has(current)) continue;
            visitedConnectors.add(current);
            connectorIds.add(current);

            // Explorar wires conectados al conector actual
            for (const wire of wires) {
                if (netFilter && wire.net !== netFilter) continue;
                if (wire.from?.connector === current && wire.to?.connector) {
                    wireIds.add(wire.id);
                    if (!visitedConnectors.has(wire.to.connector)) {
                        queue.push(wire.to.connector);
                    }
                }
                if (wire.to?.connector === current && wire.from?.connector) {
                    wireIds.add(wire.id);
                    if (!visitedConnectors.has(wire.from.connector)) {
                        queue.push(wire.from.connector);
                    }
                }
            }

            // Explorar mates conectados al conector actual
            for (const mate of mates) {
                if (netFilter && mate.net !== netFilter) continue;
                if (mate.from?.connector === current && mate.to?.connector) {
                    mateIds.add(mate.id);
                    if (!visitedConnectors.has(mate.to.connector)) {
                        queue.push(mate.to.connector);
                    }
                }
                if (mate.to?.connector === current && mate.from?.connector) {
                    mateIds.add(mate.id);
                    if (!visitedConnectors.has(mate.from.connector)) {
                        queue.push(mate.from.connector);
                    }
                }
            }
        }

        return { connectorIds, wireIds, mateIds };
    }
};
