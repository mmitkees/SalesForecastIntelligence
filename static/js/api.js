export async function fetchClusters() {
    const response = await fetch(`/api/clusters?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function fetchFiscalYears() {
    const response = await fetch(`/api/fiscal_years?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function fetchDashboard(clusterId, fiscalYearId) {
    let url = `/api/dashboard/${clusterId}?t=${Date.now()}`;
    if (fiscalYearId) url += `&fiscal_year_id=${fiscalYearId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function fetchSalesReps(clusterId) {
    const response = await fetch(`/api/sales_reps?cluster_id=${clusterId}&t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function fetchWorkloads(clusterId) {
    const response = await fetch(`/api/workloads?cluster_id=${clusterId}&t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function createWorkload(data) {
    const response = await fetch('/api/workloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

export async function updateWorkload(id, data) {
    const response = await fetch(`/api/workloads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

export async function deleteWorkload(id) {
    await fetch(`/api/workloads/${id}`, { method: 'DELETE' });
}

export async function seedDatabase() {
    const response = await fetch('/api/seed', { method: 'POST' });
    return response.json();
}

export async function createCluster(name) {
    const response = await fetch('/api/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return response.json();
}

export async function deleteCluster(id) {
    await fetch(`/api/clusters/${id}`, { method: 'DELETE' });
}

export async function createSalesRep(data) {
    const response = await fetch('/api/sales_reps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

export async function deleteSalesRep(id) {
    await fetch(`/api/sales_reps/${id}`, { method: 'DELETE' });
}

export async function fetchAllSalesReps() {
    const response = await fetch(`/api/sales_reps?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}
