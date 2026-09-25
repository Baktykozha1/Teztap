"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { PlatformPageShell } from "../../components/ui/platform-pages";
import { useAccess } from "../../components/access-provider";
import { accessCopy } from "../../lib/access-copy";
import policy from "../../../shared/access";

export default function AdminPage() {
  const { language, refresh } = useAccess();
  const t = accessCopy(language);
  const [users, setUsers] = useState([]);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading"); setError("");
    fetch(`/api/admin/users?offset=${offset}&limit=25`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(t.error); return response.json(); })
      .then((data) => { setUsers(data.users); setStatus("ready"); })
      .catch((err) => { if (err.name !== "AbortError") { setError(err.message); setStatus("error"); } });
    return () => controller.abort();
  }, [offset, t.error]);
  return <PlatformPageShell title={t.features.ADMIN_TOOLS} subtitle={t.adminOnly}>
    {error && <p className="errorText" role="alert">{error}</p>}
    {status === "loading" ? <p role="status">{t.loading}</p> : <div className="accessUserList">{users.map((user) => <UserAccessRow key={`${user.id}-${offset}`} user={user} t={t} onSaved={refresh} />)}</div>}
    <div className="accessToolbar"><button className="secondaryButton" disabled={!offset || status === "loading"} onClick={() => setOffset((value) => Math.max(0, value - 25))}><ChevronLeft size={16} />{t.previous}</button><button className="secondaryButton" disabled={users.length < 25 || status === "loading"} onClick={() => setOffset((value) => value + 25)}>{t.next}<ChevronRight size={16} /></button></div>
  </PlatformPageShell>;
}

function UserAccessRow({ user, t, onSaved }) {
  const [form, setForm] = useState({ subscriptionPlan: user.subscriptionPlan, subscriptionStatus: user.subscriptionStatus, subscriptionExpiresAt: user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toISOString().slice(0, 16) : "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, subscriptionExpiresAt: form.subscriptionExpiresAt ? `${form.subscriptionExpiresAt}:00.000Z` : null }) });
      if (!response.ok) throw new Error(t.error);
      setMessage(t.saved); await onSaved();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <form className="accessUserRow" onSubmit={save}>
    <div><strong>{user.name}</strong><p>{user.email}</p><small>{user.role}{user.requestedPlan ? ` / ${t.request}: ${user.requestedPlan}` : ""}</small></div>
    <label><span>{t.current}</span><select value={form.subscriptionPlan} onChange={update("subscriptionPlan")}>{policy.PLANS.map((plan) => <option key={plan}>{plan}</option>)}</select></label>
    <label><span>Status</span><select value={form.subscriptionStatus} onChange={update("subscriptionStatus")}>{policy.STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label><span>{t.expiry}</span><input type="datetime-local" value={form.subscriptionExpiresAt} onChange={update("subscriptionExpiresAt")} /></label>
    <button type="submit" className="secondaryButton" disabled={busy}><Save size={16} />{t.save}</button>
    {message && <p className="accessRowMessage" role="status">{message}</p>}
  </form>;
}
