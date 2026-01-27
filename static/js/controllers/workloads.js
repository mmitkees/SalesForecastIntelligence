/**
 * Workloads Controller.
 * Manages the "Workloads" view, including deal CRUD, bulk Excel uploads, 
 * inline editing, and Excel exports.
 */
import { fetchWorkloads, fetchSalesReps, updateWorkload, deleteWorkload, createWorkload } from '../api.js';
import { formatCurrency, deriveQuarter, showAlert, showConfirm } from '../utils.js';
import { state, setState } from '../state.js';

/** @type {number|null} Track the workload ID for the currently open details modal */
let currentDetailsWorkloadId = null;

/**
 * Initializes workload data and filters.
 */
export async function loadWorkloadsData() {
    if (!document.getElementById('workloads-quarters-container')) return;

    if (!state.currentClusterId) {
        setState('workloads', []);
        reRenderWorkloadTables();
        return;
    }

    try {
        const reps = await fetchSalesReps(state.currentClusterId);
        setState('salesReps', reps);
        populateSalesRepDropdown(reps);
        populateAccountManagerFilter(reps);

        // Restore saved filter values from state
        restoreFiltersFromState();

        setupFilterListeners();

        const data = await fetchWorkloads(state.currentClusterId);
        setState('workloads', data);

        reRenderWorkloadTables();
    } catch (e) {
        console.error("Failed to load workloads", e);
    }
}

/**
 * Orchestrates the rendering of all quarterly workload tables.
 * Handles quarterly tabs and data distribution.
 */
export function reRenderWorkloadTables() {
    const container = document.getElementById('workloads-quarters-container');
    if (!container) return;

    const workloads = state.workloads || [];

    // Ensure metadata consistency
    workloads.forEach(w => {
        if (!w.quarter && w.consumption_start_date) {
            w.quarter = deriveQuarter(w.consumption_start_date);
        }
        if (!w.quarter) w.quarter = 'Q3';
    });

    // Determine current quarter for default tab
    const month = new Date().getMonth() + 1;
    let currentQuarter = 'Q3';
    if (month >= 6 && month <= 8) currentQuarter = 'Q1';
    else if (month >= 9 && month <= 11) currentQuarter = 'Q2';
    else if (month === 12 || month <= 2) currentQuarter = 'Q3';
    else if (month >= 3 && month <= 5) currentQuarter = 'Q4';

    const clusterKey = `workloads_active_tab_${state.currentClusterId}`;
    const savedTab = state[clusterKey] || currentQuarter;
    state.activeWorkloadTab = savedTab;

    const allQuarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const quarterConfigs = {
        'Q1': { title: 'Q1 (Jun - Jul - Aug)', months: ['Jun', 'Jul', 'Aug'] },
        'Q2': { title: 'Q2 (Sep - Oct - Nov)', months: ['Sep', 'Oct', 'Nov'] },
        'Q3': { title: 'Q3 (Dec - Jan - Feb)', months: ['Dec', 'Jan', 'Feb'] },
        'Q4': { title: 'Q4 (Mar - Apr - May)', months: ['Mar', 'Apr', 'May'] }
    };

    const quarterContent = {};
    allQuarters.forEach(q => {
        const config = quarterConfigs[q];
        quarterContent[q] = renderQuarterSection(q, config.title, config.months);
    });

    container.innerHTML = `
        <div class="quarter-tabs-container">
            <div class="quarter-tabs">
                ${allQuarters.map(q => `
                    <button class="quarter-tab ${state.activeWorkloadTab === q ? 'active' : ''}" onclick="switchWorkloadTab('${q}')">${q}</button>
                `).join('')}
            </div>
            ${allQuarters.map(q => `
                <div class="quarter-tab-content ${state.activeWorkloadTab === q ? 'active' : ''}" id="${q.toLowerCase()}-tab-content">
                    ${quarterContent[q]}
                </div>
            `).join('')}
        </div>
    `;

    // 2. Populate rows
    allQuarters.forEach(q => {
        const tbodyId = `workloads-tbody-${q.toLowerCase()}`;
        const data = workloads.filter(w => w.quarter === q);
        renderWorkloadTable(data, tbodyId, q);
    });
}

/**
 * Generates the HTML shell for a quarterly section (Tabbed style).
 */
function renderQuarterSection(quarter, title, months) {
    const qLower = quarter.toLowerCase();
    return `
    <div class="quarter-section-tabbed" id="${qLower}-section">
        <div class="quarter-header-tabbed">
            <h3>${title}</h3>
            <div class="header-info" style="display: flex; gap: 15px; align-items: center;">
                <span class="workload-count" id="${qLower}-count">0 workloads</span>
                <span id="${qLower}-sum-won" style="font-weight: bold; color: #10b981;">WON: $0</span>
                <span id="${qLower}-sum-forecast" style="font-weight: bold; color: #3b82f6;">FCT: $0</span>
                <span id="${qLower}-sum-upside" style="font-weight: bold; color: #a855f7;">UPS: $0</span>
                <button class="export-btn" onclick="exportQuarterWorkloadToExcel('${quarter}', event)">📥 Export</button>
            </div>
        </div>
        <div class="table-container">
            <table class="data-table workloads-table" id="workloads-table-${qLower}">
                <thead>
                    <tr>
                        <th class="sortable" data-sort="forecast">Forecast ↕</th>
                        <th class="sortable" data-sort="account">Account ↕</th>
                        <th class="sortable" data-sort="sales_rep">Rep ↕</th>
                        <th class="sortable" data-sort="country">Country ↕</th>
                        <th class="sortable" data-sort="type">Type ↕</th>
                        <th class="sortable" data-sort="workload">Workload ↕</th>
                        <th class="sortable" data-sort="opt_id">Opt-ID ↕</th>
                        <th class="sortable" data-sort="start_date">Start ↕</th>
                        <th class="month-col">${months[0]}</th>
                        <th class="month-col">${months[1]}</th>
                        <th class="month-col">${months[2]}</th>
                        <th class="sortable total-col" data-sort="total">Total ↕</th>
                        <th class="icon-col">💬</th>
                        <th class="icon-col"></th>
                    </tr>
                </thead>
                <tbody id="workloads-tbody-${qLower}">
                    <tr>
                        <td colspan="14" class="loading">Loading ${quarter} data...</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>`;
}

/**
 * Renders the rows for a specific quarterly workload table.
 * Includes filtering and multi-field sorting.
 */
function renderWorkloadTable(data, tbodyId, quarter) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return 0;

    const filtered = getFilteredWorkloads(data);

    // Sorting Logic
    filtered.sort((a, b) => {
        let valA, valB;
        const currentSort = state.currentSort;
        switch (currentSort.field) {
            case 'account': valA = a.account_name || ''; valB = b.account_name || ''; break;
            case 'sales_rep': valA = a.sales_rep_name || ''; valB = b.sales_rep_name || ''; break;
            case 'country': valA = a.country || ''; valB = b.country || ''; break;
            case 'forecast': valA = a.forecast_type; valB = b.forecast_type; break;
            case 'type': valA = a.customer_type || ''; valB = b.customer_type || ''; break;
            case 'workload': valA = a.workload_type || ''; valB = b.workload_type || ''; break;
            case 'opt_id': valA = a.opt_id || ''; valB = b.opt_id || ''; break;
            case 'start_date': valA = a.consumption_start_date || ''; valB = b.consumption_start_date || ''; break;
            case 'total': valA = a.total_amount; valB = b.total_amount; break;
            default: valA = a.id; valB = b.id;
        }

        if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    updateQuarterStats(quarter);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="loading">No workloads found for ${quarter}</td></tr>`;
        return 0;
    }

    tbody.innerHTML = filtered.map(w => `
        <tr data-id="${w.id}">
            <td>
                <select class="inline-select forecast-select ${w.forecast_type.toLowerCase()}" onchange="handleInlineEdit(${w.id}, 'forecast_type', this.value)">
                    <option value="Forecast" ${w.forecast_type === 'Forecast' ? 'selected' : ''}>Forecast</option>
                    <option value="Upside" ${w.forecast_type === 'Upside' ? 'selected' : ''}>Upside</option>
                    <option value="Won" ${w.forecast_type === 'Won' ? 'selected' : ''}>Won</option>
                </select>
            </td>
            <td>
                <input type="text" class="inline-input account-input" value="${w.account_name || ''}" 
                       onchange="handleInlineEdit(${w.id}, 'account_name', this.value)">
            </td>
            <td>
                <span class="sales-rep-name">${w.sales_rep_name || 'N/A'}</span>
            </td>
            <td>
                <input type="text" class="inline-input country-input" style="text-align: center; min-width: 40px;" 
                       value="${w.country || ''}" placeholder="AE"
                       onchange="handleInlineEdit(${w.id}, 'country', this.value)">
            </td>
            <td>
                <select class="inline-select customer-select" onchange="handleInlineEdit(${w.id}, 'customer_type', this.value)">
                    <option value="Existing Customer" ${w.customer_type === 'Existing Customer' ? 'selected' : ''}>Existing Customer</option>
                    <option value="New Logo" ${w.customer_type === 'New Logo' ? 'selected' : ''}>New Logo</option>
                </select>
            </td>
            <td>
                <select class="inline-select workload-select" onchange="handleInlineEdit(${w.id}, 'workload_type', this.value)">
                    <option value="Non-Reportable WL" ${w.workload_type === 'Non-Reportable WL' ? 'selected' : ''}>Non-Reportable WL</option>
                    <option value="Temp/Forfieted" ${w.workload_type === 'Temp/Forfieted' ? 'selected' : ''}>Temp/Forfieted</option>
                    <option value="Sticky New WL" ${w.workload_type === 'Sticky New WL' ? 'selected' : ''}>Sticky New WL</option>
                    <option value="Resources expansion" ${w.workload_type === 'Resources expansion' ? 'selected' : ''}>Resources expansion</option>
                </select>
            </td>
            <td>
                <input type="text" class="inline-input opt-id-input" value="${w.opt_id || ''}" 
                       placeholder="Opt ID" style="text-align: center; min-width: 60px;"
                       onchange="handleInlineEdit(${w.id}, 'opt_id', this.value)">
            </td>
            <td>
                <input type="date" class="inline-date-input" value="${(w.consumption_start_date && w.consumption_start_date !== 'NaT') ? w.consumption_start_date : ''}" 
                       onchange="handleInlineEdit(${w.id}, 'consumption_start_date', this.value)">
            </td>
            
            <td><input type="number" class="inline-input" value="${w.month_1_amt}" onchange="handleInlineEdit(${w.id}, 'month_1_amt', this.value)"></td>
            <td><input type="number" class="inline-input" value="${w.month_2_amt}" onchange="handleInlineEdit(${w.id}, 'month_2_amt', this.value)"></td>
            <td><input type="number" class="inline-input" value="${w.month_3_amt}" onchange="handleInlineEdit(${w.id}, 'month_3_amt', this.value)"></td>
            
            <td class="total-col"><strong>${formatCurrency(w.total_amount)}</strong></td>
            
            <td>
                <button class="comment-icon-btn ${w.workload_details ? 'has-comment' : ''}" 
                        onclick="openWorkloadDetailsModal(${w.id}, '${w.account_name}')" 
                        title="${w.workload_details || 'Add details'}">
                    💬
                </button>
            </td>
            
            <td>
                <button class="action-btn delete" onclick="removeWorkload(${w.id})" title="Delete Workload">✖</button>
            </td>
        </tr>
    `).join('');

    return filtered.length;
}

/**
 * Populates the 'Add Workload' rep dropdown.
 */
function populateSalesRepDropdown(reps) {
    const select = document.getElementById('wl-sales-rep');
    if (select) {
        // Filter out admins - only regular sales reps should be assigned workloads
        const salesRepsOnly = reps.filter(r => !r.role || r.role === 'user');
        select.innerHTML = '<option value="">Select Sales Rep</option>' +
            salesRepsOnly.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
}

/**
 * Populates the global account manager filter.
 */
function populateAccountManagerFilter(reps) {
    const filter = document.getElementById('filter-account-manager');
    if (!filter) return;

    // Filter out admins - only show regular sales reps
    const salesRepsOnly = reps.filter(r => !r.role || r.role === 'user');
    const currentVal = filter.value;
    filter.innerHTML = '<option value="">All Account Managers</option>' +
        salesRepsOnly.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    filter.value = currentVal;
}

/**
 * Handles bulk Excel upload of workloads.
 */
export async function uploadExcel(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('cluster_id', state.currentClusterId);

    try {
        const btn = document.getElementById('upload-excel-btn');
        if (btn) {
            btn.textContent = '⏳ Uploading...';
            btn.disabled = true;
        }

        const response = await fetch('/api/workloads/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Upload failed');
        }

        const result = await response.json();
        await showAlert('Success', result.message);
        await loadWorkloadsData();
    } catch (e) {
        console.error("Excel upload failed", e);
        await showAlert('Upload Failed', e.message);
    } finally {
        const btn = document.getElementById('upload-excel-btn');
        if (btn) {
            btn.textContent = '📤 Upload Excel';
            btn.disabled = false;
        }
    }
}

/**
 * Opens the 'Add Workload' modal and resets its state.
 */
export function openModal(title = 'Add Workload') {
    const modal = document.getElementById('workload-modal');
    if (!modal) return;

    document.getElementById('modal-title').textContent = title;
    modal.classList.add('active');

    // Reset labels
    document.getElementById('lbl-month-1').textContent = 'Month 1 ($)';
    document.getElementById('lbl-month-2').textContent = 'Month 2 ($)';
    document.getElementById('lbl-month-3').textContent = 'Month 3 ($)';
}

/**
 * Closes the 'Add Workload' modal.
 */
export function closeModal() {
    const modal = document.getElementById('workload-modal');
    if (!modal) return;

    modal.classList.remove('active');
    document.getElementById('workload-form').reset();
    document.getElementById('workload-id').value = '';

    // Reset labels
    document.getElementById('lbl-month-1').textContent = 'Month 1 ($)';
    document.getElementById('lbl-month-2').textContent = 'Month 2 ($)';
    document.getElementById('lbl-month-3').textContent = 'Month 3 ($)';
}

/**
 * Handles 'Add Workload' form submission.
 */
export async function handleFormSubmit(e) {
    e.preventDefault();

    const workloadId = document.getElementById('workload-id').value;
    const data = {
        sales_rep_id: parseInt(document.getElementById('wl-sales-rep').value),
        account_name: document.getElementById('wl-account').value,
        country: document.getElementById('wl-country').value,
        opt_id: document.getElementById('wl-opt-id').value,
        forecast_type: document.getElementById('wl-forecast-type').value,
        customer_type: document.getElementById('wl-customer-type').value,
        workload_type: document.getElementById('wl-workload-type').value,
        workload_details: document.getElementById('wl-comments').value,
        consumption_start_date: document.getElementById('wl-start-date').value,
        month_1_amt: parseFloat(document.getElementById('wl-month-1').value) || 0,
        month_2_amt: parseFloat(document.getElementById('wl-month-2').value) || 0,
        month_3_amt: parseFloat(document.getElementById('wl-month-3').value) || 0
    };

    if (workloadId) {
        await updateWorkload(workloadId, data);
    } else {
        await createWorkload(data);
    }

    closeModal();
    await loadWorkloadsData();
}

/**
 * Filters the workload list based on active UI filters.
 */
function getFilteredWorkloads(data) {
    let filtered = data;
    const amFilter = document.getElementById('filter-account-manager');
    const forecastFilter = document.getElementById('filter-forecast-type');
    const customerFilter = document.getElementById('filter-customer-type');
    const workloadTypeFilter = document.getElementById('filter-workload-type');

    if (amFilter && amFilter.value) {
        filtered = filtered.filter(w => w.sales_rep_id === parseInt(amFilter.value));
    }
    if (forecastFilter && forecastFilter.value) {
        filtered = filtered.filter(w => w.forecast_type === forecastFilter.value);
    }
    if (customerFilter && customerFilter.value) {
        filtered = filtered.filter(w => w.customer_type && w.customer_type.toLowerCase().includes(customerFilter.value.toLowerCase()));
    }
    if (workloadTypeFilter && workloadTypeFilter.value) {
        filtered = filtered.filter(w => w.workload_type && w.workload_type.toLowerCase().includes(workloadTypeFilter.value.toLowerCase()));
    }
    return filtered;
}

/**
 * Updates the summary statistics (WON, FCT, UPS) in the quarter headers.
 */
function updateQuarterStats(quarter) {
    const qLower = quarter.toLowerCase();
    const data = state.workloads.filter(w => w.quarter === quarter);
    const filtered = getFilteredWorkloads(data);

    const countSpan = document.getElementById(`${qLower}-count`);
    const fctSpan = document.getElementById(`${qLower}-sum-forecast`);
    const upsSpan = document.getElementById(`${qLower}-sum-upside`);
    const wonSpan = document.getElementById(`${qLower}-sum-won`);

    if (countSpan) countSpan.textContent = `${filtered.length} workloads`;

    if (fctSpan || upsSpan || wonSpan) {
        const sums = { Forecast: 0, Upside: 0, Won: 0 };
        filtered.forEach(w => {
            const type = (w.forecast_type || 'Forecast');
            if (sums[type] !== undefined) {
                sums[type] += (w.total_amount || 0);
            } else {
                sums.Forecast += (w.total_amount || 0);
            }
        });

        if (fctSpan) fctSpan.textContent = `FCT: ${formatCurrency(sums.Forecast)}`;
        if (upsSpan) upsSpan.textContent = `UPS: ${formatCurrency(sums.Upside)}`;
        if (wonSpan) wonSpan.textContent = `WON: ${formatCurrency(sums.Won)}`;
    }
}

/**
 * Handles real-time inline editing for workload table cells.
 * Triggers API updates and local state synchronization.
 */
window.handleInlineEdit = async function (id, field, value) {
    const workload = state.workloads.find(w => w.id === id);
    if (!workload) return;

    // Numerical conditioning
    if (['month_1_amt', 'month_2_amt', 'month_3_amt'].includes(field)) {
        value = parseFloat(value) || 0;
    }

    workload[field] = value;

    let shouldUpdateStats = false;
    if (field.includes('amt')) {
        workload.total_amount = workload.month_1_amt + workload.month_2_amt + workload.month_3_amt;
        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            row.querySelector('.total-col strong').textContent = formatCurrency(workload.total_amount);
        }
        shouldUpdateStats = true;
    }

    if (field === 'forecast_type') {
        const select = document.querySelector(`tr[data-id="${id}"] .forecast-select`);
        if (select) {
            select.className = `inline-select forecast-select ${value.toLowerCase()}`;
        }
        shouldUpdateStats = true;
    }

    // Quarter recalibration
    if (field === 'consumption_start_date') {
        const newQuarter = deriveQuarter(value);
        if (workload.quarter !== newQuarter) {
            workload.quarter = newQuarter;
            reRenderWorkloadTables();
            // Still perform API call
        }
    }

    if (shouldUpdateStats) {
        updateQuarterStats(workload.quarter);
    }

    try {
        await updateWorkload(id, { [field]: value });
    } catch (e) {
        console.error("Failed to save edit", e);
    }
};

/**
 * Deletes a workload.
 */
window.removeWorkload = async function (id) {
    const ok = await showConfirm('Delete Workload', 'Are you sure you want to delete this workload?');
    if (ok) {
        await deleteWorkload(id);
        await loadWorkloadsData();
    }
};

/**
 * Opens the workload details modal.
 */
window.openWorkloadDetailsModal = function (workloadId, accountName) {
    currentDetailsWorkloadId = workloadId;
    const workload = state.workloads.find(w => w.id === workloadId);

    const modal = document.getElementById('comments-modal');
    const title = document.getElementById('comments-modal-title');
    const textarea = document.getElementById('comments-modal-text');

    if (modal && title && textarea) {
        title.textContent = `Workload Details - ${accountName}`;
        textarea.value = workload?.workload_details || '';
        modal.classList.add('active');
        textarea.focus();
    }
};

/**
 * Handles switching between quarterly tabs.
 */
window.switchWorkloadTab = function (quarter) {
    const all = ['Q1', 'Q2', 'Q3', 'Q4'];
    const target = quarter.toUpperCase();

    all.forEach(q => {
        const qLower = q.toLowerCase();
        const tab = document.querySelector(`.quarter-tab[onclick="switchWorkloadTab('${q}')"]`);
        const content = document.getElementById(`${qLower}-tab-content`);
        if (tab) tab.classList.toggle('active', q === target);
        if (content) content.classList.toggle('active', q === target);
    });

    state.activeWorkloadTab = target;
    const clusterKey = `workloads_active_tab_${state.currentClusterId}`;
    setState(clusterKey, target);
};

/**
 * Exports the visible data for a specific quarter to Excel.
 */
window.exportQuarterWorkloadToExcel = function (quarter, event) {
    if (event) event.stopPropagation();

    const workloads = state.workloads;
    const quarterData = workloads.filter(w => w.quarter === quarter);

    if (quarterData.length === 0) {
        showAlert('No data', `No workloads found for ${quarter} to export.`);
        return;
    }

    const data = quarterData.map(w => ({
        'Forecast': w.forecast_type,
        'Account': w.account_name,
        'Rep': w.sales_rep_name,
        'Country': w.country,
        'Type': w.customer_type,
        'Workload': w.workload_type,
        'Opt-ID': w.opt_id,
        'Start': w.consumption_start_date,
        'Month 1': w.month_1_amt,
        'Month 2': w.month_2_amt,
        'Month 3': w.month_3_amt,
        'Total': w.total_amount,
        'Workload Details': w.workload_details
    }));

    // Get cluster name from dropdown
    const clusterSelect = document.getElementById('cluster-select');
    const clusterName = clusterSelect?.options[clusterSelect.selectedIndex]?.text || 'Cluster';

    // Format short date as YYYYMMDD
    const now = new Date();
    const shortDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, `${quarter} Workloads`);
    XLSX.writeFile(wb, `${clusterName}-${quarter}-Workloads-${shortDate}.xlsx`);
};

/**
 * Handles table sorting logic.
 */
export async function handleSort(field) {
    if (state.currentSort.field === field) {
        state.currentSort.order = state.currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        state.currentSort.field = field;
        state.currentSort.order = 'asc';
    }
    reRenderWorkloadTables();
}

/**
 * Resets sorting and triggers a re-render when a new AM filter is selected.
 */
export function handleAccountManagerFilterChange() {
    state.currentSort.field = 'forecast';
    state.currentSort.order = 'asc';

    const amFilter = document.getElementById('filter-account-manager');
    if (amFilter && amFilter.value === '') {
        ['filter-forecast-type', 'filter-customer-type', 'filter-workload-type'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    reRenderWorkloadTables();
}

// Global UI Navigation delegation
document.addEventListener('click', (e) => {
    if (e.target.id === 'close-comments-modal' || e.target.id === 'cancel-comments-modal') {
        const modal = document.getElementById('comments-modal');
        if (modal) modal.classList.remove('active');
        currentDetailsWorkloadId = null;
    }
    if (e.target.id === 'save-comments-modal') {
        saveWorkloadDetails();
    }
    if (e.target.id === 'comments-modal') {
        const modal = document.getElementById('comments-modal');
        if (modal) modal.classList.remove('active');
        currentDetailsWorkloadId = null;
    }
});

/**
 * Saves workload details from the modal.
 */
async function saveWorkloadDetails() {
    if (!currentDetailsWorkloadId) return;
    const textarea = document.getElementById('comments-modal-text');
    const details = textarea.value;
    await window.handleInlineEdit(currentDetailsWorkloadId, 'workload_details', details);

    const modal = document.getElementById('comments-modal');
    if (modal) modal.classList.remove('active');
    currentDetailsWorkloadId = null;
}

/**
 * Binds DOM event listeners to the side/top filter elements.
 */
function setupFilterListeners() {
    ['filter-forecast-type', 'filter-customer-type', 'filter-workload-type'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.onchange = () => {
                saveFiltersToState();
                reRenderWorkloadTables();
            };
        }
    });

    const amFilter = document.getElementById('filter-account-manager');
    if (amFilter) {
        amFilter.onchange = () => {
            saveFiltersToState();
            handleAccountManagerFilterChange();
        };
    }
}

/**
 * Saves current filter values to global state for persistence.
 */
function saveFiltersToState() {
    state.workloadsFilter = {
        accountManager: document.getElementById('filter-account-manager')?.value || '',
        forecastType: document.getElementById('filter-forecast-type')?.value || '',
        customerType: document.getElementById('filter-customer-type')?.value || '',
        workloadType: document.getElementById('filter-workload-type')?.value || ''
    };
}

/**
 * Restores filter values from global state after page navigation.
 */
function restoreFiltersFromState() {
    const filters = state.workloadsFilter;
    if (!filters) return;

    const amFilter = document.getElementById('filter-account-manager');
    const forecastFilter = document.getElementById('filter-forecast-type');
    const customerFilter = document.getElementById('filter-customer-type');
    const workloadFilter = document.getElementById('filter-workload-type');

    if (amFilter && filters.accountManager) amFilter.value = filters.accountManager;
    if (forecastFilter && filters.forecastType) forecastFilter.value = filters.forecastType;
    if (customerFilter && filters.customerType) customerFilter.value = filters.customerType;
    if (workloadFilter && filters.workloadType) workloadFilter.value = filters.workloadType;
}
