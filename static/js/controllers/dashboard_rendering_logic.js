/**
 * Dashboard Rendering Logic.
 * v1.1.2 - Fix isForceEdit reference
 * Date: 2026-01-25 15:13
 * View Controller for Sales Dashboard.
 * Handles DOM manipulation, event listeners, and API calls.
 * Delegates business logic to dashboard_calculation_logic.js.
 */
import { state, setState } from '../state.js';
import { fetchDashboard } from '../api.js';
import { formatCurrency, formatPercent, getPercentColorClass, showAlert } from '../utils.js';
import {
    getQuarterConfig,
    processQuarterData,
    FY_MONTHS,
    MONTH_NAMES,
    DB_FIELD_MAP
} from './dashboard_calculation_logic.js';

/**
 * Generates an editable HTML input for a numeric cell.
 */
const mkInput = (repId, field, value, type = 'number') => {
    // Format numbers with currency style for display
    let formattedValue = value;
    if (type === 'number' && !isNaN(value)) {
        formattedValue = formatCurrency(Math.round(value));
    }

    return `
    <input type="text" 
           class="editable-cell w-full bg-transparent border-none text-right focus:ring-0 p-0" 
           data-id="${repId}" 
           data-field="${field}" 
           data-original-type="${type}"
           value="${formattedValue}" 
           onfocus="this.select()">
    `;
};

/**
 * Primary entry point for dashboard data loading.
 */
export async function loadDashboardData() {
    // 1. DOM Check
    const container = document.getElementById('quarterly-breakdowns-container');
    if (!container) return;

    // 2. State Recovery
    if (!state.currentClusterId && localStorage.getItem('currentClusterId')) {
        console.warn('Restoring Cluster ID from storage');
        state.currentClusterId = parseInt(localStorage.getItem('currentClusterId'));
    }

    if (!state.currentClusterId) {
        renderDashboard({ sales_reps: [] });
        return;
    }

    try {
        const dashboardData = await fetchDashboard(state.currentClusterId, state.currentFiscalYearId);

        // Sync cluster-level metadata
        state.partialDataDate = dashboardData.partial_data_date || null;
        // Save reps to global state for local recalculation
        state.salesReps = dashboardData.sales_reps || [];



        renderDashboard(dashboardData);

        // Initialize date picker
        const dateInput = document.getElementById('partial-data-date');
        if (dateInput && typeof flatpickr !== 'undefined') {
            flatpickr(dateInput, {
                dateFormat: "d/m/Y",
                defaultDate: state.partialDataDate || null,
                onChange: (selectedDates, dateStr) => window.updatePartialDate(dateStr)
            });
        }
    } catch (e) {
        console.error("Failed to load dashboard data", e);
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #c23321;">
                <h3>Failed to load data</h3>
                <p>${e.message}</p>
                <button onclick="loadDashboardData()" style="margin-top: 10px; padding: 6px 12px; cursor: pointer;">Retry</button>
            </div>`;
    }
}

/**
 * Main render loop for the dashboard view.
 */
function renderDashboard(data) {
    const reps = data.sales_reps || [];

    // Determine current fiscal quarter for default expansion
    const month = new Date().getMonth() + 1; // 1-12
    let currentQuarter = 'q3';
    if (month >= 6 && month <= 8) currentQuarter = 'q1';
    else if (month >= 9 && month <= 11) currentQuarter = 'q2';
    else if (month === 12 || month <= 2) currentQuarter = 'q3';
    else if (month >= 3 && month <= 5) currentQuarter = 'q4';

    renderQuarterlyBreakdowns(reps, currentQuarter);
}

/**
 * Renders all four quarterly sections with tabbed interface.
 */
function renderQuarterlyBreakdowns(reps, currentQuarter) {
    const container = document.getElementById('quarterly-breakdowns-container');
    if (!container || !reps) return;

    const clusterKey = `dashboard_active_tab_${state.currentClusterId}`;
    const savedTab = state[clusterKey] || currentQuarter;
    state.activeQuarterTab = savedTab;

    const currentMonthIdx = new Date().getMonth();
    const allQuarters = ['q1', 'q2', 'q3', 'q4'];

    // Render all quarters
    const quarterContent = {};
    allQuarters.forEach(q => {
        const isCurrent = (q === currentQuarter);
        // Delegate Configuration to Logic Module
        const config = getQuarterConfig(q, currentMonthIdx, isCurrent);
        quarterContent[q] = renderSection(q, reps, config, currentMonthIdx);
    });

    // Create tabbed interface
    container.innerHTML = `
        <div class="quarter-tabs-container">
            <div class="quarter-tabs">
                ${allQuarters.map(q => `
                    <button class="quarter-tab ${state.activeQuarterTab === q ? 'active' : ''}" onclick="switchQuarterTab('${q}')">${q.toUpperCase()}</button>
                `).join('')}
            </div>
            ${allQuarters.map(q => `
                <div class="quarter-tab-content ${state.activeQuarterTab === q ? 'active' : ''}" id="${q}-tab-content">
                    ${quarterContent[q]}
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Renders a specific quarterly section.
 * Uses `dashboard_calculation_logic.js` for data processing.
 */
function renderSection(q, reps, config, currentMonthIdx) {
    const f = config.fields;
    const cols = config.columns;

    // --- Calculation Delegation ---
    // Process the data (Calculation Engine)
    const { totals, totalPrevDenom } = processQuarterData(q, reps, config, currentMonthIdx, state.partialDataDate);

    // --- HTML Generation ---

    const qLower = q.toLowerCase();
    const isOverride = state.overrides?.[qLower];
    const month = new Date().getMonth() + 1;
    let currQ = 'q3';
    // Re-determine current q for partial input visibility
    if (month >= 6 && month <= 8) currQ = 'q1';
    else if (month >= 9 && month <= 11) currQ = 'q2';
    else if (month === 12 || month <= 2) currQ = 'q3';
    else currQ = 'q4';

    const isCurrentQuarter = (q === currQ);

    const rows = reps.map(rep => {
        const tds = cols.map(c => {
            const fieldName = f[c.key];
            let val = 0;

            if (fieldName === 'current_month_est') {
                val = rep.current_month_est || 0;
            } else {
                val = fieldName ? (rep[fieldName] || 0) : 0;
            }

            // forceEdit unlocks percentage columns if needed (not currently for QoQ)
            const forceEdit = isOverride && fieldName && (c.key === 'prevExit');
            const baseCls = c.customClass || '';

            if (c.type === 'percent' && !forceEdit) {
                return `<td class="${getPercentColorClass(val)} ${baseCls}">${fieldName ? formatPercent(val) : '-'}</td>`;
            }

            if (fieldName && !c.readOnly && !c.type) {
                const ky = c.key;
                const isMonthCol = ky.startsWith('m_');
                const isRateCol = (ky === 'lastWk' || ky === 'currDaily');

                // 1. Standard inputs for current quarter (Rates and Months)
                const isStandard = isCurrentQuarter && (isMonthCol || isRateCol);

                // 2. Override inputs (Unlocks PrevExit and any Month in any quarter)
                const isOverridden = isOverride && (ky === 'prevExit' || isMonthCol);

                if (isStandard || isOverridden) {
                    return `<td class="${baseCls}">${mkInput(rep.id, fieldName, val)}</td>`;
                }
            }

            if (c.key === 'sim') {
                return `<td class="${baseCls}">${mkInput(rep.id, fieldName, val)}</td>`;
            }

            let txt = fieldName ? (c.type === 'date' ? val : formatCurrency(val)) : '-';
            if (c.type === 'percent') {
                txt = formatPercent(val);
                const colorClass = getPercentColorClass(val);
                return `<td class="${baseCls} ${colorClass}"><strong>${txt}</strong></td>`;
            }

            const cls = `${c.subtle ? 'subtle' : ''} ${c.blue ? 'highlight-blue' : ''} ${baseCls}`;
            return `<td class="${cls}">${c.strong ? `<strong>${txt}</strong>` : txt}</td>`;
        }).join('');

        let prevDenom = 0;
        if (f.prevExit && f.prevQoQ) {
            const pe = rep[f.prevExit] || 0, pq = rep[f.prevQoQ] || 0;
            if (pq > -99.9) prevDenom = pe / (1 + (pq / 100));
        }
        return `<tr data-rep-id="${rep.id}" data-prev-denom="${prevDenom}"><td class="fixed-col">${rep.name}</td>${tds}</tr>`;
    }).join('');

    const tCell = (c) => {
        const baseCls = c.customClass || (c.blue ? 'highlight-blue' : '');

        if (c.type === 'percent') {
            const val = totals[c.key] || 0;
            const hasVal = (c.key === 'prevQoQ' && totalPrevDenom > 0) || (c.key === 'qQoQ' && f.qEst) || (c.key === 'qoqPlusFct' && f.totalExit);
            return `<td class="${getPercentColorClass(val)} ${baseCls}"><strong>${hasVal ? formatPercent(val) : '-'}</strong></td>`;
        }
        const val = totals[c.key];
        return `<td class="${baseCls}"><strong>${(f[c.key] || val !== 0) ? formatCurrency(val) : '-'}</strong></td>`;
    };

    const savedDate = state.partialDataDate || '';
    const partialDataInput = (q === currQ) ? `
        <div class="partial-data-row" style="margin-bottom: 12px; display: flex; align-items: center; gap: 10px;">
            <label for="partial-data-date" style="font-weight: 500;">Partial Data Of:</label>
            <div style="position: relative; display: inline-block;">
                <input type="text" id="partial-data-date" value="${savedDate}" placeholder="Select date..." 
                       style="padding: 8px 35px 8px 12px; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; width: 160px;">
                <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none;">📅</span>
            </div>
        </div>` : '';

    const isOverrideActive = state.overrides?.[qLower];

    return `
    <div class="quarter-section-tabbed" id="${q}-section">
        <div class="quarter-header-tabbed">
            <h3>${config.title}</h3>
            <div class="header-info" style="display: flex; gap: 15px; align-items: center;">
                <button class="override-btn" onclick="window.toggleOverride('${qLower}', event)" 
                        style="padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-color); background: ${isOverrideActive ? 'rgba(231, 76, 60, 0.15)' : 'transparent'}; color: ${isOverrideActive ? 'var(--accent-red)' : 'var(--text-muted)'}; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; gap: 5px;">
                    <span>${isOverrideActive ? '🔓' : '🔒'}</span>
                    <span>${isOverrideActive ? 'Override Active' : 'Override'}</span>
                </button>
                <button class="export-btn" onclick="exportQuarterDashboardToExcel('${q.toUpperCase()}', event)">📥 Export</button>
            </div>
        </div>
        ${partialDataInput}
        <div class="table-container">
            <table class="data-table" id="${q}-table">
                <thead><tr><th class="fixed-col">Sales Rep</th>${cols.map(c => `<th class="${c.customClass || ''}">${c.label}</th>`).join('')}</tr></thead>
                <tbody id="${q}-tbody">${rows}<tr class="totals-row"><td class="fixed-col"><strong>TOTAL</strong></td>${cols.map(c => tCell(c)).join('')}</tr></tbody>
            </table>
        </div>
    </div>`;
}

// --- Global Event Handlers ---

window.switchQuarterTab = function (quarter) {
    const allQuarters = ['q1', 'q2', 'q3', 'q4'];
    const target = quarter.toLowerCase();
    allQuarters.forEach(q => {
        const tab = document.querySelector(`.quarter-tab[onclick="switchQuarterTab('${q}')"]`);
        const content = document.getElementById(`${q}-tab-content`);
        if (tab) tab.classList.toggle('active', q === target);
        if (content) content.classList.toggle('active', q === target);
    });
    state.activeQuarterTab = target;
    const clusterKey = `dashboard_active_tab_${state.currentClusterId}`;
    setState(clusterKey, target);
};

window.updatePartialDate = async function (dateValue) {
    if (!state.currentClusterId) return;
    try {
        const promises = [];
        // 1. Update Cluster Metadata
        promises.push(fetch(`/api/clusters/${state.currentClusterId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partial_data_date: dateValue })
        }));

        // 2. Update All Reps in the current view
        if (state.salesReps && state.salesReps.length > 0) {
            state.salesReps.forEach(rep => {
                promises.push(fetch(`/api/sales_reps/${rep.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ partial_data_date: dateValue })
                }));
            });
        }

        await Promise.all(promises);

        state.partialDataDate = dateValue;
        loadDashboardData();
    } catch (e) {
        console.error("Failed to update partial date", e);
        showAlert('Error', 'Failed to update date for all reps');
    }
};

document.addEventListener('change', async (e) => {
    if (e.target.classList.contains('editable-cell')) {
        const input = e.target, repId = input.dataset.id, field = input.dataset.field;
        const originalType = input.dataset.originalType || input.type;
        const rawValue = input.value.replace(/[$,]/g, '');
        let value = originalType === 'number' ? parseFloat(rawValue) || 0 : input.value;

        input.classList.add('saving');
        try {
            const res = await fetch(`/api/sales_reps/${repId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            if (!res.ok) throw new Error();
            input.classList.replace('saving', 'saved');
            setTimeout(() => input.classList.remove('saved'), 1000);

            updateTotalsLocally(input);
        } catch (error) {
            input.classList.replace('saving', 'error');
            setTimeout(() => input.classList.remove('error'), 2000);
        }
    }
});

document.addEventListener('blur', (e) => {
    if (e.target.classList.contains('editable-cell')) {
        const input = e.target;
        const originalType = input.dataset.originalType;
        if (originalType === 'number') {
            const rawValue = input.value.replace(/[$,]/g, '');
            const numValue = parseFloat(rawValue);
            if (!isNaN(numValue)) {
                input.value = formatCurrency(Math.round(numValue));
            }
        }
    }
}, true);

/**
 * Performs local, real-time recalculations using the SHARED calculation logic.
 * This ensures consistency with the initial load logic.
 */
function updateTotalsLocally(changedInput) {
    // 1. Update State with new value
    const repId = parseInt(changedInput.dataset.id);
    const field = changedInput.dataset.field;
    let newValue = parseFloat(changedInput.value.replace(/[$,]/g, ''));
    if (isNaN(newValue)) newValue = 0;

    const repInState = state.salesReps.find(r => r.id === repId);
    if (!repInState) return;
    repInState[field] = newValue;

    // 2. Run Global Refresh (silent) for all visible tables
    const currentMonthIdx = new Date().getMonth();
    const month = currentMonthIdx + 1;
    let currQ = 'q3';
    if (month >= 6 && month <= 8) currQ = 'q1';
    else if (month >= 9 && month <= 11) currQ = 'q2';
    else if (month === 12 || month <= 2) currQ = 'q3';
    else currQ = 'q4';

    ['q1', 'q2', 'q3', 'q4'].forEach(qKey => {
        const table = document.getElementById(`${qKey}-table`);
        if (!table) return;

        const isCurrentQuarter = (qKey === currQ);
        const config = getQuarterConfig(qKey, currentMonthIdx, isCurrentQuarter);
        const f = config.fields;

        // Recalculate this specific quarter based on updated state
        const { totals } = processQuarterData(qKey, state.salesReps, config, currentMonthIdx, state.partialDataDate);

        // Update Rows
        const tbody = table.querySelector('tbody');
        const rows = tbody.querySelectorAll('tr:not(.totals-row)');

        rows.forEach(row => {
            const rId = parseInt(row.dataset.repId);
            const rData = state.salesReps.find(r => r.id === rId);
            if (!rData) return;

            const updateCell = (targetKey, val, isPct = false) => {
                const colIdx = config.columns.findIndex(c => c.key === targetKey);
                if (colIdx === -1) return;
                const cell = row.cells[colIdx + 1]; // +1 for fixed Name col
                if (!cell || cell.querySelector('input')) return;

                const target = cell.querySelector('strong') || cell;
                target.textContent = isPct ? formatPercent(val) : formatCurrency(val);

                if (isPct) {
                    cell.className = `${getPercentColorClass(val)} ${config.columns[colIdx].customClass || ''}`;
                }
            };

            // Update all calculated and projected columns
            config.columns.forEach(col => {
                const fieldKey = f[col.key] || col.key;
                let val = (fieldKey === 'current_month_est') ? (rData.current_month_est || 0) : (rData[fieldKey] || 0);

                updateCell(col.key, val, col.type === 'percent');
            });
        });

        // Update Footer Totals
        const totalsRow = table.querySelector('.totals-row');
        if (totalsRow) {
            config.columns.forEach((col, idx) => {
                const cell = totalsRow.cells[idx + 1];
                if (!cell) return;
                const target = cell.querySelector('strong') || cell;

                if (col.type === 'percent') {
                    let val = totals[col.key] || 0;
                    target.textContent = formatPercent(val);
                    cell.className = `${getPercentColorClass(val)} ${col.customClass || ''}`;
                } else {
                    target.textContent = formatCurrency(totals[col.key] || 0);
                }
            });
        }
    });
}

/** Toggles override */
window.toggleOverride = (q, e) => {
    e.stopPropagation();
    const currentOverrides = state.overrides || {};
    const newOverrides = { ...currentOverrides };
    newOverrides[q] = !currentOverrides[q];
    state.overrides = newOverrides;
    setTimeout(() => refreshQuarterData(), 0);
};

async function refreshQuarterData() {
    if (!state.currentClusterId) return;
    const scroll = window.scrollY;
    await loadDashboardData();
    window.scrollTo(0, scroll);
}

window.exportQuarterDashboardToExcel = function (quarter, event) {
    if (event) event.stopPropagation();
    const qLower = quarter.toLowerCase();
    const table = document.getElementById(`${qLower}-table`);
    if (!table) return;

    const clusterSelect = document.getElementById('cluster-select');
    const clusterName = clusterSelect?.options[clusterSelect.selectedIndex]?.text || 'Cluster';
    const now = new Date();
    const shortDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const filename = `${clusterName}_${quarter}_Breakdown_${shortDate}.xlsx`;

    // Use SheetJS (XLSX) which is loaded in index.html
    if (typeof XLSX !== 'undefined') {
        try {
            // Clone the table so we can modify it for export without affecting the UI
            const clone = table.cloneNode(true);

            // Replace all inputs with their current values
            const originalInputs = table.querySelectorAll('input');
            const cloneInputs = clone.querySelectorAll('input');

            originalInputs.forEach((input, idx) => {
                const parent = cloneInputs[idx].parentElement;
                parent.textContent = input.value;
            });

            const wb = XLSX.utils.table_to_book(clone, { sheet: "Sheet 1" });
            XLSX.writeFile(wb, filename);
        } catch (err) {
            console.error("Export failed:", err);
            alert("Export failed. Check console for details.");
        }
    } else {
        alert("XLSX library not loaded");
    }
};
