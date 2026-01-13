import { fetchWorkloads, fetchSalesReps, updateWorkload, deleteWorkload, createWorkload } from '../api.js';
import { formatCurrency, deriveQuarter, showAlert, showConfirm } from '../utils.js';
import { state, setState } from '../state.js';

// Comments state
let currentCommentsWorkloadId = null;

export async function loadWorkloadsData() {
    if (!document.getElementById('workloads-quarters-container')) return;

    if (!state.currentClusterId) return;

    try {
        const reps = await fetchSalesReps(state.currentClusterId);
        setState('salesReps', reps);
        populateSalesRepDropdown(reps);

        populateAccountManagerFilter(reps);
        setupFilterListeners(); // Bind listeners to filters

        const data = await fetchWorkloads(state.currentClusterId);
        setState('workloads', data);

        reRenderWorkloadTables();
    } catch (e) {
        console.error("Failed to load workloads", e);
    }
}

export function reRenderWorkloadTables() {
    const container = document.getElementById('workloads-quarters-container');
    if (!container) return; // Should exist

    const workloads = state.workloads;

    // Ensure every workload has a quarter
    workloads.forEach(w => {
        if (!w.quarter && w.consumption_start_date) {
            w.quarter = deriveQuarter(w.consumption_start_date);
        }
        if (!w.quarter) w.quarter = 'Q3'; // Fallback
    });

    // Determine Rolling Order (Current -> Next -> Prev)
    const month = new Date().getMonth() + 1;
    let currentQuarter = 'Q3';
    if (month >= 6 && month <= 8) currentQuarter = 'Q1';
    else if (month >= 9 && month <= 11) currentQuarter = 'Q2';
    else if (month === 12 || month <= 2) currentQuarter = 'Q3';
    else if (month >= 3 && month <= 5) currentQuarter = 'Q4';

    const allQuarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const idx = allQuarters.indexOf(currentQuarter);
    const displayOrder = [...allQuarters.slice(idx), ...allQuarters.slice(0, idx)];

    // Generate Titles and Months
    const quarterConfigs = {
        'Q1': { title: 'Q1 (Jun - Jul - Aug)', months: ['Jun', 'Jul', 'Aug'] },
        'Q2': { title: 'Q2 (Sep - Oct - Nov)', months: ['Sep', 'Oct', 'Nov'] },
        'Q3': { title: 'Q3 (Dec - Jan - Feb)', months: ['Dec', 'Jan', 'Feb'] },
        'Q4': { title: 'Q4 (Mar - Apr - May)', months: ['Mar', 'Apr', 'May'] }
    };

    // 1. Generate Structure
    container.innerHTML = displayOrder.map(q => {
        const config = quarterConfigs[q];
        return renderQuarterSection(q, config.title, config.months);
    }).join('');

    // 2. Populate Data (using existing renderWorkloadTable)
    displayOrder.forEach(q => {
        const tbodyId = `workloads-tbody-${q.toLowerCase()}`;
        const data = workloads.filter(w => w.quarter === q);
        renderWorkloadTable(data, tbodyId, q);
    });

    // 3. Expand Current Quarter (collapse others)
    displayOrder.forEach(q => {
        const qLower = q.toLowerCase();
        const content = document.getElementById(`${qLower}-content`);
        const icon = document.getElementById(`${qLower}-icon`);
        const header = document.querySelector(`#${qLower}-section`);

        if (q === currentQuarter) {
            if (content) content.style.display = 'block';
            if (icon) icon.textContent = '▼';
            if (header) header.classList.remove('collapsed');
        } else {
            if (content) content.style.display = 'none';
            if (icon) icon.textContent = '▶';
            if (header) header.classList.add('collapsed');
        }
    });

    // 4. Dynamic Export Buttons
    // Export function is generic and accepts the quarter ID from the button click.
}

function renderQuarterSection(quarter, title, months) {
    const qLower = quarter.toLowerCase();
    return `
    <div class="quarter-section collapsible" id="${qLower}-section">
        <div class="quarter-header" onclick="toggleQuarterSection('${qLower}')">
            <h3>
                <span class="collapse-icon" id="${qLower}-icon">▼</span>
                ${title}
            </h3>
            <div class="header-info" style="display: flex; gap: 15px; align-items: center;">
                <span class="workload-count" id="${qLower}-count">0 workloads</span>
                <span id="${qLower}-sum-won" style="font-weight: bold; color: #10b981;">WON: $0</span>
                <span id="${qLower}-sum-forecast" style="font-weight: bold; color: #3b82f6;">FCT: $0</span>
                <span id="${qLower}-sum-upside" style="font-weight: bold; color: #a855f7;">UPS: $0</span>
                <button class="export-btn" onclick="exportToExcel('${quarter}', event)">📥 Export</button>
            </div>
        </div>
        <div class="quarter-content" id="${qLower}-content">
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
        </div>
    </div>`;
}

function renderWorkloadTable(data, tbodyId, quarter) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return 0;

    // Use unified filter helper
    const filtered = getFilteredWorkloads(data);

    // Apply Sorting
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

    // Update count and breakdowns in header via helper
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
                <button class="comment-icon-btn ${w.comments ? 'has-comment' : ''}" 
                        onclick="openCommentsModal(${w.id}, '${w.account_name}')" 
                        title="${w.comments || 'Add comment'}">
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

function populateSalesRepDropdown(reps) {
    const select = document.getElementById('wl-sales-rep');
    if (select) {
        select.innerHTML = '<option value="">Select Sales Rep</option>' +
            reps.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
}

function populateAccountManagerFilter(reps) {
    const filter = document.getElementById('filter-account-manager');
    if (!filter) return;

    const currentVal = filter.value;
    filter.innerHTML = '<option value="">All Account Managers</option>' +
        reps.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    filter.value = currentVal;
}

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

// Modal & Form Handlers
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
        comments: document.getElementById('wl-comments').value,
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
    // Refresh only if current view is workloads. If dashboard, main loop handles it.
    // Actually we should refresh the current view data.
    // If in workloads view:
    await loadWorkloadsData();
}

// Helper to get filtered data for stats
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

// Exposed Global Functions
window.handleInlineEdit = async function (id, field, value) {
    // Optimistic UI update
    const workload = state.workloads.find(w => w.id === id);
    if (!workload) return;

    // Type coercion
    if (['month_1_amt', 'month_2_amt', 'month_3_amt'].includes(field)) {
        value = parseFloat(value) || 0;
    }

    // Update local state
    workload[field] = value;

    // Recalculate total if amount changed
    let shouldUpdateStats = false;
    if (field.includes('amt')) {
        workload.total_amount = workload.month_1_amt + workload.month_2_amt + workload.month_3_amt;
        // Update DOM total immediately
        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            row.querySelector('.total-col strong').textContent = formatCurrency(workload.total_amount);
        }
        shouldUpdateStats = true;
    }

    // Update stats if forecast type changed
    if (field === 'forecast_type') {
        const select = document.querySelector(`tr[data-id="${id}"] .forecast-select`);
        if (select) {
            select.className = `inline-select forecast-select ${value.toLowerCase()}`;
        }
        shouldUpdateStats = true;
    }

    // Recalculate quarter if date changed
    if (field === 'consumption_start_date') {
        const newQuarter = deriveQuarter(value);
        if (workload.quarter !== newQuarter) {
            workload.quarter = newQuarter;
            reRenderWorkloadTables();
            return; // reRender handles stats update
        }
    }

    if (shouldUpdateStats) {
        updateQuarterStats(workload.quarter);
    }

    // Send API request
    try {
        await updateWorkload(id, { [field]: value });
    } catch (e) {
        console.error("Failed to save edit", e);
    }
};

window.removeWorkload = async function (id) {
    const ok = await showConfirm('Delete Workload', 'Are you sure you want to delete this workload?');
    if (ok) {
        await deleteWorkload(id);
        await loadWorkloadsData();
    }
};

window.openCommentsModal = function (workloadId, accountName) {
    currentCommentsWorkloadId = workloadId;
    const workload = state.workloads.find(w => w.id === workloadId);

    const modal = document.getElementById('comments-modal');
    const title = document.getElementById('comments-modal-title');
    const textarea = document.getElementById('comments-modal-text');

    if (modal && title && textarea) {
        title.textContent = `Comments - ${accountName}`;
        textarea.value = workload?.comments || '';
        modal.classList.add('active');
        textarea.focus();
    }
};

window.toggleQuarterSection = function (quarter) {
    const qLower = quarter.toLowerCase();
    const allQuarters = ['q1', 'q2', 'q3', 'q4'];

    // Check current state of target
    const targetContent = document.getElementById(`${qLower}-content`);
    const isCurrentlyOpen = targetContent && targetContent.style.display === 'block';

    // Close ALL sections
    allQuarters.forEach(q => {
        const content = document.getElementById(`${q}-content`);
        const icon = document.getElementById(`${q}-icon`);
        const section = document.getElementById(`${q}-section`);

        if (content) content.style.display = 'none';
        if (icon) icon.textContent = '▶';
        if (section) section.classList.add('collapsed');
    });

    // If it was closed, open it (Accordion behavior)
    if (!isCurrentlyOpen && targetContent) {
        targetContent.style.display = 'block';
        const icon = document.getElementById(`${qLower}-icon`);
        const section = document.getElementById(`${qLower}-section`);
        if (icon) icon.textContent = '▼';
        if (section) section.classList.remove('collapsed');
    }
};

window.exportToExcel = function (quarter, event) {
    if (event) event.stopPropagation();

    // Get data for this quarter
    const workloads = state.workloads;
    const quarterData = workloads.filter(w => w.quarter === quarter);

    if (quarterData.length === 0) {
        showAlert('No data', `No workloads found for ${quarter} to export.`);
        return;
    }

    // Format data for Excel
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
        'Comments': w.comments
    }));

    // Create workbook and worksheet (using global XLSX from CDN)
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, `${quarter} Workloads`);

    // Save to file
    XLSX.writeFile(wb, `Sales_Intel_Workloads_${quarter}.xlsx`);
};

export async function handleSort(field) {
    if (state.currentSort.field === field) {
        state.currentSort.order = state.currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        state.currentSort.field = field;
        state.currentSort.order = 'asc';
    }
    reRenderWorkloadTables();
}

export function handleAccountManagerFilterChange() {
    state.currentSort.field = 'forecast';
    state.currentSort.order = 'asc';

    // If 'All Account Managers' selected, clear other filters so "all appears"
    const amFilter = document.getElementById('filter-account-manager');
    if (amFilter && amFilter.value === '') {
        ['filter-forecast-type', 'filter-customer-type', 'filter-workload-type'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    reRenderWorkloadTables();
}

// Setup internal event listeners for comments modal close/save
document.addEventListener('click', (e) => {
    // Check if we are in workloads view implicitly by existence of modal or similar
    if (e.target.id === 'close-comments-modal' || e.target.id === 'cancel-comments-modal') {
        const modal = document.getElementById('comments-modal');
        if (modal) modal.classList.remove('active');
        currentCommentsWorkloadId = null;
    }
    if (e.target.id === 'save-comments-modal') {
        saveComments();
    }
    if (e.target.id === 'comments-modal') {
        const modal = document.getElementById('comments-modal');
        if (modal) modal.classList.remove('active');
        currentCommentsWorkloadId = null;
    }
});

async function saveComments() {
    if (!currentCommentsWorkloadId) return;
    const textarea = document.getElementById('comments-modal-text');
    const comments = textarea.value;
    await window.handleInlineEdit(currentCommentsWorkloadId, 'comments', comments);

    const modal = document.getElementById('comments-modal');
    if (modal) modal.classList.remove('active');
    currentCommentsWorkloadId = null;
}

function setupFilterListeners() {
    ['filter-forecast-type', 'filter-customer-type', 'filter-workload-type'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.onchange = () => reRenderWorkloadTables();
        }
    });

    // Also Account Manager if not already handled via HTML attribute
    const amFilter = document.getElementById('filter-account-manager');
    if (amFilter) {
        amFilter.onchange = handleAccountManagerFilterChange;
    }
}
