export const state = {
    currentClusterId: null,
    currentFiscalYearId: null,
    currentView: 'dashboard',
    workloads: [],
    salesReps: [],
    currentSort: { field: 'total', order: 'desc' },
};

export function setState(key, value) {
    state[key] = value;
}

export function getState(key) {
    return state[key];
}
