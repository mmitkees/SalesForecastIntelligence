/**
 * API Wrapper for SalesApp Backend.
 * All functions use the fetch API to communicate with Flask endpoints.
 * Cache-busting is implemented using a timestamp query parameter (t=...).
 */

/**
 * Fetches all available clusters.
 * @returns {Promise<Array>} List of cluster objects.
 */
export async function fetchClusters() {
    // Append timestamp to prevent browser caching of GET requests
    const response = await fetch(`/api/clusters?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * Fetches all defined fiscal years.
 * @returns {Promise<Array>} List of fiscal year objects.
 */
export async function fetchFiscalYears() {
    const response = await fetch(`/api/fiscal_years?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * Fetches dashboard data (KPIs and Sales Rep list) for a specific cluster.
 * @param {number} clusterId - Target cluster ID.
 * @param {number} [fiscalYearId] - Optional fiscal year filter.
 * @returns {Promise<Object>} Dashboard summary and representative data.
 */
export async function fetchDashboard(clusterId, fiscalYearId) {
    let url = `/api/dashboard/${clusterId}?t=${Date.now()}`;
    if (fiscalYearId) url += `&fiscal_year_id=${fiscalYearId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * Fetches sales representatives filtered by cluster.
 * @param {number} clusterId - Target cluster ID.
 * @returns {Promise<Array>} List of sales reps.
 */
export async function fetchSalesReps(clusterId) {
    const response = await fetch(`/api/sales_reps?cluster_id=${clusterId}&t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * Fetches workload deals filtered by cluster.
 * @param {number} clusterId - Target cluster ID.
 * @returns {Promise<Array>} List of workloads.
 */
export async function fetchWorkloads(clusterId) {
    const response = await fetch(`/api/workloads?cluster_id=${clusterId}&t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * Creates a new workload record.
 * @param {Object} data - Workload details.
 * @returns {Promise<Object>} Created workload info.
 */
export async function createWorkload(data) {
    const response = await fetch('/api/workloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

/**
 * Updates an existing workload record.
 * @param {number} id - Workload ID.
 * @param {Object} data - Updated fields.
 * @returns {Promise<Object>} Updated workload info.
 */
export async function updateWorkload(id, data) {
    const response = await fetch(`/api/workloads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

/**
 * Deletes a workload record.
 * @param {number} id - Workload ID.
 */
/**
 * Deletes a workload record.
 * @param {number} id - Workload ID.
 */
export async function deleteWorkload(id) {
    const response = await fetch(`/api/workloads/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error("Failed to delete workload");
}



/**
 * Creates a new cluster.
 * @param {string} name - Cluster name.
 * @returns {Promise<Object>} Created cluster.
 */
export async function createCluster(name) {
    const response = await fetch('/api/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return response.json();
}

/**
 * Deletes a cluster and all its associated data.
 * @param {number} id - Cluster ID.
 */
export async function deleteCluster(id) {
    const response = await fetch(`/api/clusters/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error("Failed to delete cluster");
}

/**
 * Creates a new sales representative.
 * @param {Object} data - Sales rep details.
 * @returns {Promise<Object>} Created rep.
 */
export async function createSalesRep(data) {
    const response = await fetch('/api/sales_reps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

/**
 * Deletes a sales representative.
 * @param {number} id - Rep ID.
 */
export async function deleteSalesRep(id) {
    const response = await fetch(`/api/sales_reps/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error("Failed to delete sales rep");
}

/**
 * Fetches all sales representatives globally.
 * @returns {Promise<Array>} List of all sales reps.
 */
export async function fetchAllSalesReps() {
    const response = await fetch(`/api/sales_reps?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

// --- Authentication API ---

/**
 * Authenticates a user with username and password.
 * @param {string} username - User's username.
 * @param {string} password - User's password.
 * @returns {Promise<Object>} User data on success.
 */
export async function login(username, password) {
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed');
    return data;
}

/**
 * Logs out the current user.
 */
export async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
}

/**
 * Gets the currently logged-in user's info.
 * @returns {Promise<Object|null>} User data or null if not authenticated.
 */
export async function getCurrentUser() {
    const response = await fetch(`/api/auth/me?t=${Date.now()}`);
    if (!response.ok) return null;
    return response.json();
}

// --- Region API ---

/**
 * Fetches all regions.
 * @returns {Promise<Array>} List of regions.
 */
export async function fetchRegions() {
    const response = await fetch(`/api/regions?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * Creates a new region.
 * @param {string} name - Region name.
 * @returns {Promise<Object>} Created region.
 */
export async function createRegion(name) {
    const response = await fetch('/api/regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return response.json();
}


/**
 * Deletes a region.
 * @param {number} id - Region ID.
 */
export async function deleteRegion(id) {
    const response = await fetch(`/api/regions/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error("Failed to delete region");
}

/**
 * Fetches analytics data for a specific region.
 * @param {string|number} regionId - Region ID or 'all'.
 * @returns {Promise<Object>} Analytics data.
 */
export async function fetchRegionAnalytics(regionId) {
    const response = await fetch(`/api/analytics/regions?region_id=${regionId}&t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}
