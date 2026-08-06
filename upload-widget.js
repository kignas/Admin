(function () {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — matches the backend's multer limit
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

  function initImageUpload(root) {
    const type = root.dataset.uploadType;
    const targetInput = document.getElementById(root.dataset.targetInput);
    if (!targetInput) return;

    const preview = root.querySelector('[data-preview]');
    const emptyLabel = root.querySelector('[data-empty]');
    const fileInput = root.querySelector('[data-file-input]');
    const btnLabel = root.querySelector('[data-btn-label]');
    const progressWrap = root.querySelector('[data-progress-wrap]');
    const progressFill = root.querySelector('[data-progress-fill]');

    let previewImg = null;

    function showImage(url) {
      if (!url) return showEmpty();
      if (!previewImg) {
        previewImg = document.createElement('img');
        preview.appendChild(previewImg);
      }
      previewImg.src = url;
      previewImg.style.display = 'block';
      if (emptyLabel) emptyLabel.style.display = 'none';
    }

    function showEmpty() {
      if (previewImg) previewImg.style.display = 'none';
      if (emptyLabel) emptyLabel.style.display = '';
    }

    function setProgress(percent) {
      progressWrap.style.display = percent == null ? 'none' : 'flex';
      if (percent != null) progressFill.style.width = `${percent}%`;
    }

    function resetWidget() {
      targetInput.value = '';
      showEmpty();
      setProgress(null);
      btnLabel.textContent = 'Upload image';
      fileInput.disabled = false;
    }

    // Render whatever value the target input already holds (e.g. an edit modal opening).
    showImage(targetInput.value);

    // Other scripts (e.g. manage-restaurants.js) dispatch 'change' after
    // programmatically setting the target input's value, so the preview
    // stays in sync when editing an existing record.
    targetInput.addEventListener('change', () => showImage(targetInput.value));

    // Clear back to the empty state when the parent form resets.
    const form = root.closest('form');
    if (form) form.addEventListener('reset', resetWidget);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      if (!ALLOWED_TYPES.includes(file.type)) {
        showToast('Please choose a JPEG, PNG, WEBP, or GIF image.', 'error');
        fileInput.value = '';
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast('Image must be 5MB or smaller.', 'error');
        fileInput.value = '';
        return;
      }

      // Instant local preview while the upload is in flight.
      const localUrl = URL.createObjectURL(file);
      showImage(localUrl);

      fileInput.disabled = true;
      btnLabel.textContent = 'Uploading…';
      setProgress(0);

      try {
        const url = await uploadImage(file, type, (pct) => setProgress(pct));
        targetInput.value = url;
        showImage(url);
        showToast('Image uploaded.', 'success');
      } catch (err) {
        showToast(err.message || 'Image upload failed.', 'error');
        showImage(targetInput.value); // fall back to whatever was there before
      } finally {
        URL.revokeObjectURL(localUrl);
        fileInput.disabled = false;
        fileInput.value = '';
        btnLabel.textContent = 'Upload image';
        setProgress(null);
      }
    });
  }

  document.querySelectorAll('[data-img-upload]').forEach(initImageUpload);

  // Exposed for pages that insert widget markup dynamically after page load.
  window.initImageUpload = initImageUpload;
})();
