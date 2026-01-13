import { fetchClusters, fetchAllSalesReps, createSalesRep, deleteSalesRep, deleteCluster, fetchFiscalYears } from '../api.js';
import { showConfirm, showAlert } from '../utils.js';
import { loadClusters } from '../main.js';

let latestFyId = null;

export async function loadAdminData() {
    const container = document.getElementById('admin-clusters-container');
    if (!container) return;

    try {
        container.innerHTML = '<p class="loading">Loading clusters...</p>';

        const [clusters, allReps, fiscalYears] = await Promise.all([
            fetchClusters(),
            fetchAllSalesReps(),
            fetchFiscalYears()
        ]);

        // Set latest FY
        if (fiscalYears && fiscalYears.length > 0) {
            latestFyId = fiscalYears[0].id;
        }



        if (!clusters || clusters.length === 0) {
            container.innerHTML = '<div><p class="no-reps">No clusters found. Add a cluster above to get started.</p></div>';
            return;
        }

        container.innerHTML = clusters.map((cluster, index) => {
            const clusterReps = Array.isArray(allReps) ? allReps.filter(r => r.cluster_id === cluster.id) : [];
            const isExpanded = false; // Default all collapsed? Or first expanded? Let's default all collapsed to keep it clean, or index === 0.
            // User requested "maximize a table... other gets collapsed". 
            // Better UX: Open first one? No, let's keep all collapsed or restore state. 
            // For now, let's defaults to all closed except user interaction.
            // Actually, usually users want to see something. Let's expand the first one.
            const displayStyle = index === 0 ? 'block' : 'none';
            const iconChar = index === 0 ? '▼' : '▶';

            return `
                <div class="cluster-section" id="cluster-section-${cluster.id}" style="margin-bottom: 24px; padding: 16px; background: var(--bg-card); border-radius: 8px;">
                    <div class="cluster-table-header" onclick="toggleCluster(${cluster.id})" style="cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <h3>
                                <span class="collapse-icon" id="cluster-icon-${cluster.id}" style="display: inline-block; width: 20px;">${iconChar}</span>
                                <span id="cluster-name-display-${cluster.id}">📁 ${cluster.name}</span>
                                <input type="text" id="cluster-name-input-${cluster.id}" value="${cluster.name}" style="display: none; font-size: 1rem; padding: 6px; border: 1px solid var(--accent-blue); border-radius: 4px; background: var(--bg-sidebar); color: var(--text-primary);" onclick="event.stopPropagation()">
                            </h3>
                            <button class="secondary-btn cluster-edit-btn" id="cluster-edit-btn-${cluster.id}" onclick="event.stopPropagation(); handleEditCluster(${cluster.id})">✏️ Edit</button>
                            <button class="primary-btn cluster-save-btn" id="cluster-save-btn-${cluster.id}" onclick="event.stopPropagation(); handleSaveCluster(${cluster.id})" style="display: none;">💾 Save</button>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="secondary-btn" onclick="event.stopPropagation(); handleLoadWorkloads(${cluster.id})" style="border-color: var(--accent-green); color: var(--accent-green);">📂 Load Workloads</button>
                            <button class="delete-cluster-btn" onclick="event.stopPropagation(); handleDeleteCluster(${cluster.id})">
                                <span class="delete-icon">✖</span> Delete Cluster
                            </button>
                        </div>
                    </div>
                    
                    <div class="cluster-content" id="cluster-content-${cluster.id}" style="display: ${displayStyle}; margin-top: 16px;">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th>Sales Rep Name</th>
                                    <th style="width: 120px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${clusterReps.map(rep => `
                                    <tr>
                                        <td>
                                            <span id="rep-name-display-${rep.id}">${rep.name}</span>
                                            <input type="text" id="rep-name-input-${rep.id}" value="${rep.name}" style="display: none; width: 100%; font-size: 0.9rem; padding: 6px; border: 1px solid var(--accent-blue); border-radius: 4px; background: var(--bg-sidebar); color: var(--text-primary);">
                                        </td>
                                        <td style="display: flex; gap: 6px; align-items: center;">
                                            <button class="action-btn edit" id="rep-edit-btn-${rep.id}" onclick="handleEditRep(${rep.id})" title="Edit">✏️</button>
                                            <button class="action-btn" id="rep-save-btn-${rep.id}" onclick="handleSaveRep(${rep.id})" style="display: none; color: var(--accent-green);" title="Save">💾</button>
                                            <button class="action-btn delete" onclick="handleDeleteRep(${rep.id})" title="Delete">✖</button>
                                        </td>
                                    </tr>
                                `).join('')}
                                <tr class="add-row">
                                    <td><input type="text" id="add-rep-name-${cluster.id}" placeholder="Enter sales rep name..."></td>
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

// Global Toggle Function
window.toggleCluster = function (id) {
    // Accordion Logic: Close all others, toggle current
    const allContents = document.querySelectorAll('.cluster-content');
    const allIcons = document.querySelectorAll('.collapse-icon');

    // First, find the specific one to see its current state
    const targetContent = document.getElementById(`cluster-content-${id}`);
    const isCurrentlyOpen = targetContent && targetContent.style.display === 'block';

    // Close ALL
    allContents.forEach(el => el.style.display = 'none');
    allIcons.forEach(el => el.textContent = '▶');

    // If it was closed, open it. If it was open, leave it closed (toggle behavior)
    // Wait, user said "maximize a table the other gets collapsed". 
    // Usually means if I click one, it opens.
    if (!isCurrentlyOpen) {
        targetContent.style.display = 'block';
        const targetIcon = document.getElementById(`cluster-icon-${id}`);
        if (targetIcon) targetIcon.textContent = '▼';
    }
};
// Attach Event Listeners (ensure we don't duplicate if called multiple times, though loadAdminData re-renders container)
// For global inputs that aren't inside the container, we need to be careful. 
// Best to attach these once or check if already attached. 
// Actually, simple inline onclicks in HTML or delegation here works best for dynamic content.
// For static content (Add FY, Add Rep), we can attach here safely if we use .onclick reassignment.




// --- Handlers ---


window.handleDeleteCluster = async function (id) {
    const ok = await showConfirm('Delete Cluster', 'Are you sure you want to delete this cluster and all its sales reps?');
    if (ok) {
        await deleteCluster(id);
        await loadClusters(); // Refresh dropdown in main nav
        await loadAdminData(); // Refresh admin view
    }
};

window.handleDeleteRep = async function (id) {
    const ok = await showConfirm('Delete Sales Rep', 'Are you sure you want to delete this sales rep?');
    if (ok) {
        await deleteSalesRep(id);
        await loadClusters(); // Refresh dropdown
        await loadAdminData();
    }
};

window.handleAddRep = async function (clusterId) {
    const input = document.getElementById(`add-rep-name-${clusterId}`);
    const name = input.value.trim();
    if (!name) {
        await showAlert('Missing Information', 'Please enter a name');
        return;
    }

    if (!latestFyId) {
        await showAlert('Error', 'No Fiscal Year found');
        return;
    }

    await createSalesRep({
        cluster_id: clusterId,
        fiscal_year_id: parseInt(latestFyId),
        name,
        last_year_exit: 0,
        q1_exit: 0
    });
    await loadClusters();
    await loadAdminData();
};

window.handleEditCluster = function (id) {
    const display = document.getElementById(`cluster-name-display-${id}`);
    const input = document.getElementById(`cluster-name-input-${id}`);
    const editBtn = document.getElementById(`cluster-edit-btn-${id}`);
    const saveBtn = document.getElementById(`cluster-save-btn-${id}`);

    display.style.display = 'none';
    input.style.display = 'inline-block';
    input.focus();
    input.select();
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
};

window.handleSaveCluster = async function (id) {
    const input = document.getElementById(`cluster-name-input-${id}`);
    const newName = input.value.trim();

    if (!newName) {
        await showAlert('Error', 'Cluster name cannot be empty');
        return;
    }

    try {
        const response = await fetch(`/api/clusters/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update cluster');
        }

        await loadClusters(); // Refresh navigation dropdown
        await loadAdminData(); // Refresh admin view
    } catch (error) {
        await showAlert('Error', error.message);
    }
};

window.handleEditRep = function (id) {
    const display = document.getElementById(`rep-name-display-${id}`);
    const input = document.getElementById(`rep-name-input-${id}`);
    const editBtn = document.getElementById(`rep-edit-btn-${id}`);
    const saveBtn = document.getElementById(`rep-save-btn-${id}`);

    display.style.display = 'none';
    input.style.display = 'inline-block';
    input.focus();
    input.select();
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
};

window.handleSaveRep = async function (id) {
    const input = document.getElementById(`rep-name-input-${id}`);
    const newName = input.value.trim();

    if (!newName) {
        await showAlert('Error', 'Sales rep name cannot be empty');
        return;
    }

    try {
        const response = await fetch(`/api/sales_reps/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update sales rep');
        }

        await loadAdminData(); // Refresh admin view
    } catch (error) {
        await showAlert('Error', error.message);
    }
};

// State for upload
let currentUploadClusterId = null;

window.handleLoadWorkloads = function (clusterId) {
    currentUploadClusterId = clusterId;
    const modal = document.getElementById('upload-modal');
    if (modal) {
        modal.classList.add('active');
        const fileInput = document.getElementById('upload-file');
        if (fileInput) fileInput.value = ''; // Reset file input
    }
};

// Event Listeners for Upload Modal
document.addEventListener('click', (e) => {
    if (e.target.id === 'close-upload-modal' || e.target.id === 'cancel-upload-modal') {
        closeUploadModal();
    }
    if (e.target.id === 'confirm-upload-btn') {
        performUploadDirectly();
    }
    if (e.target.id === 'upload-modal') {
        // Click outside to close
        closeUploadModal();
    }
});

function closeUploadModal() {
    const modal = document.getElementById('upload-modal');
    if (modal) modal.classList.remove('active');
    currentUploadClusterId = null;
}


/**
 * Handles the direct file upload for workloads.
 * Sends the file and selected default quarter to the backend UPSERT endpoint.
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

    // Show loading state
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
            await loadAdminData(); // Refresh admin to show any stats if needed (currently workloads are hidden in admin)
        } else {
            await showAlert('Error', result.error || 'Upload failed');
        }
    } catch (error) {
        await showAlert('Error', error.message);
    } finally {
        // Reset button state
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
}
