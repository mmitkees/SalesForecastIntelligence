export const state = {
    currentUser: null,        // Logged-in user object with role
    currentClusterId: null,
    currentFiscalYearId: null,
    currentView: 'dashboard',
    workloads: [],
    salesReps: [],
    currentSort: { field: 'total', order: 'desc' },
    // Workloads page state persistence
    workloadsFilter: {
        accountManager: '',
        forecastType: '',
        customerType: '',
        workloadType: ''
    },
    workloadsExpandedQuarter: null, // Will store which quarter is expanded (e.g., 'q3')
    // Dashboard page state persistence
    dashboardExpandedQuarter: null, // Will store which quarter is expanded on dashboard (e.g., 'q3')
};

export function setState(key, value) {
    state[key] = value;
}

export function getState(key) {
    return state[key];
}
