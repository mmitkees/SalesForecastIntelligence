/**
 * SalesApp Main Entry Point.
 * Handles primary application state management, UI routing, and global event delegation.
 */
import { fetchClusters, createCluster, fetchFiscalYears, getCurrentUser, logout, createRegion } from './api.js';
import { loadDashboardData } from './controllers/dashboard.js';
import { loadWorkloadsData, handleSort, openModal, closeModal, handleFormSubmit, uploadExcel } from './controllers/workloads.js';
import { loadAdminData } from './controllers/admin.js';
import { loadAnalyticsData } from './controllers/analytics.js';
import { state, setState } from './state.js';
import { showAlert, showConfirm } from './utils.js';

// --- Shared DOM Elements ---
const clusterSelect = document.getElementById('cluster-select');
const fiscalYearSelect = document.getElementById('fiscal-year-select');
const navItems = document.querySelectorAll('.nav-item');
const viewContainer = document.getElementById('view-container');

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
/**
 * Populates the Cluster dropdown and initializes the view data.
 */
export async function loadClusters() {
    try {
        const clusters = await fetchClusters();
        const user = state.currentUser;

        let filteredClusters = clusters;

        // Role-based filtering
        if (user) {
            if (user.role === 'user') {
                // Regular user: only show their assigned cluster
                filteredClusters = clusters.filter(c => c.id === user.cluster_id);
            } else if (user.role === 'region_admin') {
                // Region Admin: only show clusters in their region
                if (user.region_id) {
                    filteredClusters = clusters.filter(c => c.region_id === user.region_id);
                }
            }
            // System Admin sees all
        }

        if (filteredClusters.length === 0) {
            clusterSelect.innerHTML = '<option value="">No clusters available</option>';
            setState('currentClusterId', null); // Set to null explicitly
            // Proceed to load views even without a cluster
        } else {
            clusterSelect.innerHTML = filteredClusters.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

            // Sync local storage / state with dropdown
            if (state.currentClusterId && filteredClusters.some(c => c.id === state.currentClusterId)) {
                clusterSelect.value = state.currentClusterId;
            } else {
                // Default to first available
                if (filteredClusters.length > 0) {
                    setState('currentClusterId', filteredClusters[0].id);
                    clusterSelect.value = filteredClusters[0].id;
                }
            }
        }

        // Trigger data refresh for the active view
        if (state.currentView === 'dashboard') await loadDashboardData();
        if (state.currentView === 'workloads') await loadWorkloadsData();
        if (state.currentView === 'analytics') await loadAnalyticsData();
        if (state.currentView === 'admin') await loadAdminData();
    } catch (e) {
        console.error("Failed to load clusters", e);
    }
}
// Expose for Admin Controller usage (breaking circular dependency)
window.loadClusters = loadClusters;

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
// --- Global Initialization ---
// --- Global Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication first
    const user = await getCurrentUser();

    if (!user) {
        // Not authenticated - redirect to login
        window.location.href = '/login';
        return;
    }

    // Store current user in state
    setState('currentUser', user);

    // Display user info in the header
    displayUserInfo(user);

    // Restore persistent session state
    const savedView = localStorage.getItem('currentView') || 'dashboard';
    const savedClusterId = localStorage.getItem('currentClusterId');

    // For non-admins, force their assigned cluster
    if (user.role !== 'system_admin' && user.role !== 'region_admin') {
        setState('currentClusterId', user.cluster_id);
    } else if (savedClusterId) {
        setState('currentClusterId', parseInt(savedClusterId));
    }

    // Load Context FIRST (Fiscal Years & Clusters)
    // This ensures state.currentClusterId is validated/set before the view tries to use it
    await loadFiscalYears();
    await loadClusters();

    // Load View LAST
    await loadView(savedView);

    // Hide admin nav for regular users
    updateNavVisibility(user);

    // Display environment badge
    displayEnvironmentBadge();
});

/**
 * Displays user info in the header and sets up logout button.
 */
function displayUserInfo(user) {
    const userInfoContainer = document.getElementById('user-info');
    if (userInfoContainer) {
        // New Header Design: Icon + "Hi [Name]" + Logout Icon
        userInfoContainer.innerHTML = `
            <div class="user-profile" style="display: flex; align-items: center; gap: 8px;">
                <span class="user-icon" style="font-size: 1.2rem;">👤</span>
                <span class="user-name" style="font-weight: 500;">Hi, ${user.name}</span>
                <button id="logout-btn" title="Logout" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; margin-left: 8px;">⏻</button>
            </div>
        `;

        document.getElementById('logout-btn').addEventListener('click', async () => {
            const confirmed = await showConfirm('Logout', 'Are you sure you want to logout?');
            if (confirmed) {
                await logout();
                localStorage.removeItem('currentView'); // Force dashboard on next login
                window.location.href = '/login';
            }
        });
    }
}

/**
 * Updates navigation visibility based on user role.
 */
function updateNavVisibility(user) {
    const adminNav = document.querySelector('[data-view="admin"]');
    const analyticsNav = document.querySelector('[data-view="analytics"]');

    // Admin Page: Only System Admin
    if (adminNav) {
        if (user.role === 'system_admin') {
            adminNav.style.display = 'flex';
        } else {
            adminNav.style.display = 'none';
        }
    }

    // Analytics Page: System Admin and Region Admin
    if (analyticsNav) {
        if (user.role === 'system_admin' || user.role === 'region_admin') {
            analyticsNav.style.display = 'flex';
        } else {
            analyticsNav.style.display = 'none';
        }
    }

    // Hide cluster dropdown only for regular users (not admins)
    // Cluster admins see their cluster, region/system admins see all
    const clusterDropdown = document.getElementById('cluster-select');
    if (user.role === 'user') {
        if (clusterDropdown) clusterDropdown.style.display = 'none';
    } else {
        if (clusterDropdown) clusterDropdown.style.display = 'block';
    }
}

/**
 * Detects the current execution environment and displays a badge.
 */
function displayEnvironmentBadge() {
    const logoContainer = document.querySelector('.logo');
    if (!logoContainer) return;

    const hostname = window.location.hostname;
    // Check for dev IP, localhost, or dev-specific subdomains
    const isDev = hostname === '129.151.152.53' || hostname === 'localhost' || hostname === '127.0.0.1';
    const isProd = hostname === '129.151.159.172' || hostname.includes('salesforecast');

    if (isDev) {
        const badge = document.createElement('span');
        badge.className = 'env-badge';
        badge.textContent = 'DEV';
        badge.title = 'Development Environment';
        logoContainer.appendChild(badge);
    } else if (isProd) {
        // Optional: Show PROD badge or keep it clean
        // For now, let's show a subtle green one as requested to tell them apart
        const badge = document.createElement('span');
        badge.className = 'env-badge env-badge-prod';
        badge.textContent = 'PROD';
        badge.title = 'Production Environment';
        logoContainer.appendChild(badge);
    }
}

// --- Primary Event Listeners ---

// Navigation Clicks
navItems.forEach(item => {
    item.addEventListener('click', () => {
        loadView(item.dataset.view);
    });
});

// ClusterSelection Change
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
    if (target.closest('#add-workload-btn')) {
        openModal();
    }

    // Bulk Deal Upload
    if (target.id === 'upload-excel-btn') {
        document.getElementById('excel-upload').click();
    }

    // Admin: New Cluster Creation
    if (target.id === 'add-cluster-btn') {
        const nameInput = document.getElementById('new-cluster-name');
        const regionSelect = document.getElementById('new-cluster-region');
        const name = nameInput.value.trim();
        const regionId = regionSelect ? regionSelect.value : null;

        if (!name) {
            await showAlert('Missing Information', 'Please enter a cluster name');
            return;
        }
        await createCluster(name, regionId);
        nameInput.value = '';
        if (regionSelect) regionSelect.value = '';
        await loadClusters();
        await loadAdminData();
    }

    // Admin: New Region Creation
    if (target.id === 'add-region-btn') {
        const nameInput = document.getElementById('new-region-name');
        const name = nameInput.value.trim();

        if (!name) {
            await showAlert('Missing Information', 'Please enter a region name');
            return;
        }

        try {
            await createRegion(name);
            nameInput.value = '';
            await loadAdminData(); // Refresh list
        } catch (e) {
            await showAlert('Error', e.message);
        }
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
