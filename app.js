document.addEventListener('DOMContentLoaded', () => {
    // --- Haptic Feedback Helper ---
    const triggerHaptic = (type = 'light') => {
        if (!navigator.vibrate) return;
        if (type === 'light') navigator.vibrate(50);
        if (type === 'heavy') navigator.vibrate([100, 50, 100]); // Pulse
    };

    // --- Tab Navigation Logic ---
    const tabs = document.querySelectorAll('.nav-tab');
    const modules = document.querySelectorAll('.module');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            triggerHaptic('light');
            
            // Remove active states
            tabs.forEach(t => t.classList.remove('active'));
            modules.forEach(m => m.classList.remove('active'));

            // Set new active state
            const targetId = e.target.getAttribute('data-target');
            e.target.classList.add('active');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- Button Interaction Feedback ---
    const actionButtons = document.querySelectorAll('.action-calc');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            triggerHaptic('heavy');
            // Calculation logic will hook in here
        });
    });

    // --- Lock/Unlock Edit Mode ---
    const lockBtn = document.getElementById('edit-toggle');
    lockBtn.addEventListener('click', () => {
        triggerHaptic('light');
        if (lockBtn.innerText === 'LOCKED') {
            lockBtn.innerText = 'EDIT MODE';
            lockBtn.style.color = 'var(--neon-green)';
            lockBtn.style.borderColor = 'var(--neon-green)';
        } else {
            lockBtn.innerText = 'LOCKED';
            lockBtn.style.color = 'var(--text-muted)';
            lockBtn.style.borderColor = 'var(--text-muted)';
        }
    });
});
