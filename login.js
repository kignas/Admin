(function () {
  // Already signed in — skip straight to the dashboard.
  if (AdminAuth.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const emailError = document.getElementById('email-error');
  const passwordError = document.getElementById('password-error');
  const loginError = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');
  const loginBtnText = document.getElementById('login-btn-text');

  let submitting = false;

  function clearErrors() {
    emailError.textContent = '';
    passwordError.textContent = '';
    loginError.classList.remove('show');
    loginError.textContent = '';
    emailInput.classList.remove('invalid');
    passwordInput.classList.remove('invalid');
  }

  function validate() {
    let ok = true;
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      emailError.textContent = 'Email is required.';
      emailInput.classList.add('invalid');
      ok = false;
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      emailError.textContent = 'Enter a valid email address.';
      emailInput.classList.add('invalid');
      ok = false;
    }

    if (!password) {
      passwordError.textContent = 'Password is required.';
      passwordInput.classList.add('invalid');
      ok = false;
    }

    return ok;
  }

  function setLoading(loading) {
    submitting = loading;
    loginBtn.disabled = loading;
    loginBtnText.innerHTML = loading
      ? '<span class="btn-spinner"></span> Signing in…'
      : 'Sign in';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return; // prevent duplicate submissions

    clearErrors();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await apiRequest('/admin/login', {
        method: 'POST',
        body: {
          email: emailInput.value.trim(),
          password: passwordInput.value,
        },
      });

      AdminAuth.setSession(res.data.token, res.data.user);
      window.location.href = 'index.html';
    } catch (err) {
      loginError.textContent = err.message || 'Sign in failed. Please try again.';
      loginError.classList.add('show');
      setLoading(false);
    }
  });
})();
