export function initReviewUI(vscode) {
    const reviewBanner = document.getElementById('reviewBanner');
    const reviewMessage = document.getElementById('reviewMessage');
    const reviewAcceptBtn = document.getElementById('reviewAcceptBtn');
    const reviewRejectBtn = document.getElementById('reviewRejectBtn');
    const inputBar = document.querySelector('.input-bar');

    function showReviewBanner(text) {
        if (reviewBanner && reviewMessage && inputBar) {
            reviewMessage.textContent = text;
            reviewBanner.style.display = 'flex';
            inputBar.classList.add('has-review');
            // Ensure input bar is visible
            inputBar.style.display = '';
        }
    }

    function hideReviewBanner() {
        if (reviewBanner && inputBar) {
            reviewBanner.style.display = 'none';
            inputBar.classList.remove('has-review');
        }
    }

    if (reviewAcceptBtn) {
        reviewAcceptBtn.addEventListener('click', () => {
            hideReviewBanner();
            vscode.postMessage({ command: 'reviewResponse', answer: 'accept' });
        });
    }

    if (reviewRejectBtn) {
        reviewRejectBtn.addEventListener('click', () => {
            hideReviewBanner();
            vscode.postMessage({ command: 'reviewResponse', answer: 'reject' });
        });
    }

    return {
        showReviewBanner,
        hideReviewBanner
    };
}
