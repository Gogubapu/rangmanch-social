const supa = window.supabase.createClient(INDIANFEED_SUPABASE_URL, INDIANFEED_SUPABASE_ANON_KEY);
const feed = document.getElementById("feed");
const modal = document.getElementById("createModal");
let posts = [], liked = {}, viewMode = "home", selectedUser = "", activeUserId = "", activeUsername = "", viewedProfile = null;
let followedUserIds = new Set();
let pendingFollowRequestIds = new Set();
let relationshipMode = "following";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function toast(message) { const el = document.getElementById("toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2200); }
function updateAccountAvatarImages(avatarUrl) {
  const source = avatarUrl || "https://i.pravatar.cc/120?img=47";
  document.querySelector(".user-row img").src = source;
  document.querySelector("#storyAdd img").src = source;
  document.getElementById("profileAvatar").src = source;
  document.querySelectorAll('a[href="#profile"] img').forEach(image => { image.src = source; });
}
function updateFollowButton(button, isFollowing) {
  button.textContent = isFollowing ? "Following" : "Follow";
  button.classList.toggle("is-following", isFollowing);
  button.setAttribute("aria-pressed", String(isFollowing));
}
function updateFollowAction(button, profileId, isPrivate = false) {
  button.dataset.followId = profileId;
  button.dataset.private = String(isPrivate);
  if (followedUserIds.has(profileId)) updateFollowButton(button, true);
  else if (pendingFollowRequestIds.has(profileId)) {
    button.textContent = "Requested";
    button.classList.remove("is-following");
    button.classList.add("is-requested");
    button.setAttribute("aria-pressed", "true");
  } else { button.classList.remove("is-requested"); updateFollowButton(button, false); }
}
async function loadFollowing() {
  const [{ data, error }, { data: requests, error: requestsError }] = await Promise.all([
    supa.from("user_follows").select("following_id").eq("follower_id", activeUserId),
    supa.from("follow_requests").select("target_id").eq("requester_id", activeUserId).eq("status", "pending")
  ]);
  if (error || requestsError) { console.warn(error || requestsError); return; }
  followedUserIds = new Set((data || []).map(follow => follow.following_id));
  pendingFollowRequestIds = new Set((requests || []).map(request => request.target_id));
  document.querySelectorAll(".follow-toggle[data-follow-id]").forEach(button => updateFollowAction(button, button.dataset.followId, button.dataset.private === "true"));
}
const notificationsModal = document.getElementById("notificationsModal");
let notificationRefreshTimer;
function setNotificationBadge(count) {
  const badge = document.getElementById("notificationBadge");
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.hidden = count < 1;
  document.getElementById("mobileNotificationDot").hidden = count < 1;
}
async function loadNotifications(markRead = false) {
  const list = document.getElementById("notificationsList");
  const { data, error } = await supa.from("notifications").select("id,actor_id,event_type,post_id,follow_request_id,created_at,read_at").order("created_at", { ascending: false }).limit(100);
  if (error) { console.warn(error.message); if (!notificationsModal.hidden) list.innerHTML = `<p class="notification-empty">${esc(error.message)}</p>`; return; }
  const { data: pendingRequests, error: requestError } = await supa.from("follow_requests").select("id").eq("target_id", activeUserId).eq("status", "pending");
  if (requestError) console.warn(requestError.message);
  const pendingRequestIds = new Set((pendingRequests || []).map(request => request.id));
  const unreadIds = (data || []).filter(item => !item.read_at).map(item => item.id);
  setNotificationBadge(markRead ? 0 : unreadIds.length);
  if (markRead && unreadIds.length) {
    const { error: updateError } = await supa.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    if (updateError) console.warn(updateError.message);
  }
  if (notificationsModal.hidden) return;
  const actorIds = [...new Set((data || []).map(item => item.actor_id))];
  const { data: actors, error: actorError } = actorIds.length
    ? await supa.from("profiles").select("id,username,avatar_url").in("id", actorIds)
    : { data: [], error: null };
  if (actorError) { list.innerHTML = `<p class="notification-empty">${esc(actorError.message)}</p>`; return; }
  const actorsById = new Map((actors || []).map(actor => [actor.id, actor]));
  const labels = { post_like: "liked your post", comment: "commented on your post", new_follower: "started following you", follow_request: "requested to follow you", follow_request_accepted: "accepted your follow request" };
  list.innerHTML = data?.length ? data.map(item => {
    const actor = actorsById.get(item.actor_id);
    if (!actor) return "";
    const actions = item.event_type === "follow_request" && pendingRequestIds.has(item.follow_request_id) ? `<div class="notification-request-actions"><button type="button" data-request-action="accepted" data-request-id="${esc(item.follow_request_id)}">Accept</button><button type="button" data-request-action="declined" data-request-id="${esc(item.follow_request_id)}">Decline</button></div>` : "";
    return `<article class="notification-item ${item.read_at || markRead ? "read" : "unread"}"><button class="notification-actor" type="button" data-actor-id="${esc(actor.id)}"><img src="${esc(actor.avatar_url || "https://i.pravatar.cc/80?img=47")}" alt=""><span><b>${esc(actor.username)}</b> ${labels[item.event_type] || "interacted with you"}<small>${new Date(item.created_at).toLocaleString()}</small></span></button>${actions}</article>`;
  }).join("") || '<p class="notification-empty">You are all caught up.</p>' : '<p class="notification-empty">You are all caught up.</p>';
}
async function respondToFollowRequest(requestId, response) {
  const list = document.getElementById("notificationsList");
  const actions = list.querySelector(`[data-request-id="${CSS.escape(requestId)}"]`)?.parentElement;
  if (actions) actions.querySelectorAll("button").forEach(button => { button.disabled = true; });
  const request = response === "accepted"
    ? supa.from("follow_requests").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", requestId).eq("target_id", activeUserId).eq("status", "pending")
    : supa.from("follow_requests").delete().eq("id", requestId).eq("target_id", activeUserId).eq("status", "pending");
  const { error } = await request;
  if (error) { if (actions) actions.querySelectorAll("button").forEach(button => { button.disabled = false; }); return toast(error.message); }
  await Promise.all([loadNotifications(), loadFollowing(), loadProfileStats()]);
  toast(response === "accepted" ? "Follow request accepted" : "Follow request declined");
}
async function openNotifications() {
  if (!activeUserId) return location.assign("/login");
  notificationsModal.hidden = false;
  await loadFollowing();
  await loadNotifications(true);
}
function closeNotifications() { notificationsModal.hidden = true; }
async function loadProfileStats() {
  const [postResult, followerResult, followingResult] = await Promise.all([
    supa.from("posts").select("id", { count: "exact", head: true }).eq("author_id", activeUserId),
    supa.from("user_follows").select("follower_id", { count: "exact", head: true }).eq("following_id", activeUserId),
    supa.from("user_follows").select("following_id", { count: "exact", head: true }).eq("follower_id", activeUserId)
  ]);
  if (postResult.error || followerResult.error || followingResult.error) {
    console.warn(postResult.error || followerResult.error || followingResult.error);
    return;
  }
  document.getElementById("profilePostCount").textContent = postResult.count || 0;
  document.getElementById("profileFollowerCount").textContent = followerResult.count || 0;
  document.getElementById("profileFollowingCount").textContent = followingResult.count || 0;
  document.getElementById("kpiFollowers").textContent = followerResult.count || 0;
}
async function loadViewedProfileStats(profileId = viewedProfile?.id) {
  if (!profileId) return;
  const { data, error } = await supa.rpc("get_profile_counts", { profile_ids: [profileId] });
  if (error) { console.warn(error.message); return; }
  const counts = data?.[0];
  if (!counts || viewedProfile?.id !== profileId) return;
  document.getElementById("profilePostCount").textContent = counts.posts_count || 0;
  document.getElementById("profileFollowerCount").textContent = counts.followers_count || 0;
  document.getElementById("profileFollowingCount").textContent = counts.following_count || 0;
}
async function openProfile(profileId) {
  const { data: profile, error } = await supa.from("profiles").select("id,username,display_name,avatar_url,bio,is_private").eq("id", profileId).maybeSingle();
  if (error || !profile) { toast(error?.message || "Profile not found"); return; }
  viewedProfile = profile;
  viewMode = "profile";
  selectedUser = "";
  searchPanel.hidden = true;
  document.getElementById("profileAvatar").src = profile.avatar_url || "https://i.pravatar.cc/120?img=47";
  document.getElementById("profileUsername").textContent = profile.username;
  document.getElementById("profileDisplayName").textContent = profile.display_name || "";
  document.getElementById("profileBio").textContent = profile.bio || "";
  document.getElementById("profilePrivacyLabel").hidden = !profile.is_private;
  const followButton = document.getElementById("profileFollowButton");
  followButton.hidden = profile.id === activeUserId;
  followButton.dataset.followId = profile.id;
  updateFollowAction(followButton, profile.id, profile.is_private);
  document.getElementById("editProfileButton").hidden = profile.id !== activeUserId;
  document.getElementById("showFollowers").disabled = profile.id !== activeUserId;
  document.getElementById("showFollowing").disabled = profile.id !== activeUserId;
  renderFeed();
  document.querySelectorAll(".nav-item[href]").forEach(item => item.classList.toggle("active", item.getAttribute("href") === "#profile"));
  await Promise.all([loadSocial(), loadViewedProfileStats(profile.id)]);
}
let selectedProfilePhoto = null;
let profilePhotoPreviewUrl = "";
function closeProfileEditor() {
  if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
  profilePhotoPreviewUrl = "";
  selectedProfilePhoto = null;
  document.getElementById("profilePhotoInput").value = "";
  if (pendingMfaFactorId) {
    const factorId = pendingMfaFactorId;
    pendingMfaFactorId = null;
    supa.auth.mfa.unenroll({ factorId });
  }
  document.getElementById("profileEditModal").hidden = true;
}
function openProfileEditor() {
  if (!viewedProfile || viewedProfile.id !== activeUserId) return;
  document.getElementById("editDisplayName").value = viewedProfile.display_name || "";
  document.getElementById("editUsername").value = viewedProfile.username || "";
  document.getElementById("editBio").value = viewedProfile.bio || "";
  document.getElementById("editPrivateAccount").checked = Boolean(viewedProfile.is_private);
  document.getElementById("editBioCount").textContent = (viewedProfile.bio || "").length;
  document.getElementById("profilePhotoPreview").src = viewedProfile.avatar_url || "https://i.pravatar.cc/120?img=47";
  document.getElementById("profileEditStatus").textContent = "";
  document.getElementById("profileEditModal").hidden = false;
  loadMfaSettings();
}
let pendingMfaFactorId = null;
let verifiedMfaFactorId = null;
async function loadMfaSettings() {
  const status = document.getElementById("mfaStatus");
  status.textContent = "Checking account security…";
  const { data, error } = await supa.auth.mfa.listFactors();
  if (error) { status.textContent = error.message; return; }
  const verified = (data.totp || []).find(factor => factor.status === "verified");
  verifiedMfaFactorId = verified?.id || null;
  document.getElementById("enableMfaButton").hidden = Boolean(verified);
  document.getElementById("disableMfaButton").hidden = !verified;
  document.getElementById("mfaEnrollment").hidden = true;
  document.getElementById("mfaSettingsSummary").textContent = verified ? "An authenticator app protects your sign-in." : "Add an authenticator app for an extra sign-in step.";
  status.textContent = verified ? "Two-factor authentication is enabled." : "Two-factor authentication is not enabled.";
}
document.getElementById("enableMfaButton").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  const status = document.getElementById("mfaStatus");
  status.textContent = "Preparing authenticator setup…";
  try {
    const { data, error } = await supa.auth.mfa.enroll({ factorType: "totp", friendlyName: "RangManch authenticator" });
    if (error) throw error;
    pendingMfaFactorId = data.id;
    document.getElementById("mfaQrCode").src = data.totp.qr_code;
    document.getElementById("mfaSecret").textContent = data.totp.secret;
    document.getElementById("mfaSetupCode").value = "";
    document.getElementById("mfaEnrollment").hidden = false;
    status.textContent = "Scan the QR code, then enter the current code to verify setup.";
    document.getElementById("mfaSetupCode").focus();
  } catch (error) { status.textContent = error.message || "Could not start authenticator setup."; }
  finally { button.disabled = false; }
});
document.getElementById("verifyMfaSetup").addEventListener("click", async event => {
  if (!pendingMfaFactorId) return;
  const button = event.currentTarget;
  const status = document.getElementById("mfaStatus");
  const code = document.getElementById("mfaSetupCode").value.trim();
  if (!/^\d{6,8}$/.test(code)) { status.textContent = "Enter the current code from your authenticator app."; return; }
  button.disabled = true;
  try {
    const { data: challenge, error: challengeError } = await supa.auth.mfa.challenge({ factorId: pendingMfaFactorId });
    if (challengeError) throw challengeError;
    const { error } = await supa.auth.mfa.verify({ factorId: pendingMfaFactorId, challengeId: challenge.id, code });
    if (error) throw error;
    pendingMfaFactorId = null;
    await loadMfaSettings();
    toast("Two-factor authentication enabled");
  } catch (error) { status.textContent = error.message || "That code could not be verified."; }
  finally { button.disabled = false; }
});
document.getElementById("cancelMfaSetup").addEventListener("click", async () => {
  if (pendingMfaFactorId) await supa.auth.mfa.unenroll({ factorId: pendingMfaFactorId });
  pendingMfaFactorId = null;
  await loadMfaSettings();
});
document.getElementById("disableMfaButton").addEventListener("click", async event => {
  if (!verifiedMfaFactorId || !confirm("Turn off two-factor authentication?")) return;
  event.currentTarget.disabled = true;
  const { error } = await supa.auth.mfa.unenroll({ factorId: verifiedMfaFactorId });
  event.currentTarget.disabled = false;
  if (error) { document.getElementById("mfaStatus").textContent = error.message; return; }
  await loadMfaSettings();
  toast("Two-factor authentication disabled");
});
document.getElementById("profilePhotoInput").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  const status = document.getElementById("profileEditStatus");
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) { status.textContent = "Choose a JPG, PNG, or WebP image."; event.target.value = ""; return; }
  if (file.size > 5 * 1024 * 1024) { status.textContent = "Profile photos must be under 5 MB."; event.target.value = ""; return; }
  if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
  selectedProfilePhoto = file;
  profilePhotoPreviewUrl = URL.createObjectURL(file);
  document.getElementById("profilePhotoPreview").src = profilePhotoPreviewUrl;
  status.textContent = "Photo ready to upload.";
});
document.getElementById("editBio").addEventListener("input", event => { document.getElementById("editBioCount").textContent = event.target.value.length; });
document.getElementById("profileEditForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!activeUserId || viewedProfile?.id !== activeUserId) return;
  const username = document.getElementById("editUsername").value.trim().toLowerCase();
  const status = document.getElementById("profileEditStatus");
  const saveButton = document.getElementById("saveProfileButton");
  if (!/^[a-z0-9_]{3,30}$/.test(username)) { status.textContent = "Username must be 3–30 letters, numbers, or underscores."; return; }
  saveButton.disabled = true;
  status.textContent = "Saving profile…";
  try {
    let avatarUrl = viewedProfile.avatar_url;
    if (selectedProfilePhoto) {
      const extension = selectedProfilePhoto.type === "image/png" ? "png" : selectedProfilePhoto.type === "image/webp" ? "webp" : "jpg";
      const path = `${activeUserId}/profile/${crypto.randomUUID()}.${extension}`;
      const { data: upload, error: uploadError } = await supa.storage.from("indianfeed-media").upload(path, selectedProfilePhoto, { contentType: selectedProfilePhoto.type, upsert: true });
      if (uploadError) throw uploadError;
      avatarUrl = supa.storage.from("indianfeed-media").getPublicUrl(upload.path).data.publicUrl;
    }
    const updates = { username, display_name: document.getElementById("editDisplayName").value.trim(), bio: document.getElementById("editBio").value.trim(), avatar_url: avatarUrl, is_private: document.getElementById("editPrivateAccount").checked };
    const { data, error } = await supa.from("profiles").update(updates).eq("id", activeUserId).select("id,username,display_name,avatar_url,bio,is_private").single();
    if (error) throw error;
    viewedProfile = data;
    activeUsername = data.username;
    document.getElementById("profileUsername").textContent = data.username;
    document.getElementById("profileDisplayName").textContent = data.display_name || "";
    document.getElementById("profileBio").textContent = data.bio || "";
    document.getElementById("profilePrivacyLabel").hidden = !data.is_private;
    updateAccountAvatarImages(data.avatar_url);
    document.querySelector(".user-row b").textContent = data.username;
    document.querySelector(".user-row small").textContent = data.display_name || "";
    closeProfileEditor();
    await loadSocial();
    toast("Profile updated");
  } catch (error) {
    status.textContent = /duplicate key|unique constraint/i.test(error.message || "") ? "That username is already taken." : error.message;
  } finally {
    saveButton.disabled = false;
  }
});
let conversations = [];
let activeConversation = null;
let messageRefreshTimer;
const messagesModal = document.getElementById("messagesModal");
const conversationList = document.getElementById("conversationList");
const chatPanel = document.getElementById("chatPanel");
const messageEmojis = ["❤️", "😂", "😮", "😢", "👏", "🔥"];
function renderMessageBubbles(messages, reactions) {
  const byMessage = new Map();
  (reactions || []).forEach(reaction => {
    if (!byMessage.has(reaction.message_id)) byMessage.set(reaction.message_id, []);
    byMessage.get(reaction.message_id).push(reaction);
  });
  return (messages || []).map(message => {
    const grouped = new Map();
    (byMessage.get(message.id) || []).forEach(reaction => {
      if (!grouped.has(reaction.emoji)) grouped.set(reaction.emoji, []);
      grouped.get(reaction.emoji).push(reaction);
    });
    const reactionsHtml = `<div class="message-reactions">${[...grouped].map(([emoji, items]) => `<button type="button" class="reaction-chip ${items.some(item => item.user_id === activeUserId) ? "selected" : ""}" data-message-id="${esc(message.id)}" data-emoji="${esc(emoji)}" aria-label="${esc(emoji)} reaction, ${items.length}" aria-pressed="${items.some(item => item.user_id === activeUserId)}">${esc(emoji)} <span>${items.length}</span></button>`).join("")}</div>`;
    const picker = `<div class="reaction-picker" aria-label="React to message">${messageEmojis.map(emoji => `<button type="button" data-message-id="${esc(message.id)}" data-emoji="${esc(emoji)}" aria-label="React ${esc(emoji)}">${emoji}</button>`).join("")}</div>`;
    return `<div class="message-bubble ${message.sender_id === activeUserId ? "outgoing" : "incoming"}" data-message-id="${esc(message.id)}"><p>${esc(message.body)}</p><time>${new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>${reactionsHtml}${picker}</div>`;
  }).join("");
}
function setMessageBadge(count) {
  const badge = document.getElementById("messageBadge");
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.hidden = count < 1;
}
function conversationUserId(message) { return message.sender_id === activeUserId ? message.recipient_id : message.sender_id; }
async function loadMessages() {
  const { data, error } = await supa.from("direct_messages").select("id,sender_id,recipient_id,body,created_at,read_at").or(`sender_id.eq.${activeUserId},recipient_id.eq.${activeUserId}`).order("created_at", { ascending: false }).limit(500);
  if (error) { console.warn(error.message); return; }
  const latestByPerson = new Map();
  let unread = 0;
  (data || []).forEach(message => {
    if (message.recipient_id === activeUserId && !message.read_at) unread++;
    const personId = conversationUserId(message);
    if (!latestByPerson.has(personId)) latestByPerson.set(personId, { personId, latest: message, unread: 0 });
    if (message.recipient_id === activeUserId && !message.read_at) latestByPerson.get(personId).unread++;
  });
  const ids = [...latestByPerson.keys()];
  let profilesById = new Map();
  if (ids.length) {
    const { data: profiles, error: profileError } = await supa.from("profiles").select("id,username,display_name,avatar_url").in("id", ids);
    if (profileError) { console.warn(profileError.message); return; }
    profilesById = new Map((profiles || []).map(profile => [profile.id, profile]));
  }
  conversations = [...latestByPerson.values()].map(item => ({ ...item, profile: profilesById.get(item.personId) })).filter(item => item.profile);
  setMessageBadge(unread);
  if (!document.getElementById("messageSearch").value.trim()) renderConversations();
}
function renderConversations(filter = "") {
  const matches = conversations.filter(item => `${item.profile.username} ${item.profile.display_name || ""}`.toLowerCase().includes(filter.toLowerCase()));
  conversationList.innerHTML = matches.length ? matches.map(item => `<button class="conversation-item ${activeConversation === item.personId ? "selected" : ""}" data-person-id="${esc(item.personId)}"><img src="${esc(item.profile.avatar_url || "https://i.pravatar.cc/80?img=47")}" alt=""><span><b>${esc(item.profile.username)}</b><small>${esc(item.latest.body)}</small></span><time>${new Date(item.latest.created_at).toLocaleDateString()}</time>${item.unread ? `<i>${item.unread > 9 ? "9+" : item.unread}</i>` : ""}</button>`).join("") : '<p class="message-empty">No conversations yet.</p>';
}
async function renderConversation(personId, markRead = true) {
  activeConversation = personId;
  renderConversations(document.getElementById("messageSearch").value.trim());
  const conversation = conversations.find(item => item.personId === personId);
  let person = conversation?.profile;
  if (!person) {
    const { data, error } = await supa.from("profiles").select("id,username,display_name,avatar_url").eq("id", personId).maybeSingle();
    if (error || !data) { chatPanel.innerHTML = '<div class="chat-empty"><span>Could not open this conversation.</span></div>'; return; }
    person = data;
  }
  if (markRead) {
    const { error } = await supa.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("sender_id", personId).eq("recipient_id", activeUserId).is("read_at", null);
    if (error) console.warn(error.message);
  }
  const { data: messages, error } = await supa.from("direct_messages").select("id,sender_id,recipient_id,body,created_at").or(`and(sender_id.eq.${activeUserId},recipient_id.eq.${personId}),and(sender_id.eq.${personId},recipient_id.eq.${activeUserId})`).order("created_at", { ascending: true }).limit(500);
  if (error) { chatPanel.innerHTML = `<div class="chat-empty">${esc(error.message)}</div>`; return; }
  const messageIds = (messages || []).map(message => message.id);
  const { data: reactions, error: reactionsError } = messageIds.length
    ? await supa.from("message_reactions").select("message_id,user_id,emoji").in("message_id", messageIds)
    : { data: [], error: null };
  if (reactionsError) console.warn(reactionsError.message);
  messagesModal.classList.add("conversation-open");
  chatPanel.innerHTML = `<header class="chat-header"><button class="chat-back" type="button" aria-label="Back to inbox">‹</button><img src="${esc(person.avatar_url || "https://i.pravatar.cc/80?img=47")}" alt=""><span><b>${esc(person.username)}</b><small>${esc(person.display_name || "RangManch member")}</small></span></header><div class="chat-messages" id="chatMessages">${messages?.length ? renderMessageBubbles(messages, reactions) : '<p class="message-empty chat-start">Say hello and start the conversation.</p>'}</div><form class="message-compose" id="messageCompose"><input id="messageInput" maxlength="2000" autocomplete="off" placeholder="Write a message…" required><button type="submit" aria-label="Send message">Send</button></form>`;
  const messageScroll = document.getElementById("chatMessages");
  messageScroll.scrollTop = messageScroll.scrollHeight;
  document.getElementById("messageCompose").addEventListener("submit", sendMessage);
  if (markRead) await loadMessages();
}
async function sendMessage(event) {
  event.preventDefault();
  const input = document.getElementById("messageInput");
  const body = input.value.trim();
  if (!body || !activeConversation) return;
  const submit = event.currentTarget.querySelector("button");
  submit.disabled = true;
  const { error } = await supa.from("direct_messages").insert({ sender_id: activeUserId, recipient_id: activeConversation, body });
  submit.disabled = false;
  if (error) return toast(error.message);
  input.value = "";
  await loadMessages();
  await renderConversation(activeConversation, false);
}
async function refreshActiveConversation() {
  const messageScroll = document.getElementById("chatMessages");
  if (!messageScroll || !activeConversation) return;
  const wasAtBottom = messageScroll.scrollHeight - messageScroll.scrollTop - messageScroll.clientHeight < 48;
  const personId = activeConversation;
  const { data: messages, error } = await supa.from("direct_messages").select("id,sender_id,recipient_id,body,created_at,read_at").or(`and(sender_id.eq.${activeUserId},recipient_id.eq.${personId}),and(sender_id.eq.${personId},recipient_id.eq.${activeUserId})`).order("created_at", { ascending: true }).limit(500);
  if (error || activeConversation !== personId || !document.getElementById("chatMessages")) return;
  const messageIds = (messages || []).map(message => message.id);
  const { data: reactions, error: reactionsError } = messageIds.length
    ? await supa.from("message_reactions").select("message_id,user_id,emoji").in("message_id", messageIds)
    : { data: [], error: null };
  if (reactionsError) console.warn(reactionsError.message);
  messageScroll.innerHTML = messages?.length ? renderMessageBubbles(messages, reactions) : '<p class="message-empty chat-start">Say hello and start the conversation.</p>';
  if (wasAtBottom) messageScroll.scrollTop = messageScroll.scrollHeight;
  if (messages?.some(message => message.recipient_id === activeUserId && !message.read_at)) {
    await supa.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("sender_id", personId).eq("recipient_id", activeUserId).is("read_at", null);
    await loadMessages();
  }
}
async function toggleMessageReaction(event) {
  const button = event.target.closest("[data-message-id][data-emoji]");
  if (!button || !activeUserId) return;
  const { messageId, emoji } = button.dataset;
  button.disabled = true;
  const { data: existing, error: lookupError } = await supa.from("message_reactions").select("id,emoji").eq("message_id", messageId).eq("user_id", activeUserId).maybeSingle();
  if (lookupError) { button.disabled = false; return toast(lookupError.message); }
  let error;
  if (existing?.emoji === emoji) {
    ({ error } = await supa.from("message_reactions").delete().eq("id", existing.id));
  } else if (existing) {
    ({ error } = await supa.from("message_reactions").update({ emoji }).eq("id", existing.id));
  } else {
    ({ error } = await supa.from("message_reactions").insert({ message_id: messageId, user_id: activeUserId, emoji }));
  }
  if (error) { button.disabled = false; return toast(error.message); }
  await refreshActiveConversation();
}
async function searchMessagePeople(query) {
  if (query.length < 2) { renderConversations(query); return; }
  const safeQuery = query.replace(/[^a-z0-9 ._-]/gi, " ").trim();
  const { data, error } = await supa.from("profiles").select("id,username,display_name,avatar_url").neq("id", activeUserId).or(`username.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`).limit(15);
  if (error) { conversationList.innerHTML = `<p class="message-empty">${esc(error.message)}</p>`; return; }
  conversationList.innerHTML = (data || []).map(person => `<button class="conversation-item message-person" data-person-id="${esc(person.id)}"><img src="${esc(person.avatar_url || "https://i.pravatar.cc/80?img=47")}" alt=""><span><b>${esc(person.username)}</b><small>${esc(person.display_name || "Start a conversation")}</small></span><span class="message-start-label">Message</span></button>`).join("") || '<p class="message-empty">No people found.</p>';
}
function openMessages() {
  if (!activeUserId) return location.assign("/login");
  messagesModal.hidden = false;
  loadMessages();
  document.getElementById("messageSearch").focus();
  clearInterval(messageRefreshTimer);
  messageRefreshTimer = setInterval(async () => { if (!messagesModal.hidden) { await loadMessages(); await refreshActiveConversation(); } }, 8000);
}
function closeMessages() { messagesModal.hidden = true; messagesModal.classList.remove("conversation-open"); clearInterval(messageRefreshTimer); }
async function loadRelationshipList(mode) {
  if (!activeUserId || !viewedProfile || viewedProfile.id !== activeUserId) return toast("Follower lists are available on your own profile");
  relationshipMode = mode;
  const title = mode === "followers" ? "Followers" : "Following";
  const list = document.getElementById("relationshipList");
  document.getElementById("relationshipTitle").textContent = title;
  list.innerHTML = '<p class="relationship-message">Loading…</p>';
  document.getElementById("relationshipModal").hidden = false;
  const column = mode === "followers" ? "follower_id" : "following_id";
  const filterColumn = mode === "followers" ? "following_id" : "follower_id";
  const { data: relationships, error } = await supa.from("user_follows").select(column).eq(filterColumn, activeUserId);
  if (error) { list.innerHTML = `<p class="relationship-message">${esc(error.message)}</p>`; return; }
  const ids = (relationships || []).map(row => row[column]);
  if (!ids.length) { list.innerHTML = `<p class="relationship-message">No ${title.toLowerCase()} yet.</p>`; return; }
  const { data: profiles, error: profileError } = await supa.from("profiles").select("id,username,display_name,avatar_url,is_private").in("id", ids);
  if (profileError) { list.innerHTML = `<p class="relationship-message">${esc(profileError.message)}</p>`; return; }
  const byId = new Map((profiles || []).map(profile => [profile.id, profile]));
  const people = ids.map(id => byId.get(id)).filter(Boolean);
  list.innerHTML = people.map(person => `<div class="relationship-person"><button class="relationship-profile-open" data-profile-id="${esc(person.id)}"><img src="${esc(person.avatar_url || "https://i.pravatar.cc/80?img=47")}" alt=""><span><b>${esc(person.username)}</b><small>${esc(person.display_name || "RangManch member")}</small></span></button><button class="follow-toggle" data-private="${Boolean(person.is_private)}">Follow</button></div>`).join("");
  list.querySelectorAll(".follow-toggle").forEach(button => updateFollowAction(button, button.previousElementSibling.dataset.profileId, button.dataset.private === "true"));
}
async function loadSuggestions() {
  const suggestions = document.getElementById("suggestions");
  const { data, error } = await supa.from("profiles").select("id,username,display_name,avatar_url,is_private").neq("id", activeUserId).limit(40);
  if (error) { suggestions.innerHTML = ""; return; }
  const people = (data || []).filter(person => !followedUserIds.has(person.id)).slice(0, 3);
  suggestions.innerHTML = people.length ? people.map(person => `<div class="suggest"><img src="${esc(person.avatar_url || "https://i.pravatar.cc/80?img=47")}" alt=""><div><b>${esc(person.username)}</b><small>${esc(person.display_name || "RangManch member")}</small></div><button class="follow-toggle" data-follow-id="${esc(person.id)}" data-private="${Boolean(person.is_private)}">Follow</button></div>`).join("") : '<p class="suggest-empty">You are all caught up.</p>';
  suggestions.querySelectorAll(".follow-toggle").forEach(button => updateFollowAction(button, button.dataset.followId, button.dataset.private === "true"));
}
async function toggleFollow(button) {
  const targetId = button.dataset.followId || button.closest(".suggest")?.dataset.profileId;
  if (!activeUserId) return location.assign("/login");
  if (targetId === activeUserId) return toast("You cannot follow yourself");
  const isFollowing = followedUserIds.has(targetId);
  const isRequested = pendingFollowRequestIds.has(targetId);
  button.disabled = true;
  const request = isFollowing
    ? supa.from("user_follows").delete().eq("follower_id", activeUserId).eq("following_id", targetId)
    : isRequested
      ? supa.from("follow_requests").delete().eq("requester_id", activeUserId).eq("target_id", targetId).eq("status", "pending")
      : button.dataset.private === "true"
        ? supa.from("follow_requests").insert({ requester_id: activeUserId, target_id: targetId })
        : supa.from("user_follows").insert({ follower_id: activeUserId, following_id: targetId });
  const { error } = await request;
  button.disabled = false;
  if (error?.code === "23505" && !isFollowing && !isRequested && button.dataset.private === "true") {
    const { data: pendingRequest, error: lookupError } = await supa.from("follow_requests")
      .select("id")
      .eq("requester_id", activeUserId)
      .eq("target_id", targetId)
      .eq("status", "pending")
      .maybeSingle();
    if (lookupError) return toast(lookupError.message);
    if (pendingRequest) {
      pendingFollowRequestIds.add(targetId);
      updateFollowAction(button, targetId, true);
      return;
    }
  }
  if (error) return toast(error.message);
  if (isFollowing) followedUserIds.delete(targetId);
  else if (isRequested) pendingFollowRequestIds.delete(targetId);
  else if (button.dataset.private === "true") pendingFollowRequestIds.add(targetId);
  else followedUserIds.add(targetId);
  updateFollowAction(button, targetId, button.dataset.private === "true");
  await loadProfileStats();
  if (viewMode === "profile") await loadViewedProfileStats();
  if (button.closest("#suggestions")) await loadSuggestions();
  if (button.closest("#relationshipList")) await loadRelationshipList(relationshipMode);
}
function isVideo(post) { return /\.(mp4|mov|webm|m4v)(?:$|\?)/i.test(post.image || ""); }
function visiblePosts() {
  let result = posts.map((post, index) => ({ post, index }));
  if (viewMode === "profile") result = result.filter(({ post }) => post.authorId === viewedProfile?.id);
  else if (selectedUser) result = result.filter(({ post }) => post.user.toLowerCase() === selectedUser.toLowerCase());
  if (viewMode === "reels") result = result.filter(({ post }) => isVideo(post));
  return result;
}
function renderFeed() {
  const entries = visiblePosts();
    feed.className = viewMode === "reels" ? "feed-reels" : viewMode === "explore" ? "feed-explore" : viewMode === "profile" ? "profile-post-grid" : "feed-default";
  feed.closest(".feed-column").classList.toggle("reels-mode", viewMode === "reels");
  feed.closest(".feed-column").classList.toggle("profile-mode", viewMode === "profile");
  feed.closest(".feed-layout").classList.toggle("reels-layout", viewMode === "reels");
  feed.closest(".feed-layout").classList.toggle("profile-layout", viewMode === "profile");
  document.getElementById("profileHeader").hidden = viewMode !== "profile";
  if (!entries.length) {
    const emptyMessage = viewMode === "reels" ? "Share a video to start your Reels feed." : viewMode === "profile" ? "No posts available." : selectedUser ? "This profile has not shared anything yet." : "Posts from the community will appear here.";
    feed.innerHTML = `<div class="empty-view"><b>${viewMode === "reels" ? "No reels yet" : viewMode === "profile" ? "No posts" : "No posts yet"}</b><span>${emptyMessage}</span>${viewMode === "reels" || (viewMode === "profile" && viewedProfile?.id === activeUserId) ? '<button class="empty-create">Create a post</button>' : ""}</div>`;
    return;
  }
  feed.innerHTML = entries.map(({ post: p, index: i }) => {
    const media = isVideo(p) ? `<video class="post-image" src="${esc(p.image)}" ${viewMode === "reels" ? "autoplay muted loop" : "controls"} playsinline preload="metadata"></video>` : `<img class="post-image" src="${esc(p.image)}" alt="${esc(p.caption)}">`;
    if (viewMode === "reels") return `<article class="reel-card post" data-index="${i}">${media}<div class="reel-shade"><div class="reel-copy"><b>@${esc(p.user)}</b><p>${esc(p.caption)}</p><small>♫ Original audio</small></div><div class="reel-actions"><button class="like ${liked[p.id] ? "liked" : ""}">${liked[p.id] ? "♥" : "♡"}<small>${Number(p.likes || 0).toLocaleString()}</small></button><button class="share">↗<small>Share</small></button></div></div></article>`;
    if (viewMode === "explore" || viewMode === "profile") return `<button class="explore-tile post" data-index="${i}">${isVideo(p) ? `<video class="post-image" src="${esc(p.image)}" muted loop playsinline preload="metadata"></video>` : media}<span>♡ ${Number(p.likes || 0).toLocaleString()}</span></button>`;
    const ownerMenu = p.authorId === activeUserId ? `<button class="dots" type="button" aria-label="Post options" aria-expanded="false">•••</button><div class="post-menu" hidden><button type="button" class="post-edit">Edit post</button><button type="button" class="post-delete">Delete post</button></div>` : "";
    return `<article class="post" data-index="${i}"><header class="post-header"><img src="${esc(p.avatar)}" alt=""><div><b>${esc(p.user)}</b><small>${esc(p.name)} · ${esc(p.time)}</small></div>${ownerMenu}</header>${media}<div class="post-actions"><button class="like ${liked[p.id] ? "liked" : ""}">${liked[p.id] ? "♥" : "♡"}</button><button>◯</button><button class="share">⌁</button><button class="save">♧</button></div><div class="post-likes"><span>${Number(p.likes || 0).toLocaleString()}</span> likes</div><p class="caption"><b>${esc(p.user)}</b>${esc(p.caption)}</p><button class="comments-link">View all ${p.comments || 0} comments</button><div class="post-comments" hidden></div><div class="comment-box"><input placeholder="Add a comment…"><button>Post</button></div></article>`;
  }).join("");
  feed.querySelectorAll(".comment-box").forEach(box => {
    const input = box.querySelector("input");
    const submit = box.querySelector("button");
    if (!input || !submit) return;
    input.classList.add("comment-input");
    submit.classList.add("comment-submit");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "comment-emoji-toggle";
    toggle.setAttribute("aria-label", "Insert emoji");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "☺";
    box.insertBefore(toggle, input);
    const popover = document.createElement("div");
    popover.className = "comment-emoji-popover";
    popover.hidden = true;
    const picker = document.createElement("emoji-picker");
    picker.className = "comment-emoji-picker";
    picker.setAttribute("locale", "en");
    picker.addEventListener("emoji-click", event => {
      const emoji = event.detail?.unicode;
      if (!emoji) return;
      input.setRangeText(emoji, input.selectionStart, input.selectionEnd, "end");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      popover.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    });
    popover.append(picker);
    box.append(popover);
  });
}
async function loadPostComments(post, card) {
  const list = card.querySelector(".post-comments");
  list.hidden = false;
  list.innerHTML = '<p class="comment-list-status">Loading comments…</p>';
  const { data, error } = await supa.from("comments").select("id,author_id,body,created_at").eq("post_id", post.id).order("created_at", { ascending: true }).limit(200);
  if (error) { list.innerHTML = `<p class="comment-list-status">${esc(error.message)}</p>`; return; }
  const authorIds = [...new Set((data || []).map(comment => comment.author_id))];
  const { data: authors, error: authorError } = authorIds.length
    ? await supa.from("profiles").select("id,username").in("id", authorIds)
    : { data: [], error: null };
  if (authorError) { list.innerHTML = `<p class="comment-list-status">${esc(authorError.message)}</p>`; return; }
  const usernames = new Map((authors || []).map(author => [author.id, author.username]));
  post.comments = data?.length || 0;
  card.querySelector(".comments-link").textContent = `View all ${post.comments} comments`;
  list.innerHTML = data?.length ? data.map(comment => {
    const canEdit = comment.author_id === activeUserId;
    const canDelete = canEdit || post.authorId === activeUserId;
    const actions = canEdit || canDelete ? `<div class="comment-tools">${canEdit ? '<button type="button" class="comment-edit">Edit</button>' : ""}${canDelete ? '<button type="button" class="comment-delete">Delete</button>' : ""}</div>` : "";
    return `<article class="comment-row" data-comment-id="${esc(comment.id)}"><div class="comment-row-copy"><b>${esc(usernames.get(comment.author_id) || "member")}</b><p>${esc(comment.body)}</p><time>${new Date(comment.created_at).toLocaleString()}</time></div>${actions}</article>`;
  }).join("") : '<p class="comment-list-status">No comments yet.</p>';
}
renderFeed();
feed.addEventListener("click", async event => {
  if (event.target.closest(".empty-create")) { openPostComposer(); return; }
  const card = event.target.closest(".post"); if (!card) return;
  if (viewMode === "explore") { viewMode = "home"; renderFeed(); return; }
  const post = posts[Number(card.dataset.index)];
  if (event.target.closest(".comments-link")) {
    const list = card.querySelector(".post-comments");
    if (list.hidden) await loadPostComments(post, card); else list.hidden = true;
    return;
  }
  if (event.target.closest(".comment-edit")) {
    const row = event.target.closest(".comment-row");
    const body = row.querySelector(".comment-row-copy p").textContent;
    row.querySelector(".comment-row-copy").innerHTML = `<textarea class="comment-edit-input" maxlength="2200"></textarea><div class="comment-edit-actions"><button type="button" class="comment-edit-cancel">Cancel</button><button type="button" class="comment-edit-save">Save</button></div>`;
    row.querySelector(".comment-edit-input").value = body;
    row.querySelector(".comment-edit-input").focus();
    row.querySelector(".comment-tools")?.remove();
    return;
  }
  if (event.target.closest(".comment-edit-cancel")) { await loadPostComments(post, card); return; }
  if (event.target.closest(".comment-edit-save")) {
    const row = event.target.closest(".comment-row");
    const body = row.querySelector(".comment-edit-input").value.trim();
    if (!body) return toast("Comment cannot be empty");
    const save = event.target.closest(".comment-edit-save"); save.disabled = true;
    const { error } = await supa.from("comments").update({ body }).eq("id", row.dataset.commentId).eq("author_id", activeUserId);
    if (error) { save.disabled = false; return toast(error.message); }
    await loadPostComments(post, card); toast("Comment updated"); return;
  }
  if (event.target.closest(".comment-delete")) {
    const row = event.target.closest(".comment-row");
    if (!confirm("Delete this comment? This can’t be undone.")) return;
    const { error } = await supa.from("comments").delete().eq("id", row.dataset.commentId);
    if (error) return toast(error.message);
    await loadPostComments(post, card); toast("Comment deleted"); return;
  }
  if (event.target.closest(".comment-emoji-toggle")) {
    const toggle = event.target.closest(".comment-emoji-toggle");
    const popover = card.querySelector(".comment-emoji-popover");
    const willOpen = popover.hidden;
    feed.querySelectorAll(".comment-emoji-popover").forEach(panel => { panel.hidden = true; });
    feed.querySelectorAll(".comment-emoji-toggle").forEach(button => button.setAttribute("aria-expanded", "false"));
    popover.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
    return;
  }
  if (event.target.closest(".dots")) {
    const menu = card.querySelector(".post-menu");
    if (menu) { menu.hidden = !menu.hidden; event.target.closest(".dots").setAttribute("aria-expanded", String(!menu.hidden)); }
  } else if (event.target.closest(".post-edit")) {
    if (post.authorId === activeUserId) openEditPostComposer(post);
  } else if (event.target.closest(".post-delete")) {
    if (post.authorId !== activeUserId || !confirm("Delete this post? This can’t be undone.")) return;
    const { error } = await supa.from("posts").delete().eq("id", post.id).eq("author_id", activeUserId);
    if (error) return toast(error.message);
    await loadSocial(); await loadProfileStats(); toast("Post deleted");
  } else if (event.target.closest(".like")) {
    const { data: { user } } = await supa.auth.getUser(); if (!user) return location.assign("/login");
    liked[post.id] = !liked[post.id];
    const request = liked[post.id] ? supa.from("post_likes").upsert({ post_id: post.id, user_id: user.id }) : supa.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    const { error } = await request; if (error) { liked[post.id] = !liked[post.id]; return toast(error.message); }
    post.likes = Math.max(0, Number(post.likes || 0) + (liked[post.id] ? 1 : -1)); renderFeed();
  } else if (event.target.closest(".save")) toast("Saved to your collection");
  else if (event.target.closest(".share")) { await navigator.clipboard?.writeText(location.origin); toast("Link copied"); }
  else if (event.target.closest(".comment-submit")) {
    const input = card.querySelector(".comment-input"); if (!input.value.trim()) return;
    const { data: { user } } = await supa.auth.getUser(); if (!user) return location.assign("/login");
    const { error } = await supa.from("comments").insert({ post_id: post.id, author_id: user.id, body: input.value.trim() });
    if (error) toast(error.message); else {
      input.value = "";
      post.comments = Number(post.comments || 0) + 1;
      card.querySelector(".comments-link").textContent = `View all ${post.comments} comments`;
      if (!card.querySelector(".post-comments").hidden) await loadPostComments(post, card);
      toast("Comment added");
    }
  }
});
document.addEventListener("click", event => {
  if (event.target.closest(".comment-box")) return;
  feed.querySelectorAll(".comment-emoji-popover").forEach(popover => { popover.hidden = true; });
  feed.querySelectorAll(".comment-emoji-toggle").forEach(button => button.setAttribute("aria-expanded", "false"));
});
const postFileInput = document.getElementById("postFile");
const postDropzone = document.getElementById("postDropzone");
const postPreview = document.getElementById("postPreview");
const publishPostButton = document.getElementById("publishPost");
let selectedPostFile = null, postPreviewUrl = "", publishingPost = false, editingPostId = null, editingPost = null;
function setPostFile(file) {
  const status = document.getElementById("uploadStatus");
  if (!file) return;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime"];
  if (!allowedTypes.includes(file.type)) { status.textContent = "Choose a JPG, PNG, WebP, GIF, MP4, or MOV file."; return; }
  if (file.size > 15 * 1024 * 1024) { status.textContent = "Files must be under 15 MB."; return; }
  if (postPreviewUrl) URL.revokeObjectURL(postPreviewUrl);
  selectedPostFile = file;
  postPreviewUrl = URL.createObjectURL(file);
  postDropzone.classList.add("has-file");
  postPreview.hidden = false;
  postPreview.innerHTML = `${file.type.startsWith("video/") ? `<video src="${postPreviewUrl}" controls playsinline></video>` : `<img src="${postPreviewUrl}" alt="Preview of selected image">`}<div class="preview-tools"><span>${esc(file.name)}</span><button type="button" id="changePostFile">Change</button><button type="button" id="removePostFile" aria-label="Remove selected media">×</button></div>`;
  status.textContent = "Ready to share";
  publishPostButton.disabled = false;
}
function showExistingPostMedia(post) {
  if (!post) return;
  postDropzone.classList.add("has-file"); postPreview.hidden = false;
  postPreview.innerHTML = `${isVideo(post) ? `<video src="${esc(post.image)}" controls playsinline></video>` : `<img src="${esc(post.image)}" alt="Current post image">`}<div class="preview-tools"><span>Current media</span><button type="button" id="changePostFile">Replace</button></div>`;
}
function resetPostComposer() {
  if (postPreviewUrl) URL.revokeObjectURL(postPreviewUrl);
  selectedPostFile = null; postPreviewUrl = ""; postFileInput.value = ""; editingPostId = null; editingPost = null;
  postPreview.hidden = true; postPreview.innerHTML = ""; postDropzone.classList.remove("has-file");
  document.getElementById("composerTitle").textContent = "Create new post";
  publishPostButton.textContent = "Share post";
  document.getElementById("postCaption").value = "";
  document.getElementById("captionCount").textContent = "0";
  document.getElementById("uploadStatus").textContent = "";
  publishPostButton.disabled = true;
}
function closePostComposer() { if (publishingPost) return; modal.classList.remove("open"); resetPostComposer(); }
function openPostComposer() { resetPostComposer(); modal.classList.add("open"); }
function openEditPostComposer(post) {
  resetPostComposer(); editingPostId = post.id; editingPost = post;
  document.getElementById("composerTitle").textContent = "Edit post";
  const caption = document.getElementById("postCaption"); caption.value = post.caption || "";
  document.getElementById("captionCount").textContent = caption.value.length;
  document.getElementById("uploadStatus").textContent = "Update the caption or replace the media.";
  showExistingPostMedia(post);
  publishPostButton.textContent = "Save changes"; publishPostButton.disabled = false;
  modal.classList.add("open");
}
document.getElementById("createNav").onclick = openPostComposer;
document.querySelector(".modal-close").onclick = closePostComposer;
modal.onclick = event => { if (event.target === modal) closePostComposer(); };
postFileInput.addEventListener("change", () => setPostFile(postFileInput.files[0]));
postPreview.addEventListener("click", event => {
  if (event.target.closest("#changePostFile")) { if (!publishingPost) postFileInput.click(); return; }
  if (!event.target.closest("#removePostFile") || publishingPost) return;
  if (postPreviewUrl) URL.revokeObjectURL(postPreviewUrl);
  selectedPostFile = null; postPreviewUrl = ""; postFileInput.value = "";
  if (editingPost) showExistingPostMedia(editingPost);
  else { postPreview.hidden = true; postPreview.innerHTML = ""; postDropzone.classList.remove("has-file"); }
  publishPostButton.disabled = !editingPost; document.getElementById("uploadStatus").textContent = editingPost ? "Original media kept. Choose a replacement or save the caption." : "Choose media to continue.";
});
postDropzone.addEventListener("dragover", event => { event.preventDefault(); postDropzone.classList.add("dragging"); });
postDropzone.addEventListener("dragleave", event => { if (!postDropzone.contains(event.relatedTarget)) postDropzone.classList.remove("dragging"); });
postDropzone.addEventListener("drop", event => { event.preventDefault(); postDropzone.classList.remove("dragging"); setPostFile(event.dataTransfer.files[0]); });
postDropzone.addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && event.target === postDropzone) { event.preventDefault(); postFileInput.click(); } });
document.getElementById("postCaption").addEventListener("input", event => { document.getElementById("captionCount").textContent = event.target.value.length; });
async function uploadMedia(file, user, kind) {
  if (!file) throw new Error("Choose a photo or video first.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Files must be under 15 MB.");
  const cleanName = file.name.replace(/[^\w.-]/g, "_"); const path = `${user.id}/${kind}/${crypto.randomUUID()}-${cleanName}`;
  const { data, error } = await supa.storage.from("indianfeed-media").upload(path, file, { contentType: file.type });
  if (error) {
    if (/row-level security/i.test(error.message || "")) throw new Error("Storage blocked this upload. Apply migration 20261011000006_indianfeed_media_storage_policies.sql in Supabase, then retry.");
    throw error;
  }
  return supa.storage.from("indianfeed-media").getPublicUrl(data.path).data.publicUrl;
}
async function publish(kind, file, audioFile = null) {
  try {
    const { data: { user } } = await supa.auth.getUser(); if (!user) return location.assign("/login");
    let result;
    if (kind === "story") {
      const imageUrl = await uploadMedia(file, user, kind);
      const audioUrl = audioFile ? await uploadMedia(audioFile, user, "story-audio") : null;
      result = await supa.from("stories").insert({ author_id: user.id, image_url: imageUrl, audio_url: audioUrl });
    } else if (editingPostId) {
      const changes = { caption: document.getElementById("postCaption").value.trim() };
      if (file) changes.image_url = await uploadMedia(file, user, "post");
      result = await supa.from("posts").update(changes).eq("id", editingPostId).eq("author_id", user.id);
    } else {
      const imageUrl = await uploadMedia(file, user, kind);
      result = await supa.from("posts").insert({ author_id: user.id, image_url: imageUrl, caption: document.getElementById("postCaption").value.trim() });
    }
    if (result.error) throw result.error;
    modal.classList.remove("open");
    if (kind === "story") { toast("Story shared for 24 hours"); await loadStories(); }
    else {
      const refreshed = await loadSocial();
      if (refreshed) toast(editingPostId ? "Post updated" : "Your post is live");
      else toast("Post saved, but the feed could not refresh");
      await loadProfileStats();
    }
  } catch (error) {
    const message = /bucket not found/i.test(error.message || "")
      ? "Storage bucket indianfeed-media is missing. Apply migration 20261011000005_ensure_indianfeed_media_bucket.sql in Supabase, then retry."
      : /row-level security/i.test(error.message || "")
        ? (editingPostId ? "Supabase blocked this edit. Apply migration 20261011000009_user_post_edit_access.sql to allow post owners to edit their posts." : "Supabase blocked the post. Apply migration 20261011000007_user_posts_feed_access.sql to allow users to publish posts and followers to read them.")
      : error.message;
    if (kind === "post") document.getElementById("uploadStatus").textContent = message;
    else toast(message);
  }
}
publishPostButton.onclick = async () => {
  if ((!selectedPostFile && !editingPostId) || publishingPost) return;
  publishingPost = true; publishPostButton.disabled = true;
  document.querySelector(".modal-close").disabled = true;
  document.getElementById("uploadStatus").textContent = selectedPostFile ? "Uploading your post…" : "Saving your changes…";
  try {
    await publish("post", selectedPostFile);
    if (!modal.classList.contains("open")) resetPostComposer();
  } finally {
    publishingPost = false; document.querySelector(".modal-close").disabled = false;
    if (modal.classList.contains("open")) publishPostButton.disabled = !selectedPostFile && !editingPostId;
  }
};
let selectedStoryMedia = null, selectedStoryAudio = null, storyMediaPreviewUrl = "", storyAudioPreviewUrl = "", publishingStory = false;
const storyComposerModal = document.getElementById("storyComposerModal");
const storyMediaInput = document.getElementById("storyMediaInput");
const storyAudioInput = document.getElementById("storyAudioInput");
const storyPublishButton = document.getElementById("publishStory");
function resetStoryComposer() {
  if (storyMediaPreviewUrl) URL.revokeObjectURL(storyMediaPreviewUrl);
  if (storyAudioPreviewUrl) URL.revokeObjectURL(storyAudioPreviewUrl);
  selectedStoryMedia = null; selectedStoryAudio = null; storyMediaPreviewUrl = ""; storyAudioPreviewUrl = "";
  storyMediaInput.value = ""; storyAudioInput.value = "";
  document.getElementById("storyUploadPreview").hidden = true;
  document.getElementById("storyUploadPreview").replaceChildren();
  document.getElementById("storyAudioPreview").hidden = true;
  document.getElementById("storyAudioPreview").replaceChildren();
  document.getElementById("storyUploadStatus").textContent = "Stories disappear after 24 hours.";
  storyPublishButton.disabled = true;
}
function closeStoryComposer() { if (publishingStory) return; storyComposerModal.hidden = true; resetStoryComposer(); }
document.getElementById("storyAdd").onclick = () => { resetStoryComposer(); storyComposerModal.hidden = false; };
storyMediaInput.addEventListener("change", event => {
  const file = event.target.files[0]; if (!file) return;
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime"];
  const status = document.getElementById("storyUploadStatus");
  if (!allowed.includes(file.type)) { status.textContent = "Choose a JPG, PNG, WebP, GIF, MP4, or MOV file."; event.target.value = ""; return; }
  if (file.size > 15 * 1024 * 1024) { status.textContent = "Story media must be under 15 MB."; event.target.value = ""; return; }
  if (storyMediaPreviewUrl) URL.revokeObjectURL(storyMediaPreviewUrl);
  selectedStoryMedia = file; storyMediaPreviewUrl = URL.createObjectURL(file);
  const preview = document.getElementById("storyUploadPreview");
  preview.innerHTML = file.type.startsWith("video/") ? `<video src="${storyMediaPreviewUrl}" controls playsinline></video>` : `<img src="${storyMediaPreviewUrl}" alt="Story preview">`;
  preview.hidden = false; storyPublishButton.disabled = false; status.textContent = "Story media ready.";
});
storyAudioInput.addEventListener("change", event => {
  const file = event.target.files[0]; if (!file) return;
  const status = document.getElementById("storyUploadStatus");
  if (!file.type.startsWith("audio/")) { status.textContent = "Choose an audio file for the soundtrack."; event.target.value = ""; return; }
  if (file.size > 15 * 1024 * 1024) { status.textContent = "Soundtracks must be under 15 MB."; event.target.value = ""; return; }
  if (storyAudioPreviewUrl) URL.revokeObjectURL(storyAudioPreviewUrl);
  selectedStoryAudio = file; storyAudioPreviewUrl = URL.createObjectURL(file);
  const preview = document.getElementById("storyAudioPreview");
  preview.innerHTML = `<span>${esc(file.name)}</span><audio src="${storyAudioPreviewUrl}" controls></audio>`;
  preview.hidden = false; status.textContent = "Soundtrack ready.";
});
document.getElementById("storyComposerForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!selectedStoryMedia || publishingStory) return;
  publishingStory = true; storyPublishButton.disabled = true;
  document.getElementById("storyUploadStatus").textContent = selectedStoryAudio ? "Uploading story and soundtrack…" : "Uploading story…";
  try {
    const { data: { user } } = await supa.auth.getUser(); if (!user) return location.assign("/login");
    const imageUrl = await uploadMedia(selectedStoryMedia, user, "story");
    const audioUrl = selectedStoryAudio ? await uploadMedia(selectedStoryAudio, user, "story-audio") : null;
    const { error } = await supa.from("stories").insert({ author_id: user.id, image_url: imageUrl, audio_url: audioUrl });
    if (error) throw error;
    storyComposerModal.hidden = true; resetStoryComposer(); toast("Story shared for 24 hours"); await loadStories();
  } catch (error) { document.getElementById("storyUploadStatus").textContent = error.message; }
  finally { publishingStory = false; if (!storyComposerModal.hidden) storyPublishButton.disabled = !selectedStoryMedia; }
});
document.getElementById("closeStoryComposer").onclick = closeStoryComposer;
storyComposerModal.addEventListener("click", event => { if (event.target === storyComposerModal) closeStoryComposer(); });
const storyViewer = document.createElement("div");
storyViewer.className = "story-viewer";
storyViewer.hidden = true;
storyViewer.innerHTML = '<div class="story-viewer-panel"><button class="story-viewer-close" aria-label="Close story">×</button><button class="story-viewer-prev" type="button" aria-label="Previous story">‹</button><button class="story-viewer-next" type="button" aria-label="Next story">›</button><div class="story-viewer-owner"></div><div class="story-viewer-media"></div></div>';
document.body.append(storyViewer);
const storyExpiryTimers = new Map();
let storyViewerExpiryTimer;
let visibleStories = [], activeStoryIndex = -1;
function closeStory() {
  clearTimeout(storyViewerExpiryTimer);
  storyViewer.hidden = true;
  storyViewer.dataset.storyId = "";
  activeStoryIndex = -1;
  storyViewer.querySelector(".story-viewer-media").replaceChildren();
}
function removeExpiredStory(id) {
  clearTimeout(storyExpiryTimers.get(id));
  storyExpiryTimers.delete(id);
  const currentStoryId = storyViewer.dataset.storyId;
  const expiredIndex = visibleStories.findIndex(story => story.id === id);
  visibleStories = visibleStories.filter(story => story.id !== id);
  if (storyViewer.dataset.storyId === id) closeStory();
  else if (expiredIndex >= 0 && expiredIndex < activeStoryIndex) activeStoryIndex--;
  renderStoryTray();
  if (currentStoryId && currentStoryId !== id) activeStoryIndex = visibleStories.findIndex(story => story.id === currentStoryId);
}
function renderStoryTray() {
  storyExpiryTimers.forEach(timer => clearTimeout(timer));
  storyExpiryTimers.clear();
  document.querySelectorAll(".remote-story").forEach(button => button.remove());
  const byAuthor = new Map();
  visibleStories.forEach(story => {
    if (!byAuthor.has(story.authorId)) byAuthor.set(story.authorId, []);
    byAuthor.get(story.authorId).push(story);
  });
  const groups = [...byAuthor.values()].map(group => group.sort((left, right) => left.createdAt - right.createdAt));
  groups.sort((left, right) => right[right.length - 1].createdAt - left[left.length - 1].createdAt);
  visibleStories = groups.flat();
  groups.forEach(group => {
    const firstStory = group[0];
    const button = document.createElement("button"); button.className = "story remote-story"; button.dataset.storyId = firstStory.id;
    const count = group.length > 1 ? `<i class="story-count">${group.length}</i>` : "";
    button.innerHTML = `<span class="story-ring"><img src="${esc(firstStory.avatarUrl || firstStory.imageUrl)}">${count}</span><small>${esc(firstStory.username)}</small>`;
    document.querySelector(".stories").append(button);
  });
  visibleStories.forEach(story => storyExpiryTimers.set(story.id, setTimeout(() => removeExpiredStory(story.id), Math.max(0, story.expiresAt - Date.now()))));
}
function showStoryAt(index) {
  visibleStories = visibleStories.filter(story => story.expiresAt > Date.now());
  if (!visibleStories.length) { closeStory(); return; }
  activeStoryIndex = (index + visibleStories.length) % visibleStories.length;
  const story = visibleStories[activeStoryIndex];
  const media = storyViewer.querySelector(".story-viewer-media");
  const visual = isVideo({ image: story.imageUrl }) ? `<video src="${esc(story.imageUrl)}" ${story.audioUrl ? "muted" : ""} controls playsinline></video>` : `<img src="${esc(story.imageUrl)}" alt="${esc(story.username)}'s story">`;
  const soundtrack = story.audioUrl ? `<audio src="${esc(story.audioUrl)}" controls autoplay loop aria-label="Story soundtrack"></audio>` : "";
  media.innerHTML = `${visual}${soundtrack}`;
  storyViewer.querySelector(".story-viewer-owner").textContent = story.username;
  storyViewer.dataset.storyId = story.id;
  storyViewer.hidden = false;
  storyViewer.querySelector(".story-viewer-prev").disabled = visibleStories.length < 2;
  storyViewer.querySelector(".story-viewer-next").disabled = visibleStories.length < 2;
  clearTimeout(storyViewerExpiryTimer);
  storyViewerExpiryTimer = setTimeout(() => removeExpiredStory(story.id), story.expiresAt - Date.now());
}
document.querySelector(".stories").addEventListener("click", event => {
  const story = event.target.closest(".story");
  if (!story || story.classList.contains("add-story")) return;
  const index = visibleStories.findIndex(item => item.id === story.dataset.storyId);
  if (index >= 0) showStoryAt(index);
});
storyViewer.addEventListener("click", event => {
  if (event.target.closest(".story-viewer-prev")) showStoryAt(activeStoryIndex - 1);
  else if (event.target.closest(".story-viewer-next")) showStoryAt(activeStoryIndex + 1);
  else if (event.target === storyViewer || event.target.closest(".story-viewer-close")) closeStory();
});
async function loadSocial() {
  let postsQuery = supa.from("posts").select("id,image_url,caption,created_at,author_id").order("created_at", { ascending: false });
  postsQuery = viewMode === "profile" ? postsQuery.eq("author_id", viewedProfile?.id || activeUserId).limit(100) : postsQuery.limit(40);
  const { data, error } = await postsQuery;
  if (error) {
    console.warn(error.message);
    feed.innerHTML = `<div class="empty-view"><b>Posts couldn’t load</b><span>${esc(error.message)}</span></div>`;
    return false;
  }
  const postIds = (data || []).map(post => post.id);
  const authorIds = [...new Set((data || []).map(post => post.author_id))];
  const [profileResult, likesResult, commentsResult, userResult] = await Promise.all([
    authorIds.length ? supa.from("profiles").select("id,username,display_name,avatar_url").in("id", authorIds) : Promise.resolve({ data: [], error: null }),
    postIds.length ? supa.from("post_likes").select("post_id,user_id").in("post_id", postIds) : Promise.resolve({ data: [], error: null }),
    postIds.length ? supa.from("comments").select("post_id").in("post_id", postIds) : Promise.resolve({ data: [], error: null }),
    supa.auth.getUser()
  ]);
  for (const result of [profileResult, likesResult, commentsResult]) if (result.error) console.warn(result.error.message);
  const profilesById = new Map((profileResult.data || []).map(profile => [profile.id, profile]));
  const likeCounts = new Map(), commentCounts = new Map();
  const myLikedPosts = new Set();
  const user = userResult.data?.user;
  (likesResult.data || []).forEach(like => { likeCounts.set(like.post_id, (likeCounts.get(like.post_id) || 0) + 1); if (user && like.user_id === user.id) myLikedPosts.add(like.post_id); });
  (commentsResult.data || []).forEach(comment => commentCounts.set(comment.post_id, (commentCounts.get(comment.post_id) || 0) + 1));
  posts = (data || []).map(post => {
    const profile = profilesById.get(post.author_id);
    return { id: post.id, authorId: post.author_id, user: profile?.username || "member", name: profile?.display_name || "", avatar: profile?.avatar_url || "https://i.pravatar.cc/80?img=47", image: post.image_url, caption: post.caption, likes: likeCounts.get(post.id) || 0, comments: commentCounts.get(post.id) || 0, time: new Date(post.created_at).toLocaleDateString() };
  });
  liked = Object.fromEntries([...myLikedPosts].map(postId => [postId, true]));
  renderFeed();
  const mine = (data || []).filter(post => post.author_id === user?.id); const interactions = mine.reduce((sum, post) => sum + (likeCounts.get(post.id) || 0) + (commentCounts.get(post.id) || 0), 0);
  document.getElementById("creatorKpis").hidden = !user;
  document.getElementById("kpiPosts").textContent = mine.length;
  document.getElementById("kpiReach").textContent = interactions.toLocaleString();
  document.getElementById("kpiEngagement").textContent = mine.length ? (interactions / mine.length).toFixed(1) : "0";
  return true;
}
async function loadStories() {
  const visibleAuthorIds = [...new Set([activeUserId, ...followedUserIds].filter(Boolean))];
  const { data, error } = await supa.from("stories").select("id,image_url,audio_url,expires_at,created_at,author_id,profiles(username,avatar_url)").in("author_id", visibleAuthorIds).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }); if (error) return;
  storyExpiryTimers.forEach(timer => clearTimeout(timer)); storyExpiryTimers.clear();
  const currentStoryId = storyViewer.dataset.storyId;
  visibleStories = [];
  (data || []).forEach(story => {
    const expiresAt = Date.parse(story.expires_at);
    if (!expiresAt || expiresAt <= Date.now()) return;
    const item = { id: story.id, authorId: story.author_id, imageUrl: story.image_url, audioUrl: story.audio_url, expiresAt, createdAt: Date.parse(story.created_at), username: story.profiles?.username || "member", avatarUrl: story.profiles?.avatar_url };
    visibleStories.push(item);
  });
  renderStoryTray();
  const currentIndex = visibleStories.findIndex(story => story.id === currentStoryId);
  if (currentStoryId && currentIndex < 0) closeStory();
  else if (currentIndex >= 0) activeStoryIndex = currentIndex;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadStories(); });
const searchPanel = document.getElementById("searchResults");
searchPanel.insertAdjacentHTML("beforebegin", '<nav class="feed-switcher" aria-label="Feed view"><button data-view="home" class="selected">For you</button><button data-view="explore">Explore</button><button data-view="reels">Reels <span>▶</span></button></nav>');
searchPanel.innerHTML = '<label class="search-field"><span>⌕</span><input id="userSearchInput" type="search" placeholder="Search people" autocomplete="off"></label><div class="search-hint">Find people by name or username</div><div class="search-matches" id="searchMatches"></div>';
let searchTimer;
async function searchUsers(query = "") {
  searchPanel.hidden = false;
  const input = document.getElementById("userSearchInput");
  input.focus();
  if (query.length < 2) { document.getElementById("searchMatches").innerHTML = '<p class="search-hint">Type at least 2 characters to search.</p>'; return; }
  const safeQuery = query.replace(/[^a-z0-9 ._-]/gi, " ").trim();
  const { data, error } = await supa.from("profiles").select("id,username,display_name,avatar_url,is_private").or(`username.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`).limit(15);
  const matches = document.getElementById("searchMatches");
  if (error) { matches.innerHTML = `<p class="search-hint">${esc(error.message)}</p>`; return; }
  const people = (data || []).filter(person => person.id !== activeUserId);
  matches.innerHTML = people.length ? people.map(person => `<div class="search-person"><button class="person-open" data-profile-id="${esc(person.id)}"><img src="${esc(person.avatar_url || "https://i.pravatar.cc/80?img=47")}" alt=""><span><b>${esc(person.username)}</b><small>${esc(person.display_name || "RangManch member")}</small></span></button><button class="follow-toggle" data-follow-id="${esc(person.id)}" data-private="${Boolean(person.is_private)}">Follow</button></div>`).join("") : '<p class="search-hint">No matching people.</p>';
  matches.querySelectorAll(".follow-toggle").forEach(button => updateFollowAction(button, button.dataset.followId, button.dataset.private === "true"));
}
searchPanel.addEventListener("input", event => { if (event.target.id === "userSearchInput") { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchUsers(event.target.value.trim()), 250); } });
searchPanel.addEventListener("click", async event => {
  const followButton = event.target.closest(".follow-toggle");
  if (followButton) { await toggleFollow(followButton); return; }
  const person = event.target.closest(".person-open");
  if (!person) return;
  await openProfile(person.dataset.profileId);
});
document.getElementById("suggestions").addEventListener("click", async event => { const button = event.target.closest(".follow-toggle"); if (button) await toggleFollow(button); });
function setView(mode) { if (mode === "profile") { openProfile(activeUserId); return; } viewedProfile = null; viewMode = mode; selectedUser = ""; searchPanel.hidden = true; renderFeed(); if (mode === "home") loadSocial(); document.querySelectorAll(".feed-switcher button").forEach(button => button.classList.toggle("selected", button.dataset.view === mode)); document.querySelectorAll(".nav-item[href]").forEach(item => item.classList.toggle("active", item.hash === `#${mode === "home" ? "" : mode}` || (mode === "home" && item.getAttribute("href") === "#"))); }
document.querySelector(".feed-switcher").addEventListener("click", event => { const button = event.target.closest("[data-view]"); if (button) setView(button.dataset.view); });
document.querySelectorAll('a[href="#"],a[href="#explore"],a[href="#reels"],a[href="#profile"]').forEach(link => link.addEventListener("click", event => { event.preventDefault(); const mode = link.hash === "#reels" ? "reels" : link.hash === "#explore" ? "explore" : link.hash === "#profile" ? "profile" : "home"; setView(mode); }));
document.getElementById("searchNav").onclick = () => searchUsers(); document.getElementById("mobileSearch").onclick = () => searchUsers(); document.getElementById("refreshInsights").onclick = loadSocial;
document.getElementById("searchAll").onclick = () => searchUsers();
document.getElementById("messagesNav").onclick = openMessages;
document.getElementById("mobileMessages").onclick = openMessages;
document.getElementById("notificationsNav").onclick = openNotifications;
document.getElementById("mobileNotifications").onclick = openNotifications;
document.getElementById("closeNotifications").onclick = closeNotifications;
notificationsModal.addEventListener("click", event => { if (event.target === notificationsModal) closeNotifications(); });
document.getElementById("notificationsList").addEventListener("click", async event => {
  const requestAction = event.target.closest("[data-request-action]");
  if (requestAction) { await respondToFollowRequest(requestAction.dataset.requestId, requestAction.dataset.requestAction); return; }
  const actor = event.target.closest("[data-actor-id]");
  if (actor) { closeNotifications(); await openProfile(actor.dataset.actorId); }
});
document.getElementById("messagesClose").onclick = closeMessages;
messagesModal.addEventListener("click", event => { if (event.target === messagesModal) closeMessages(); });
conversationList.addEventListener("click", event => { const person = event.target.closest("[data-person-id]"); if (person) renderConversation(person.dataset.personId); });
chatPanel.addEventListener("click", event => {
  if (event.target.closest(".chat-back")) messagesModal.classList.remove("conversation-open");
  else if (event.target.closest("[data-message-id][data-emoji]")) toggleMessageReaction(event);
});
let messageSearchTimer;
document.getElementById("messageSearch").addEventListener("input", event => { clearTimeout(messageSearchTimer); messageSearchTimer = setTimeout(() => searchMessagePeople(event.target.value.trim()), 220); });
document.getElementById("newMessageButton").onclick = () => { document.getElementById("messageSearch").focus(); conversationList.innerHTML = '<p class="message-empty">Search for someone to message.</p>'; };
document.getElementById("showFollowers").onclick = () => loadRelationshipList("followers");
document.getElementById("showFollowing").onclick = () => loadRelationshipList("following");
document.getElementById("editProfileButton").onclick = openProfileEditor;
document.getElementById("closeProfileEdit").onclick = closeProfileEditor;
document.getElementById("cancelProfileEdit").onclick = closeProfileEditor;
document.getElementById("profileEditModal").addEventListener("click", event => { if (event.target.id === "profileEditModal") closeProfileEditor(); });
document.getElementById("relationshipList").addEventListener("click", async event => {
  const button = event.target.closest(".follow-toggle");
  if (button) { await toggleFollow(button); return; }
  const profile = event.target.closest(".relationship-profile-open");
  if (profile) { document.getElementById("relationshipModal").hidden = true; await openProfile(profile.dataset.profileId); }
});
document.getElementById("profileFollowButton").addEventListener("click", async event => { await toggleFollow(event.currentTarget); });
document.getElementById("closeRelationships").onclick = () => { document.getElementById("relationshipModal").hidden = true; };
document.getElementById("relationshipModal").addEventListener("click", event => { if (event.target.id === "relationshipModal") event.currentTarget.hidden = true; });
document.addEventListener("keydown", event => { if (event.key === "Escape") { document.getElementById("relationshipModal").hidden = true; closeProfileEditor(); closeMessages(); closeNotifications(); } });
document.getElementById("logoutButton").onclick = async () => { await supa.auth.signOut(); location.replace("/login"); };
async function initialize() {
  const { data: { session } } = await supa.auth.getSession(); if (!session) return location.replace("/login");
  const user = session.user; activeUserId = user.id; const { data: profile } = await supa.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!profile) { const metadata = user.user_metadata || {}; const username = metadata.username || user.email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 30) || "member"; await supa.from("profiles").upsert({ id: user.id, username, display_name: metadata.display_name || "" }); }
  const { data: account } = await supa.from("profiles").select("username,display_name,avatar_url,bio,is_private").eq("id", user.id).maybeSingle();
  if (account) {
    activeUsername = account.username;
    const userRow = document.querySelector(".user-row");
    updateAccountAvatarImages(account.avatar_url);
    userRow.querySelector("b").textContent = account.username;
    userRow.querySelector("small").textContent = account.display_name || user.email;
    document.getElementById("profileUsername").textContent = account.username;
    document.getElementById("profileDisplayName").textContent = account.display_name || user.email;
    document.getElementById("profileBio").textContent = account.bio || "";
    document.getElementById("profilePrivacyLabel").hidden = !account.is_private;
  }
  await loadFollowing(); await loadSuggestions(); await loadSocial(); await loadStories(); await loadProfileStats(); await loadMessages(); await loadNotifications();
  clearInterval(notificationRefreshTimer);
  notificationRefreshTimer = setInterval(() => loadNotifications(!notificationsModal.hidden), 20000);
  supa.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") location.replace("/login"); });
}
initialize();
