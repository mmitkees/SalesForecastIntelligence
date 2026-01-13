export function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

export function formatPercent(value) {
    const formatted = parseFloat(value).toFixed(1);
    return `${formatted}%`;
}

export function getPercentColorClass(value) {
    if (value < 0) return 'text-red';
    if (value < 10) return 'text-yellow';
    return 'text-green';
}

export function deriveQuarter(dateStr) {
    if (!dateStr) return 'Q3';
    try {
        const month = new Date(dateStr).getMonth() + 1; // 1-12
        if ([12, 1, 2].includes(month)) return 'Q3';
        if ([3, 4, 5].includes(month)) return 'Q4';
        return 'Q3';
    } catch (e) {
        return 'Q3';
    }
}

export function showConfirm(title, message) {
    return new Promise((resolve) => {
        const confirmModal = document.getElementById('confirm-modal');
        const confirmTitle = document.getElementById('confirm-title');
        const confirmMessage = document.getElementById('confirm-message');
        const confirmClose = document.getElementById('confirm-close');
        const confirmCancel = document.getElementById('confirm-cancel');
        const confirmOk = document.getElementById('confirm-ok');

        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmOk.textContent = title.toLowerCase().includes('delete') ? 'Delete' : 'OK';
        confirmModal.classList.add('active');

        const handleOk = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

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
