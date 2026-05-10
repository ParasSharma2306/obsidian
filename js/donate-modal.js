(function () {
  const KEY = 'cl_donate_shown';

  function show(isDark) {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>ChatLume is free forever 🎉</h3>
        <p>If it saved you time, consider buying me a chai ☕ — it keeps this tool alive.</p>
        <div class="modal-actions">
          <a href="donate.html" class="btn btn-green" id="cl-modal-support">Support with UPI</a>
          <button class="btn btn-outline" id="cl-modal-later">Maybe later</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#cl-modal-later').addEventListener('click', close);
    overlay.querySelector('#cl-modal-support').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  window.DonateModal = { show };
})();
