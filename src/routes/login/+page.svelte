<script lang="ts">
  import { goto } from '$app/navigation';
  import { signIn, signUp } from '$lib/supabase/auth';

  let mode: 'login' | 'signup' = $state('login');
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    error = null;
    success = null;

    if (mode === 'login') {
      const result = await signIn(email, password);
      if (result.error) {
        error = result.error;
      } else {
        goto('/lists');
      }
    } else {
      const result = await signUp(email, password);
      if (result.error) {
        error = result.error;
      } else if (result.session) {
        goto('/lists');
      } else {
        success = 'Check your email for the confirmation link!';
        mode = 'login';
      }
    }

    loading = false;
  }

  function toggleMode() {
    mode = mode === 'login' ? 'signup' : 'login';
    error = null;
    success = null;
  }
</script>

<div class="login-container">
  <div class="login-card card">
    <h1>{mode === 'login' ? 'Log In' : 'Sign Up'}</h1>

    <form onsubmit={handleSubmit}>
      <div class="form-group">
        <label for="email">Email</label>
        <input
          type="email"
          id="email"
          bind:value={email}
          required
          disabled={loading}
          placeholder="you@example.com"
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          bind:value={password}
          required
          disabled={loading}
          minlength="6"
          placeholder="Min 6 characters"
        />
      </div>

      {#if error}
        <div class="message error">{error}</div>
      {/if}

      {#if success}
        <div class="message success">{success}</div>
      {/if}

      <button type="submit" class="btn btn-primary submit-btn" disabled={loading}>
        {#if loading}
          Loading...
        {:else}
          {mode === 'login' ? 'Log In' : 'Sign Up'}
        {/if}
      </button>
    </form>

    <div class="toggle-mode">
      {#if mode === 'login'}
        Don't have an account?
        <button type="button" class="link-btn" onclick={toggleMode}>Sign up</button>
      {:else}
        Already have an account?
        <button type="button" class="link-btn" onclick={toggleMode}>Log in</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .login-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    padding: 1rem;
  }

  .login-card {
    width: 100%;
    max-width: 400px;
    padding: 2rem;
  }

  h1 {
    text-align: center;
    margin-bottom: 1.5rem;
    color: var(--color-primary);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 500;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  input {
    width: 100%;
  }

  .message {
    padding: 0.75rem;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
  }

  .error {
    background-color: rgba(255, 107, 107, 0.15);
    color: var(--color-red);
    border: 1px solid var(--color-red);
  }

  .success {
    background-color: rgba(38, 222, 129, 0.15);
    color: var(--color-green);
    border: 1px solid var(--color-green);
  }

  .submit-btn {
    width: 100%;
    padding: 0.75rem;
    margin-top: 0.5rem;
  }

  .submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .toggle-mode {
    text-align: center;
    margin-top: 1.5rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .link-btn {
    color: var(--color-primary);
    font-weight: 500;
    padding: 0;
    margin-left: 0.25rem;
  }

  .link-btn:hover {
    text-decoration: underline;
  }
</style>
