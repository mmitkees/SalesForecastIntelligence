/**
 * Formats a numeric value into a USD currency string.
 * Rounds to 0 decimal places for dashboard display.
 * @param {number} value - The number to format.
 * @returns {string} Formatted currency (e.g., "$1,234").
 */
export function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

/**
 * Formats a value as a percentage string.
 * @param {number|string} value - The value to format.
 * @returns {string} "X.X%".
 */
export function formatPercent(value) {
    const formatted = parseFloat(value).toFixed(1);
    return `${formatted}%`;
}

/**
 * Returns a CSS class name based on a percentage threshold.
 * Used for color-coding growth/performance.
 * @param {number} value - The percentage value.
 * @returns {string} 'text-red', 'text-yellow', or 'text-green'.
 */
export function getPercentColorClass(value) {
    if (value < 0) return 'text-red';      // Negative growth
    if (value < 10) return 'text-yellow'; // Low/Moderate growth
    return 'text-green';                  // Strong growth
}

/**
 * Determines the fiscal quarter name based on a date.
 * Business Logic: FY starts in June.
 *   - Q1: Jun, Jul, Aug (months 6, 7, 8)
 *   - Q2: Sep, Oct, Nov (months 9, 10, 11)
 *   - Q3: Dec, Jan, Feb (months 12, 1, 2)
 *   - Q4: Mar, Apr, May (months 3, 4, 5)
 * @param {string} dateStr - Date string (expected ISO format).
 * @returns {string} 'Q1', 'Q2', 'Q3', or 'Q4'.
 */
export function deriveQuarter(dateStr) {
    if (!dateStr) return 'Q3';
    try {
        const month = new Date(dateStr).getMonth() + 1; // 1-indexed
        if ([6, 7, 8].includes(month)) return 'Q1';
        if ([9, 10, 11].includes(month)) return 'Q2';
        if ([12, 1, 2].includes(month)) return 'Q3';
        if ([3, 4, 5].includes(month)) return 'Q4';
        return 'Q3'; // Default fallback
    } catch (e) {
        return 'Q3'; // Safety fallback
    }
}

/**
 * Displays a custom confirmation modal using Promises for async/await usage.
 * @param {string} title - Modal header.
 * @param {string} message - Content body.
 * @returns {Promise<boolean>} True if confirmed, False if cancelled.
 */
export function showConfirm(title, message) {
    return new Promise((resolve) => {
        // Retrieve DOM elements for the shared confirmation modal
        const confirmModal = document.getElementById('confirm-modal');
        const confirmTitle = document.getElementById('confirm-title');
        const confirmMessage = document.getElementById('confirm-message');
        const confirmClose = document.getElementById('confirm-close');
        const confirmCancel = document.getElementById('confirm-cancel');
        const confirmOk = document.getElementById('confirm-ok');

        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        // Visual cue for destructive actions
        confirmOk.textContent = title.toLowerCase().includes('delete') ? 'Delete' : 'OK';
        confirmModal.classList.add('active');

        // Internal click handlers
        const handleOk = () => {
            cleanup();
            resolve(true); // User confirmed
        };

        const handleCancel = () => {
            cleanup();
            resolve(false); // User cancelled
        };

        // Event listener cleanup to prevent memory leaks/double-firing
        const cleanup = () => {
            confirmOk.removeEventListener('click', handleOk);
            confirmCancel.removeEventListener('click', handleCancel);
            confirmClose.removeEventListener('click', handleCancel);
            confirmModal.classList.remove('active');
        };

        confirmOk.addEventListener('click', handleOk);
        confirmCancel.addEventListener('click', handleCancel);
        confirmClose.addEventListener('click', handleCancel);
    });
}

/**
 * Displays a custom alert modal for notifications or errors.
 * @param {string} title - Modal header.
 * @param {string} message - Content body.
 * @returns {Promise<void>} Resolves when the user acknowledges.
 */
export function showAlert(title, message) {
    return new Promise((resolve) => {
        const alertModal = document.getElementById('alert-modal');
        const alertTitle = document.getElementById('alert-title');
        const alertMessage = document.getElementById('alert-message');
        const alertClose = document.getElementById('alert-close');
        const alertOk = document.getElementById('alert-ok');

        alertTitle.textContent = title;
        alertMessage.textContent = message;
        alertModal.classList.add('active');

        const handleOk = () => {
            cleanup();
            resolve();
        };

        const cleanup = () => {
            alertOk.removeEventListener('click', handleOk);
            alertClose.removeEventListener('click', handleOk);
            alertModal.classList.remove('active');
        };

        alertOk.addEventListener('click', handleOk);
        alertClose.addEventListener('click', handleOk);
    });
}
