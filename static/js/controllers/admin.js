/**
 * Admin Controller.
 * Manages the cluster management interface, sales rep CRUD operations, 
 * and bulk workload uploads from the admin panel.
 */
import { fetchClusters, fetchAllSalesReps, createSalesRep, deleteSalesRep, deleteCluster, fetchFiscalYears, fetchRegions, createRegion, deleteRegion } from '../api.js';
import { showConfirm, showAlert } from '../utils.js';


// Store reps globally for easy access in edit modals
let cachedReps = [];
let cachedClusters = [];
let cachedRegions = [];
let latestFyId = null;

/**
 * Loads and renders the admin dashboard.
 * Fetches clusters, regions, and their associated sales reps.
 */
// --- Tab Management ---
window.switchAdminTab = function (tabName) {
    // Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Content
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    const target = document.getElementById(`admin-tab-${tabName}`);
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
    }

    // Refresh Data if needed
    // loadAdminData(); // Optional, but might be overkill to reload everything
}

export async function loadAdminData() {
    const container = document.getElementById('admin-clusters-container');
    const regionsContainer = document.getElementById('admin-regions-container');
    if (!container) return;

    try {
        // container.innerHTML = '<p class="loading">Loading clusters...</p>'; // Removed to prevent scroll reset

        const [clusters, allReps, fiscalYears, regions] = await Promise.all([
            fetchClusters(),
            fetchAllSalesReps(),
            fetchFiscalYears(),
            fetchRegions()
        ]);

        // Update caches
        cachedReps = allReps;
        cachedClusters = clusters;
        cachedRegions = regions;

        if (fiscalYears && fiscalYears.length > 0) {
            latestFyId = fiscalYears[0].id;
        }

        // populate region dropdown in Add Cluster
        const regionSelect = document.getElementById('new-cluster-region');
        if (regionSelect) {
            let options = '<option value="">Select Region...</option>';
            if (regions.length > 0) {
                // Default to first region logic? User requested "first one become default"
                // Let's keep "Select Region..." but make the first actual region selected? 
                // Or just remove the placeholder? 
                // "when i meant default region i mean the first one become default" -> implies selection.

                // Let's make the FIRST region the selected one by default.
                options = regions.map((r, i) => `<option value="${r.id}" ${i === 0 ? 'selected' : ''}>${r.name}</option>`).join('');
            }
            regionSelect.innerHTML = options;
        }

        // ... (Render Regions logic) ...
        if (regionsContainer) {
            if (regions.length === 0) {
                regionsContainer.innerHTML = '<p class="text-muted">No regions found.</p>';
            } else {
                regionsContainer.innerHTML = regions.map(r => `
                    <div class="sales-rep-item" style="margin-bottom: 8px;">
                        <span class="rep-name">${r.name}</span>
                        <button class="delete-rep-btn" onclick="handleDeleteRegion(${r.id})">✖</button>
                    </div>
                `).join('');
            }
        }

        // --- SEPARATE REPS BY ROLE ---
        const admins = allReps.filter(r => r.role === 'system_admin' || r.role === 'region_admin' || r.role === 'cluster_admin');
        const regularReps = allReps.filter(r => !r.role || r.role === 'user');

        // --- RENDER ADMINISTRATORS ---
        const adminsContainer = document.getElementById('admin-admins-container');
        if (adminsContainer) {
            // Helper to get region/cluster names for admins
            const getAdminScope = (admin) => {
                if (admin.role === 'system_admin') {
                    return { region: 'All', cluster: 'All' };
                } else if (admin.role === 'region_admin') {
                    const region = cachedRegions.find(r => r.id === admin.region_id);
                    return { region: region ? region.name : '-', cluster: 'All' };
                } else if (admin.role === 'cluster_admin') {
                    const cluster = cachedClusters.find(c => c.id === admin.cluster_id);
                    const regionName = cluster && cluster.region_name ? cluster.region_name : '-';
                    return { region: regionName, cluster: cluster ? cluster.name : '-' };
                }
                return { region: '-', cluster: '-' };
            };

            adminsContainer.innerHTML = `
                <div class="cluster-section" style="margin-bottom: 30px; padding: 20px; background: white; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <div class="cluster-table-header" style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <h3 style="margin:0; font-size: 1.25rem;">🔑 Administrators</h3>
                            <span class="badge" style="background: var(--accent-purple); color: white;">${admins.length}</span>
                        </div>
                        <button class="primary-btn" onclick="handleAddAdmin()">+ Add Administrator</button>
                    </div>
                    
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Region</th>
                                <th>Cluster</th>
                                <th style="width: 100px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${admins.length === 0 ? '<tr><td colspan="6" class="text-muted" style="text-align:center;">No administrators found.</td></tr>' : ''}
                            ${admins.map(admin => {
                const scope = getAdminScope(admin);
                return `
                                <tr>
                                    <td><strong>${admin.name}</strong></td>
                                    <td>@${admin.username}</td>
                                    <td><span class="role-badge ${admin.role}">${admin.role.replace('_', ' ')}</span></td>
                                    <td>${scope.region}</td>
                                    <td>${scope.cluster}</td>
                                    <td style="display: flex; gap: 6px; justify-content: center;">
                                        <button class="action-btn edit" onclick="handleEditRep(${admin.id})" title="Edit">✏️</button>
                                        <button class="action-btn delete" onclick="handleDeleteRep(${admin.id})" title="Delete">✖</button>
                                    </td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // ... (Render Clusters logic using regularReps, same as before) ...
        // Ensure to reuse cachedclusters/regularReps variable names correctly in subsequent blocks

        if (!clusters || clusters.length === 0) {
            container.innerHTML = '<div><p class="no-reps">No clusters found. Add a cluster above to get started.</p></div>';
            return;
        }

        container.innerHTML = clusters.map((cluster, index) => {
            const clusterReps = regularReps.filter(r => r.cluster_id === cluster.id);
            const regionName = cluster.region_name ? `<span class="badge region-badge">${cluster.region_name}</span>` : '';
            // ... (rest of cluster rendering) ...
            const displayStyle = index === 0 ? 'block' : 'none';
            const iconChar = index === 0 ? '▼' : '▶';

            return `
                <div class="cluster-section" id="cluster-section-${cluster.id}" style="margin-bottom: 24px; padding: 16px; background: var(--bg-card); border-radius: 8px;">
                    <div class="cluster-table-header" onclick="toggleCluster(${cluster.id})" style="cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                            <h3>
                                <span class="collapse-icon" id="cluster-icon-${cluster.id}" style="display: inline-block; width: 20px;">${iconChar}</span>
                                <span id="cluster-name-display-${cluster.id}">📁 ${cluster.name}</span>
                                <input type="text" id="cluster-name-input-${cluster.id}" value="${cluster.name}" class="editable-cell" style="display:none; width: auto; font-size: 1rem; font-weight: bold;" onclick="event.stopPropagation()">
                                ${regionName}
                            </h3>
                            <!-- ... buttons ... -->
                            <div style="margin-left:auto; display:flex; gap:8px;">
                                <button class="secondary-btn cluster-edit-btn" id="cluster-edit-btn-${cluster.id}" onclick="event.stopPropagation(); handleEditCluster(${cluster.id})">✏️ Edit</button>
                                <button class="primary-btn cluster-save-btn" id="cluster-save-btn-${cluster.id}" onclick="event.stopPropagation(); handleSaveCluster(${cluster.id})" style="display: none;">💾 Save</button>
                                <button class="secondary-btn" onclick="event.stopPropagation(); handleLoadWorkloads(${cluster.id})" style="border-color: var(--accent-green); color: var(--accent-green);">📂 Load Workloads</button>
                                <button class="delete-cluster-btn" onclick="event.stopPropagation(); handleDeleteCluster(${cluster.id})">
                                    <span class="delete-icon">✖</span> Delete Cluster
                                </button>
                            </div>
                        </div>
                    </div>
                        
                    <div class="cluster-content" id="cluster-content-${cluster.id}" style="display: ${displayStyle}; margin-top: 16px;">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th>Sales Rep Name</th>
                                    <th>Username</th>
                                    <th style="width: 120px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${clusterReps.map(rep => `
                                    <tr>
                                        <td><span id="rep-name-display-${rep.id}">${rep.name}</span></td>
                                        <td class="text-muted">@${rep.username || 'no_user'}</td>
                                        <td style="display: flex; gap: 6px; align-items: center;">
                                            <button class="action-btn edit" onclick="handleEditRep(${rep.id})" title="Edit">✏️</button>
                                            <button class="action-btn delete" onclick="handleDeleteRep(${rep.id})" title="Delete">✖</button>
                                        </td>
                                    </tr>
                                `).join('')}
                                <tr class="add-row">
                                    <td><input type="text" id="add-rep-name-${cluster.id}" placeholder="Enter new user name..."></td>
                                    <td><small class="text-muted">Auto-generated</small></td>
                                    <td><button class="action-btn add" onclick="handleAddRep(${cluster.id})">➕</button></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading admin data:', error);
        container.innerHTML = `<p class="error-message">Error loading data: ${error.message}. Please try refreshing the page.</p>`;
    }
}

// ... (toggleCluster, handleDeleteCluster, handleDeleteRep remain similar) ...



/**
 * Toggles a cluster section in the accordion.
 * Logic: Closes all other open clusters to focus on the selection.
 * @param {number} id - Target cluster ID.
 */
window.toggleCluster = function (id) {
    const allContents = document.querySelectorAll('.cluster-content');
    const allIcons = document.querySelectorAll('.collapse-icon');
    const targetContent = document.getElementById(`cluster-content-${id}`);
    const isCurrentlyOpen = targetContent && targetContent.style.display === 'block';

    // Collapse all sections
    allContents.forEach(el => el.style.display = 'none');
    allIcons.forEach(el => el.textContent = '▶');

    // Expand target if it was closed
    if (!isCurrentlyOpen) {
        targetContent.style.display = 'block';
        const targetIcon = document.getElementById(`cluster-icon-${id}`);
        if (targetIcon) targetIcon.textContent = '▼';
    }
};

// --- CRUD Handlers ---

/**
 * Deletes a cluster and refreshes the UI.
 */
window.handleDeleteCluster = async function (id) {
    const ok = await showConfirm('Delete Cluster', 'Are you sure you want to delete this cluster and all its sales reps?');
    if (ok) {
        try {
            await deleteCluster(id);
            await window.loadClusters(); // Refresh global dropdown which triggers loadAdminData
        } catch (e) {
            await showAlert('Error', e.message || 'Failed to delete cluster');
        }
    }
};

/**
 * Deletes a single sales rep.
 */
window.handleDeleteRep = async function (id) {
    const ok = await showConfirm('Delete Sales Rep', 'Are you sure you want to delete this sales rep?');
    if (ok) {
        await deleteSalesRep(id);
        await window.loadClusters();
        await loadAdminData();
    }
};

/**
 * Creates a new sales rep within a cluster.
 */
window.handleAddRep = async function (clusterId) {
    const input = document.getElementById(`add-rep-name-${clusterId}`);
    const name = input.value.trim();
    if (!name) {
        await showAlert('Missing Information', 'Please enter a name');
        return;
    }

    if (!latestFyId) {
        await showAlert('Error', 'No Fiscal Year found. Please create a fiscal year first.');
        return;
    }

    await createSalesRep({
        cluster_id: clusterId,
        fiscal_year_id: parseInt(latestFyId),
        name,
        last_year_exit: 0,
        q1_exit: 0
    });
    await window.loadClusters();
    await loadAdminData();
};

/**
 * Switches a cluster title to 'Edit' mode.
 */
window.handleEditCluster = function (id) {
    document.getElementById(`cluster-name-display-${id}`).style.display = 'none';
    const nameInput = document.getElementById(`cluster-name-input-${id}`);
    nameInput.style.display = 'inline-block';

    // Switch Region Badge to Dropdown
    const regionBadge = document.querySelector(`#cluster-section-${id} .region-badge`);
    const headerTitle = document.querySelector(`#cluster-section-${id} h3`);

    // Create region select if it doesn't exist
    if (!document.getElementById(`cluster-region-select-${id}`)) {
        const select = document.createElement('select');
        select.id = `cluster-region-select-${id}`;
        select.className = 'editable-cell';
        select.style.width = 'auto';
        select.style.marginLeft = '10px';
        select.style.display = 'inline-block';
        select.onclick = (e) => e.stopPropagation();

        let options = '<option value="">Select Region...</option>';
        // Need access to regions. They are available in the "Add Cluster" dropdown
        const addRegionSelect = document.getElementById('new-cluster-region');
        if (addRegionSelect) {
            options = addRegionSelect.innerHTML;
        }
        select.innerHTML = options;

        // Pre-select current region if badge exists
        // Relying on cachedClusters (available in scope) to find the correct region_id
        const cluster = cachedClusters.find(c => c.id === id);
        if (cluster && cluster.region_id) {
            select.value = cluster.region_id;
        }

        // Hide badge if it exists
        if (regionBadge) regionBadge.style.display = 'none';

        headerTitle.appendChild(select);
    } else {
        document.getElementById(`cluster-region-select-${id}`).style.display = 'inline-block';
        if (regionBadge) regionBadge.style.display = 'none';
    }

    document.getElementById(`cluster-edit-btn-${id}`).style.display = 'none';
    document.getElementById(`cluster-save-btn-${id}`).style.display = 'inline-block';
};

/**
 * Saves a cluster name modification.
 */
/**
 * Saves changes to a cluster name and region.
 */
window.handleSaveCluster = async function (id) {
    const input = document.getElementById(`cluster-name-input-${id}`);
    const newName = input.value.trim();

    const regionSelect = document.getElementById(`cluster-region-select-${id}`);
    const regionId = regionSelect ? regionSelect.value : null;

    if (!newName) {
        await showAlert('Error', 'Cluster name cannot be empty');
        return;
    }

    try {
        const response = await fetch(`/api/clusters/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: newName,
                region_id: regionId ? parseInt(regionId) : null
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update cluster');
        }

        await window.loadClusters();
        await loadAdminData();
    } catch (error) {
        await showAlert('Error', error.message);
    }
};

/**
 * Switches a Sales Rep name to 'Edit' mode.
 */
// Stores current editing user for the modal
/**
 * Handle Add Admin - Opens Modal in Create Mode
 */
window.handleAddAdmin = function () {
    openUserModal(null);
}

function getModalHTML() {
    return `
    <div class="modal-overlay" id="user-modal">
        <div class="modal">
            <div class="modal-header">
                <h3>Manage User</h3>
                <button class="close-btn" onclick="closeUserModal()">&times;</button>
            </div>
            <div class="modal-body">
                <input type="hidden" id="edit-user-id">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="edit-user-name" class="form-control" placeholder="Full Name">
                </div>
                <div class="form-group">
                    <label>Username</label>
                    <div class="input-group">
                        <span class="input-group-text">@</span>
                        <input type="text" id="edit-user-username" class="form-control" placeholder="username">
                    </div>
                </div>
                <div class="form-group">
                    <label>Role</label>
                    <select id="edit-user-role" class="form-control" onchange="handleRoleChange()">
                        <option value="user">Sales Rep</option>
                        <option value="cluster_admin">Cluster Admin</option>
                        <option value="region_admin">Region Admin</option>
                        <option value="system_admin">System Admin</option>
                    </select>
                </div>
                <div class="form-group" id="region-select-group" style="display: none;">
                    <label>Assign to Region</label>
                    <select id="edit-user-region" class="form-control">
                        <option value="">Select Region...</option>
                    </select>
                </div>
                <div class="form-group" id="cluster-select-group" style="display: none;">
                    <label>Assign to Cluster</label>
                    <select id="edit-user-cluster" class="form-control">
                        <option value="">Select Cluster...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="edit-user-password" class="form-control" placeholder="Enter new password">
                </div>
                <div class="form-actions-big" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="secondary-btn" onclick="closeUserModal()">Cancel</button>
                    <button class="primary-btn" onclick="saveUserChanges()">Save User</button>
                </div>
            </div>
        </div>
    </div>
    `;
}

/**
 * Opens the User Management Modal
 * @param {number|null} id - User ID to edit, or null to create new
 */
async function openUserModal(id) {
    let modal = document.getElementById('user-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', getModalHTML());
        modal = document.getElementById('user-modal');
    }

    // Populate Region Dropdown
    const regionSelect = document.getElementById('edit-user-region');
    if (regionSelect) {
        try {
            const regions = await fetchRegions();
            regionSelect.innerHTML = '<option value="">Select Region...</option>' +
                regions.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        } catch (e) {
            console.error('Failed to load regions for modal', e);
        }
    }

    // Populate Cluster Dropdown
    const clusterSelect = document.getElementById('edit-user-cluster');
    if (clusterSelect) {
        clusterSelect.innerHTML = '<option value="">Select Cluster...</option>' +
            cachedClusters.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    // Reset Form
    document.getElementById('edit-user-id').value = '';
    document.getElementById('edit-user-name').value = '';
    document.getElementById('edit-user-username').value = '';
    document.getElementById('edit-user-password').value = '';
    document.getElementById('edit-user-region').value = '';
    document.getElementById('edit-user-cluster').value = '';

    // Set placeholder based on mode
    const passInput = document.getElementById('edit-user-password');
    if (id) {
        // Edit Mode
        passInput.placeholder = "(Leave empty to keep current)";
        const user = cachedReps.find(r => r.id === id);
        if (user) {
            document.getElementById('edit-user-id').value = user.id;
            document.getElementById('edit-user-name').value = user.name;
            document.getElementById('edit-user-username').value = user.username || '';
            document.getElementById('edit-user-role').value = user.role || 'user';
            // Set region/cluster if present
            if (user.region_id) document.getElementById('edit-user-region').value = user.region_id;
            if (user.cluster_id) document.getElementById('edit-user-cluster').value = user.cluster_id;
        }
    } else {
        // Create Mode
        passInput.placeholder = "Enter password";
        document.getElementById('edit-user-role').value = 'system_admin';
    }

    // Set initial visibility of dropdowns
    handleRoleChange();

    modal.classList.add('active');
}

/**
 * Toggles visibility of Region/Cluster dropdowns based on selected role.
 */
window.handleRoleChange = function () {
    const role = document.getElementById('edit-user-role').value;
    const regionGroup = document.getElementById('region-select-group');
    const clusterGroup = document.getElementById('cluster-select-group');

    if (regionGroup) regionGroup.style.display = (role === 'region_admin') ? 'block' : 'none';
    if (clusterGroup) clusterGroup.style.display = (role === 'cluster_admin' || role === 'user') ? 'block' : 'none';
};

window.handleEditRep = function (id) {
    openUserModal(id);
}

window.closeUserModal = function () {
    const modal = document.getElementById('user-modal');
    if (modal) modal.classList.remove('active');
}

window.saveUserChanges = async function () {
    const id = document.getElementById('edit-user-id').value;
    const name = document.getElementById('edit-user-name').value;
    const username = document.getElementById('edit-user-username').value;
    const password = document.getElementById('edit-user-password').value;
    const role = document.getElementById('edit-user-role').value;

    if (!name || !username) {
        await showAlert('Error', 'Name and Username are required');
        return;
    }

    try {
        const payload = { name, username, role };
        if (password) payload.password = password;

        // Add region_id for Region Admins
        if (role === 'region_admin') {
            const regionId = document.getElementById('edit-user-region').value;
            if (regionId) payload.region_id = parseInt(regionId);
        }

        // Add cluster_id for Cluster Admins and Sales Reps
        if (role === 'cluster_admin' || role === 'user') {
            const clusterId = document.getElementById('edit-user-cluster').value;
            if (clusterId) payload.cluster_id = parseInt(clusterId);
        }

        let response;
        if (id) {
            // Update
            response = await fetch(`/api/sales_reps/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // Create New User/Admin
            // Ensure cluster_id is set for non-system_admin roles if not already
            if (!payload.cluster_id && role !== 'system_admin' && role !== 'region_admin') {
                if (cachedClusters.length === 0) throw new Error("No clusters available to assign user to.");
                payload.cluster_id = cachedClusters[0].id;
            }
            // Also need fiscal_year_id!
            if (latestFyId) payload.fiscal_year_id = latestFyId;

            response = await fetch(`/api/sales_reps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (response.ok) {
            closeUserModal();
            await loadAdminData();
            await window.loadClusters();
        } else {
            const err = await response.json();
            await showAlert('Error', err.error || 'Failed to save user');
        }
    } catch (e) {
        await showAlert('Error', e.message);
    }
}



// --- Bulk Upload Support ---

/** @type {number|null} Tracking cluster ID for the currently open upload modal */
let currentUploadClusterId = null;

/**
 * Opens the workload upload modal for a specific cluster.
 */
window.handleLoadWorkloads = function (clusterId) {
    currentUploadClusterId = clusterId;
    const modal = document.getElementById('upload-modal');
    if (modal) {
        modal.classList.add('active');
        const fileInput = document.getElementById('upload-file');
        if (fileInput) fileInput.value = ''; // Clear previous selections
    }
};

// Modal Navigation Listeners
document.addEventListener('click', (e) => {
    if (e.target.id === 'close-upload-modal' || e.target.id === 'cancel-upload-modal') {
        closeUploadModal();
    }
    if (e.target.id === 'confirm-upload-btn') {
        performUploadDirectly();
    }
    if (e.target.id === 'upload-modal') {
        closeUploadModal();
    }
});

function closeUploadModal() {
    const modal = document.getElementById('upload-modal');
    if (modal) modal.classList.remove('active');
    currentUploadClusterId = null;
}

/**
 * Executes a direct bulk upload of workload Excel data.
 * Redirects to /api/workloads/upload (the UPSERT logic).
 */
async function performUploadDirectly() {
    if (!currentUploadClusterId) return;

    const fileInput = document.getElementById('upload-file');
    const quarterSelect = document.getElementById('default-quarter');
    const file = fileInput.files[0];
    const quarter = quarterSelect.value;

    if (!file) {
        await showAlert('Missing File', 'Please select a file to upload.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('cluster_id', currentUploadClusterId);
    formData.append('default_quarter', quarter);

    // Provide visual feedback for long-running IO
    const btn = document.getElementById('confirm-upload-btn');
    const originalText = btn.textContent;
    btn.textContent = '⏳ Uploading...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/workloads/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            closeUploadModal();
            await showAlert('Success', result.message || 'Workloads uploaded successfully');
            await loadAdminData();
        } else {
            await showAlert('Error', result.error || 'Upload failed');
        }
    } catch (error) {
        await showAlert('Error', error.message);
    } finally {
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
}

// --- Initialization ---

/**
 * Attaches global listeners for admin-specific actions (e.g., adding a cluster).
 * Run once on main app load.
 */
export function setAdminListeners() {
    const addClusterBtn = document.getElementById('add-cluster-btn');
    if (addClusterBtn) {
        addClusterBtn.addEventListener('click', async () => {
            const input = document.getElementById('new-cluster-name');
            const regionSelect = document.getElementById('new-cluster-region');
            const name = input.value.trim();
            const regionId = regionSelect ? regionSelect.value : null;

            if (name) {
                try {
                    const response = await fetch('/api/clusters', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name, region_id: regionId })
                    });

                    if (response.ok) {
                        input.value = '';
                        if (regionSelect) regionSelect.value = '';
                        await window.loadClusters(); // Refresh global cluster list
                        await loadAdminData(); // Refresh admin view
                    } else {
                        const err = await response.json();
                        await showAlert('Error', err.error || 'Failed to create cluster');
                    }
                } catch (error) {
                    await showAlert('Error', error.message);
                }
            } else {
                await showAlert('Warning', 'Please enter a cluster name');
            }
        });
    }

    const addRegionBtn = document.getElementById('add-region-btn');
    if (addRegionBtn) {
        addRegionBtn.addEventListener('click', async () => {
            const input = document.getElementById('new-region-name');
            const name = input.value.trim();

            if (name) {
                try {
                    const result = await createRegion(name);
                    if (result && !result.error) {
                        input.value = '';
                        await loadAdminData();
                    } else {
                        await showAlert('Error', result.error || 'Failed to create region');
                    }
                } catch (e) {
                    await showAlert('Error', e.message);
                }
            } else {
                await showAlert('Warning', 'Please enter a region name');
            }
        });
    }
}

/**
 * Deletes a region
 */
window.handleDeleteRegion = async function (id) {
    if (await showConfirm('Are you sure you want to delete this region?')) {
        try {
            await deleteRegion(id);
            await loadAdminData();
            await window.loadClusters();
        } catch (e) {
            await showAlert('Error', e.message);
        }
    }
}
