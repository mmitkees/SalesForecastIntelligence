/**
 * Dashboard Controller.
 * Consolidated financial engine of the frontend.
 * v1.2.0 - Merged from beta branch fixes.
 * Core Logic: Handles projections, real-time recalculations, and sync.
 */
import { state, setState } from '../state.js';
import { fetchDashboard } from '../api.js';
import { formatCurrency, formatPercent, getPercentColorClass, showAlert } from '../utils.js';

// --- Constants ---

/** @type {number[]} FY starts in June (index 5) */
const FY_MONTHS = [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** maps frontend column IDs to API field names */
const DB_FIELD_MAP = {
    'm_0': 'jan', 'm_1': 'feb', 'm_2': 'mar', 'm_3': 'apr', 'm_4': 'may', 'm_5': 'jun',
    'm_6': 'jul', 'm_7': 'aug', 'm_8': 'sep', 'm_9': 'oct', 'm_10': 'nov', 'm_11': 'dec',
    'current_month_est': 'current_month_est',
    'lastWk': 'last_week_daily_rate',
    'currDaily': 'current_daily_rate',
    'sim': 'simulation'
};

const Q_MONTHS_MAP = {
    q1: [5, 6, 7],
    q2: [8, 9, 10],
    q3: [11, 0, 1],
    q4: [2, 3, 4]
};

// --- View Helpers ---

/**
 * Generates an editable HTML input for a numeric cell.
 */
const mkInput = (repId, field, value, type = 'number') => {
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

// --- Calculation Helpers ---

function calculatePartialDayParams(partialDateStr, currM) {
    let partialDay = 0;
    let daysInMonth = new Date(new Date().getFullYear(), currM + 1, 0).getDate();

    if (partialDateStr) {
        const parts = partialDateStr.split('-');
        const pd = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(partialDateStr);

        if (!isNaN(pd.getTime())) {
            const now = new Date();
            if (pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear()) {
                partialDay = pd.getDate();
                daysInMonth = new Date(pd.getFullYear(), pd.getMonth() + 1, 0).getDate();
            } else {
                partialDay = now.getDate();
            }
        }
    } else {
        partialDay = new Date().getDate();
    }
    return { partialDay, daysInMonth };
}

/**
 * Processes raw rep data for a quarter:
 * Logic preserved from beta (dashboard_calculation_logic.js)
 */
function processQuarterData(q, reps, config, currentMonthIdx, partialDateStr) {
    const f = config.fields;
    const cols = config.columns;
    const qMonths = Q_MONTHS_MAP[q] || [];
    const curFyIdxLocal = FY_MONTHS.indexOf(currentMonthIdx);
    const currentYear = new Date().getFullYear();

    const { partialDay, daysInMonth } = calculatePartialDayParams(partialDateStr, currentMonthIdx);
    const monthFieldInfo = f[`m_${currentMonthIdx}`];

    reps.forEach(r => {
        // 1. Current Month Est
        if (monthFieldInfo && partialDay > 0) {
            const daysLeft = Math.max(0, daysInMonth - partialDay);
            const daily = r.current_daily_rate || 0;
            const actual = r[monthFieldInfo] || 0;
            r.current_month_est = (daily * (daysLeft + 0.5)) + actual;
        }

        // 2. Project Future Months
        qMonths.forEach(m => {
            const mFyIdx = FY_MONTHS.indexOf(m);
            if (mFyIdx > curFyIdxLocal) {
                const monthFieldKey = DB_FIELD_MAP[`m_${m}`];
                if (monthFieldKey) {
                    const futureYear = m < 6 ? currentYear + 1 : currentYear;
                    const daysInFutureMonth = new Date(futureYear, m + 1, 0).getDate();
                    const daily = r.current_daily_rate || 0;
                    r[monthFieldKey] = daily * daysInFutureMonth;
                }
            }
        });

        // 3. Roll up to Quarter Exit
        let monthSum = 0;
        qMonths.forEach(m => {
            const mKey = DB_FIELD_MAP[`m_${m}`];
            let val = (m === currentMonthIdx) ? (r.current_month_est || 0) : (r[mKey] || 0);
            monthSum += val;
        });

        if (f.qEst) {
            const simField = f.sim || 'simulation';
            const simulationVal = r[simField] || 0;
            const calculatedExit = monthSum + simulationVal;
            const existingExit = r[f.qEst] || 0;

            if (calculatedExit !== 0) r[f.qEst] = calculatedExit;
            else if (existingExit !== 0) r[f.qEst] = existingExit;
        }

        if (f.totalExit && f.addFct) {
            const calcTotal = r[f.qEst] + (r[f.addFct] || 0);
            const existingTotal = r[f.totalExit] || 0;
            if (calcTotal !== 0) {
                if (Math.abs(existingTotal - calcTotal) > 1) r[f.totalExit] = calcTotal;
            } else if (existingTotal !== 0) {
                r[f.totalExit] = existingTotal;
            }
        }

        // 4. Row Level Percentages
        if (f.prevExit) {
            const prev = r[f.prevExit] || 0;
            if (prev > 0) {
                if (f.qQoQ) r[f.qQoQ] = (((r[f.qEst] || 0) / prev) - 1) * 100;
                if (f.qoqPlusFct) r[f.qoqPlusFct] = (((r[f.totalExit] || 0) / prev) - 1) * 100;
            } else {
                if (f.qQoQ) r[f.qQoQ] = 0;
                if (f.qoqPlusFct) r[f.qoqPlusFct] = 0;
            }
        }
    });

    // Aggregate Footer Totals
    const totals = {};
    let totalPrevDenom = 0;
    cols.forEach(c => totals[c.key] = 0);

    reps.forEach(r => {
        cols.forEach(c => {
            const field = f[c.key];
            if (field && c.type !== 'percent') totals[c.key] += (r[field] || 0);
        });
        if (f.prevExit && f.prevQoQ) {
            const exit = r[f.prevExit] || 0, pct = r[f.prevQoQ] || 0;
            if (pct > -99.9) totalPrevDenom += (exit / (1 + (pct / 100)));
        }
    });

    if (totalPrevDenom > 0 && totals.prevExit) totals.prevQoQ = ((totals.prevExit / totalPrevDenom) - 1) * 100;
    if (f.qEst && f.prevExit && totals.prevExit > 0) totals.qQoQ = ((totals.qEst / totals.prevExit) - 1) * 100;
    if (f.totalExit && f.prevExit && totals.prevExit > 0) totals.qoqPlusFct = ((totals.totalExit / totals.prevExit) - 1) * 100;

    return { totals, totalPrevDenom };
}

/**
 * Returns column schema and field mapping for a quarter.
 */
function getQuarterConfig(q, currentMonthIdx, isCurrentQuarter) {
    const qMonths = Q_MONTHS_MAP[q] || [];
    const curFyIdx = FY_MONTHS.indexOf(currentMonthIdx);

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

        if (mFyIdx < curFyIdx) columns.push({ key: monthField, label: `${mName} Act` });
        else if (mFyIdx === curFyIdx) columns.push({ key: monthField, label: `${mName} Act` }, { key: 'current_month_est', label: `${mName} Est`, readOnly: true });
        else columns.push({ key: monthField, label: `${mName} Est`, readOnly: true });
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
        fields.qQoQ = 'q4_qoq_pct'; fields.addFct = 'q4_add_fct'; fields.totalExit = 'q4_total_exit_with_fc'; fields.qoqPlusFct = 'q4_qoq_plus_fct_pct'; fields.upside = 'q4_add_upside';
    }

    columns.forEach(col => {
        if (col.key === 'sim') fields[col.key] = `${q}_simulation`;
        else if (!fields[col.key] && DB_FIELD_MAP[col.key]) fields[col.key] = DB_FIELD_MAP[col.key];
    });

    return { title: `${q.toUpperCase()} Monthly Breakdown`, columns, fields };
}

// --- Controller Logic ---

export async function loadDashboardData() {
    const container = document.getElementById('quarterly-breakdowns-container');
    if (!container) return;

    if (!state.currentClusterId && localStorage.getItem('currentClusterId')) {
        state.currentClusterId = parseInt(localStorage.getItem('currentClusterId'));
    }

    if (!state.currentClusterId) {
        renderDashboard({ sales_reps: [] });
        return;
    }

    try {
        const dashboardData = await fetchDashboard(state.currentClusterId, state.currentFiscalYearId);
        state.partialDataDate = dashboardData.partial_data_date || null;
        state.salesReps = dashboardData.sales_reps || [];

        renderDashboard(dashboardData);

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

function renderDashboard(data) {
    const reps = data.sales_reps || [];
    const month = new Date().getMonth() + 1;
    let currentQuarter = 'q3';
    if (month >= 6 && month <= 8) currentQuarter = 'q1';
    else if (month >= 9 && month <= 11) currentQuarter = 'q2';
    else if (month === 12 || month <= 2) currentQuarter = 'q3';
    else if (month >= 3 && month <= 5) currentQuarter = 'q4';

    renderQuarterlyBreakdowns(reps, currentQuarter);
}

function renderQuarterlyBreakdowns(reps, currentQuarter) {
    const container = document.getElementById('quarterly-breakdowns-container');
    if (!container || !reps) return;

    const clusterKey = `dashboard_active_tab_${state.currentClusterId}`;
    const savedTab = state[clusterKey] || currentQuarter;
    state.activeQuarterTab = savedTab;

    const currentMonthIdx = new Date().getMonth();
    const allQuarters = ['q1', 'q2', 'q3', 'q4'];

    const quarterContent = {};
    allQuarters.forEach(q => {
        const isCurrent = (q === currentQuarter);
        const config = getQuarterConfig(q, currentMonthIdx, isCurrent);
        quarterContent[q] = renderSection(q, reps, config, currentMonthIdx);
    });

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

function renderSection(q, reps, config, currentMonthIdx) {
    const f = config.fields;
    const cols = config.columns;
    const { totals, totalPrevDenom } = processQuarterData(q, reps, config, currentMonthIdx, state.partialDataDate);

    const qLower = q.toLowerCase();
    const isOverride = state.overrides?.[qLower];
    const month = new Date().getMonth() + 1;
    let currQ = 'q3';
    if (month >= 6 && month <= 8) currQ = 'q1';
    else if (month >= 9 && month <= 11) currQ = 'q2';
    else if (month === 12 || month <= 2) currQ = 'q3';
    else currQ = 'q4';

    const isCurrentQuarter = (q === currQ);

    const rows = reps.map(rep => {
        const tds = cols.map(c => {
            const fieldName = f[c.key];
            let val = (fieldName === 'current_month_est') ? (rep.current_month_est || 0) : (fieldName ? (rep[fieldName] || 0) : 0);

            const forceEdit = isOverride && fieldName && (c.key === 'prevExit');
            const baseCls = c.customClass || '';

            if (c.type === 'percent' && !forceEdit) {
                return `<td class="${getPercentColorClass(val)} ${baseCls}">${fieldName ? formatPercent(val) : '-'}</td>`;
            }

            if (fieldName && !c.readOnly && !c.type) {
                const ky = c.key;
                const isMonthCol = ky.startsWith('m_');
                const isRateCol = (ky === 'lastWk' || ky === 'currDaily');
                const isStandard = isCurrentQuarter && (isMonthCol || isRateCol);
                const isOverridden = isOverride && (ky === 'prevExit' || isMonthCol);

                if (isStandard || isOverridden || ky === 'sim') {
                    return `<td class="${baseCls}">${mkInput(rep.id, fieldName, val)}</td>`;
                }
            }

            if (c.key === 'sim') return `<td class="${baseCls}">${mkInput(rep.id, fieldName, val)}</td>`;

            let txt = fieldName ? (c.type === 'date' ? val : formatCurrency(val)) : '-';
            if (c.type === 'percent') {
                txt = formatPercent(val);
                return `<td class="${baseCls} ${getPercentColorClass(val)}"><strong>${txt}</strong></td>`;
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

    return `
    <div class="quarter-section-tabbed" id="${q}-section">
        <div class="quarter-header-tabbed">
            <h3>${config.title}</h3>
            <div class="header-info" style="display: flex; gap: 15px; align-items: center;">
                <button class="override-btn" onclick="window.toggleOverride('${qLower}', event)" 
                        style="padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-color); background: ${state.overrides?.[qLower] ? 'rgba(231, 76, 60, 0.15)' : 'transparent'}; color: ${state.overrides?.[qLower] ? 'var(--accent-red)' : 'var(--text-muted)'}; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; gap: 5px;">
                    <span>${state.overrides?.[qLower] ? '🔓' : '🔒'}</span>
                    <span>${state.overrides?.[qLower] ? 'Override Active' : 'Override'}</span>
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

// --- Global Handlers ---

window.switchQuarterTab = function (quarter) {
    const all = ['q1', 'q2', 'q3', 'q4'];
    const target = quarter.toLowerCase();
    all.forEach(q => {
        const tab = document.querySelector(`.quarter-tab[onclick="switchQuarterTab('${q}')"]`);
        const content = document.getElementById(`${q}-tab-content`);
        if (tab) tab.classList.toggle('active', q === target);
        if (content) content.classList.toggle('active', q === target);
    });
    state.activeQuarterTab = target;
    setState(`dashboard_active_tab_${state.currentClusterId}`, target);
};

window.updatePartialDate = async function (dateValue) {
    if (!state.currentClusterId) return;
    try {
        const promises = [
            fetch(`/api/clusters/${state.currentClusterId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partial_data_date: dateValue })
            })
        ];
        if (state.salesReps) {
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
        console.error(e);
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
        if (input.dataset.originalType === 'number') {
            const numValue = parseFloat(input.value.replace(/[$,]/g, ''));
            if (!isNaN(numValue)) input.value = formatCurrency(Math.round(numValue));
        }
    }
}, true);

function updateTotalsLocally(changedInput) {
    const repId = parseInt(changedInput.dataset.id);
    const field = changedInput.dataset.field;
    let newValue = parseFloat(changedInput.value.replace(/[$,]/g, '')) || 0;

    const repInState = state.salesReps.find(r => r.id === repId);
    if (!repInState) return;
    repInState[field] = newValue;

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

        const config = getQuarterConfig(qKey, currentMonthIdx, qKey === currQ);
        const { totals } = processQuarterData(qKey, state.salesReps, config, currentMonthIdx, state.partialDataDate);

        const rows = table.querySelectorAll('tbody tr:not(.totals-row)');
        rows.forEach(row => {
            const rId = parseInt(row.dataset.repId);
            const rData = state.salesReps.find(r => r.id === rId);
            if (!rData) return;

            config.columns.forEach((col, idx) => {
                const cell = row.cells[idx + 1];
                if (!cell || cell.querySelector('input')) return;
                const fieldKey = config.fields[col.key] || col.key;
                let val = (fieldKey === 'current_month_est') ? (rData.current_month_est || 0) : (rData[fieldKey] || 0);
                const target = cell.querySelector('strong') || cell;
                target.textContent = col.type === 'percent' ? formatPercent(val) : formatCurrency(val);
                if (col.type === 'percent') cell.className = `${getPercentColorClass(val)} ${col.customClass || ''}`;
            });
        });

        const totalsRow = table.querySelector('.totals-row');
        if (totalsRow) {
            config.columns.forEach((col, idx) => {
                const cell = totalsRow.cells[idx + 1];
                if (!cell) return;
                const target = cell.querySelector('strong') || cell;
                const val = totals[col.key] || 0;
                target.textContent = col.type === 'percent' ? formatPercent(val) : formatCurrency(val);
                if (col.type === 'percent') cell.className = `${getPercentColorClass(val)} ${col.customClass || ''}`;
            });
        }
    });
}

window.toggleOverride = (q, e) => {
    e.stopPropagation();
    state.overrides = { ...(state.overrides || {}), [q]: !(state.overrides?.[q]) };
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
    const table = document.getElementById(`${quarter.toLowerCase()}-table`);
    if (!table || typeof XLSX === 'undefined') return;

    const clusterSelect = document.getElementById('cluster-select');
    const clusterName = clusterSelect?.options[clusterSelect.selectedIndex]?.text || 'Cluster';
    const shortDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${clusterName}_${quarter}_Breakdown_${shortDate}.xlsx`;

    try {
        const clone = table.cloneNode(true);
        const originalInputs = table.querySelectorAll('input');
        const cloneInputs = clone.querySelectorAll('input');
        originalInputs.forEach((input, idx) => {
            cloneInputs[idx].parentElement.textContent = input.value;
        });
        const wb = XLSX.utils.table_to_book(clone, { sheet: "Sheet 1" });
        XLSX.writeFile(wb, filename);
    } catch (err) {
        console.error(err);
    }
};
