(function () {
  const form = document.getElementById('create-vendor-form');
  if (!form) return;

  const submitBtn = document.getElementById('cv-submit-btn');
  const submitText = document.getElementById('cv-submit-text');
  const resultBox = document.getElementById('cv-result');

  const f = (id) => document.getElementById(id);
  let submitting = false;

  function setError(fieldId, message) {
    const el = document.querySelector(`[data-error-for="${fieldId}"]`);
    const input = f(fieldId);
    if (el) el.textContent = message || '';
    if (input) input.classList.toggle('invalid', !!message);
  }

  function clearAllErrors() {
    form.querySelectorAll('[data-error-for]').forEach(el => (el.textContent = ''));
    form.querySelectorAll('input.invalid').forEach(el => el.classList.remove('invalid'));
    resultBox.className = 'form-result';
    resultBox.textContent = '';
  }

  function toArray(raw) {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  function validate() {
    let ok = true;

    const vendorPhone = f('cv-vendorPhone').value.trim();
    if (!vendorPhone) { setError('cv-vendorPhone', 'Phone is required.'); ok = false; }
    else if (!/^\+?[1-9]\d{9,14}$/.test(vendorPhone)) { setError('cv-vendorPhone', 'Enter a valid phone number.'); ok = false; }

    const vendorEmail = f('cv-vendorEmail').value.trim();
    if (!vendorEmail) { setError('cv-vendorEmail', 'Email is required.'); ok = false; }
    else if (!/^\S+@\S+\.\S+$/.test(vendorEmail)) { setError('cv-vendorEmail', 'Enter a valid email.'); ok = false; }

    const vendorPassword = f('cv-vendorPassword').value;
    if (!vendorPassword) { setError('cv-vendorPassword', 'Password is required.'); ok = false; }
    else if (vendorPassword.length < 6) { setError('cv-vendorPassword', 'At least 6 characters.'); ok = false; }

    const restaurantName = f('cv-restaurantName').value.trim();
    if (!restaurantName) { setError('cv-restaurantName', 'Restaurant name is required.'); ok = false; }

    const cuisine = toArray(f('cv-cuisine').value);
    if (cuisine.length === 0) { setError('cv-cuisine', 'At least one cuisine is required.'); ok = false; }

    const image = f('cv-image').value.trim();
    if (image && !/^https?:\/\/.+/i.test(image)) { setError('cv-image', 'Must be a valid http(s) URL.'); ok = false; }

    const min = f('cv-deliveryMin').value;
    const max = f('cv-deliveryMax').value;
    if (!min) { setError('cv-deliveryMin', 'Required.'); ok = false; }
    if (!max) { setError('cv-deliveryMax', 'Required.'); ok = false; }
    if (min && max && Number(min) > Number(max)) {
      setError('cv-deliveryMax', 'Must be ≥ min delivery time.'); ok = false;
    }

    const lng = f('cv-longitude').value.trim();
    const lat = f('cv-latitude').value.trim();
    if ((lng && !lat) || (!lng && lat)) {
      setError(lng ? 'cv-latitude' : 'cv-longitude', 'Both longitude and latitude are required together.');
      ok = false;
    } else if (lng && lat) {
      const lngNum = Number(lng), latNum = Number(lat);
      if (lngNum < -180 || lngNum > 180) { setError('cv-longitude', 'Must be between -180 and 180.'); ok = false; }
      if (latNum < -90 || latNum > 90) { setError('cv-latitude', 'Must be between -90 and 90.'); ok = false; }
    }

    return ok;
  }

  function buildPayload() {
    const lng = f('cv-longitude').value.trim();
    const lat = f('cv-latitude').value.trim();

    const payload = {
      vendorName: f('cv-vendorName').value.trim() || undefined,
      vendorEmail: f('cv-vendorEmail').value.trim(),
      vendorPhone: f('cv-vendorPhone').value.trim(),
      vendorPassword: f('cv-vendorPassword').value,
      restaurantName: f('cv-restaurantName').value.trim(),
      cuisine: toArray(f('cv-cuisine').value),
      address: f('cv-address').value.trim() || undefined,
      image: f('cv-image').value.trim() || undefined,
      categories: toArray(f('cv-categories').value),
      estimatedDeliveryMin: Number(f('cv-deliveryMin').value),
      estimatedDeliveryMax: Number(f('cv-deliveryMax').value),
      deliveryFee: f('cv-deliveryFee').value ? Number(f('cv-deliveryFee').value) : undefined,
      platformFee: f('cv-platformFee').value ? Number(f('cv-platformFee').value) : undefined,
      minOrder: f('cv-minOrder').value ? Number(f('cv-minOrder').value) : undefined,
      freeDeliveryAbove: f('cv-freeDeliveryAbove').value ? Number(f('cv-freeDeliveryAbove').value) : undefined,
      isVeg: f('cv-isVeg').checked,
    };

    if (lng && lat) {
      payload.location = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
    }

    return payload;
  }

  function setLoading(loading) {
    submitting = loading;
    submitBtn.disabled = loading;
    submitText.innerHTML = loading
      ? '<span class="btn-spinner"></span> Creating vendor…'
      : 'Create vendor';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return; // hard guard against duplicate submissions

    clearAllErrors();
    if (!validate()) {
      showToast('Please fix the highlighted fields.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest('/auth/admin/create-vendor', {
        method: 'POST',
        body: buildPayload(),
      });

      resultBox.textContent = `✓ ${res.message || 'Vendor created successfully.'} (${res.vendor?.email})`;
      resultBox.className = 'form-result show success';
      showToast('Vendor account created.', 'success');
      form.reset();
    } catch (err) {
      resultBox.textContent = err.message || 'Could not create vendor. Please try again.';
      resultBox.className = 'form-result show error';
      showToast(err.message || 'Vendor creation failed.', 'error');
    } finally {
      setLoading(false);
    }
  });

  form.addEventListener('reset', () => {
    setTimeout(clearAllErrors, 0);
  });
})();
