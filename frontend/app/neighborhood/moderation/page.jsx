"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlatformPageShell } from "../../../components/ui/platform-pages";
import { useAccess } from "../../../components/access-provider";
import { neighborhoodRequest } from "../../../lib/neighborhood";

const labels = { locations: "Предложенные территории", roles: "Заявки представителей", events: "События", reports: "Сообщения жителей", discussions: "Обсуждения" };
const kinds = { locations: "location", roles: "role", events: "event", reports: "report", discussions: "discussion" };

export default function NeighborhoodModerationPage() {
  const { access } = useAccess();
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() { try { setQueue(await neighborhoodRequest("/moderation")); setError(""); } catch (cause) { setError(cause.message); } }
  useEffect(() => { refresh(); }, []);
  async function decide(key, id, decision) {
    setBusy(true); setNotice("");
    try { await neighborhoodRequest(`/moderation/${kinds[key]}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ decision }) }); await refresh(); setNotice("Решение сохранено."); }
    catch (cause) { setNotice(cause.message); }
    finally { setBusy(false); }
  }
  return <PlatformPageShell eyebrow="Проверка сообщества" title="Модерация района" subtitle="Проверяйте адреса, полномочия представителей и сообщения жителей."><Link href="/neighborhood">← К карте районов</Link>{error && <p role="alert" className="neighborhoodNotice">{error}</p>}{notice && <p role="status" className="neighborhoodNotice">{notice}</p>}{!queue && !error && <p role="status">Загрузка заявок…</p>}{queue && Object.entries(labels).map(([key, label]) => <section className="neighborhoodSection" key={key}><h2>{label}</h2>{queue[key]?.length ? queue[key].map((item) => <article className="neighborhoodCard" key={item.id}><h3>{item.name || item.title || `${item.role} · ${item.organizationName}`}</h3><p>{item.address || item.description || item.evidence || item.body || item.sourceLabel}</p><small>Статус: {item.reviewStatus || item.status || item.publicStatus}</small><div className="neighborhoodActions">{key === "roles" && access?.role !== "ADMIN" ? <span>Проверку полномочий выполняет администратор платформы.</span> : <>{!["reports", "discussions"].includes(key) && <button disabled={busy} onClick={() => decide(key, item.id, key === "locations" || key === "roles" ? "approved" : "published")}>Подтвердить</button>}<button disabled={busy} onClick={() => decide(key, item.id, "rejected")}>Отклонить</button></>}</div></article>) : <p>Нет заявок.</p>}</section>)}</PlatformPageShell>;
}
