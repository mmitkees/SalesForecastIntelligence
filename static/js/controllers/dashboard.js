import { state } from '../state.js';
import { fetchDashboard } from '../api.js';
import { formatCurrency, formatPercent, getPercentColorClass } from '../utils.js';

// Constants for Month Logic
const FY_MONTHS = [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4]; // Jun..May (FY starts Jun)
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DB_FIELD_MAP = {
    // Monthly data - maps month index (0=Jan...11=Dec) to DB field
    // For current month: 'act' = month field, 'est' = current_month_est
    // For past months: single field stores final value
    // For future months: single field stores projection

    'm_0': 'jan',       // January
    'm_1': 'feb',       // February
    'm_2': 'mar',       // March
    'm_3': 'apr',       // April
    'm_4': 'may',       // May
    'm_5': 'jun',       // June
    'm_6': 'jul',       // July
    'm_7': 'aug',       // August
    'm_8': 'sep',       // September
    'm_9': 'oct',       // October
    'm_10': 'nov',      // November
    'm_11': 'dec',      // December

    'current_month_est': 'current_month_est',  // Current month estimate

    // Other
    'lastWk': 'last_week_daily_rate',
    'currDaily': 'current_daily_rate',
    'sim': 'simulation'
};

// Helper function to create editable input fields
const mkInput = (repId, field, value, type = 'number') => `
    <input type="${type}" ${type === 'number' ? 'step="1"' : ''} 
           class="editable-cell w-full bg-transparent border-none text-right focus:ring-0 p-0" 
           data-id="${repId}" 
           data-field="${field}" 
           value="${type === 'number' && !isNaN(value) ? Math.round(value) : value}" 
           onfocus="this.select()">
`;

export async function loadDashboardData() {
    if (!document.getElementById('quarterly-breakdowns-container')) return;

    if (!state.currentClusterId) return;

    try {
        const dashboardData = await fetchDashboard(state.currentClusterId, state.currentFiscalYearId);

        // Store partial_data_date from cluster in state for calculations
        if (dashboardData.cluster && dashboardData.cluster.partial_data_date) {
            state.partialDataDate = dashboardData.cluster.partial_data_date;
        } else {
            state.partialDataDate = null;
        }

        renderDashboard(dashboardData);

        // Initialize Flatpickr on partial data date input
        const dateInput = document.getElementById('partial-data-date');
        if (dateInput && typeof flatpickr !== 'undefined') {
            flatpickr(dateInput, {
                dateFormat: "d/m/Y",
                defaultDate: state.partialDataDate || null,
                onChange: function (selectedDates, dateStr) {
                    window.updatePartialDate(dateStr);
                }
            });
        }
    } catch (e) {
        console.error("Failed to load dashboard data", e);
    }
}

function renderDashboard(data) {
    if (!data.sales_reps) return;

    // Determine current quarter
    const month = new Date().getMonth() + 1; // 1-12
    let currentQuarter = 'q3'; // Default to Q3 if no match
    if (month >= 6 && month <= 8) currentQuarter = 'q1'; // June, July, August
    else if (month >= 9 && month <= 11) currentQuarter = 'q2'; // September, October, November
    else if (month === 12 || month <= 2) currentQuarter = 'q3'; // December, January, February
    else if (month >= 3 && month <= 5) currentQuarter = 'q4'; // March, April, May

    // Render quarterly breakdowns (This is now the MAIN VIEW)
    renderQuarterlyBreakdowns(data.sales_reps, currentQuarter);

    // Expand current quarter
    const currentContent = document.getElementById(`${currentQuarter}-content`);
    const currentToggleBtn = document.getElementById(`${currentQuarter}-toggle`);
    if (currentContent && currentToggleBtn) { // Ensure elements exist
        // Force expand if needed, relying on toggle logic
        if (currentContent.style.display === 'none') {
            window.toggleQuarter(currentQuarter);
        }
    }
}

function renderQuarterlyBreakdowns(reps, currentQuarter) {
    const container = document.getElementById('quarterly-breakdowns-container');
    if (!container || !reps) return;

    // Determine current month index (0-11)
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

function getQuarterConfig(q, currentMonthIdx, isCurrentQuarter) {
    let qMonths = [];
    if (q === 'q1') qMonths = [5, 6, 7]; // Jun, Jul, Aug
    if (q === 'q2') qMonths = [8, 9, 10]; // Sep, Oct, Nov
    if (q === 'q3') qMonths = [11, 0, 1]; // Dec, Jan, Feb
    if (q === 'q4') qMonths = [2, 3, 4]; // Mar, Apr, May

    const curFyIdx = FY_MONTHS.indexOf(currentMonthIdx);

    // 1. Build Columns
    const columns = [
        { key: 'prevExit', label: 'Prev Q Exit' },
        { key: 'prevQoQ', label: 'Prev QoQ', type: 'percent', color: true }
    ];

    // Last Wk, Curr Daily only for Current Quarter
    if (isCurrentQuarter) {
        columns.push(
            { key: 'lastWk', label: 'Last Wk' },
            { key: 'currDaily', label: 'Curr Daily' }
        );
    }

    // Dynamic Months
    qMonths.forEach(m => {
        const mFyIdx = FY_MONTHS.indexOf(m);
        const mName = MONTH_NAMES[m];
        const monthField = `m_${m}`; // Maps to 'jan', 'feb', etc.

        if (mFyIdx < curFyIdx) {
            // Past month: Shows "Act" - value is final/actual
            columns.push({ key: monthField, label: `${mName} Act` });
        } else if (mFyIdx === curFyIdx) {
            // Current month: TWO columns - Act (editable) + Est (calculated)
            columns.push({ key: monthField, label: `${mName} Act` });
            columns.push({ key: 'current_month_est', label: `${mName} Est`, readOnly: true });
        } else {
            // Future month: Shows "Est" - projection, read-only
            columns.push({ key: monthField, label: `${mName} Est`, readOnly: true });
        }
    });

    // End Columns
    columns.push(
        { key: 'sim', label: 'Sim', subtle: true },
        { key: 'qEst', label: `${q.toUpperCase()} Est`, blue: true },
        { key: 'qQoQ', label: 'QoQ', type: 'percent', color: true },
        { key: 'addFct', label: 'Add FCT', readOnly: true },
        { key: 'totalExit', label: 'Total Exit', strong: true },
        { key: 'qoqPlusFct', label: 'QoQ+', type: 'percent', color: true },
        { key: 'upside', label: 'Upside', readOnly: true }
    );

    // 2. Build Fields Map
    const fields = {};

    // Map Fixed/Known Fields
    if (q === 'q1') {
        fields.prevExit = 'last_year_exit';
        fields.qEst = 'q1_exit';
        fields.qQoQ = 'q1_qoq_pct';
        fields.addFct = 'q1_add_fct';
        fields.totalExit = 'q1_total_exit_with_fc';
        fields.qoqPlusFct = 'q1_qoq_plus_fct_pct';
        fields.upside = 'q1_add_upside';
    } else if (q === 'q2') {
        fields.prevExit = 'q1_exit';
        fields.prevQoQ = 'q1_qoq_pct';
        fields.qEst = 'q2_exit';
        fields.qQoQ = 'q2_qoq_pct';
        fields.addFct = 'q2_add_fct';
        fields.totalExit = 'q2_total_exit_with_fc';
        fields.qoqPlusFct = 'q2_qoq_plus_fct_pct';
        fields.upside = 'q2_add_upside';
    } else if (q === 'q3') {
        fields.prevExit = 'q2_exit';
        fields.prevQoQ = 'q2_qoq_pct';
        fields.qEst = 'q3_estimated';
        fields.qQoQ = 'q3_qoq_pct';
        fields.addFct = 'q3_add_fct';
        fields.totalExit = 'q3_total_exit_with_fc';
        fields.qoqPlusFct = 'qoq_plus_fct_pct';
        fields.upside = 'q3_add_upside';
    } else if (q === 'q4') {
        fields.prevExit = 'q3_total_exit_with_fc';
        fields.prevQoQ = 'qoq_plus_fct_pct';
        fields.qEst = 'q4_exit';
        fields.addFct = 'q4_add_fct';
        fields.totalExit = 'q4_total_exit_with_fc';
        fields.qoqPlusFct = 'q4_qoq_plus_fct_pct';
        fields.upside = 'q4_add_upside';
    }

    // Map Dynamic DB Fields (if match)
    columns.forEach(col => {
        if (!fields[col.key] && DB_FIELD_MAP[col.key]) {
            fields[col.key] = DB_FIELD_MAP[col.key];
        }
    });

    return { title: `${q.toUpperCase()} Monthly Breakdown`, columns, fields };
}

function renderSection(q, reps, config) {
    const f = config.fields;
    const cols = config.columns;

    // Pre-calculate Current Month Estimate if applicable
    const currM = new Date().getMonth();
    const monthField = f[`m_${currM}`]; // e.g., 'jan' for January

    // Get partial date from state (loaded from cluster via API)
    const partialDateStr = state.partialDataDate || '';
    let partialDay = 0;
    let daysInMonth = 0;

    if (partialDateStr) {
        // Parse dd/mm/yyyy format
        const parts = partialDateStr.split('/');
        let pd;
        if (parts.length === 3) {
            // dd/mm/yyyy format
            pd = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
            // Fallback to standard parsing (yyyy-mm-dd)
            pd = new Date(partialDateStr);
        }
        if (!isNaN(pd.getTime())) {
            partialDay = pd.getDate();
            daysInMonth = new Date(new Date().getFullYear(), currM + 1, 0).getDate();
        }
    }

    // Calculate current_month_est: (Daily Rate × (Remaining Days + 0.5)) + Actual
    if (monthField && partialDay > 0) {
        const daysLeft = Math.max(0, daysInMonth - partialDay);
        reps.forEach(r => {
            const daily = r.current_daily_rate || 0;
            const actual = r[monthField] || 0;  // Current month actual value
            // FORMULA: Est = (Daily Rate × (Remaining Days + 0.5)) + Actual
            r.current_month_est = (daily * (daysLeft + 0.5)) + actual;
        });
    }

    // Calculate FUTURE month estimates: Daily Rate × Days in that Month
    const currentYear = new Date().getFullYear();
    const curFyIdxLocal = FY_MONTHS.indexOf(currM);
    const qMonthsMap = { q1: [5, 6, 7], q2: [8, 9, 10], q3: [11, 0, 1], q4: [2, 3, 4] };
    const qMonths = qMonthsMap[q] || [];

    qMonths.forEach(m => {
        const mFyIdx = FY_MONTHS.indexOf(m);
        if (mFyIdx > curFyIdxLocal) {  // Future month
            const monthFieldKey = DB_FIELD_MAP[`m_${m}`];  // e.g., 'feb'
            if (monthFieldKey) {
                // Days in that future month (using current year, adjust for fiscal year if needed)
                const futureYear = m < 6 ? currentYear + 1 : currentYear;  // Jan-May is next year
                const daysInFutureMonth = new Date(futureYear, m + 1, 0).getDate();

                reps.forEach(r => {
                    const daily = r.current_daily_rate || 0;
                    // Future Est = Daily Rate × Days in Month
                    r[monthFieldKey] = daily * daysInFutureMonth;
                });
            }
        }
    });

    // Auto-Calculate Q Est from monthly sums if DB value is 0 (Fix for zero projections)
    // Applies to all quarters but critical for Future quarters (Q4)
    reps.forEach(r => {
        let monthSum = 0;
        let hasMonths = false;
        qMonths.forEach(m => {
            const mKey = DB_FIELD_MAP[`m_${m}`];
            if (mKey) {
                monthSum += (r[mKey] || 0);
                hasMonths = true;
            }
        });

        // Loop through config fields to find qEst mapped key
        const f = config.fields;
        if (f.qEst && r[f.qEst] === 0 && hasMonths) {
            // Only override if DB value is 0 (assumes calc is better than 0)
            // Or should we always override for future quarters? 
            // Let's stick to 0-override to respect manual inputs if any.
            // Add Simulation to the estimate (as requested)
            r[f.qEst] = monthSum + (r.simulation || 0);
        }

        // Also ensure Total Exit is updated if it depends on Q Est
        if (f.totalExit && f.addFct) {
            // If total exit is 0 or we just updated qEst, recalculate it for display
            // Total = Q Est + Add FCT
            const addFct = r[f.addFct] || 0;
            // Check if Total matches Est + addFct
            // If we updated qEst, we should update Total
            // Note: r[f.totalExit] might be DB value (0).
            const calcTotal = r[f.qEst] + addFct;
            if (Math.abs((r[f.totalExit] || 0) - calcTotal) > 1) { // loose equality
                r[f.totalExit] = calcTotal;
            }
        }
    });

    // Calculate Totals
    const totals = {};
    let totalPrevDenom = 0; // For PrevQoQ

    // Initialize totals
    cols.forEach(c => totals[c.key] = 0);

    reps.forEach(r => {
        // Sum values (skip percent/text if needed, but simple sum is fine for numbers)
        cols.forEach(c => {
            const field = f[c.key];
            if (field && c.type !== 'percent' && c.type !== 'date') { // Skip date sum
                totals[c.key] += (r[field] || 0);
            }
        });

        // Specific Percent Denominator Back-Calc
        if (f.prevExit && f.prevQoQ) {
            const exit = r[f.prevExit] || 0;
            const pct = r[f.prevQoQ] || 0;
            if (pct > -99.9) {
                totalPrevDenom += (exit / (1 + (pct / 100)));
            }
        }
    });

    // Calculate Percent Totals
    // PrevQoQ
    if (totalPrevDenom > 0 && totals.prevExit) {
        totals.prevQoQ = ((totals.prevExit / totalPrevDenom) - 1) * 100;
    }
    // Fix: Only calculate percentages if corresponding fields are mapped
    if (f.qEst && f.prevExit && totals.prevExit > 0) {
        totals.qQoQ = ((totals.qEst / totals.prevExit) - 1) * 100;
    }
    if (f.totalExit && f.prevExit && totals.prevExit > 0) {
        totals.qoqPlusFct = ((totals.totalExit / totals.prevExit) - 1) * 100;
    }


    // Check override state for this quarter
    const qLower = q.toLowerCase();
    const isOverride = state.overrides && state.overrides[qLower];

    const rows = reps.map(rep => {
        const tds = cols.map(c => {
            const fieldName = f[c.key];
            const val = fieldName ? (rep[fieldName] || 0) : 0;

            // Override Check: Specifically for Prev Exit and Prev QoQ
            let forceEdit = false;
            // Only allow override if fieldName exists (mapped to DB)
            if (isOverride && fieldName && (c.key === 'prevExit' || c.key === 'prevQoQ')) {
                forceEdit = true;
            }

            if (c.type === 'percent' && !forceEdit) {
                const txt = fieldName ? formatPercent(val) : '-';
                return `<td class="${getPercentColorClass(val)}">${txt}</td>`;
            }

            // Input vs Text logic
            // Allow inputs if standard input field OR if forced by override
            const isStandardInput = fieldName && !c.readOnly && !c.blue && !c.strong && !c.label.includes('Exit');

            if (forceEdit || isStandardInput) {
                const inputType = c.type === 'date' ? 'date' : 'number';
                return `<td>${mkInput(rep.id, fieldName, val, inputType)}</td>`;
            } else {
                const cls = [
                    c.subtle ? 'subtle' : '',
                    c.blue ? 'highlight-blue' : '',
                    c.strong ? '' : ''
                ].join(' ');

                let txt = '-';
                if (fieldName) {
                    if (c.type === 'date') txt = val || '';
                    else txt = formatCurrency(val);
                }
                const content = c.strong ? `<strong>${txt}</strong>` : txt;
                return `<td class="${cls}">${content}</td>`;
            }
        }).join('');

        // Calculate Denom for recalculations
        let prevDenom = 0;
        if (f.prevExit && f.prevQoQ) {
            const pe = rep[f.prevExit] || 0;
            const pq = rep[f.prevQoQ] || 0;
            if (pq > -99.9) prevDenom = pe / (1 + (pq / 100));
        }

        return `<tr data-rep-id="${rep.id}" data-prev-denom="${prevDenom}"><td class="fixed-col">${rep.name}</td>${tds}</tr>`;
    }).join('');

    const tCell = (c) => {
        if (c.type === 'percent') {
            const val = totals[c.key] || 0;
            const hasVal = (c.key === 'prevQoQ' && totalPrevDenom > 0) ||
                (c.key === 'qQoQ' && f.qEst) ||
                (c.key === 'qoqPlusFct' && f.totalExit);

            return `<td class="${getPercentColorClass(val)}"><strong>${hasVal ? formatPercent(val) : '-'}</strong></td>`;
        }

        const val = totals[c.key];
        const cls = c.blue ? 'highlight-blue' : '';
        const txt = formatCurrency(val);
        const hasMapping = f[c.key] || (totals[c.key] !== 0); // Heuristic
        return `<td class="${cls}"><strong>${hasMapping ? txt : '-'}</strong></td>`;
    };

    const totalTds = cols.map(c => tCell(c)).join('');
    const totalsRow = `<tr class="totals-row"><td class="fixed-col"><strong>TOTAL</strong></td>${totalTds}</tr>`;

    const headers = cols.map(c => `<th>${c.label}</th>`).join('');

    // Get current quarter to show partial data input only for it
    const month = new Date().getMonth() + 1;
    let currentQuarter = 'q3';
    if (month >= 6 && month <= 8) currentQuarter = 'q1';
    else if (month >= 9 && month <= 11) currentQuarter = 'q2';
    else if (month === 12 || month <= 2) currentQuarter = 'q3';
    else if (month >= 3 && month <= 5) currentQuarter = 'q4';

    const isCurrentQuarter = (q === currentQuarter);
    const savedDate = state.partialDataDate || '';

    const partialDataInput = isCurrentQuarter ? `
        <div class="partial-data-row" style="margin-bottom: 12px; display: flex; align-items: center; gap: 10px;">
            <label for="partial-data-date" style="font-weight: 500;">📅 Partial Data Of:</label>
            <input type="text" id="partial-data-date" value="${savedDate}" 
                   placeholder="Select date..."
                   style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; width: 150px;">
        </div>
    ` : '';

    // Check override for button state
    const isOverrideActive = state.overrides && state.overrides[qLower];

    return `
    <div class="quarterly-breakdown" style="margin-bottom: 24px;">
        <div class="quarter-header-wrapper" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <button class="collapse-btn" id="${q}-toggle" onclick="toggleQuarter('${q}')" style="flex: 1; margin-bottom: 0;">
                <span id="${q}-icon">▶</span> ${config.title}
            </button>
            <button class="override-btn" onclick="window.toggleOverride('${qLower}', event)" 
                    style="margin-left: 10px; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-color); background: ${isOverrideActive ? 'rgba(231, 76, 60, 0.15)' : 'rgba(255,255,255,0.05)'}; color: ${isOverrideActive ? 'var(--accent-red)' : 'var(--text-muted)'}; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; gap: 5px;">
                <span>${isOverrideActive ? '🔓' : '🔒'}</span>
                <span>${isOverrideActive ? 'Override Active' : 'Override'}</span>
            </button>
        </div>
        <div class="collapse-content" id="${q}-content" style="display: none;">
            ${partialDataInput}
            <div class="table-container">
                <table class="data-table" id="${q}-table">
                    <thead>
                        <tr>
                            <th class="fixed-col">Sales Rep</th>
                            ${headers}
                        </tr>
                    </thead>
                    <tbody id="${q}-tbody">
                        ${rows}
                        ${totalsRow}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}


// Global toggle function for quarterly sections
window.toggleQuarter = function (quarter) {
    const allQuarters = ['q1', 'q2', 'q3', 'q4'];
    const currentQ = quarter.toLowerCase();

    // Check current state of target
    const content = document.getElementById(`${currentQ}-content`);
    const isCurrentlyOpen = content && content.style.display === 'block';

    // Close ALL sections
    allQuarters.forEach(q => {
        const c = document.getElementById(`${q}-content`);
        const i = document.getElementById(`${q}-icon`);
        const b = document.getElementById(`${q}-toggle`);
        if (c) c.style.display = 'none';
        if (i) i.textContent = '▶';
        if (b) b.classList.remove('active');
    });

    // If it was closed, open it (Accordion behavior)
    if (!isCurrentlyOpen && content) {
        content.style.display = 'block';
        const icon = document.getElementById(`${currentQ}-icon`);
        const btn = document.getElementById(`${currentQ}-toggle`);
        if (icon) icon.textContent = '▼';
        if (btn) btn.classList.add('active');
    }
};

// Global function to update partial data date and save to server
window.updatePartialDate = async function (dateValue) {
    if (!state.currentClusterId) return;

    try {
        // Save to server
        await fetch(`/api/clusters/${state.currentClusterId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partial_data_date: dateValue })
        });

        // Update local state
        state.partialDataDate = dateValue;

        // Reload dashboard to recalculate estimates
        loadDashboardData();
    } catch (e) {
        console.error("Failed to save partial data date", e);
    }
};


// Real-time updates as user types (for calculations only - no save)
document.addEventListener('input', (e) => {
    if (e.target.classList.contains('editable-cell') && e.target.type === 'number') {
        updateTotalsLocally(e.target);
    }
});

// Global Event Listener for Cell Updates (Auto-Save on blur/change)
document.addEventListener('change', async (e) => {
    if (e.target.classList.contains('editable-cell')) {
        const input = e.target;
        const repId = input.dataset.id;
        const field = input.dataset.field;
        let value = input.value;
        if (input.type === 'number') {
            value = parseFloat(value) || 0;
        }

        // Visual feedback: Saving...
        input.classList.add('saving');

        try {
            const payload = {};
            payload[field] = value;

            const response = await fetch(`/api/sales_reps/${repId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Update failed');

            // Success feedback
            input.classList.remove('saving');
            input.classList.add('saved');
            setTimeout(() => input.classList.remove('saved'), 1000);

            // Update totals locally - NO re-render for zero flicker
            updateTotalsLocally(input);

        } catch (error) {
            console.error(error);
            input.classList.remove('saving');
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 2000);
        }
    }
});

// Smart refresh: Re-renders dashboard while preserving open quarter state
async function refreshQuarterData() {
    if (!state.currentClusterId) return;

    try {
        // Remember which quarter is open
        const openQuarter = ['q1', 'q2', 'q3', 'q4'].find(q => {
            const content = document.getElementById(`${q}-content`);
            return content && content.style.display === 'block';
        });

        // Remember scroll position
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;

        // Fetch fresh data and re-render
        const data = await fetchDashboard(state.currentClusterId, state.currentFiscalYearId);
        if (!data.sales_reps) return;

        // Determine current quarter
        const month = new Date().getMonth() + 1;
        let currentQuarter = 'q3';
        if (month >= 6 && month <= 8) currentQuarter = 'q1';
        else if (month >= 9 && month <= 11) currentQuarter = 'q2';
        else if (month === 12 || month <= 2) currentQuarter = 'q3';
        else if (month >= 3 && month <= 5) currentQuarter = 'q4';

        // Re-render
        renderQuarterlyBreakdowns(data.sales_reps, currentQuarter);

        // Re-initialize Flatpickr
        const dateInput = document.getElementById('partial-data-date');
        if (dateInput && typeof flatpickr !== 'undefined') {
            flatpickr(dateInput, {
                dateFormat: "d/m/Y",
                defaultDate: localStorage.getItem('partialDataDate') || null,
                onChange: function (selectedDates, dateStr) {
                    window.updatePartialDate(dateStr);
                }
            });
        }

        // Restore open quarter (use previously open or current)
        const quarterToOpen = openQuarter || currentQuarter;
        const content = document.getElementById(`${quarterToOpen}-content`);
        const icon = document.getElementById(`${quarterToOpen}-icon`);
        const btn = document.getElementById(`${quarterToOpen}-toggle`);
        if (content) {
            content.style.display = 'block';
            if (icon) icon.textContent = '▼';
            if (btn) btn.classList.add('active');
        }

        // Restore scroll position
        window.scrollTo(0, scrollTop);

    } catch (e) {
        console.error("Failed to refresh quarter data", e);
    }
}

// Update cells in a row based on new rep data
function updateRowCells(row, rep) {
    const cells = row.querySelectorAll('td');
    cells.forEach(cell => {
        // Check for input (editable) or display cell
        const input = cell.querySelector('input[type="number"]');
        if (input) {
            const field = input.dataset.field;
            if (field && rep[field] !== undefined && document.activeElement !== input) {
                input.value = rep[field];
            }
        } else {
            // Display-only cells - update if they have known field mappings
            const strong = cell.querySelector('strong');
            const target = strong || cell;

            // Check for percentage display
            if (cell.className.includes('text-')) {
                // This is a percentage cell - handled by class
            }
        }
    });
}

// Recalculate totals from data
function updateTotalsFromData(tbody, reps) {
    const rows = tbody.querySelectorAll('tr:not(.totals-row)');
    const totalsRow = tbody.querySelector('.totals-row');
    if (!totalsRow || rows.length === 0) return;

    const table = tbody.closest('table');
    const headerCells = table.querySelectorAll('thead th');

    headerCells.forEach((th, colIdx) => {
        if (colIdx === 0) return; // Skip "Sales Rep" column

        let total = 0;
        let hasValues = false;
        let isPercent = false;

        rows.forEach(row => {
            const cell = row.cells[colIdx];
            if (!cell) return;

            // Check if this is a percentage cell
            if (cell.className.includes('text-green') || cell.className.includes('text-red') || cell.className.includes('text-gray')) {
                isPercent = true;
            }

            const input = cell.querySelector('input[type="number"]');
            if (input) {
                total += parseFloat(input.value) || 0;
                hasValues = true;
            } else if (!isPercent) {
                const text = cell.textContent.replace(/[$,%]/g, '').trim();
                const num = parseFloat(text.replace(/,/g, ''));
                if (!isNaN(num)) {
                    total += num;
                    hasValues = true;
                }
            }
        });

        // Update totals cell
        const totalsCell = totalsRow.cells[colIdx];
        if (totalsCell && hasValues && !isPercent) {
            const strong = totalsCell.querySelector('strong');
            if (strong) {
                const formatted = '$' + total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                strong.textContent = formatted;
            }
        }
    });
}

// Comprehensive local update - recalculates ALL derived fields per row
function updateTotalsLocally(changedInput) {
    const table = changedInput.closest('table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr:not(.totals-row)');
    const totalsRow = tbody.querySelector('.totals-row');
    if (!totalsRow) return;

    const headerCells = table.querySelectorAll('thead th');
    const headers = Array.from(headerCells).map(th => th.textContent.trim());

    // Find column indices by header text
    const colIndex = {};
    headers.forEach((h, i) => colIndex[h] = i);

    // Helper to get cell value - ROUNDED to ensure integer calculations
    const getCellValue = (row, colIdx) => {
        const cell = row.cells[colIdx];
        if (!cell) return 0;
        const input = cell.querySelector('input[type="number"]');
        if (input) return Math.round(parseFloat(input.value) || 0);
        const text = cell.textContent.replace(/[$,%]/g, '').trim().replace(/,/g, '');
        // Round to nearest integer to avoid decimal propagation
        return Math.round(parseFloat(text) || 0);
    };

    // Helper to set cell value (display cells only - skip inputs)
    const setCellValue = (row, colIdx, value, isPercent = false) => {
        const cell = row.cells[colIdx];
        if (!cell) return;

        // Skip cells with inputs - they're editable and shouldn't be overwritten
        if (cell.querySelector('input')) return;

        // Find the text target - prefer strong, then first text node, then cell
        const strong = cell.querySelector('strong');
        let target = strong;

        if (!target) {
            // Look for existing text node or create structure
            const existingText = cell.childNodes[0];
            if (existingText && existingText.nodeType === Node.TEXT_NODE) {
                // Update text node directly
                if (isPercent) {
                    existingText.textContent = value.toFixed(1) + '%';
                } else {
                    existingText.textContent = '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                }
            } else {
                // Fallback: set innerHTML
                const formatted = isPercent
                    ? value.toFixed(1) + '%'
                    : '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                cell.innerHTML = formatted;
            }
        } else {
            // Update strong tag content
            if (isPercent) {
                target.textContent = value.toFixed(1) + '%';
            } else {
                target.textContent = '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            }
        }

        // Update color classes for percentages
        if (isPercent) {
            cell.classList.remove('text-green', 'text-red', 'text-gray');
            if (value > 0) cell.classList.add('text-green');
            else if (value < 0) cell.classList.add('text-red');
            else cell.classList.add('text-gray');
        }
    };

    // Find relevant column indices
    const prevExitCol = colIndex['Prev Q Exit'];
    const prevQoQCol = colIndex['Prev QoQ'];
    const qEstCol = Object.keys(colIndex).find(k => k.match(/Q[1-4] Est/));
    const qEstIdx = qEstCol ? colIndex[qEstCol] : null;
    const addFctCol = colIndex['Add FCT'];
    const totalExitCol = colIndex['Total Exit'];
    const qoqCol = colIndex['QoQ'];
    const qoqPlusCol = colIndex['QoQ+'];

    // Find current month Est column for recalculation
    const currM = new Date().getMonth();
    const currMName = MONTH_NAMES[currM];
    const currMonthActCol = colIndex[`${currMName} Act`];
    const currMonthEstCol = colIndex[`${currMName} Est`];
    const currDailyCol = colIndex['Curr Daily'];

    // Get partial date info for estimate calculation
    const partialDateStr = state.partialDataDate || '';
    let daysLeft = 0;
    if (partialDateStr) {
        const parts = partialDateStr.split('/');
        if (parts.length === 3) {
            const partialDay = parseInt(parts[0], 10);
            const daysInMonth = new Date(new Date().getFullYear(), currM + 1, 0).getDate();
            daysLeft = Math.max(0, daysInMonth - partialDay);
        }
    }

    // Find monthly columns (Act and Est)
    const monthCols = headers.filter(h => h.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (Act|Est)/));

    // Recalculate each row
    rows.forEach(row => {
        // Get daily rate for all calculations
        const daily = currDailyCol !== undefined ? getCellValue(row, currDailyCol) : 0;

        // 1. Recalculate CURRENT month Est
        if (currMonthEstCol !== undefined && currMonthActCol !== undefined && daysLeft > 0) {
            const actual = getCellValue(row, currMonthActCol);
            const newEst = (daily * (daysLeft + 0.5)) + actual;
            setCellValue(row, currMonthEstCol, newEst);
        }

        // 2. Recalculate FUTURE month Estimates: Daily Rate × Days in Month
        headers.forEach((h, colIdx) => {
            const match = h.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) Est$/);
            if (match && h !== `${currMName} Est`) {  // Skip current month (handled above)
                const monthName = match[1];
                const monthIdx = MONTH_NAMES.indexOf(monthName);
                if (monthIdx !== -1) {
                    const mFyIdx = FY_MONTHS.indexOf(monthIdx);
                    const curFyIdx = FY_MONTHS.indexOf(currM);

                    // Only calculate for future months
                    if (mFyIdx > curFyIdx) {
                        const futureYear = monthIdx < 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
                        const daysInFutureMonth = new Date(futureYear, monthIdx + 1, 0).getDate();
                        const futureEst = daily * daysInFutureMonth;
                        setCellValue(row, colIdx, futureEst);
                    }
                }
            }
        });

        // Sum monthly values for Q Est
        let monthlySum = 0;
        monthCols.forEach(mCol => {
            monthlySum += getCellValue(row, colIndex[mCol]);
        });

        // Subtract Current Month Actual (because we want effective Q Total = Past Acts + Current Est + Future Ests)
        // Since 'monthlySum' includes (Current Act + Current Est), subtracting Current Act leaves just Current Est.
        if (currMonthActCol !== undefined) {
            monthlySum -= getCellValue(row, currMonthActCol);
        }

        // Update Q Est if column exists
        if (qEstIdx !== null) {
            setCellValue(row, qEstIdx, monthlySum);
        }

        // Get values for calculations
        const prevExit = prevExitCol !== undefined ? getCellValue(row, prevExitCol) : 0;
        const addFct = addFctCol !== undefined ? getCellValue(row, addFctCol) : 0;
        const qEst = qEstIdx !== null ? monthlySum : 0;

        // Calculate Total Exit = Q Est + Add FCT
        const totalExit = qEst + addFct;
        if (totalExitCol !== undefined) {
            setCellValue(row, totalExitCol, totalExit);
        }

        // Recalculate Prev QoQ if overridden and denominator exists (from dataset)
        const prevDenom = parseFloat(row.dataset.prevDenom) || 0;
        if (prevQoQCol !== undefined && prevDenom > 0) {
            const newPrevQoQ = ((prevExit / prevDenom) - 1) * 100;
            setCellValue(row, prevQoQCol, newPrevQoQ, true);

            // Manually update input if it exists (for override mode)
            const cell = row.cells[prevQoQCol];
            if (cell) {
                const input = cell.querySelector('input');
                if (input && document.activeElement !== input) {
                    input.value = Math.round(newPrevQoQ);
                }
            }
        }

        // Calculate QoQ% = ((Q Est / Prev Exit) - 1) * 100
        if (qoqCol !== undefined && prevExit > 0) {
            const qoqPct = ((qEst / prevExit) - 1) * 100;
            setCellValue(row, qoqCol, qoqPct, true);
        }

        // Calculate QoQ+% = ((Total Exit / Prev Exit) - 1) * 100
        if (qoqPlusCol !== undefined && prevExit > 0) {
            const qoqPlusPct = ((totalExit / prevExit) - 1) * 100;
            setCellValue(row, qoqPlusCol, qoqPlusPct, true);
        }
    });

    // Now update totals row
    const totals = {};
    headers.forEach((h, i) => totals[h] = 0);

    rows.forEach(row => {
        headers.forEach((h, i) => {
            if (i === 0) return; // Skip name column
            totals[h] += getCellValue(row, i);
        });
    });

    // Update totals row cells
    headers.forEach((h, i) => {
        if (i === 0) return;
        if (h === 'QoQ' || h === 'QoQ+' || h.includes('QoQ')) {
            // Calculate percentages for totals
            const prevExit = totals['Prev Q Exit'] || 0;
            if (h === 'QoQ' && qEstCol && prevExit > 0) {
                const pct = ((totals[qEstCol] / prevExit) - 1) * 100;
                setCellValue(totalsRow, i, pct, true);
            } else if (h === 'QoQ+' && prevExit > 0) {
                const pct = ((totals['Total Exit'] / prevExit) - 1) * 100;
                setCellValue(totalsRow, i, pct, true);
            }
        } else if (!h.includes('%')) {
            setCellValue(totalsRow, i, totals[h]);
        }
    });
}


// Add toggle function to window
window.toggleOverride = function (quarter, event) {
    if (event) event.stopPropagation();
    state.overrides = state.overrides || {};
    state.overrides[quarter] = !state.overrides[quarter];

    // Refresh Quarter
    refreshQuarterData();
};
