/**
 * ArnesViz v2.5 – Módulo principal (App)
 * Define el namespace, el estado, las constantes y las funciones de utilidad.
 */

const App = {
    state: {
        metadata: null,
        data: {
            containers: [],
            connectors: [],
            wires: [],
            mates: []
        },
        editMode: false,
        activeView: 'table',
        selectedEntityId: null,
        selectedEntityType: null,
        sidebarState: null,
        lastDetailEntityId: null,
        isDirty: false,
        currentFileName: null,
        filters: {
            search: '',
            type: 'all',
            net: 'all',
            section: 'all'
        },
        logEntries: [],
        logShowErrors: true,
        logShowWarnings: true,
        logShowInfo: true,
        zoom: 1,
        panX: 0,
        panY: 0,
        dragging: null,
        resizing: null,
        panning: false,
        panStart: { x: 0, y: 0 },
        autosaveTimer: null,
        inlineEditing: false,
        lastCatalogEditorData: null,
        // Sección de catálogo activa (para el botón Añadir global)
        activeCatalogSection: null,
        // Conjunto de secciones de catálogo expandidas (para restaurar estado)
        expandedCatalogSections: new Set()
    },

    CONST: {
        ZOOM_MIN: 0.2,
        ZOOM_MAX: 3.0,
        ZOOM_STEP: 0.1,
        AUTOSAVE_INTERVAL: 30000,
        MAX_HIERARCHY_DEPTH: 4,
        DEFAULT_COLOR: '#6b7280',
        DEFAULT_WIRE_COLOR: 'black',
        PIN_RADIUS: 5,
        CONNECTOR_WIDTH: 180,
        CONNECTOR_HEIGHT: 115,
    },

    Utils: {
        generateId(prefix, existingIds) {
            const existing = existingIds
                .filter(id => id.startsWith(prefix))
                .map(id => parseInt(id.slice(1)))
                .filter(n => !isNaN(n));
            let next = 1;
            while (existing.includes(next)) next++;
            return `${prefix}${String(next).padStart(3, '0')}`;
        },

        clone(obj) {
            return JSON.parse(JSON.stringify(obj));
        },

        debounce(fn, delay) {
            let timer;
            return function (...args) {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        },

        throttle(fn, limit) {
            let inThrottle;
            return function (...args) {
                if (!inThrottle) {
                    fn.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => (inThrottle = false), limit);
                }
            };
        },

        escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        formatTime(isoString) {
            const d = new Date(isoString);
            return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        },

        findEntityById(id) {
            const { data } = App.state;
            for (const type of ['containers', 'connectors', 'wires', 'mates']) {
                const entity = data[type].find(e => e.id === id);
                if (entity) return { entity, type: type.slice(0, -1) };
            }
            return null;
        },

        getEntityTypeFromId(id) {
            if (!id) return null;
            const map = { T: 'container', C: 'connector', W: 'wire', M: 'mate' };
            return map[id.charAt(0)] || null;
        },

        getDataArray(type) {
            const map = {
                container: 'containers',
                connector: 'connectors',
                wire: 'wires',
                mate: 'mates'
            };
            return App.state.data[map[type]];
        },

        showToast(message, level = 'info', duration = 3000) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${level}`;
            toast.textContent = message;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        },

        showModal(title, message, buttons) {
            const container = document.getElementById('modal-container');
            container.style.display = 'flex';
            container.className = 'modal-overlay';
            container.innerHTML = `
                <div class="modal-dialog">
                    <h2>${title}</h2>
                    <p>${message}</p>
                    <div class="modal-actions">
                        ${buttons.map((btn, i) => `
                            <button class="${btn.cls || 'btn-secondary'}" data-index="${i}">${btn.label}</button>
                        `).join('')}
                    </div>
                </div>
            `;
            return new Promise(resolve => {
                container.querySelectorAll('.modal-actions button').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const index = parseInt(btn.dataset.index);
                        container.style.display = 'none';
                        resolve(index);
                    });
                });
                container.addEventListener('click', (e) => {
                    if (e.target === container) {
                        container.style.display = 'none';
                        resolve(buttons.length - 1);
                    }
                });
            });
        },

        addLog(level, message, entityId = null) {
            App.state.logEntries.push({
                level,
                message,
                entityId,
                timestamp: new Date().toISOString()
            });
            App.Interaction.updateLogPanel();
        },

        clearLogs() {
            App.state.logEntries = [];
            App.Interaction.updateLogPanel();
        },

        saveToStorage(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                App.Utils.addLog('warning', 'No se pudieron guardar preferencias. Almacenamiento local lleno.');
            }
        },

        loadFromStorage(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (e) {
                return defaultValue;
            }
        }
    }
};
