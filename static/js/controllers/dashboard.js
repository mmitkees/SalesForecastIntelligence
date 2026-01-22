/**
 * Dashboard Controller.
 * Core financial engine of the frontend. Handles complex quarterly projections, 
 * real-time local recalculations, and server-side data synchronization.
 */
import { state, setState } from '../state.js';
import { fetchDashboard } from '../api.js';
import { formatCurrency, formatPercent, getPercentColorClass } from '../utils.js';

// --- Constants for Fiscal Month Logic ---
/** @type {number[]} FY starts in June (index 5) */
const FY_MONTHS = [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];



/** 
 * Maps frontend abstraction IDs to database field names.
 */
const DB_FIELD_MAP = {
    'm_0': 'jan', 'm_1': 'feb', 'm_2': 'mar', 'm_3': 'apr', 'm_4': 'may', 'm_5': 'jun',
    'm_6': 'jul', 'm_7': 'aug', 'm_8': 'sep', 'm_9': 'oct', 'm_10': 'nov', 'm_11': 'dec',
    'current_month_est': 'current_month_est',
    'lastWk': 'last_week_daily_rate',
    'currDaily': 'current_daily_rate',
    'sim': 'simulation'
};

/**
 * Generates an editable HTML input for a numeric cell.
 */
const mkInput = (repId, field, value, type = 'number') => `
    <input type="${type}" ${type === 'number' ? 'step="1"' : ''} 
           class="editable-cell w-full bg-transparent border-none text-right focus:ring-0 p-0" 
           data-id="${repId}" 
           data-field="${field}" 
           value="${type === 'number' && !isNaN(value) ? Math.round(value) : value}" 
           onfocus="this.select()">
`;

/**
 * Primary entry point for dashboard data loading.
 */
export async function loadDashboardData() {
    if (!document.getElementById('quarterly-breakdowns-container')) return;

    // Handle No Cluster State
    if (!state.currentClusterId) {
        renderDashboard({ sales_reps: [] });
        return;
    }

    try {
        const dashboardData = await fetchDashboard(state.currentClusterId, state.currentFiscalYearId);

        // Sync cluster-level metadata
        state.partialDataDate = dashboardData.partial_data_date || null;

        renderDashboard(dashboardData);

        // Initialize date picker for partial data calculations
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
    }
}

/**
 * Main render loop for the dashboard view.
 */
function renderDashboard(data) {
    const reps = data.sales_reps || [];

    // Determine current fiscal quarter for default expansion
    // Determine current fiscal quarter for default expansion
    const month = new Date().getMonth() + 1; // 1-12
    let currentQuarter = 'q3';
    if (month >= 6 && month <= 8) currentQuarter = 'q1';
    else if (month >= 9 && month <= 11) currentQuarter = 'q2';
    else if (month === 12 || month <= 2) currentQuarter = 'q3';
    else if (month >= 3 && month <= 5) currentQuarter = 'q4';

    // Use saved quarter or default to current quarter
    const quarterToExpand = state.dashboardExpandedQuarter || currentQuarter;

    renderQuarterlyBreakdowns(reps, currentQuarter);

    // Initial Accordion State - expand saved or current quarter
    const targetContent = document.getElementById(`${quarterToExpand}-content`);
    if (targetContent && targetContent.style.display === 'none') {
        window.toggleQuarter(quarterToExpand);
    }
}

/**
 * Renders all four quarterly sections in rolling priority order.
 */
function renderQuarterlyBreakdowns(reps, currentQuarter) {
    const container = document.getElementById('quarterly-breakdowns-container');
    if (!container || !reps) return;

    const currentMonthIdx = new Date().getMonth();
    const allQuarters = ['q1', 'q2', 'q3', 'q4'];
    const idx = allQuarters.indexOf(currentQuarter);
    const displayOrder = [...allQuarters.slice(idx), ...allQuarters.slice(0, idx)];

    container.innerHTML = displayOrder.map(q => {
        const isCurrent = (q === currentQuarter);
        const config = getQuarterConfig(q, currentMonthIdx, isCurrent);
        return renderSection(q, reps, config);
    }).join('');
}

/**
 * Configures the column schema and DB mapping for a specific quarter.
 * Dynamic month columns are generated based on the current date.
 */
function getQuarterConfig(q, currentMonthIdx, isCurrentQuarter) {
    let qMonths = [];
    if (q === 'q1') qMonths = [5, 6, 7];
    if (q === 'q2') qMonths = [8, 9, 10];
    if (q === 'q3') qMonths = [11, 0, 1];
    if (q === 'q4') qMonths = [2, 3, 4];

    const curFyIdx = FY_MONTHS.indexOf(currentMonthIdx);

    // 1. Column Definition
    const columns = [
        { key: 'prevExit', label: 'Prev Q Exit' },
        { key: 'prevQoQ', label: 'Prev QoQ', type: 'percent', color: true }
    ];

    if (isCurrentQuarter) {
        columns.push({ key: 'lastWk', label: 'Last Wk' }, { key: 'currDaily', label: 'Curr Daily' });
    }

    qMonths.forEach(m => {
        const mFyIdx = FY_MONTHS.indexOf(m);
        const mName = MONTH_NAMES[m];
        const monthField = `m_${m}`;

        if (mFyIdx < curFyIdx) {
            columns.push({ key: monthField, label: `${mName} Act` });
        } else if (mFyIdx === curFyIdx) {
            columns.push({ key: monthField, label: `${mName} Act` }, { key: 'current_month_est', label: `${mName} Est`, readOnly: true });
        } else {
            columns.push({ key: monthField, label: `${mName} Est`, readOnly: true });
        }
    });

    columns.push(
        { key: 'sim', label: 'Sim', subtle: true },
        { key: 'qEst', label: `${q.toUpperCase()} Est`, blue: true, customClass: 'highlight-blue' },
        { key: 'qQoQ', label: 'QoQ', type: 'percent', color: true, customClass: 'col-qoq' },
        { key: 'addFct', label: 'Add FCT', readOnly: true, customClass: 'col-fct' },
        { key: 'totalExit', label: 'Total Exit', strong: true, customClass: 'col-total' },
        { key: 'qoqPlusFct', label: 'QoQ+', type: 'percent', color: true, customClass: 'col-qoq-plus' },
        { key: 'upside', label: 'Upside', readOnly: true, customClass: 'col-upside' }
    );

    // 2. Field Mapping logic
    const fields = {};
    if (q === 'q1') {
        fields.prevExit = 'last_year_exit'; fields.qEst = 'q1_exit'; fields.qQoQ = 'q1_qoq_pct';
        fields.addFct = 'q1_add_fct'; fields.totalExit = 'q1_total_exit_with_fc'; fields.qoqPlusFct = 'q1_qoq_plus_fct_pct'; fields.upside = 'q1_add_upside';
    } else if (q === 'q2') {
        fields.prevExit = 'q1_exit'; fields.prevQoQ = 'q1_qoq_pct'; fields.qEst = 'q2_exit';
        fields.qQoQ = 'q2_qoq_pct'; fields.addFct = 'q2_add_fct'; fields.totalExit = 'q2_total_exit_with_fc'; fields.qoqPlusFct = 'q2_qoq_plus_fct_pct'; fields.upside = 'q2_add_upside';
    } else if (q === 'q3') {
        fields.prevExit = 'q2_exit'; fields.prevQoQ = 'q2_qoq_pct'; fields.qEst = 'q3_exit';
        fields.qQoQ = 'q3_qoq_pct'; fields.addFct = 'q3_add_fct'; fields.totalExit = 'q3_total_exit_with_fc'; fields.qoqPlusFct = 'qoq_plus_fct_pct'; fields.upside = 'q3_add_upside';
    } else if (q === 'q4') {
        fields.prevExit = 'q3_total_exit_with_fc'; fields.prevQoQ = 'qoq_plus_fct_pct'; fields.qEst = 'q4_exit';
        fields.qQoQ = 'q4_qoq_pct'; // Added missing field
        fields.addFct = 'q4_add_fct'; fields.totalExit = 'q4_total_exit_with_fc'; fields.qoqPlusFct = 'q4_qoq_plus_fct_pct'; fields.upside = 'q4_add_upside';
    }

    columns.forEach(col => {
        if (!fields[col.key] && DB_FIELD_MAP[col.key]) fields[col.key] = DB_FIELD_MAP[col.key];
    });

    return { title: `${q.toUpperCase()} Monthly Breakdown`, columns, fields };
}

/**
 * Renders a specific quarterly section.
 * Includes complex frontend-only calculations for Current Month and Future projections.
 */
function renderSection(q, reps, config) {
    const f = config.fields;
    const cols = config.columns;

    // --- Calculation Engine ---

    const currM = new Date().getMonth();
    const monthField = f[`m_${currM}`];
    const partialDateStr = state.partialDataDate || '';
    let partialDay = 0, daysInMonth = 0;

    if (partialDateStr) {
        const parts = partialDateStr.split('-');
        // Handle YYYY-MM-DD format (typical from backend API)
        const pd = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(partialDateStr);

        if (!isNaN(pd.getTime())) {
            // Only use partial day if it's in the current month/year
            const now = new Date();
            if (pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear()) {
                partialDay = pd.getDate();
            } else {
                partialDay = now.getDate(); // Fallback to today
            }
            daysInMonth = new Date(new Date().getFullYear(), currM + 1, 0).getDate();
        }
    } else {
        // Fallback to today if no date provided
        partialDay = new Date().getDate();
        daysInMonth = new Date(new Date().getFullYear(), currM + 1, 0).getDate();
    }

    // 1. Recalculate Current Month Estimate
    if (monthField && partialDay > 0) {
        const daysLeft = Math.max(0, daysInMonth - partialDay);
        reps.forEach(r => {
            const daily = r.current_daily_rate || 0;
            const actual = r[monthField] || 0;
            // FORMULA: Current Est = (Daily Rate * (Days Remaining + 0.5 buffer)) + Actual To Date
            r.current_month_est = (daily * (daysLeft + 0.5)) + actual;
        });
    }

    // 2. Project Future Months
    const currentYear = new Date().getFullYear();
    const curFyIdxLocal = FY_MONTHS.indexOf(currM);
    const qMonthsMap = { q1: [5, 6, 7], q2: [8, 9, 10], q3: [11, 0, 1], q4: [2, 3, 4] };
    const qMonths = qMonthsMap[q] || [];

    qMonths.forEach(m => {
        const mFyIdx = FY_MONTHS.indexOf(m);
        if (mFyIdx > curFyIdxLocal) {
            const monthFieldKey = DB_FIELD_MAP[`m_${m}`];
            if (monthFieldKey) {
                const futureYear = m < 6 ? currentYear + 1 : currentYear;
                const daysInFutureMonth = new Date(futureYear, m + 1, 0).getDate();
                reps.forEach(r => {
                    const daily = r.current_daily_rate || 0;
                    // FORMULA: Future Est = Daily Rate * Days In Month
                    r[monthFieldKey] = daily * daysInFutureMonth;
                });
            }
        }
    });

    // 3. Roll up Subtotals to Quarter Estimate
    reps.forEach(r => {
        let monthSum = 0;
        qMonths.forEach(m => {
            const mKey = DB_FIELD_MAP[`m_${m}`];
            if (mKey) monthSum += (r[mKey] || 0);
        });

        if (f.qEst) {
            r[f.qEst] = monthSum + (r.simulation || 0);
        }

        if (f.totalExit && f.addFct) {
            const calcTotal = r[f.qEst] + (r[f.addFct] || 0);
            if (Math.abs((r[f.totalExit] || 0) - calcTotal) > 1) r[f.totalExit] = calcTotal;
        }
    });

    // --- Totals Row Logic ---

    const totals = {};
    let totalPrevDenom = 0;
    cols.forEach(c => totals[c.key] = 0);

    reps.forEach(r => {
        cols.forEach(c => {
            const field = f[c.key];
            if (field && c.type !== 'percent') totals[c.key] += (r[field] || 0);
        });

        // PrevQoQ Denominator Reconstruction
        if (f.prevExit && f.prevQoQ) {
            const exit = r[f.prevExit] || 0, pct = r[f.prevQoQ] || 0;
            if (pct > -99.9) totalPrevDenom += (exit / (1 + (pct / 100)));
        }
    });

    if (totalPrevDenom > 0 && totals.prevExit) totals.prevQoQ = ((totals.prevExit / totalPrevDenom) - 1) * 100;
    if (f.qEst && f.prevExit && totals.prevExit > 0) totals.qQoQ = ((totals.qEst / totals.prevExit) - 1) * 100;
    if (f.totalExit && f.prevExit && totals.prevExit > 0) totals.qoqPlusFct = ((totals.totalExit / totals.prevExit) - 1) * 100;

    // --- HTML Generation ---

    const qLower = q.toLowerCase();
    const isOverride = state.overrides?.[qLower];

    const rows = reps.map(rep => {
        const tds = cols.map(c => {
            const fieldName = f[c.key], val = fieldName ? (rep[fieldName] || 0) : 0;
            const forceEdit = isOverride && fieldName && (c.key === 'prevExit' || c.key === 'prevQoQ');

            const baseCls = c.customClass || '';

            if (c.type === 'percent' && !forceEdit) {
                return `<td class="${getPercentColorClass(val)} ${baseCls}">${fieldName ? formatPercent(val) : '-'}</td>`;
            }

            const isStandardInput = fieldName && !c.readOnly && !c.blue && !c.strong && !c.label.includes('Exit');
            if (forceEdit || isStandardInput) {
                return `<td class="${baseCls}">${mkInput(rep.id, fieldName, val, c.type === 'date' ? 'date' : 'number')}</td>`;
            } else {
                let txt = fieldName ? (c.type === 'date' ? val : formatCurrency(val)) : '-';
                const cls = `${c.subtle ? 'subtle' : ''} ${c.blue ? 'highlight-blue' : ''} ${baseCls}`;
                return `<td class="${cls}">${c.strong ? `<strong>${txt}</strong>` : txt}</td>`;
            }
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
        // Blue is handled by baseCls now, but we keep existing logic check
        return `<td class="${baseCls}"><strong>${(f[c.key] || val !== 0) ? formatCurrency(val) : '-'}</strong></td>`;
    };

    const month = new Date().getMonth() + 1;
    let currQ = 'q3';
    if (month >= 6 && month <= 8) currQ = 'q1';
    else if (month >= 9 && month <= 11) currQ = 'q2';
    else if (month === 12 || month <= 2) currQ = 'q3';
    else currQ = 'q4';

    const savedDate = state.partialDataDate || '';
    const partialDataInput = (q === currQ) ? `
        <div class="partial-data-row" style="margin-bottom: 12px; display: flex; align-items: center; gap: 10px;">
            <label for="partial-data-date" style="font-weight: 500;">📅 Partial Data Of:</label>
            <input type="text" id="partial-data-date" value="${savedDate}" placeholder="Select date..." style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; width: 150px;">
        </div>` : '';

    const isOverrideActive = state.overrides?.[qLower];

    return `
    <div class="quarter-section collapsible" id="${q}-section">
        <div class="quarter-header" onclick="toggleQuarter('${q}')">
            <h3>
                <span class="collapse-icon" id="${q}-icon">▼</span>
                ${config.title}
            </h3>
            <div class="header-info" style="display: flex; gap: 15px; align-items: center;">
                <button class="override-btn" onclick="window.toggleOverride('${qLower}', event)" 
                        style="padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-color); background: ${isOverrideActive ? 'rgba(231, 76, 60, 0.15)' : 'transparent'}; color: ${isOverrideActive ? 'var(--accent-red)' : 'var(--text-muted)'}; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; gap: 5px;">
                    <span>${isOverrideActive ? '🔓' : '🔒'}</span>
                    <span>${isOverrideActive ? 'Override Active' : 'Override'}</span>
                </button>
                <button class="export-btn" onclick="exportQuarterDashboardToExcel('${q.toUpperCase()}', event)">📥 Export</button>
            </div>
        </div>
        <div class="quarter-content" id="${q}-content" style="display: none;">
            ${partialDataInput}
            <div class="table-container">
                <table class="data-table" id="${q}-table">
                    <thead><tr><th class="fixed-col">Sales Rep</th>${cols.map(c => `<th class="${c.customClass || ''}">${c.label}</th>`).join('')}</tr></thead>
                    <tbody id="${q}-tbody">${rows}<tr class="totals-row"><td class="fixed-col"><strong>TOTAL</strong></td>${cols.map(c => tCell(c)).join('')}</tr></tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// --- Global Event Handlers ---

/**
 * Toggles the expansion of a quarterly section (Accordion behavior).
 */
window.toggleQuarter = function (quarter) {
    const allQuarters = ['q1', 'q2', 'q3', 'q4'], target = quarter.toLowerCase();
    const content = document.getElementById(`${target}-content`), isOpen = content?.style.display === 'block';

    allQuarters.forEach(q => {
        const c = document.getElementById(`${q}-content`);
        const i = document.getElementById(`${q}-icon`);
        const section = document.getElementById(`${q}-section`);
        if (c) c.style.display = 'none';
        if (i) i.textContent = '▶';
        if (section) section.classList.add('collapsed');
    });

    if (!isOpen && content) {
        content.style.display = 'block';
        const icon = document.getElementById(`${target}-icon`);
        const section = document.getElementById(`${target}-section`);
        if (icon) icon.textContent = '▼';
        if (section) section.classList.remove('collapsed');
        // Save expanded quarter to state for persistence
        setState('dashboardExpandedQuarter', target);
    } else {
        // All collapsed - clear saved state
        setState('dashboardExpandedQuarter', null);
    }
};

/**
 * Updates the partial data date for the cluster.
 */
window.updatePartialDate = async function (dateValue) {
    if (!state.currentClusterId) return;
    try {
        await fetch(`/api/clusters/${state.currentClusterId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partial_data_date: dateValue })
        });
        state.partialDataDate = dateValue;
        loadDashboardData();
    } catch (e) {
        console.error(e);
    }
};

/**
 * Syncs cell modifications to the server.
 */
document.addEventListener('change', async (e) => {
    if (e.target.classList.contains('editable-cell')) {
        const input = e.target, repId = input.dataset.id, field = input.dataset.field;
        let value = input.type === 'number' ? parseFloat(input.value) || 0 : input.value;

        input.classList.add('saving');
        try {
            const res = await fetch(`/api/sales_reps/${repId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            if (!res.ok) throw new Error();
            input.classList.replace('saving', 'saved');
            setTimeout(() => input.classList.remove('saved'), 1000);

            // If daily rate changed, reload full dashboard to refresh all quarters
            if (field === 'current_daily_rate') {
                await loadDashboardData();
            } else {
                updateTotalsLocally(input);
            }
        } catch (error) {
            input.classList.replace('saving', 'error');
            setTimeout(() => input.classList.remove('error'), 2000);
        }
    }
});

/**
 * Performs local, real-time recalculations for UI responsiveness.
 */
function updateTotalsLocally(changedInput) {
    const table = changedInput.closest('table'), tbody = table?.querySelector('tbody'), rows = tbody?.querySelectorAll('tr:not(.totals-row)');
    if (!rows) return;

    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    const colIndex = {}; headers.forEach((h, i) => colIndex[h] = i);

    const getVal = (row, idx) => {
        const cell = row.cells[idx]; if (!cell) return 0;
        const input = cell.querySelector('input');
        return Math.round(parseFloat(input ? input.value : cell.textContent.replace(/[$,%]/g, '').replace(/,/g, '')) || 0);
    };

    const setVal = (row, idx, val, isPct = false) => {
        const cell = row.cells[idx]; if (!cell || cell.querySelector('input')) return;
        const formatted = isPct ? val.toFixed(1) + '%' : '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
        const target = cell.querySelector('strong') || cell;
        target.textContent = formatted;
        if (isPct) {
            cell.classList.remove('text-green', 'text-red', 'text-gray');
            cell.classList.add(val > 0 ? 'text-green' : (val < 0 ? 'text-red' : 'text-gray'));
        }
    };

    const currM = new Date().getMonth(), currMName = MONTH_NAMES[currM];
    const qEstIdx = colIndex[Object.keys(colIndex).find(k => k.match(/Q[1-4] Est/))];
    const daysLeft = (() => {
        if (!state.partialDataDate) return 0;
        const p = state.partialDataDate.split('/');
        return p.length === 3 ? Math.max(0, new Date(new Date().getFullYear(), currM + 1, 0).getDate() - parseInt(p[0])) : 0;
    })();

    const monthCols = headers.filter(h => h.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (Act|Est)/));

    rows.forEach(row => {
        const daily = colIndex['Curr Daily'] !== undefined ? getVal(row, colIndex['Curr Daily']) : 0;

        if (colIndex[`${currMName} Est`] !== undefined && colIndex[`${currMName} Act`] !== undefined) {
            setVal(row, colIndex[`${currMName} Est`], (daily * (daysLeft + 0.5)) + getVal(row, colIndex[`${currMName} Act`]));
        }

        headers.forEach((h, i) => {
            const m = h.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) Est$/);
            if (m && h !== `${currMName} Est`) {
                const mIdx = MONTH_NAMES.indexOf(m[1]);
                if (FY_MONTHS.indexOf(mIdx) > FY_MONTHS.indexOf(currM)) {
                    setVal(row, i, daily * new Date(mIdx < 6 ? new Date().getFullYear() + 1 : new Date().getFullYear(), mIdx + 1, 0).getDate());
                }
            }
        });

        let qSum = 0; monthCols.forEach(mc => qSum += getVal(row, colIndex[mc]));
        if (colIndex[`${currMName} Act`] !== undefined) qSum -= getVal(row, colIndex[`${currMName} Act`]);
        const sim = colIndex['Sim'] !== undefined ? getVal(row, colIndex['Sim']) : 0;
        qSum += sim;
        if (qEstIdx !== undefined) setVal(row, qEstIdx, qSum);

        const pe = colIndex['Prev Q Exit'] !== undefined ? getVal(row, colIndex['Prev Q Exit']) : 0;
        const af = colIndex['Add FCT'] !== undefined ? getVal(row, colIndex['Add FCT']) : 0;
        const te = qSum + af;
        if (colIndex['Total Exit'] !== undefined) setVal(row, colIndex['Total Exit'], te);

        if (colIndex['QoQ'] !== undefined && pe > 0) setVal(row, colIndex['QoQ'], ((qSum / pe) - 1) * 100, true);
        if (colIndex['QoQ+'] !== undefined && pe > 0) setVal(row, colIndex['QoQ+'], ((te / pe) - 1) * 100, true);
    });

    // Update Totals row (Aggregate each column)
    const totalsRow = table.querySelector('.totals-row');
    headers.forEach((h, i) => {
        if (i === 0 || h.includes('%')) return;
        let sum = 0; rows.forEach(r => sum += getVal(r, i));
        setVal(totalsRow, i, sum);
    });
}

/**
 * Toggles the override lock for a quarter.
 */
window.toggleOverride = (q, e) => {
    e.stopPropagation(); state.overrides = state.overrides || {};
    state.overrides[q] = !state.overrides[q];
    refreshQuarterData();
};

async function refreshQuarterData() {
    if (!state.currentClusterId) return;
    const openQ = ['q1', 'q2', 'q3', 'q4'].find(q => document.getElementById(`${q}-content`)?.style.display === 'block');
    const scroll = window.scrollY;
    await loadDashboardData();
    if (openQ) window.toggleQuarter(openQ);
    window.scrollTo(0, scroll);
}

/**
 * Exports the visible data for a specific quarter from the dashboard to Excel.
 */
window.exportQuarterDashboardToExcel = function (quarter, event) {
    if (event) event.stopPropagation();

    const qLower = quarter.toLowerCase();
    const table = document.getElementById(`${qLower}-table`);
    if (!table) {
        console.error('Table not found for quarter:', quarter);
        return;
    }

    // Get cluster name from dropdown
    const clusterSelect = document.getElementById('cluster-select');
    const clusterName = clusterSelect?.options[clusterSelect.selectedIndex]?.text || 'Cluster';

    // Format short date as YYYYMMDD
    const now = new Date();
    const shortDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    // Extract data from table
    const headers = [];
    const headerRow = table.querySelector('thead tr');
    headerRow.querySelectorAll('th').forEach(th => headers.push(th.textContent.trim()));

    const data = [];
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const rowData = {};
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, idx) => {
            const input = cell.querySelector('input');
            const value = input ? input.value : cell.textContent.trim();
            rowData[headers[idx]] = value;
        });
        data.push(rowData);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, `${quarter} Dashboard`);
    XLSX.writeFile(wb, `${clusterName}-${quarter}-Dashboard-${shortDate}.xlsx`);
};
