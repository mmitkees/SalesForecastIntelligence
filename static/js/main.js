/**
 * SalesApp Main Entry Point.
 * Handles primary application state management, UI routing, and global event delegation.
 */
import { fetchClusters, seedDatabase, createCluster, fetchFiscalYears } from './api.js';
import { loadDashboardData } from './controllers/dashboard.js';
import { loadWorkloadsData, handleSort, openModal, closeModal, handleFormSubmit, uploadExcel, reRenderWorkloadTables, handleAccountManagerFilterChange } from './controllers/workloads.js';
import { loadAdminData } from './controllers/admin.js';
import { loadAnalyticsData } from './controllers/analytics.js';
import { state, setState } from './state.js';
import { showAlert } from './utils.js';

// --- Shared DOM Elements ---
const clusterSelect = document.getElementById('cluster-select');
const fiscalYearSelect = document.getElementById('fiscal-year-select');
const navItems = document.querySelectorAll('.nav-item');
const seedBtn = document.getElementById('seed-btn');
const viewContainer = document.getElementById('view-container');
const workloadModal = document.getElementById('workload-modal');

/**
 * Populates the Fiscal Year dropdown and handles selection state.
 */
export async function loadFiscalYears() {
    try {
        const fys = await fetchFiscalYears();
        if (fys.length === 0) {
            fiscalYearSelect.innerHTML = '<option value="">No Data</option>';
            return;
        }
        // Build options list
        fiscalYearSelect.innerHTML = fys.map(fy => `<option value="${fy.id}">FY${fy.year}</option>`).join('');

        // Restore selection from state or default to the most recent (first) entry
        if (state.currentFiscalYearId && fys.some(fy => fy.id === state.currentFiscalYearId)) {
            fiscalYearSelect.value = state.currentFiscalYearId;
        } else {
            setState('currentFiscalYearId', fys[0].id);
        }
    } catch (e) {
        console.error("Failed to load fiscal years", e);
    }
}

/**
 * Populates the Cluster dropdown and initializes the view data.
 */
export async function loadClusters() {
    try {
        const clusters = await fetchClusters();
        if (clusters.length === 0) {
            clusterSelect.innerHTML = '<option value="">No clusters - Click Seed</option>';
            return;
        }
        clusterSelect.innerHTML = clusters.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        // Sync local storage / state with dropdown
        if (state.currentClusterId && clusters.some(c => c.id === state.currentClusterId)) {
            clusterSelect.value = state.currentClusterId;
        } else {
            setState('currentClusterId', clusters[0].id);
        }

        // Trigger data refresh for the active view
        if (state.currentView === 'dashboard') await loadDashboardData();
        if (state.currentView === 'workloads') await loadWorkloadsData();
    } catch (e) {
        console.error("Failed to load clusters", e);
    }
}

/**
 * Dynamic View Loader (Routing).
 * Fetches HTML fragments from the server and initializes the corresponding controller.
 * @param {string} viewName - The name of the view (e.g., 'dashboard', 'workloads').
 */
async function loadView(viewName) {
    setState('currentView', viewName);
    localStorage.setItem('currentView', viewName);

    // Update Sidebar/Nav visual state
    navItems.forEach(item => {
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    try {
        // Fetch the HTML template for this view
        const response = await fetch(`/views/${viewName}.html?t=${Date.now()}`);
        if (!response.ok) throw new Error(`Failed to load view: ${viewName}`);

        const html = await response.text();
        viewContainer.innerHTML = html;

        // Controller Initialization
        if (state.currentClusterId || viewName === 'admin') {
            if (viewName === 'dashboard') await loadDashboardData();
            else if (viewName === 'workloads') await loadWorkloadsData();
            else if (viewName === 'analytics') await loadAnalyticsData();
            else if (viewName === 'admin') await loadAdminData();
        }
    } catch (error) {
        console.error(error);
        viewContainer.innerHTML = `<p class="error-message">Error loading page: ${error.message}</p>`;
    }
}

// --- Global Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Restore persistent session state
    const savedView = localStorage.getItem('currentView') || 'dashboard';
    const savedClusterId = localStorage.getItem('currentClusterId');

    if (savedClusterId) {
        setState('currentClusterId', parseInt(savedClusterId));
    }

    // Parallel load of UI framework and data
    await loadView(savedView);
    await loadFiscalYears();
    await loadClusters();
});

// --- Primary Event Listeners ---

// Navigation Clicks
navItems.forEach(item => {
    item.addEventListener('click', () => {
        loadView(item.dataset.view);
    });
});

// Cluster Selection Change
clusterSelect.addEventListener('change', async (e) => {
    const newVal = parseInt(e.target.value);
    setState('currentClusterId', newVal);
    localStorage.setItem('currentClusterId', newVal);
    // Reload whatever view is currently active
    if (state.currentView === 'dashboard') await loadDashboardData();
    if (state.currentView === 'workloads') await loadWorkloadsData();
    if (state.currentView === 'analytics') await loadAnalyticsData();
});

// Fiscal Year Selection Change
fiscalYearSelect.addEventListener('change', async (e) => {
    const newVal = parseInt(e.target.value);
    setState('currentFiscalYearId', newVal);
    if (state.currentView === 'dashboard') await loadDashboardData();
    if (state.currentView === 'analytics') await loadAnalyticsData();
});

// Seed Button (Database Initialization Override)
seedBtn.addEventListener('click', async () => {
    seedBtn.textContent = '⏳';
    await seedDatabase();
    seedBtn.textContent = '✅';
    setTimeout(() => seedBtn.textContent = '🔄', 2000);
    await loadClusters();
    if (state.currentView === 'admin') await loadAdminData();
});

// --- Modal & Global Actions ---
const closeModalBtn = document.getElementById('close-modal');
const cancelModalBtn = document.getElementById('cancel-modal');
const workloadForm = document.getElementById('workload-form');

if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
if (workloadForm) workloadForm.addEventListener('submit', handleFormSubmit);

/**
 * Shared Click Delegation for dynamic elements.
 */
document.addEventListener('click', async (e) => {
    const target = e.target;

    // Table Sorting
    if (target.classList.contains('sortable')) {
        const field = target.dataset.sort;
        handleSort(field);
    }

    // Single Deal Add Modal
    if (target.id === 'add-workload-btn') {
        openModal();
    }

    // Bulk Deal Upload
    if (target.id === 'upload-excel-btn') {
        document.getElementById('excel-upload').click();
    }

    // Admin: New Cluster Creation
    if (target.id === 'add-cluster-btn') {
        const nameInput = document.getElementById('new-cluster-name');
        const name = nameInput.value.trim();
        if (!name) {
            await showAlert('Missing Information', 'Please enter a cluster name');
            return;
        }
        await createCluster(name);
        nameInput.value = '';
        await loadClusters();
        await loadAdminData();
    }

    // Bulk Consumption Upload Modal
    if (target.id === 'upload-data-btn') {
        document.getElementById('upload-modal').classList.add('active');
    }
    if (target.id === 'close-upload-modal' || target.id === 'cancel-upload') {
        document.getElementById('upload-modal').classList.remove('active');
    }
});

/**
 * Bulk Consumption Upload Form Submission.
 * Sends Sales Data (Exits, Rates) to /api/sales_data/upload.
 */
const uploadForm = document.getElementById('upload-form');
if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('upload-file');
        const file = fileInput.files[0];
        if (!file) {
            await showAlert('Error', 'Please select a file');
            return;
        }

        const submitBtn = uploadForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Uploading...';
        submitBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('cluster_id', state.currentClusterId);

            const response = await fetch('/api/sales_data/upload', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (!response.ok) throw new Error(result.error);

            await showAlert('Success', result.message);
            document.getElementById('upload-modal').classList.remove('active');

            // Refresh dashboards to reflect new exit numbers
            if (state.currentView === 'dashboard') await loadDashboardData();

        } catch (error) {
            await showAlert('Upload Failed', error.message);
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

/**
 * Shared Change Delegation for filters and file inputs.
 */
document.addEventListener('change', async (e) => {
    // NOTE: Workload filters (filter-account-manager, filter-forecast-type, etc.)
    // are handled in workloads.js setupFilterListeners() to properly persist state.
    // Do NOT add filter handlers here as they will bypass state saving.

    // Individual Excel upload (Deals)
    if (e.target.id === 'excel-upload') {
        const file = e.target.files[0];
        if (file) {
            await uploadExcel(file);
            e.target.value = ''; // Reset for re-upload
        }
    }


    // Deal Modal: Consumption Start Date Listener.
    // Automatically updates the labels for Month 1, 2, 3 based on the selected date.
    if (e.target.id === 'wl-start-date') {
        const dateVal = e.target.value;
        if (!dateVal) return;
        const month = new Date(dateVal).getUTCMonth() + 1; // 1-indexed
        let labels;

        // Q3 (Dec-Feb) logic
        if (month === 12 || month === 1 || month === 2) {
            labels = ['December ($)', 'January ($)', 'February ($)'];
        }
        // Q4 (Mar-May) logic
        else if (month >= 3 && month <= 5) {
            labels = ['March ($)', 'April ($)', 'May ($)'];
        }
        else {
            labels = ['Month 1 ($)', 'Month 2 ($)', 'Month 3 ($)'];
        }

        const l1 = document.getElementById('lbl-month-1');
        const l2 = document.getElementById('lbl-month-2');
        const l3 = document.getElementById('lbl-month-3');
        if (l1) l1.textContent = labels[0];
        if (l2) l2.textContent = labels[1];
        if (l3) l3.textContent = labels[2];
    }
});
