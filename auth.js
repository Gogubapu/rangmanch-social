const sb = window.supabase.createClient(INDIANFEED_SUPABASE_URL, INDIANFEED_SUPABASE_ANON_KEY);
const form = document.getElementById("authForm");
const error = document.getElementById("authError");
const mfaForm = document.getElementById("mfaChallengeForm");
const forgotForm = document.getElementById("forgotPasswordForm");
let loginMfaFactor = null;
let loginMfaChallenge = null;

async function finishLogin() {
	const { data: assurance, error: assuranceError } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
	if (assuranceError) throw assuranceError;
	if (assurance.currentLevel !== "aal2" && assurance.nextLevel === "aal2") {
		const { data: factors, error: factorsError } = await sb.auth.mfa.listFactors();
		if (factorsError) throw factorsError;
		loginMfaFactor = (factors.totp || []).find(factor => factor.status === "verified");
		if (!loginMfaFactor) throw new Error("Your account requires multi-factor authentication, but no verified authenticator is available.");
		const { data: challenge, error: challengeError } = await sb.auth.mfa.challenge({ factorId: loginMfaFactor.id });
		if (challengeError) throw challengeError;
		loginMfaChallenge = challenge;
		form.hidden = true;
		forgotForm.hidden = true;
		mfaForm.hidden = false;
		document.getElementById("mfaLoginCode").focus();
		error.classList.remove("success-message");
		error.textContent = "Enter the code from your authenticator app.";
		return;
	}
	location.assign("/");
}

form.addEventListener("submit", async event => {
	event.preventDefault();
	error.classList.remove("success-message");
	error.textContent = "";
	const mode = form.dataset.mode;
	const button = form.querySelector(".auth-submit");
	button.disabled = true;
	button.textContent = mode === "login" ? "Signing in…" : "Creating account…";
	try {
		let result;
		if (mode === "login") {
			result = await sb.auth.signInWithPassword({ email: document.getElementById("authEmail").value.trim(), password: document.getElementById("authPassword").value });
		} else {
			const username = document.getElementById("authUsername").value.trim().toLowerCase();
			if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new Error("Username must be 3–30 letters, numbers or underscores.");
			result = await sb.auth.signUp({
				email: document.getElementById("authEmail").value.trim(),
				password: document.getElementById("authPassword").value,
				options: { data: { username, display_name: document.getElementById("authName").value.trim() } }
			});
			if (!result.error && result.data.user && !result.data.session) {
				error.classList.add("success-message");
				error.textContent = "Check your email to confirm your account, then log in.";
				return;
			}
		}
		if (result.error) throw result.error;
		if (mode === "login") await finishLogin();
		else location.assign("/");
	} catch (err) {
		error.classList.remove("success-message");
		error.textContent = err.message || "Could not continue. Please try again.";
	} finally {
		button.disabled = false;
		button.textContent = mode === "login" ? "Log in" : "Create account";
	}
});

mfaForm.addEventListener("submit", async event => {
	event.preventDefault();
	const button = mfaForm.querySelector(".auth-submit");
	const code = document.getElementById("mfaLoginCode").value.trim();
	if (!loginMfaFactor || !loginMfaChallenge) return;
	button.disabled = true;
	error.textContent = "Verifying code…";
	try {
		const { error: verifyError } = await sb.auth.mfa.verify({ factorId: loginMfaFactor.id, challengeId: loginMfaChallenge.id, code });
		if (verifyError) throw verifyError;
		location.assign("/");
	} catch (err) {
		error.textContent = err.message || "That code could not be verified. Try again.";
		document.getElementById("mfaLoginCode").select();
	} finally {
		button.disabled = false;
	}
});

document.getElementById("forgotPasswordButton").addEventListener("click", () => {
	error.textContent = "";
	document.getElementById("resetEmail").value = document.getElementById("authEmail").value.trim();
	form.hidden = true;
	forgotForm.hidden = false;
	document.getElementById("resetEmail").focus();
});
document.getElementById("cancelPasswordReset").addEventListener("click", () => { forgotForm.hidden = true; form.hidden = false; });
document.getElementById("cancelMfaLogin").addEventListener("click", async () => {
	await sb.auth.signOut();
	loginMfaFactor = null; loginMfaChallenge = null;
	mfaForm.hidden = true; form.hidden = false; error.textContent = "";
});
forgotForm.addEventListener("submit", async event => {
	event.preventDefault();
	const button = forgotForm.querySelector(".auth-submit");
	button.disabled = true;
	button.textContent = "Sending…";
	try {
		const { error: resetError } = await sb.auth.resetPasswordForEmail(document.getElementById("resetEmail").value.trim(), {
			redirectTo: `${location.origin}/reset-password.html`
		});
		if (resetError) throw resetError;
		error.classList.add("success-message");
		error.textContent = "If an account exists for that email, a password reset link is on its way.";
	} catch (err) {
		error.classList.remove("success-message");
		error.textContent = err.message || "Could not send a reset link. Please try again.";
	} finally {
		button.disabled = false;
		button.textContent = "Send reset link";
	}
});
