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
    overrides: loadOverridesFromStorage(), // Override state for each quarter (persisted to localStorage)
};

/**
 * Load override states from localStorage.
 */
function loadOverridesFromStorage() {
    try {
        const saved = localStorage.getItem('dashboardOverrides');
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        console.error('Failed to load overrides from localStorage:', e);
        return {};
    }
}

/**
 * Save override states to localStorage.
 */
export function saveOverridesToStorage() {
    try {
        localStorage.setItem('dashboardOverrides', JSON.stringify(state.overrides || {}));
    } catch (e) {
        console.error('Failed to save overrides to localStorage:', e);
    }
}

export function setState(key, value) {
    state[key] = value;
    // Persist overrides to localStorage when they change
    if (key === 'overrides') {
        saveOverridesToStorage();
    }
}

export function getState(key) {
    return state[key];
}
