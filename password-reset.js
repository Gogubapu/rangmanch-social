const resetClient = window.supabase.createClient(INDIANFEED_SUPABASE_URL, INDIANFEED_SUPABASE_ANON_KEY);
const resetForm = document.getElementById("passwordResetForm");
const resetStatus = document.getElementById("resetStatus");
const savePasswordButton = document.getElementById("saveNewPassword");
let recoverySessionReady = false;

async function checkRecoverySession() {
  const { data, error } = await resetClient.auth.getSession();
  if (error) { resetStatus.textContent = error.message; return; }
  recoverySessionReady = Boolean(data.session);
  savePasswordButton.disabled = !recoverySessionReady;
  resetStatus.textContent = recoverySessionReady
    ? "Reset link verified. Choose a new password."
    : "This reset link is invalid or expired. Request a new one from login.";
}

resetClient.auth.onAuthStateChange(event => {
  if (event === "PASSWORD_RECOVERY") {
    recoverySessionReady = true;
    savePasswordButton.disabled = false;
    resetStatus.textContent = "Reset link verified. Choose a new password.";
  }
});

resetForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!recoverySessionReady) return;
  const password = document.getElementById("newPassword").value;
  const confirmation = document.getElementById("confirmPassword").value;
  if (password.length < 8) { resetStatus.textContent = "Use at least 8 characters."; return; }
  if (password !== confirmation) { resetStatus.textContent = "The passwords do not match."; return; }
  savePasswordButton.disabled = true;
  resetStatus.textContent = "Updating password…";
  const { error } = await resetClient.auth.updateUser({ password });
  if (error) {
    resetStatus.textContent = error.message;
    savePasswordButton.disabled = false;
    return;
  }
  await resetClient.auth.signOut();
  resetStatus.textContent = "Password updated. You can now log in with your new password.";
  resetStatus.classList.add("success-message");
  resetForm.hidden = true;
});

checkRecoverySession();
