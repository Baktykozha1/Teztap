"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, CalendarDays, MapPin, Navigation, Sparkles, UserRound } from "lucide-react";
import { FavoriteButton, RecommendationScore } from "./discovery-ui";
import { scoreListing } from "../../lib/discovery";
import { dispatchWorkspaceActivity } from "../workspace-provider";

const CV_KEY = "mercora.jobs.cv.v1";
const APPLICATIONS_KEY = "mercora.jobs.applications.v1";
const employmentLabels = { "full-time": "Полный день", "part-time": "Частичная занятость", temporary: "Временная работа", internship: "Стажировка", "entry-level": "Начало карьеры" };
const formatLabels = { onsite: "На месте", hybrid: "Гибрид", remote: "Удалённо" };

export function useJobsLocalData() {
  const [profile, setProfile] = useState({ name: "", headline: "", skills: [], experienceYears: null, preferredFormat: "", preferredEmployment: "" });
  const [applications, setApplications] = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const savedProfile = JSON.parse(window.localStorage.getItem(CV_KEY) || "null");
      const savedApplications = JSON.parse(window.localStorage.getItem(APPLICATIONS_KEY) || "[]");
      if (savedProfile && typeof savedProfile === "object") setProfile((current) => ({ ...current, ...savedProfile, skills: Array.isArray(savedProfile.skills) ? savedProfile.skills : [] }));
      if (Array.isArray(savedApplications)) setApplications(savedApplications);
    } catch { /* Empty local state remains usable when storage is unavailable. */ }
    setReady(true);
  }, []);
  function saveProfile(next) {
    const normalized = { ...next, skills: Array.isArray(next.skills) ? next.skills : String(next.skills || "").split(",").map((value) => value.trim()).filter(Boolean) };
    setProfile(normalized);
    try { window.localStorage.setItem(CV_KEY, JSON.stringify(normalized)); } catch { /* Keep the current session state. */ }
  }
  function saveApplication(listing, values) {
    const nextItem = { id: `application-${listing.id}`, listingId: listing.id, title: listing.title, employer: listing.job?.employer?.name || listing.provider, applicantName: values.name, contact: values.contact, coverLetter: values.coverLetter, status: "saved-local", submittedAt: new Date().toISOString(), demo: listing.demo === true };
    setApplications((current) => {
      const next = [nextItem, ...current.filter((item) => item.listingId !== listing.id)].slice(0, 100);
      try { window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(next)); } catch { /* Keep the current session state. */ }
      return next;
    });
    dispatchWorkspaceActivity("application", { id: nextItem.id, title: nextItem.title, employer: nextItem.employer, status: nextItem.status, demo: nextItem.demo });
  }
  function updateApplicationStatus(id, status) {
    setApplications((current) => {
      const next = current.map((item) => item.id === id ? { ...item, status } : item);
      try { window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(next)); } catch { /* Keep the current session state. */ }
      return next;
    });
  }
  return { profile, saveProfile, applications, saveApplication, updateApplicationStatus, ready };
}

export function scoreJobMatch(listing, profile) {
  const job = listing?.job;
  if (!job || !profile || !(profile.skills?.length || profile.experienceYears != null || profile.preferredFormat || profile.preferredEmployment)) return { score: null, matchedSkills: [], missingSkills: job?.requiredSkills || [] };
  const skills = (profile.skills || []).map(normalizeText).filter(Boolean);
  const requiredSkills = job.requiredSkills || [];
  const matchedSkills = requiredSkills.filter((required) => skills.some((skill) => skill.includes(normalizeText(required)) || normalizeText(required).includes(skill)));
  const missingSkills = requiredSkills.filter((required) => !matchedSkills.includes(required));
  const skillScore = requiredSkills.length ? matchedSkills.length / requiredSkills.length : 1;
  const experienceKnown = profile.experienceYears != null && profile.experienceYears !== "";
  const experienceScore = !experienceKnown ? 0.5 : Number(profile.experienceYears) >= Number(job.experienceYears || 0) ? 1 : 0;
  const employmentScore = !profile.preferredEmployment || profile.preferredEmployment === job.employmentType ? 1 : 0;
  const formatScore = !profile.preferredFormat || profile.preferredFormat === "any" || profile.preferredFormat === job.workFormat ? 1 : 0;
  const score = Math.round((skillScore * 60 + experienceScore * 20 + employmentScore * 10 + formatScore * 10));
  return { score, matchedSkills, missingSkills, factors: { skills: Math.round(skillScore * 60), experience: Math.round(experienceScore * 20), employment: employmentScore * 10, format: formatScore * 10 } };
}

export function JobFilters({ value, onChange }) {
  function update(key, next) { onChange((current) => ({ ...current, [key]: next })); }
  return <section className="jobFilters" aria-label="Фильтры вакансий">
    <label>Зарплата от, ₸<input type="number" min="0" value={value.minSalary} onChange={(event) => update("minSalary", event.target.value)} placeholder="Любая" /></label>
    <label>Зарплата до, ₸<input type="number" min="0" value={value.maxSalary} onChange={(event) => update("maxSalary", event.target.value)} placeholder="Любая" /></label>
    <label>Занятость<select value={value.employmentType} onChange={(event) => update("employmentType", event.target.value)}><option value="">Любая</option>{Object.entries(employmentLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
    <label>Опыт<select value={value.experience} onChange={(event) => update("experience", event.target.value)}><option value="">Любой</option><option value="0">Без опыта</option><option value="1">От 1 года</option><option value="3">От 3 лет</option></select></label>
    <label>График<select value={value.schedule} onChange={(event) => update("schedule", event.target.value)}><option value="">Любой</option><option value="weekday">Будни</option><option value="weekend">Выходные</option><option value="shift">Сменный</option><option value="flexible">Гибкий</option></select></label>
    <label>Формат работы<select value={value.workFormat} onChange={(event) => update("workFormat", event.target.value)}><option value="">Любой</option><option value="remote">Удалённо</option><option value="hybrid">Гибрид</option><option value="onsite">На месте</option></select></label>
    <button type="button" onClick={() => onChange({ minSalary: "", maxSalary: "", employmentType: "", experience: "", schedule: "", workFormat: "" })}>Сбросить фильтры</button>
  </section>;
}

export function matchesJobFilters(listing, filters) {
  const job = listing.job;
  if (!job) return !filters.minSalary && !filters.maxSalary && !filters.employmentType && !filters.experience && !filters.schedule && !filters.workFormat;
  if (filters.minSalary && (job.salaryMax == null || job.salaryMax < Number(filters.minSalary))) return false;
  if (filters.maxSalary && (job.salaryMin == null || job.salaryMin > Number(filters.maxSalary))) return false;
  if (filters.employmentType && job.employmentType !== filters.employmentType) return false;
  if (filters.experience && Number(job.experienceYears ?? 0) < Number(filters.experience)) return false;
  if (filters.workFormat && job.workFormat !== filters.workFormat) return false;
  const schedule = String(job.schedule || "").toLowerCase();
  if (filters.schedule === "weekday" && !/пн|будн|mon|weekday/.test(schedule)) return false;
  if (filters.schedule === "weekend" && !/суббот|воскрес|выход|weekend|sat|sun/.test(schedule)) return false;
  if (filters.schedule === "shift" && !/смен|shift|2\/2/.test(schedule)) return false;
  if (filters.schedule === "flexible" && !/гибк|flex|по согласован/.test(schedule)) return false;
  return true;
}

export function JobCard({ listing, profile, favorite, onToggleFavorite, onViewOnMap, onApply, onDetails, application, selected, scoreContext }) {
  const job = listing.job;
  const match = scoreJobMatch(listing, profile);
  const recommendation = scoreListing(listing, scoreContext);
  const salary = job?.salaryMin == null ? listing.priceLabel || "Зарплата не указана" : job.salaryMax && job.salaryMax !== job.salaryMin ? `${money(job.salaryMin)}–${money(job.salaryMax)} ₸ / ${job.salaryPeriod || "месяц"}` : `${money(job.salaryMin)} ₸ / ${job.salaryPeriod || "месяц"}`;
  return <article id={`listing-${listing.id}`} className={`jobCard ${selected ? "selected" : ""}`} aria-current={selected ? "true" : undefined}>
    <div className="jobCardTop"><span className={listing.demo ? "demoBadge" : "dataSourceBadge"}>{listing.demo ? "Пример TezTap · вакансия не опубликована" : listing.sourceLabel || "Работодатель на карте"}</span><FavoriteButton active={favorite} onClick={() => onToggleFavorite(listing.id)} /></div>
    <div className="jobCardHeading"><span className="jobEmployerMark"><BriefcaseBusiness size={20} /></span><div><span className="listingSubtype">{listing.subtypeLabel || listing.subtype}</span><h3>{listing.title}</h3><p>{job?.employer?.name || listing.provider}</p></div><RecommendationScore score={recommendation.recommendationScore} /></div>
    <div className="jobFacts"><strong>{salary}</strong><span>{job ? `${employmentLabels[job.employmentType] || job.employmentType} · ${formatLabels[job.workFormat] || "формат не указан"}` : "Работодатель на карте · вакансии не опубликованы"}</span><span><CalendarDays size={14} />{job?.schedule || "График не указан"}</span><span><MapPin size={14} />{listing.address || listing.district} · {recommendation.distanceKm == null ? "расстояние неизвестно" : `${recommendation.distanceKm.toFixed(1)} км`}</span><small>{job?.publishedAt ? `Опубликовано ${new Date(`${job.publishedAt}T12:00:00`).toLocaleDateString("ru-RU")}` : `Источник: ${listing.sourceLabel || "OpenStreetMap"}`}</small></div>
    {job && <div className="jobMatchBox"><div><strong>{match.score == null ? "Добавьте навыки в CV для оценки совпадения" : `Совпадение с CV · ${match.score}%`}</strong><span>{match.matchedSkills.length ? `Подходит: ${match.matchedSkills.join(", ")}` : "Пока нет совпавших навыков"}</span>{match.missingSkills.length > 0 && <span>Стоит развить: {match.missingSkills.join(", ")}</span>}</div><small>Совпадение рассчитано по CV и требованиям вакансии. Это отдельная оценка TezTap.</small></div>}
    <div className="jobRequirementTags">{(job?.requirements || listing.tags || []).map((item) => <span key={item}>{item}</span>)}</div>
    <div className="jobCardActions"><button type="button" onClick={() => onDetails(listing, "job")}>Вакансия</button><button type="button" onClick={() => onDetails(listing, "employer")}>Работодатель</button><Link href="#directory-map" onClick={() => onViewOnMap(listing)}><MapPin size={14} /> На карте</Link>{job && <button type="button" className="jobApplyButton" onClick={() => onApply(listing)}>{application ? "Мой отклик" : "Быстрый отклик"}</button>}<TezTapJobLink listing={listing} profile={profile} score={match.score} scoreContext={scoreContext} />
    </div>
    {application && <p className="jobApplicationStatus" role="status">Статус: {applicationStatus(application.status)} · хранится на этом устройстве</p>}
  </article>;
}

export function JobsWorkspace({ profile, onSaveProfile, applications, onUpdateApplication }) {
  const [skills, setSkills] = useState(profile.skills.join(", "));
  useEffect(() => setSkills(profile.skills.join(", ")), [profile.skills]);
  return <details className="jobsWorkspace"><summary><UserRound size={17} /> Моё CV и отклики <span>{applications.length} откликов</span></summary><div className="jobsWorkspaceGrid">
    <form className="jobsCvForm" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSaveProfile({ name: form.get("name"), headline: form.get("headline"), skills: skills.split(",").map((value) => value.trim()).filter(Boolean), experienceYears: form.get("experienceYears") === "" ? null : Number(form.get("experienceYears")), preferredEmployment: form.get("preferredEmployment"), preferredFormat: form.get("preferredFormat") }); }}>
      <h3>Базовый CV</h3><label>Имя<input name="name" defaultValue={profile.name} maxLength="100" placeholder="Как к вам обращаться" /></label><label>Желаемая должность<input name="headline" defaultValue={profile.headline} maxLength="120" placeholder="Например, специалист поддержки" /></label><label>Навыки через запятую<textarea value={skills} onChange={(event) => setSkills(event.target.value)} rows="3" placeholder="Общение, Excel, русский язык" /></label><label>Опыт, лет<input name="experienceYears" type="number" min="0" max="60" defaultValue={profile.experienceYears ?? ""} /></label><label>Занятость<select name="preferredEmployment" defaultValue={profile.preferredEmployment}><option value="">Любая</option>{Object.entries(employmentLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Формат<select name="preferredFormat" defaultValue={profile.preferredFormat}><option value="">Любой</option><option value="remote">Удалённо</option><option value="hybrid">Гибрид</option><option value="onsite">На месте</option></select></label><button type="submit">Сохранить CV на устройстве</button><small>CV остаётся в этом браузере и не публикуется.</small></form>
    <section className="jobsApplications"><h3>Мои отклики</h3>{applications.length ? applications.map((item) => <article key={item.id}><div><strong>{item.title}</strong><span>{item.employer}</span><small>{item.demo ? "Демо · работодатель не получил отклик" : "Сохранено на устройстве"}</small></div><label>Статус<select value={item.status} onChange={(event) => onUpdateApplication(item.id, event.target.value)}><option value="saved-local">Подготовлен · локально</option><option value="reviewing-demo">На рассмотрении · демо</option><option value="interview-demo">Приглашение · демо</option><option value="closed-demo">Закрыт · демо</option></select></label></article>) : <p>Отклики появятся здесь. В демонстрационном каталоге они сохраняются только локально.</p>}</section>
  </div></details>;
}

export function JobApplicationDialog({ listing, profile, onClose, onSubmit, previousApplication }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!listing) return undefined; function onKey(event) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [listing, onClose]);
  useEffect(() => { setSaved(false); setError(""); }, [listing?.id]);
  if (!listing) return null;
  function submit(event) { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name") || "").trim(); const contact = String(data.get("contact") || "").trim(); if (!name || !contact) { setError("Укажите имя и контакт для черновика отклика."); return; } onSubmit(listing, { name, contact, coverLetter: data.get("coverLetter") }); setSaved(true); }
  return <div className="jobDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="jobDialog" role="dialog" aria-modal="true" aria-labelledby="job-apply-title"><button type="button" className="educationDialogClose" onClick={onClose} aria-label="Закрыть">×</button><span className="educationEyebrow">Быстрый отклик · демо</span><h2 id="job-apply-title">{saved ? "Черновик отклика сохранён" : listing.title}</h2>{saved ? <p className="jobLocalNotice">Отклик сохранён только на этом устройстве. Работодатель не получил заявку; для реальной отправки нужен подключённый канал работодателя.</p> : <><p>{listing.job?.employer?.name || listing.provider}</p><form className="jobsCvForm" onSubmit={submit}><label>Имя<input name="name" required defaultValue={profile.name} maxLength="100" /></label><label>Телефон или e-mail<input name="contact" required maxLength="140" placeholder="Ваш контакт" /></label><label>Короткое сопроводительное письмо<textarea name="coverLetter" rows="4" maxLength="700" defaultValue={profile.headline ? `Здравствуйте! Меня заинтересовала вакансия. ${profile.headline}.` : ""} /></label><small>{previousApplication ? `Текущий локальный статус: ${applicationStatus(previousApplication.status)}.` : "Это демонстрационный отклик: он останется в браузере."}</small><button type="submit">Сохранить отклик</button>{error && <p role="alert">{error}</p>}</form></>}</section></div>;
}

export function JobDetailsDialog({ listing, tab = "job", onTabChange, onClose, onViewOnMap, profile, scoreContext }) {
  useEffect(() => { if (!listing) return undefined; function onKey(event) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [listing, onClose]);
  if (!listing) return null;
  const job = listing.job;
  const match = scoreJobMatch(listing, profile);
  const employer = job?.employer || { name: listing.provider, description: "Работодатель или организация из открытого географического каталога. Вакансии в источнике не опубликованы." };
  const mercoraPrompt = `Оцени соответствие вакансии в Актау профилю пользователя. Вакансия: ${listing.title}. Требуемые навыки: ${(job?.requiredSkills || []).join(", ") || "не указаны"}. Профиль: ${(profile.skills || []).join(", ") || "навыки не указаны"}. Совпадение навыков TezTap: ${match.score ?? "недостаточно данных"}%. Объясни сильные стороны, пробелы и ограничения доступных данных.`;
  function preserve() { try { window.sessionStorage.setItem("mercora.discovery.ai-context.v1", JSON.stringify({ category: "jobs", request: mercoraPrompt, records: [{ ...listing, jobMatch: match }] })); } catch { /* Continue to TezTap if local storage is unavailable. */ } }
  return <div className="jobDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="jobDialog jobDetailDialog" role="dialog" aria-modal="true" aria-labelledby="job-detail-title"><button type="button" className="educationDialogClose" onClick={onClose} aria-label="Закрыть">×</button><div className="jobDetailTabs"><button type="button" className={tab === "job" ? "active" : ""} onClick={() => onTabChange("job")}>Вакансия</button><button type="button" className={tab === "employer" ? "active" : ""} onClick={() => onTabChange("employer")}>Работодатель</button></div>{tab === "job" ? <><span className={listing.demo ? "demoBadge" : "dataSourceBadge"}>{listing.demo ? "Пример TezTap · не опубликовано работодателем" : listing.sourceLabel}</span><h2 id="job-detail-title">{listing.title}</h2><p className="jobDetailEmployer">{employer.name} · {listing.address || listing.district}</p><p>{listing.description}</p><div className="jobProfileGrid"><article><strong>Зарплата</strong><p>{listing.priceLabel || "Не указана"}</p></article><article><strong>Формат и занятость</strong><p>{job ? `${employmentLabels[job.employmentType]} · ${formatLabels[job.workFormat]}` : "Вакансии не опубликованы"}</p></article><article><strong>График</strong><p>{job?.schedule || "Не указан"}</p></article><article><strong>Опыт</strong><p>{job?.experienceYears == null ? "Не указан" : `${job.experienceYears} лет`}</p></article><article><strong>Требования</strong><p>{job?.requirements?.join(" · ") || "Вакансия отсутствует в открытой записи"}</p></article><article><strong>Совпадение с CV</strong><p>{match.score == null ? "Сохраните навыки в CV для сравнения" : `${match.score}% · совпали: ${match.matchedSkills.join(", ") || "пока нет"}; пробелы: ${match.missingSkills.join(", ") || "не выявлены"}`}</p></article></div><p className="jobSourceLine">Формат карточки: {listing.demo ? "Демонстрационный пример TezTap" : listing.sourceLabel || "не указан"}{job?.publishedAt ? ` · опубликовано ${new Date(`${job.publishedAt}T12:00:00`).toLocaleDateString("ru-RU")}` : ""}</p><div className="jobCardActions"><button type="button" onClick={() => onViewOnMap(listing)}><MapPin size={14} /> Показать на карте</button><Link href={`/analyze?mercoraPrompt=${encodeURIComponent(mercoraPrompt)}#mercora-ai`} onClick={preserve}><Sparkles size={14} /> Анализ TezTap</Link></div></> : <><span className="educationEyebrow">Профиль работодателя</span><h2 id="job-detail-title">{employer.name}</h2><p>{employer.description}</p><div className="jobProfileGrid"><article><strong>Сфера</strong><p>{employer.industry || "Организация на карте"}</p></article><article><strong>Расположение</strong><p>{listing.address || listing.district || "Актау"}</p></article><article><strong>Формат карточки</strong><p>{listing.demo ? "Демонстрационный пример TezTap" : listing.sourceLabel || "Не указан"}</p></article><article><strong>Вакансии</strong><p>{job ? listing.title : "В этом открытом источнике вакансии не опубликованы."}</p></article></div><button className="jobMapAction" type="button" onClick={() => onViewOnMap(listing)}><Navigation size={15} /> На карте</button></>}</section></div>;
}

function TezTapJobLink({ listing, profile, score, scoreContext }) {
  const match = scoreJobMatch(listing, profile);
  const message = `Проанализируй вакансию ${listing.title} в Актау и объясни соответствие навыков профилю: совпали ${match.matchedSkills.join(", ") || "пока никакие"}; требуют развития ${match.missingSkills.join(", ") || "нет данных"}; совпадение ${score ?? "не рассчитано"}%. Укажи ограничения доступных данных.`;
  function preserve() { try { const recommendation = scoreListing(listing, scoreContext); window.sessionStorage.setItem("mercora.discovery.ai-context.v1", JSON.stringify({ category: "jobs", request: message, records: [{ ...listing, recommendationScore: recommendation.recommendationScore, jobMatch: match }] })); } catch { /* Preserve the regular TezTap handoff. */ } }
  return <Link href={`/analyze?mercoraPrompt=${encodeURIComponent(message)}#mercora-ai`} onClick={preserve}><Sparkles size={14} /> TezTap</Link>;
}

function applicationStatus(status) { return ({ "saved-local": "черновик на устройстве", "reviewing-demo": "на рассмотрении · демо", "interview-demo": "приглашение · демо", "closed-demo": "закрыт · демо" })[status] || "неизвестен"; }
function money(value) { return new Intl.NumberFormat("ru-RU").format(Number(value)); }
function normalizeText(value) { return String(value || "").trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е"); }
