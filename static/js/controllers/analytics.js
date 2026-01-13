import { state } from '../state.js';
import { fetchDashboard } from '../api.js';
import { formatCurrency, formatPercent, getPercentColorClass } from '../utils.js';

export async function loadAnalyticsData() {
    if (!document.getElementById('quarterly-history-table')) return;

    if (!state.currentClusterId) return;

    try {
        const dashboardData = await fetchDashboard(state.currentClusterId);
        renderQuarterlyHistory(dashboardData);
    } catch (e) {
        console.error("Failed to load analytics data", e);
    }
}

function renderQuarterlyHistory(data) {
    const tbody = document.getElementById('quarterly-history-tbody');
    if (!tbody) return;

    if (!data.sales_reps || data.sales_reps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading">No sales reps found</td></tr>';
        return;
    }

    const totals = {
        last_year_exit: 0, q1_exit: 0, q2_exit: 0, q3_estimated: 0, q4_exit: 0
    };
    const avgQ1QoQ = data.sales_reps.reduce((sum, r) => sum + (r.q1_qoq_pct || 0), 0) / data.sales_reps.length;
    const avgQ2QoQ = data.sales_reps.reduce((sum, r) => sum + (r.q2_qoq_pct || 0), 0) / data.sales_reps.length;
    const avgQ3QoQ = data.sales_reps.reduce((sum, r) => sum + (r.q3_qoq_pct || 0), 0) / data.sales_reps.length;
    const avgQ4QoQ = data.sales_reps.reduce((sum, r) => sum + (r.q4_qoq_pct || 0), 0) / data.sales_reps.length;

    data.sales_reps.forEach(rep => {
        totals.last_year_exit += rep.last_year_exit || 0;
        totals.q1_exit += rep.q1_exit || 0;
        totals.q2_exit += rep.q2_exit || 0;
        totals.q3_estimated += rep.q3_estimated || 0;
        totals.q4_exit += rep.q4_exit || 0;
    });

    tbody.innerHTML = data.sales_reps.map(rep => `
        <tr>
            <td class="fixed-col">${rep.name}</td>
            <td>${formatCurrency(rep.last_year_exit)}</td>
            <td>${formatCurrency(rep.q1_exit)}</td>
            <td class="${getPercentColorClass(rep.q1_qoq_pct)}">${formatPercent(rep.q1_qoq_pct)}</td>
            <td>${formatCurrency(rep.q2_exit)}</td>
            <td class="${getPercentColorClass(rep.q2_qoq_pct)}">${formatPercent(rep.q2_qoq_pct)}</td>
            <td>${formatCurrency(rep.q3_estimated)}</td>
            <td class="${getPercentColorClass(rep.q3_qoq_pct)}">${formatPercent(rep.q3_qoq_pct)}</td>
            <td>${formatCurrency(rep.q4_exit)}</td>
            <td class="${getPercentColorClass(rep.q4_qoq_pct)}">${formatPercent(rep.q4_qoq_pct)}</td>
        </tr>
    `).join('') + `
        <tr class="totals-row">
            <td class="fixed-col"><strong>TOTAL</strong></td>
            <td><strong>${formatCurrency(totals.last_year_exit)}</strong></td>
            <td><strong>${formatCurrency(totals.q1_exit)}</strong></td>
            <td class="${getPercentColorClass(avgQ1QoQ)}"><strong>${formatPercent(avgQ1QoQ)}</strong></td>
            <td><strong>${formatCurrency(totals.q2_exit)}</strong></td>
            <td class="${getPercentColorClass(avgQ2QoQ)}"><strong>${formatPercent(avgQ2QoQ)}</strong></td>
            <td><strong>${formatCurrency(totals.q3_estimated)}</strong></td>
            <td class="${getPercentColorClass(avgQ3QoQ)}"><strong>${formatPercent(avgQ3QoQ)}</strong></td>
            <td><strong>${formatCurrency(totals.q4_exit)}</strong></td>
            <td class="${getPercentColorClass(avgQ4QoQ)}"><strong>${formatPercent(avgQ4QoQ)}</strong></td>
        </tr>
    `;
}
