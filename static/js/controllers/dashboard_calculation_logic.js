/**
 * Dashboard Calculation Logic.
 * Pure business logic for sales dashboard financial projections.
 * Handles:
 * - Quarter Column Configuration
 * - Current Month Estimation (Partial Data)
 * - Future Month Projections (Daily Rate)
 * - Quarter Rollups (Subtotals)
 * - Total Aggregation
 */

// --- Constants ---

/** @type {number[]} FY starts in June (index 5) */
export const FY_MONTHS = [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** maps frontend column IDs to API field names */
export const DB_FIELD_MAP = {
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

// --- Configuration ---

/**
 * Returns column schema and field mapping for a quarter.
 */
export function getQuarterConfig(q, currentMonthIdx, isCurrentQuarter) {
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
        fields.qQoQ = 'q4_qoq_pct';
        fields.addFct = 'q4_add_fct'; fields.totalExit = 'q4_total_exit_with_fc'; fields.qoqPlusFct = 'q4_qoq_plus_fct_pct'; fields.upside = 'q4_add_upside';
    }

    // Mixin DB fields for month columns
    columns.forEach(col => {
        if (col.key === 'sim') {
            fields[col.key] = `${q}_simulation`;
        } else if (!fields[col.key] && DB_FIELD_MAP[col.key]) {
            fields[col.key] = DB_FIELD_MAP[col.key];
        }
    });

    return { title: `${q.toUpperCase()} Monthly Breakdown`, columns, fields };
}

// --- Calculation Helper ---

function calculatePartialDayParams(partialDateStr, currM) {
    let partialDay = 0;
    let daysInMonth = new Date(new Date().getFullYear(), currM + 1, 0).getDate(); // Default to current month length

    if (partialDateStr) {
        const parts = partialDateStr.split('-');
        // Handle YYYY-MM-DD
        const pd = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(partialDateStr);

        if (!isNaN(pd.getTime())) {
            const now = new Date();
            if (pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear()) {
                partialDay = pd.getDate();
                daysInMonth = new Date(pd.getFullYear(), pd.getMonth() + 1, 0).getDate();
            } else {
                partialDay = now.getDate(); // Fallback
            }
        }
    } else {
        partialDay = new Date().getDate();
    }

    return { partialDay, daysInMonth };
}

// --- Main Processing Logic ---

/**
 * Processes raw rep data for a quarter:
 * 1. Calculates Current Month Estimates based on daily rate & partial date.
 * 2. Projects Future Month Estimates.
 * 3. Rolls up totals to Quarter Exit.
 * 4. Aggregates column totals.
 */
export function processQuarterData(q, reps, config, currentMonthIdx, partialDateStr) {
    const f = config.fields;
    const cols = config.columns;
    const qMonths = Q_MONTHS_MAP[q] || [];
    const curFyIdxLocal = FY_MONTHS.indexOf(currentMonthIdx);
    const currentYear = new Date().getFullYear();

    const { partialDay, daysInMonth } = calculatePartialDayParams(partialDateStr, currentMonthIdx);
    const monthFieldInfo = f[`m_${currentMonthIdx}`]; // Actuals field key for current month

    // 1. Process Each Rep
    reps.forEach(r => {
        // A. Current Month Estimate
        if (monthFieldInfo && partialDay > 0) {
            const daysLeft = Math.max(0, daysInMonth - partialDay);
            const daily = r.current_daily_rate || 0;
            const actual = r[monthFieldInfo] || 0;
            // FORMULA: Act + (Daily * DaysLeft + 0.5)
            r.current_month_est = (daily * (daysLeft + 0.5)) + actual;
        }

        // B. Project Future Months
        qMonths.forEach(m => {
            const mFyIdx = FY_MONTHS.indexOf(m);
            if (mFyIdx > curFyIdxLocal) {
                // Future Month
                const monthFieldKey = DB_FIELD_MAP[`m_${m}`];
                if (monthFieldKey) {
                    const futureYear = m < 6 ? currentYear + 1 : currentYear;
                    const daysInFutureMonth = new Date(futureYear, m + 1, 0).getDate();
                    const daily = r.current_daily_rate || 0;
                    r[monthFieldKey] = daily * daysInFutureMonth;
                }
            }
        });

        // C. Roll up to Quarter Exit
        let monthSum = 0;
        qMonths.forEach(m => {
            const mKey = DB_FIELD_MAP[`m_${m}`];
            let val = 0;
            // CRITICAL LOGIC: If current month, use ESTIMATE. Else use value (Actual/Projected)
            if (m === currentMonthIdx) {
                val = (r.current_month_est || 0);
            } else {
                val = (r[mKey] || 0);
            }
            monthSum += val;
        });

        // Update Quarter Exit in Rep Object
        if (f.qEst) {
            const simField = f.sim || 'simulation'; // Use correctly mapped quarter stimulation
            const simulationVal = r[simField] || 0;
            const calculatedExit = monthSum + simulationVal;
            const existingExit = r[f.qEst] || 0;

            // Prefer calculation if non-zero, otherwise fallback to DB value
            if (calculatedExit !== 0) {
                r[f.qEst] = calculatedExit;
            } else if (existingExit !== 0) {
                r[f.qEst] = existingExit;
            }
        }

        // Validate Total Exit consistency with FCT (with non-zero fallback)
        if (f.totalExit && f.addFct) {
            const calcTotal = r[f.qEst] + (r[f.addFct] || 0);
            const existingTotal = r[f.totalExit] || 0;

            if (calcTotal !== 0) {
                // If it significantly differs from calculation, update it
                if (Math.abs(existingTotal - calcTotal) > 1) r[f.totalExit] = calcTotal;
            } else if (existingTotal !== 0) {
                // Keep the database total if calculation is zero
                r[f.totalExit] = existingTotal;
            }
        }

        // D. Recalculate Row-Level Percentages (QoQ and QoQ+)
        if (f.prevExit) {
            const prev = r[f.prevExit] || 0;
            if (prev > 0) {
                if (f.qQoQ) {
                    r[f.qQoQ] = (((r[f.qEst] || 0) / prev) - 1) * 100;
                }
                if (f.qoqPlusFct) {
                    r[f.qoqPlusFct] = (((r[f.totalExit] || 0) / prev) - 1) * 100;
                }
            } else {
                if (f.qQoQ) r[f.qQoQ] = 0;
                if (f.qoqPlusFct) r[f.qoqPlusFct] = 0;
            }
        }
    });

    // 2. Calculate Footer Totals
    const totals = {};
    let totalPrevDenom = 0;
    cols.forEach(c => totals[c.key] = 0);

    reps.forEach(r => {
        cols.forEach(c => {
            const field = f[c.key];
            if (field && c.type !== 'percent') {
                totals[c.key] += (r[field] || 0);
            }
        });

        // PrevQoQ Denominator Reconstruction for Weighted Avg
        if (f.prevExit && f.prevQoQ) {
            const exit = r[f.prevExit] || 0, pct = r[f.prevQoQ] || 0;
            if (pct > -99.9) totalPrevDenom += (exit / (1 + (pct / 100)));
        }
    });

    // Derived Percentages for Totals
    if (totalPrevDenom > 0 && totals.prevExit) totals.prevQoQ = ((totals.prevExit / totalPrevDenom) - 1) * 100;
    if (f.qEst && f.prevExit && totals.prevExit > 0) totals.qQoQ = ((totals.qEst / totals.prevExit) - 1) * 100;
    if (f.totalExit && f.prevExit && totals.prevExit > 0) totals.qoqPlusFct = ((totals.totalExit / totals.prevExit) - 1) * 100;

    return { totals, totalPrevDenom };
}
