import { fetchRegions, fetchRegionAnalytics } from '../api.js';
import { formatCurrency, showAlert } from '../utils.js';
import { state } from '../state.js';

let cachedRegions = null;

export async function loadAnalyticsData() {
    const container = document.getElementById('analytics-table-body');
    if (!container) return; // Not on analytics view

    try {
        // 1. Always populate Dropdown (using cache if available)
        await populateRegionDropdown();

        // 2. Get Selected Region
        const select = document.getElementById('analytics-region-select');
        const regionId = select ? select.value : 'all';

        // 3. Fetch Data
        container.innerHTML = '<tr><td colspan="7" class="loading">Loading data...</td></tr>';

        const data = await fetchRegionAnalytics(regionId) || { aggregates: null, clusters: [] };

        // 4. Render Data
        renderScorecards(data.aggregates);
        renderBreakdownTable(data.clusters);

    } catch (e) {
        console.error("Failed to load analytics", e);
        if (container) {
            container.innerHTML = `<tr><td colspan="7" class="error">Error loading data: ${e.message}</td></tr>`;
        }
        await showAlert('Error', 'Failed to load analytics data');
    }
}

async function populateRegionDropdown() {
    const select = document.getElementById('analytics-region-select');
    if (!select) return;

    try {
        // Fetch if not cached
        if (!cachedRegions) {
            cachedRegions = await fetchRegions();
        }

        const regions = cachedRegions;

        // Role check logic (same as before)
        const user = state.currentUser;
        if (user && user.role === 'region_admin' && user.region_id) {
            // Filter for Region Admin
            const myRegion = regions.find(r => r.id === user.region_id);
            if (myRegion) {
                select.innerHTML = `<option value="${myRegion.id}">${myRegion.name}</option>`;
                return;
            }
        }

        // Sys Admin or default
        // Preserve current selection if possible? 
        // For simplicity, just rebuild. usage pattern implies "loading view" resets usually.
        // But if we want to support "refresh" button without losing selection we should check current value.
        // However, this function is mainly called on load.

        select.innerHTML = '<option value="all">All Regions</option>' +
            regions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    } catch (e) {
        console.error("Failed to load regions list", e);
    }
}

function renderScorecards(stats) {
    if (!stats) return;

    setText('stats-total-exit', formatCurrency(stats.total_q2_exit));
    setText('stats-total-upside', formatCurrency(stats.total_upside));

    setText('stats-new-logo-sum', formatCurrency(stats.new_logo_sum));
    setText('stats-new-logo-count', `(${stats.new_logo_count})`);

    setText('stats-existing-sum', formatCurrency(stats.existing_sum));
    setText('stats-existing-count', `(${stats.existing_count})`);

    setText('stats-non-rep-sum', formatCurrency(stats.non_reportable_sum));
    setText('stats-non-rep-count', `(${stats.non_reportable_count})`);
}

function renderBreakdownTable(clusters) {
    const tbody = document.getElementById('analytics-table-body');
    if (!tbody) return;

    if (!clusters || clusters.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = clusters.map(c => `
        <tr>
            <td>${c.name}</td>
            <td>${formatCurrency(c.total_q2_exit)}</td>
            <td>${formatCurrency(c.total_upside)}</td>
            <td>${formatCurrency(c.new_logo_sum)}</td>
            <td>${c.new_logo_count}</td>
            <td>${formatCurrency(c.existing_sum)}</td>
            <td>${formatCurrency(c.non_reportable_sum)}</td>
        </tr>
    `).join('');
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Event Listeners
document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'analytics-region-select') {
        loadAnalyticsData();
    }
});
