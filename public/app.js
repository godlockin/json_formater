/**
 * JSON Visualizer Pro
 * High-performance JSON editor with advanced visualization
 */

// ============================================
// State Management
// ============================================
const State = {
    jsonData: null,
    rawText: '',
    currentView: 'tree', // tree | visual (for right panel)
    currentVisual: 'structure', // structure | chart | network | topology
    history: [],
    historyIndex: -1,
    maxHistory: 50,
    settings: {
        tabSize: 4,
        fontSize: 14,
        autoFormat: true,
        virtualScroll: true,
        maxRenderItems: 1000,
        sortKeys: false,
        escapeUnicode: false,
        theme: 'dark'
    },
    search: {
        query: '',
        results: [],
        currentIndex: -1
    },
    tree: {
        expanded: new Set(),
        selected: null
    },
    chart: null,
    network: null
};

// ============================================
// DOM Elements Cache
// ============================================
const DOM = {};

function cacheDOM() {
    DOM.jsonInput = document.getElementById('json-input');
    DOM.lineNumbers = document.getElementById('line-numbers');
    DOM.errorBar = document.getElementById('error-bar');
    DOM.errorMessage = document.getElementById('error-message');
    DOM.errorPosition = document.getElementById('error-position');
    DOM.treeContainer = document.getElementById('tree-container');
    DOM.structureContainer = document.getElementById('structure-container');
    DOM.statusIndicator = document.getElementById('status-indicator');
    DOM.cursorPosition = document.getElementById('cursor-position');
    DOM.toastContainer = document.getElementById('toast-container');
    DOM.fileInput = document.getElementById('file-input');
    DOM.searchModal = document.getElementById('search-modal');
    DOM.settingsModal = document.getElementById('settings-modal');
}

// ============================================
// Utility Functions
// ============================================
const Utils = {
    debounce: (fn, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    },

    throttle: (fn, limit) => {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                fn(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    formatBytes: (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    copyToClipboard: async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            return success;
        }
    },

    downloadFile: (content, filename, type = 'application/json') => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    generateId: () => Math.random().toString(36).substr(2, 9),

    deepClone: (obj) => JSON.parse(JSON.stringify(obj)),

    getValueType: (value) => {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    },

    getPathValue: (obj, path) => {
        const parts = path.split(/\.|\[|\]/).filter(Boolean);
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }
        return current;
    },

    setPathValue: (obj, path, value) => {
        const parts = path.split(/\.|\[|\]/).filter(Boolean);
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) {
                current[parts[i]] = isNaN(parts[i + 1]) ? {} : [];
            }
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
        return obj;
    },

    compareJSON: (obj1, obj2) => {
        const changes = [];
        
        const compare = (o1, o2, path = '') => {
            if (typeof o1 !== typeof o2) {
                changes.push({ path, type: 'type', old: o1, new: o2 });
                return;
            }
            
            if (typeof o1 !== 'object' || o1 === null || o2 === null) {
                if (o1 !== o2) {
                    changes.push({ path, type: 'value', old: o1, new: o2 });
                }
                return;
            }
            
            const keys1 = Object.keys(o1);
            const keys2 = Object.keys(o2);
            
            keys1.forEach(key => {
                if (!(key in o2)) {
                    changes.push({ path: `${path}.${key}`, type: 'removed', old: o1[key], new: undefined });
                } else {
                    compare(o1[key], o2[key], `${path}.${key}`);
                }
            });
            
            keys2.forEach(key => {
                if (!(key in o1)) {
                    changes.push({ path: `${path}.${key}`, type: 'added', old: undefined, new: o2[key] });
                }
            });
        };
        
        compare(obj1, obj2);
        return changes;
    }
};

// ============================================
// History Manager
// ============================================
const History = {
    add: (text) => {
        if (State.history[State.historyIndex] === text) return;
        
        State.history = State.history.slice(0, State.historyIndex + 1);
        State.history.push(text);
        
        if (State.history.length > State.maxHistory) {
            State.history.shift();
        } else {
            State.historyIndex++;
        }
        
        History.updateButtons();
    },

    undo: () => {
        if (State.historyIndex > 0) {
            State.historyIndex--;
            DOM.jsonInput.value = State.history[State.historyIndex];
            JSONEditor.parse();
            JSONEditor.updateLineNumbers();
            History.updateButtons();
        }
    },

    redo: () => {
        if (State.historyIndex < State.history.length - 1) {
            State.historyIndex++;
            DOM.jsonInput.value = State.history[State.historyIndex];
            JSONEditor.parse();
            JSONEditor.updateLineNumbers();
            History.updateButtons();
        }
    },

    updateButtons: () => {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) undoBtn.disabled = State.historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = State.historyIndex >= State.history.length - 1;
    }
};

// ============================================
// JSON Editor
// ============================================
const JSONEditor = {
    parse: () => {
        const text = DOM.jsonInput.value.trim();
        State.rawText = text;
        
        if (!text) {
            State.jsonData = null;
            JSONEditor.hideError();
            TreeView.clear();
            Visualizations.clear();
            Stats.update();
            return;
        }
        
        try {
            State.jsonData = JSON.parse(text);
            JSONEditor.hideError();
            JSONEditor.updateStatus(true);
            
            // Update views based on current selection
            if (State.currentView === 'tree') {
                TreeView.render();
            } else {
                Visualizations[State.currentVisual].render();
            }
            Stats.update();
        } catch (error) {
            JSONEditor.showError(error);
            State.jsonData = null;
            TreeView.clear();
            Visualizations.clear();
            JSONEditor.updateStatus(false);
        }
    },

    format: () => {
        if (!State.jsonData) {
            Toast.show('No valid JSON to format', 'error');
            return;
        }
        
        const formatted = JSON.stringify(State.jsonData, null, State.settings.tabSize);
        DOM.jsonInput.value = formatted;
        JSONEditor.updateLineNumbers();
        History.add(formatted);
        Toast.show('JSON formatted', 'success');
    },

    compact: () => {
        if (!State.jsonData) {
            Toast.show('No valid JSON to compact', 'error');
            return;
        }
        
        const compact = JSON.stringify(State.jsonData);
        DOM.jsonInput.value = compact;
        JSONEditor.updateLineNumbers();
        History.add(compact);
        Toast.show('JSON compacted', 'success');
    },

    showError: (error) => {
        const match = error.message.match(/position (\d+)/);
        const position = match ? parseInt(match[1]) : null;
        
        DOM.errorMessage.textContent = error.message;
        
        if (position !== null) {
            const lines = State.rawText.substring(0, position).split('\n');
            const line = lines.length;
            const column = lines[lines.length - 1].length + 1;
            DOM.errorPosition.textContent = `Line ${line}, Column ${column}`;
            
            // Highlight error line
            document.querySelectorAll('.line-number').forEach((el, i) => {
                el.classList.toggle('error', i + 1 === line);
            });
        } else {
            DOM.errorPosition.textContent = '';
        }
        
        DOM.errorBar.classList.add('show');
    },

    hideError: () => {
        DOM.errorBar.classList.remove('show');
        document.querySelectorAll('.line-number.error').forEach(el => {
            el.classList.remove('error');
        });
    },

    updateLineNumbers: () => {
        const lines = DOM.jsonInput.value.split('\n').length;
        DOM.lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => 
            `<span class="line-number">${i + 1}</span>`
        ).join('');
    },

    updateStatus: (isValid) => {
        const indicator = DOM.statusIndicator;
        if (isValid) {
            indicator.classList.remove('error');
            indicator.innerHTML = '<i class="fas fa-check-circle"></i><span>Valid JSON</span>';
        } else {
            indicator.classList.add('error');
            indicator.innerHTML = '<i class="fas fa-times-circle"></i><span>Invalid JSON</span>';
        }
    },

    updateCursorPosition: () => {
        const textarea = DOM.jsonInput;
        const value = textarea.value;
        const selectionStart = textarea.selectionStart;
        
        const lines = value.substring(0, selectionStart).split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;
        
        DOM.cursorPosition.textContent = `Ln ${line}, Col ${column}`;
    },

    clear: () => {
        DOM.jsonInput.value = '';
        JSONEditor.updateLineNumbers();
        State.jsonData = null;
        JSONEditor.hideError();
        TreeView.clear();
        Visualizations.clear();
        Stats.update();
        History.add('');
    },

    loadSample: () => {
        const sample = {
            "name": "JSON Visualizer Pro",
            "version": "2.0.0",
            "description": "Advanced JSON editor and visualizer",
            "features": [
                "Real-time parsing",
                "Virtual scrolling",
                "Multiple visualizations",
                "Advanced search"
            ],
            "config": {
                "theme": "dark",
                "autoFormat": true,
                "tabSize": 4
            },
            "stats": {
                "users": 15000,
                "rating": 4.9,
                "downloads": 50000,
                "active": true
            },
            "nested": {
                "level1": {
                    "level2": {
                        "level3": {
                            "deep": "value"
                        }
                    }
                }
            }
        };
        
        const formatted = JSON.stringify(sample, null, State.settings.tabSize);
        DOM.jsonInput.value = formatted;
        JSONEditor.updateLineNumbers();
        JSONEditor.parse();
        History.add(formatted);
        Toast.show('Sample loaded', 'success');
    }
};

// ============================================
// Tree View
// ============================================
const TreeView = {
    render: () => {
        if (!State.jsonData) {
            TreeView.clear();
            return;
        }
        
        DOM.treeContainer.innerHTML = '';
        const tree = TreeView.createNode(State.jsonData, 'root', '', 0);
        DOM.treeContainer.appendChild(tree);
    },

    createNode: (value, key, path, depth) => {
        const type = Utils.getValueType(value);
        const container = document.createElement('div');
        container.className = 'tree-node';
        
        const isExpandable = type === 'object' || type === 'array';
        const childrenCount = isExpandable ? (type === 'array' ? value.length : Object.keys(value).length) : 0;
        
        // Toggle button
        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle' + (isExpandable ? '' : ' leaf');
        toggle.innerHTML = '▼';
        
        if (isExpandable) {
            const isExpanded = State.tree.expanded.has(path) || depth < 2;
            if (!isExpanded) {
                toggle.classList.add('collapsed');
            }
            
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const children = container.querySelector('.tree-children');
                if (children) {
                    const isCollapsed = children.classList.toggle('collapsed');
                    toggle.classList.toggle('collapsed', isCollapsed);
                    
                    if (isCollapsed) {
                        State.tree.expanded.delete(path);
                    } else {
                        State.tree.expanded.add(path);
                    }
                }
            });
        }
        
        container.appendChild(toggle);
        
        // Content
        const content = document.createElement('div');
        content.className = 'tree-content';
        content.dataset.path = path;
        
        if (key !== 'root') {
            const keySpan = document.createElement('span');
            keySpan.className = 'tree-key';
            keySpan.textContent = typeof key === 'number' ? `[${key}]` : `"${key}"`;
            content.appendChild(keySpan);
            
            const colon = document.createElement('span');
            colon.className = 'tree-colon';
            colon.textContent = ': ';
            content.appendChild(colon);
        }
        
        if (!isExpandable) {
            const valueSpan = document.createElement('span');
            valueSpan.className = `tree-value ${type}`;
            valueSpan.textContent = TreeView.formatValue(value);
            content.appendChild(valueSpan);
            
            const typeTag = document.createElement('span');
            typeTag.className = 'tree-type-tag';
            typeTag.textContent = type;
            content.appendChild(typeTag);
        } else {
            const bracketOpen = document.createElement('span');
            bracketOpen.className = 'tree-bracket';
            bracketOpen.textContent = type === 'array' ? '[' : '{';
            content.appendChild(bracketOpen);
            
            if (childrenCount > 0) {
                const elipsis = document.createElement('span');
                elipsis.className = 'tree-elipsis';
                elipsis.textContent = `${childrenCount} items`;
                content.appendChild(elipsis);
            }
            
            const bracketClose = document.createElement('span');
            bracketClose.className = 'tree-bracket';
            bracketClose.textContent = type === 'array' ? ']' : '}';
            content.appendChild(bracketClose);
        }
        
        content.addEventListener('click', () => {
            document.querySelectorAll('.tree-content.selected').forEach(el => {
                el.classList.remove('selected');
            });
            content.classList.add('selected');
            State.tree.selected = path;
        });
        
        container.appendChild(content);
        
        // Children
        if (isExpandable && childrenCount > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            
            const isExpanded = State.tree.expanded.has(path) || depth < 2;
            if (!isExpanded) {
                childrenContainer.classList.add('collapsed');
            }
            
            if (type === 'array') {
                value.forEach((item, index) => {
                    const childPath = `${path}[${index}]`;
                    const child = TreeView.createNode(item, index, childPath, depth + 1);
                    childrenContainer.appendChild(child);
                });
            } else {
                Object.entries(value).forEach(([childKey, childValue]) => {
                    const childPath = path ? `${path}.${childKey}` : childKey;
                    const child = TreeView.createNode(childValue, childKey, childPath, depth + 1);
                    childrenContainer.appendChild(child);
                });
            }
            
            container.appendChild(childrenContainer);
        }
        
        return container;
    },

    formatValue: (value) => {
        if (value === null) return 'null';
        if (typeof value === 'string') return `"${value}"`;
        return String(value);
    },

    clear: () => {
        DOM.treeContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tree"></i>
                <p>Enter JSON to see tree view</p>
            </div>
        `;
    },

    expandAll: () => {
        document.querySelectorAll('.tree-children').forEach(el => {
            el.classList.remove('collapsed');
        });
        document.querySelectorAll('.tree-toggle').forEach(el => {
            el.classList.remove('collapsed');
        });
    },

    collapseAll: () => {
        document.querySelectorAll('.tree-children').forEach(el => {
            el.classList.add('collapsed');
        });
        document.querySelectorAll('.tree-toggle').forEach(el => {
            el.classList.add('collapsed');
        });
    },

    copyPath: () => {
        if (!State.tree.selected) {
            Toast.show('No node selected', 'warning');
            return;
        }
        
        Utils.copyToClipboard(State.tree.selected);
        Toast.show('Path copied to clipboard', 'success');
    }
};

// ============================================
// Stats
// ============================================
const Stats = {
    update: () => {
        const text = State.rawText;
        document.getElementById('stat-chars').textContent = `${text.length.toLocaleString()} chars`;
        document.getElementById('stat-lines').textContent = `${text.split('\n').length.toLocaleString()} lines`;
        document.getElementById('stat-size').textContent = Utils.formatBytes(new Blob([text]).size);
    }
};

// ============================================
// Visualizations
// ============================================
const Visualizations = {
    clear: () => {
        DOM.structureContainer.innerHTML = '';
        const chartCanvas = document.getElementById('chart-canvas');
        if (chartCanvas) {
            const ctx = chartCanvas.getContext('2d');
            ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
        }
    },

    structure: {
        render: () => {
            if (!State.jsonData) {
                DOM.structureContainer.innerHTML = '';
                return;
            }
            
            DOM.structureContainer.innerHTML = '';
            const structure = Visualizations.structure.createTree(State.jsonData);
            DOM.structureContainer.appendChild(structure);
        },

        createTree: (data, key = 'root', depth = 0) => {
            const container = document.createElement('div');
            container.className = 'structure-item';
            container.style.marginLeft = `${depth * 20}px`;
            
            const type = Utils.getValueType(data);
            
            const item = document.createElement('div');
            item.className = 'structure-property';
            
            const typeTag = document.createElement('span');
            typeTag.className = `structure-type ${type}`;
            typeTag.textContent = type === 'array' ? `array[${data.length}]` : 
                                 type === 'object' ? `object{${Object.keys(data).length}}` : type;
            
            item.appendChild(typeTag);
            
            if (key !== 'root') {
                const keySpan = document.createElement('span');
                keySpan.className = 'structure-key';
                keySpan.textContent = typeof key === 'number' ? `[${key}]` : key;
                item.appendChild(keySpan);
            }
            
            if (type !== 'object' && type !== 'array') {
                const valueSpan = document.createElement('span');
                valueSpan.className = 'structure-value';
                valueSpan.textContent = typeof data === 'string' ? `"${data}"` : String(data);
                item.appendChild(valueSpan);
            }
            
            container.appendChild(item);
            
            if (type === 'object' || type === 'array') {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'structure-children';
                
                if (type === 'array') {
                    data.forEach((item, index) => {
                        childrenContainer.appendChild(
                            Visualizations.structure.createTree(item, index, depth + 1)
                        );
                    });
                } else {
                    Object.entries(data).forEach(([k, v]) => {
                        childrenContainer.appendChild(
                            Visualizations.structure.createTree(v, k, depth + 1)
                        );
                    });
                }
                
                container.appendChild(childrenContainer);
            }
            
            return container;
        }
    },

    chart: {
        instance: null,

        render: () => {
            if (!State.jsonData) return;
            
            const type = document.getElementById('chart-type').value;
            const dataType = document.getElementById('chart-data').value;
            
            if (Visualizations.chart.instance) {
                Visualizations.chart.instance.destroy();
            }
            
            const ctx = document.getElementById('chart-canvas').getContext('2d');
            const data = Visualizations.chart.prepareData(State.jsonData, dataType);
            
            const config = {
                type: type,
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Data Distribution',
                        data: data.values,
                        backgroundColor: Visualizations.chart.generateColors(data.labels.length),
                        borderColor: 'rgba(255, 255, 255, 0.5)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: getComputedStyle(document.body).getPropertyValue('--text-primary') }
                        }
                    }
                }
            };
            
            Visualizations.chart.instance = new Chart(ctx, config);
        },

        prepareData: (data, type) => {
            if (type === 'types') {
                const types = {};
                const countTypes = (obj) => {
                    const t = Utils.getValueType(obj);
                    types[t] = (types[t] || 0) + 1;
                    
                    if (t === 'object') {
                        Object.values(obj).forEach(countTypes);
                    } else if (t === 'array') {
                        obj.forEach(countTypes);
                    }
                };
                countTypes(data);
                
                return {
                    labels: Object.keys(types),
                    values: Object.values(types)
                };
            } else if (type === 'keys') {
                const keys = {};
                const countKeys = (obj) => {
                    if (typeof obj === 'object' && obj !== null) {
                        Object.keys(obj).forEach(k => {
                            keys[k] = (keys[k] || 0) + 1;
                            countKeys(obj[k]);
                        });
                    }
                };
                countKeys(data);
                
                const sorted = Object.entries(keys)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10);
                
                return {
                    labels: sorted.map(([k]) => k),
                    values: sorted.map(([, v]) => v)
                };
            }
            
            return { labels: ['Root'], values: [1] };
        },

        generateColors: (count) => {
            const colors = [];
            for (let i = 0; i < count; i++) {
                const hue = (i * 137.5) % 360;
                colors.push(`hsla(${hue}, 70%, 60%, 0.8)`);
            }
            return colors;
        }
    },

    network: {
        instance: null,

        render: () => {
            if (!State.jsonData) return;
            
            const container = document.getElementById('network-container');
            
            if (Visualizations.network.instance) {
                Visualizations.network.instance.destroy();
            }
            
            const { nodes, edges } = Visualizations.network.generateData(State.jsonData);
            
            const data = {
                nodes: new vis.DataSet(nodes),
                edges: new vis.DataSet(edges)
            };
            
            const options = {
                nodes: {
                    shape: 'dot',
                    size: 16,
                    font: { size: 12, color: getComputedStyle(document.body).getPropertyValue('--text-primary') }
                },
                edges: {
                    width: 2,
                    color: { color: getComputedStyle(document.body).getPropertyValue('--border-color') }
                },
                physics: {
                    stabilization: false,
                    barnesHut: {
                        gravitationalConstant: -8000,
                        springConstant: 0.04,
                        springLength: 95
                    }
                }
            };
            
            Visualizations.network.instance = new vis.Network(container, data, options);
        },

        generateData: (data, parentId = 'root', path = '') => {
            let nodes = [{ id: 'root', label: 'root', group: 'root' }];
            let edges = [];
            
            const process = (obj, pid, p) => {
                const type = Utils.getValueType(obj);
                
                if (type === 'object' || type === 'array') {
                    const id = p || 'root';
                    nodes.push({ id, label: type === 'array' ? `[${obj.length}]` : `{${Object.keys(obj).length}}`, group: type });
                    
                    if (pid !== id) {
                        edges.push({ from: pid, to: id });
                    }
                    
                    if (type === 'array') {
                        obj.forEach((item, i) => {
                            const itemId = `${p}[${i}]`;
                            const itemType = Utils.getValueType(item);
                            
                            if (itemType === 'object' || itemType === 'array') {
                                process(item, id, itemId);
                            } else {
                                nodes.push({ id: itemId, label: String(item).slice(0, 20), group: itemType });
                                edges.push({ from: id, to: itemId });
                            }
                        });
                    } else {
                        Object.entries(obj).forEach(([key, value]) => {
                            const keyId = `${p}.${key}`;
                            const valueType = Utils.getValueType(value);
                            
                            if (valueType === 'object' || valueType === 'array') {
                                process(value, id, keyId);
                            } else {
                                nodes.push({ id: keyId, label: key, group: 'key' });
                                edges.push({ from: id, to: keyId });
                            }
                        });
                    }
                }
            };
            
            process(data, 'root', '');
            return { nodes, edges };
        }
    },

    topology: {
        svg: null,
        simulation: null,

        render: () => {
            if (!State.jsonData) return;
            
            const container = document.getElementById('topology-container');
            container.innerHTML = '';
            
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            const svg = d3.select('#topology-container')
                .append('svg')
                .attr('width', width)
                .attr('height', height);
            
            Visualizations.topology.svg = svg;
            
            const { nodes, links } = Visualizations.topology.generateData(State.jsonData);
            
            const simulation = d3.forceSimulation(nodes)
                .force('link', d3.forceLink(links).id(d => d.id).distance(100))
                .force('charge', d3.forceManyBody().strength(-300))
                .force('center', d3.forceCenter(width / 2, height / 2));
            
            Visualizations.topology.simulation = simulation;
            
            const link = svg.append('g')
                .selectAll('line')
                .data(links)
                .join('line')
                .attr('stroke', getComputedStyle(document.body).getPropertyValue('--border-color'))
                .attr('stroke-width', 1);
            
            const node = svg.append('g')
                .selectAll('g')
                .data(nodes)
                .join('g')
                .call(d3.drag()
                    .on('start', dragstarted)
                    .on('drag', dragged)
                    .on('end', dragended));
            
            node.append('circle')
                .attr('r', d => d.type === 'root' ? 20 : 10)
                .attr('fill', d => Visualizations.topology.getColor(d.type));
            
            if (document.getElementById('topology-labels').checked) {
                node.append('text')
                    .attr('dx', 12)
                    .attr('dy', 4)
                    .text(d => d.label)
                    .attr('fill', getComputedStyle(document.body).getPropertyValue('--text-primary'))
                    .attr('font-size', '11px');
            }
            
            simulation.on('tick', () => {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);
                
                node.attr('transform', d => `translate(${d.x},${d.y})`);
            });
            
            function dragstarted(event, d) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }
            
            function dragged(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            }
            
            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }
        },

        generateData: (data, parentId = 'root', path = '') => {
            let nodes = [{ id: 'root', label: 'root', type: 'root' }];
            let links = [];
            
            const process = (obj, pid, p) => {
                const type = Utils.getValueType(obj);
                
                if (type === 'object' || type === 'array') {
                    const id = p || 'root';
                    
                    if (id !== 'root') {
                        nodes.push({ 
                            id, 
                            label: type === 'array' ? `[${obj.length}]` : `{${Object.keys(obj).length}}`, 
                            type 
                        });
                        links.push({ source: pid, target: id });
                    }
                    
                    if (type === 'array') {
                        obj.forEach((item, i) => {
                            const itemId = `${p}[${i}]`;
                            process(item, id, itemId);
                        });
                    } else {
                        Object.entries(obj).forEach(([key, value]) => {
                            const keyId = `${p}.${key}`;
                            process(value, id, keyId);
                        });
                    }
                } else {
                    nodes.push({ 
                        id: p, 
                        label: String(obj).slice(0, 10), 
                        type 
                    });
                    links.push({ source: parentId, target: p });
                }
            };
            
            process(data, 'root', '');
            return { nodes, links };
        },

        getColor: (type) => {
            const colors = {
                root: '#fd7f6f',
                object: '#7eb0d5',
                array: '#b2e061',
                string: '#bd7ebe',
                number: '#ffb55a',
                boolean: '#ffee65',
                null: '#beb9db'
            };
            return colors[type] || '#8bd3c7';
        },

        togglePhysics: () => {
            const enabled = document.getElementById('topology-physics').checked;
            if (Visualizations.topology.simulation) {
                if (enabled) {
                    Visualizations.topology.simulation.restart();
                } else {
                    Visualizations.topology.simulation.stop();
                }
            }
        },

        toggleLabels: () => {
            Visualizations.topology.render();
        }
    }
};

// ============================================
// Search
// ============================================
const Search = {
    open: () => {
        DOM.searchModal.classList.add('show');
        document.getElementById('search-input').focus();
    },

    close: () => {
        DOM.searchModal.classList.remove('show');
    },

    perform: () => {
        if (!State.jsonData) {
            Toast.show('No JSON data to search', 'warning');
            return;
        }
        
        const query = document.getElementById('search-input').value.trim();
        if (!query) return;
        
        const searchKeys = document.getElementById('search-keys').checked;
        const searchValues = document.getElementById('search-values').checked;
        const useRegex = document.getElementById('search-regex').checked;
        const caseSensitive = document.getElementById('search-case').checked;
        
        const results = [];
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = useRegex ? new RegExp(query, flags) : null;
        
        const search = (obj, path = '') => {
            if (typeof obj !== 'object' || obj === null) return;
            
            Object.entries(obj).forEach(([key, value]) => {
                const currentPath = path ? `${path}.${key}` : key;
                
                if (searchKeys) {
                    const match = useRegex ? regex.test(key) : 
                                 caseSensitive ? key.includes(query) : 
                                 key.toLowerCase().includes(query.toLowerCase());
                    if (match) {
                        results.push({ path: currentPath, key, value, type: 'key' });
                    }
                }
                
                if (searchValues && value !== null && value !== undefined) {
                    const valueStr = String(value);
                    const match = useRegex ? regex.test(valueStr) : 
                                 caseSensitive ? valueStr.includes(query) : 
                                 valueStr.toLowerCase().includes(query.toLowerCase());
                    if (match) {
                        results.push({ path: currentPath, key, value, type: 'value' });
                    }
                }
                
                if (typeof value === 'object' && value !== null) {
                    search(value, currentPath);
                }
            });
        };
        
        search(State.jsonData);
        
        const resultsContainer = document.getElementById('search-results');
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="empty-state"><p>No results found</p></div>';
        } else {
            resultsContainer.innerHTML = results.map(r => `
                <div class="search-result-item" data-path="${r.path}">
                    <div class="search-result-path">${r.path}</div>
                    <div class="search-result-value">
                        ${r.type === 'key' ? `<strong>Key:</strong> "${r.key}"` : `<strong>Value:</strong> ${JSON.stringify(r.value).slice(0, 100)}`}
                    </div>
                </div>
            `).join('');
            
            resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    Search.navigateToPath(item.dataset.path);
                });
            });
        }
        
        Toast.show(`Found ${results.length} result${results.length !== 1 ? 's' : ''}`, 'success');
    },

    navigateToPath: (path) => {
        // Switch to tree view
        document.querySelector('[data-view="tree"]').click();
        
        // Expand path in tree
        const parts = path.split('.');
        let currentPath = '';
        parts.forEach((part, i) => {
            currentPath = currentPath ? `${currentPath}.${part}` : part;
            State.tree.expanded.add(currentPath);
        });
        
        TreeView.render();
        Search.close();
        
        // Highlight the node
        setTimeout(() => {
            const node = document.querySelector(`[data-path="${path}"]`);
            if (node) {
                node.classList.add('selected');
                node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
};

// ============================================
// Settings
// ============================================
const Settings = {
    open: () => {
        DOM.settingsModal.classList.add('show');
    },

    close: () => {
        DOM.settingsModal.classList.remove('show');
    },

    load: () => {
        const saved = localStorage.getItem('jsonVisualizerSettings');
        if (saved) {
            State.settings = { ...State.settings, ...JSON.parse(saved) };
        }
        Settings.apply();
    },

    save: () => {
        State.settings.tabSize = parseInt(document.getElementById('setting-tab-size').value);
        State.settings.fontSize = parseInt(document.getElementById('setting-font-size').value);
        State.settings.autoFormat = document.getElementById('setting-auto-format').checked;
        State.settings.virtualScroll = document.getElementById('setting-virtual-scroll').checked;
        State.settings.maxRenderItems = parseInt(document.getElementById('setting-max-items').value);
        State.settings.sortKeys = document.getElementById('setting-sort-keys').checked;
        State.settings.escapeUnicode = document.getElementById('setting-escape-unicode').checked;
        
        localStorage.setItem('jsonVisualizerSettings', JSON.stringify(State.settings));
        Settings.apply();
        Toast.show('Settings saved', 'success');
    },

    apply: () => {
        document.getElementById('setting-tab-size').value = State.settings.tabSize;
        document.getElementById('setting-font-size').value = State.settings.fontSize;
        document.getElementById('font-size-value').textContent = `${State.settings.fontSize}px`;
        document.getElementById('setting-auto-format').checked = State.settings.autoFormat;
        document.getElementById('setting-virtual-scroll').checked = State.settings.virtualScroll;
        document.getElementById('setting-max-items').value = State.settings.maxRenderItems;
        document.getElementById('setting-sort-keys').checked = State.settings.sortKeys;
        document.getElementById('setting-escape-unicode').checked = State.settings.escapeUnicode;
        
        // Apply font size
        DOM.jsonInput.style.fontSize = `${State.settings.fontSize}px`;
        
        // Apply tab size
        DOM.jsonInput.style.tabSize = State.settings.tabSize;
    }
};

// ============================================
// Toast Notifications
// ============================================
const Toast = {
    show: (message, type = 'success', duration = 3000) => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'check-circle',
            error: 'times-circle',
            warning: 'exclamation-triangle'
        };
        
        toast.innerHTML = `
            <i class="fas fa-${icons[type]}"></i>
            <span>${message}</span>
        `;
        
        DOM.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};

// ============================================
// File Operations
// ============================================
const FileOps = {
    import: () => {
        DOM.fileInput.click();
    },

    handleImport: (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.name.endsWith('.json') && !file.name.endsWith('.txt')) {
            Toast.show('Please select a JSON or TXT file', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            DOM.jsonInput.value = e.target.result;
            JSONEditor.updateLineNumbers();
            JSONEditor.parse();
            History.add(e.target.result);
            Toast.show(`Loaded ${file.name}`, 'success');
        };
        reader.readAsText(file);
        
        DOM.fileInput.value = '';
    },

    export: () => {
        if (!State.jsonData) {
            Toast.show('No JSON data to export', 'warning');
            return;
        }
        
        const json = State.settings.sortKeys ? 
            JSON.stringify(State.jsonData, Object.keys(State.jsonData).sort(), State.settings.tabSize) :
            JSON.stringify(State.jsonData, null, State.settings.tabSize);
        
        Utils.downloadFile(json, `export-${Date.now()}.json`);
        Toast.show('JSON exported', 'success');
    }
};

// ============================================
// Theme
// ============================================
const Theme = {
    toggle: () => {
        document.body.classList.toggle('dark-theme');
        State.settings.theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        localStorage.setItem('jsonVisualizerTheme', State.settings.theme);
        
        // Update icon
        const icon = document.querySelector('#btn-theme i');
        icon.className = State.settings.theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        
        // Re-render visualizations with new colors
        if (State.currentView === 'visual') {
            Visualizations[State.currentVisual].render();
        }
    },

    load: () => {
        const saved = localStorage.getItem('jsonVisualizerTheme');
        if (saved === 'light') {
            document.body.classList.remove('dark-theme');
            document.querySelector('#btn-theme i').className = 'fas fa-sun';
        }
    }
};

// ============================================
// View Management
// ============================================
const ViewManager = {
    switchView: (viewName) => {
        State.currentView = viewName;
        
        // Update tabs in result panel
        document.querySelectorAll('.panel-result .view-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });
        
        // Show/hide result content
        document.querySelectorAll('.result-content').forEach(content => {
            const shouldShow = (viewName === 'tree' && content.id === 'result-tree') ||
                              (viewName === 'visual' && content.id === 'result-visual');
            content.classList.toggle('active', shouldShow);
        });
        
        // Show/hide appropriate controls
        const treeControls = document.getElementById('tree-controls');
        const visualControls = document.getElementById('visual-controls');
        
        if (treeControls) {
            treeControls.style.display = viewName === 'tree' ? 'flex' : 'none';
        }
        if (visualControls) {
            visualControls.style.display = viewName === 'visual' ? 'flex' : 'none';
        }
        
        // Render visual content if needed
        if (viewName === 'visual') {
            Visualizations[State.currentVisual].render();
        } else if (viewName === 'tree') {
            TreeView.render();
        }
    },

    switchVisual: (visualName) => {
        State.currentVisual = visualName;
        
        // Update tabs
        document.querySelectorAll('.visual-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.visual === visualName);
        });
        
        // Update content
        document.querySelectorAll('.visual-content').forEach(content => {
            content.classList.toggle('active', content.id === `visual-${visualName}`);
        });
        
        // Render
        Visualizations[visualName].render();
    }
};

// ============================================
// Keyboard Shortcuts
// ============================================
const KeyboardShortcuts = {
    init: () => {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + F - Search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                Search.open();
            }
            
            // Ctrl/Cmd + Shift + F - Format
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                JSONEditor.format();
            }
            
            // Ctrl/Cmd + Shift + C - Compact
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                JSONEditor.compact();
            }
            
            // Ctrl/Cmd + Z - Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                History.undo();
            }
            
            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z - Redo
            if (((e.ctrlKey || e.metaKey) && e.key === 'y') ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                History.redo();
            }
            
            // Escape - Close modals
            if (e.key === 'Escape') {
                Search.close();
                Settings.close();
            }
            
            // Tab handling in textarea
            if (e.key === 'Tab' && document.activeElement === DOM.jsonInput) {
                e.preventDefault();
                const start = DOM.jsonInput.selectionStart;
                const end = DOM.jsonInput.selectionEnd;
                const spaces = ' '.repeat(State.settings.tabSize);
                DOM.jsonInput.value = DOM.jsonInput.value.substring(0, start) + spaces + DOM.jsonInput.value.substring(end);
                DOM.jsonInput.selectionStart = DOM.jsonInput.selectionEnd = start + spaces.length;
                JSONEditor.updateLineNumbers();
            }
        });
    }
};

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // View tabs (right panel)
    document.querySelectorAll('.panel-result .view-tab').forEach(tab => {
        tab.addEventListener('click', () => ViewManager.switchView(tab.dataset.view));
    });
    
    // Visual tabs
    document.querySelectorAll('.visual-tab').forEach(tab => {
        tab.addEventListener('click', () => ViewManager.switchVisual(tab.dataset.visual));
    });
    
    // Toolbar buttons
    document.getElementById('btn-format').addEventListener('click', JSONEditor.format);
    document.getElementById('btn-compact').addEventListener('click', JSONEditor.compact);
    document.getElementById('btn-undo').addEventListener('click', History.undo);
    document.getElementById('btn-redo').addEventListener('click', History.redo);
    document.getElementById('btn-search').addEventListener('click', Search.open);
    document.getElementById('btn-settings').addEventListener('click', Settings.open);
    document.getElementById('btn-import').addEventListener('click', FileOps.import);
    document.getElementById('btn-export').addEventListener('click', FileOps.export);
    document.getElementById('btn-clear').addEventListener('click', JSONEditor.clear);
    document.getElementById('btn-sample').addEventListener('click', JSONEditor.loadSample);
    document.getElementById('btn-theme').addEventListener('click', Theme.toggle);
    
    // Tree controls
    document.getElementById('btn-expand-all').addEventListener('click', TreeView.expandAll);
    document.getElementById('btn-collapse-all').addEventListener('click', TreeView.collapseAll);
    document.getElementById('btn-copy-path').addEventListener('click', TreeView.copyPath);
    
    // Chart controls
    document.getElementById('btn-generate-chart').addEventListener('click', Visualizations.chart.render);
    
    // Topology controls
    document.getElementById('topology-physics').addEventListener('change', Visualizations.topology.togglePhysics);
    document.getElementById('topology-labels').addEventListener('change', Visualizations.topology.toggleLabels);
    
    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            Search.close();
            Settings.close();
        });
    });
    
    // Search
    document.getElementById('btn-search-json').addEventListener('click', Search.perform);
    document.getElementById('search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') Search.perform();
    });
    
    // Settings
    document.getElementById('setting-font-size').addEventListener('input', (e) => {
        document.getElementById('font-size-value').textContent = `${e.target.value}px`;
    });
    
    // File input
    DOM.fileInput.addEventListener('change', FileOps.handleImport);
    
    // JSON input
    const debouncedParse = Utils.debounce(JSONEditor.parse, 300);
    DOM.jsonInput.addEventListener('input', () => {
        JSONEditor.updateLineNumbers();
        debouncedParse();
        History.add(DOM.jsonInput.value);
    });
    
    DOM.jsonInput.addEventListener('click', JSONEditor.updateCursorPosition);
    DOM.jsonInput.addEventListener('keyup', JSONEditor.updateCursorPosition);
    DOM.jsonInput.addEventListener('scroll', () => {
        DOM.lineNumbers.scrollTop = DOM.jsonInput.scrollTop;
    });
    
    // Click outside modals to close
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            Search.close();
            Settings.close();
        }
    });
}

// ============================================
// Initialization
// ============================================
function init() {
    cacheDOM();
    Settings.load();
    Theme.load();
    setupEventListeners();
    KeyboardShortcuts.init();
    JSONEditor.updateLineNumbers();
    History.updateButtons();
    
    // Initialize view
    ViewManager.switchView('tree');
    
    // Load sample data
    setTimeout(() => {
        JSONEditor.loadSample();
    }, 100);
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Handle window resize for visualizations
window.addEventListener('resize', Utils.throttle(() => {
    if (State.currentView === 'visual') {
        if (State.currentVisual === 'network' && Visualizations.network.instance) {
            Visualizations.network.instance.fit();
        }
        if (State.currentVisual === 'topology' && Visualizations.topology.svg) {
            Visualizations.topology.render();
        }
    }
}, 250));
