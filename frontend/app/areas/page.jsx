"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Crosshair, Database, LoaderCircle, MapPinned, ShieldCheck } from "lucide-react";
import { useAccess } from "../../components/access-provider";
import { PlatformPageShell } from "../../components/ui/platform-pages";
import { formatBusinessType, formatMoney } from "../../lib/formatters";
import { loadSystemState, requestBestAreas } from "../../lib/api";

const AreaMap = dynamic(() => import("../components/CompetitorLeafletMap"), {
  ssr: false,
  loading: () => <div className="areaMapLoading"><LoaderCircle className="areaSpin" size={22} /> Loading map</div>
});

const copy = {
  kk: {
    eyebrow: "PRO · Орналасу аналитикасы", title: "Бизнес үшін үздік ауданды табу", subtitle: "Қала ішіндегі аумақтарды бірдей радиуспен салыстырып, бәсекені, болашақ қысымды, бюджет сәйкестігін және тексерілген нысандарды бағалайды.",
    country: "Ел", city: "Қала", category: "Бизнес санаты", budget: "Бюджет, KZT", audience: "Мақсатты аудитория (міндетті емес)", format: "Бизнес форматы (міндетті емес)", run: "Үздік ауданды табу", choose: "Таңдаңыз", waiting: "Деректер енгізілгеннен кейін ғана талдау басталады.", loading: "Нарық деректері тексеріліп, аудандар есептелуде...", error: "Аудан талдауын орындау мүмкін болмады.",
    best: "Ең үздік таңдау", lower: "Бәсекесі төмен", alternative: "Балама мүмкіндік", area: "Аумақ", score: "Аудан ұпайы", confidence: "Сенімділік", competition: "Бәсекелестер", pressure: "Болашақ қысым", saturation: "Қанығу", budgetFit: "Бюджет сәйкестігі", property: "Нысан сәйкестігі", demographics: "Демография", strengths: "Неліктен сәйкес", risks: "Тәуекелдер", missing: "Жетіспейтін деректер", compare: "Аудандарды салыстыру", map: "Картадағы рейтинг", sources: "Дереккөздер мен әдістеме", limitations: "Шектеулер", radius: "Салыстыру радиусы", coverage: "Қамту", records: "жазба", calculated: "Есептелген уақыт", weights: "Қолданылған салмақтар", noData: "N/A", budgetWarning: "Бұл бюджет толық формат үшін жеткіліксіз. Рейтинг бюджет шектеуімен есептелді.", generatedZone: "Ресми аудан шекаралары табылмады. Нәтижелер ойдан шығарылған аудан атаулары емес, координаталық талдау аймақтары бойынша берілді.", insufficient: "Сенімді аудан рейтингін құру үшін геокодталған деректер жеткіліксіз.", properties: "Сәйкес коммерциялық нысандар", noProperties: "Бұл аумақ үшін тексерілген коммерциялық нысандар табылмады.", emptyTitle: "Нарықты салыстыруға дайын", emptyBody: "Елді, қаланы, бизнес санатын және бюджетті таңдаңыз. Ұпайлар сұрау жіберілгенге дейін бос қалады.", stages: ["Қала аумақтарын жүктеу", "Бизнестерді талдау", "Бәсекені бағалау", "Қолжетімді деректерді өңдеу", "Аудан ұпайларын есептеу", "Аумақтарды рейтингтеу"]
  },
  ru: {
    eyebrow: "PRO · Аналитика локаций", title: "Найти лучший район для бизнеса", subtitle: "Сравнивает территории города в одинаковом радиусе по конкуренции, будущему давлению, соответствию бюджету и проверенным помещениям.",
    country: "Страна", city: "Город", category: "Категория бизнеса", budget: "Бюджет, KZT", audience: "Целевая аудитория (необязательно)", format: "Формат бизнеса (необязательно)", run: "Найти лучший район", choose: "Выберите", waiting: "Анализ начнётся только после ввода данных.", loading: "Проверяем рыночные данные и рассчитываем районы...", error: "Не удалось выполнить анализ районов.",
    best: "Лучший выбор", lower: "Ниже конкуренция", alternative: "Альтернативная возможность", area: "Территория", score: "Оценка района", confidence: "Достоверность", competition: "Конкуренты", pressure: "Будущее давление", saturation: "Насыщенность", budgetFit: "Соответствие бюджету", property: "Соответствие помещения", demographics: "Демография", strengths: "Почему подходит", risks: "Риски", missing: "Недостающие данные", compare: "Сравнение районов", map: "Рейтинг на карте", sources: "Источники и методика", limitations: "Ограничения", radius: "Радиус сравнения", coverage: "Покрытие", records: "записей", calculated: "Время расчёта", weights: "Использованные веса", noData: "N/A", budgetWarning: "Бюджет недостаточен для полного формата. Рейтинг рассчитан с бюджетным ограничением.", generatedZone: "Официальные границы районов недоступны. Результат показан по координатным зонам анализа, а не под вымышленными названиями районов.", insufficient: "Недостаточно геокодированных данных для достоверного рейтинга территорий.", properties: "Подходящие коммерческие помещения", noProperties: "Для этой территории нет проверенных коммерческих помещений.", emptyTitle: "Готово к сравнению рынка", emptyBody: "Выберите страну, город, категорию бизнеса и бюджет. До отправки запроса все оценки остаются пустыми.", stages: ["Загружаем территории города", "Анализируем бизнесы", "Оцениваем конкуренцию", "Обрабатываем доступные данные", "Рассчитываем оценки районов", "Формируем рейтинг"]
  },
  en: {
    eyebrow: "PRO · Location intelligence", title: "Find the best area for a business", subtitle: "Compares city areas at the same radius using competition, future pressure, budget fit, and verified commercial properties.",
    country: "Country", city: "City", category: "Business category", budget: "Budget, KZT", audience: "Target audience (optional)", format: "Business format (optional)", run: "Find best area", choose: "Select", waiting: "Analysis starts only after you provide the inputs.", loading: "Checking market evidence and ranking areas...", error: "Area analysis could not be completed.",
    best: "Best overall", lower: "Lower competition", alternative: "Alternative opportunity", area: "Area", score: "Area score", confidence: "Confidence", competition: "Competitors", pressure: "Future pressure", saturation: "Saturation", budgetFit: "Budget fit", property: "Property fit", demographics: "Demographics", strengths: "Why it fits", risks: "Risks", missing: "Missing data", compare: "Area comparison", map: "Ranked areas on map", sources: "Sources and methodology", limitations: "Limitations", radius: "Comparison radius", coverage: "Coverage", records: "records", calculated: "Calculated at", weights: "Applied weights", noData: "N/A", budgetWarning: "The budget is below the known minimum for a full format. Ranking is budget-constrained.", generatedZone: "Official neighborhood boundaries were unavailable. Results use coordinate-based analysis zones, not fabricated neighborhood names.", insufficient: "There is not enough geocoded evidence to produce a reliable area ranking.", properties: "Matching commercial properties", noProperties: "No verified commercial properties are available for this area.", emptyTitle: "Ready to compare the market", emptyBody: "Select a country, city, business category, and budget. Scores remain empty until you request analysis.", stages: ["Loading city areas", "Analyzing businesses", "Evaluating competition", "Processing available data", "Calculating area scores", "Ranking areas"]
  }
};

const resultLabels = { BEST_OVERALL: "best", LOWER_COMPETITION: "lower", ALTERNATIVE_OPPORTUNITY: "alternative" };

export default function BestAreaPage() {
  const { language, session } = useAccess();
  const t = copy[language] || copy.kk;
  const [options, setOptions] = useState({ cities: [], businessTypes: [] });
  const [form, setForm] = useState({ country: "", city: "", businessType: "", budget: "", targetAudience: "", businessFormat: "" });
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(0);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [loadingStage, setLoadingStage] = useState(0);

  useEffect(() => {
    let active = true;
    loadSystemState().then((data) => { if (active) setOptions(data.options); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (state !== "loading") return undefined;
    setLoadingStage(0);
    const timer = window.setInterval(() => setLoadingStage((current) => Math.min(current + 1, t.stages.length - 1)), 900);
    return () => window.clearInterval(timer);
  }, [state, t.stages.length]);

  const selectedArea = result?.rankedAreas?.[selected] || null;
  const mapResult = useMemo(() => result ? toMapResult(result, form) : null, [result, form]);

  async function submit(event) {
    event.preventDefault();
    setState("loading");
    setError("");
    setResult(null);
    try {
      const data = await requestBestAreas({ form, session });
      setResult(data);
      setSelected(0);
      setState("ready");
    } catch (requestError) {
      setError(requestError.message || t.error);
      setState("error");
    }
  }

  return (
    <PlatformPageShell eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle}>
      <form className="areaFinderForm" onSubmit={submit}>
        <label><span>{t.country}</span><select required value={form.country} onChange={(event) => update("country", event.target.value)}><option value="">{t.choose}</option><option value="Kazakhstan">Kazakhstan</option></select></label>
        <label><span>{t.city}</span><select required value={form.city} onChange={(event) => update("city", event.target.value)}><option value="">{t.choose}</option>{options.cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
        <label><span>{t.category}</span><select required value={form.businessType} onChange={(event) => update("businessType", event.target.value)}><option value="">{t.choose}</option>{options.businessTypes.map((type) => <option key={type} value={type}>{formatBusinessType(type)}</option>)}</select></label>
        <label><span>{t.budget}</span><input required min="1" type="number" inputMode="numeric" value={form.budget} onChange={(event) => update("budget", event.target.value)} /></label>
        <label><span>{t.audience}</span><input value={form.targetAudience} onChange={(event) => update("targetAudience", event.target.value)} /></label>
        <label><span>{t.format}</span><input value={form.businessFormat} onChange={(event) => update("businessFormat", event.target.value)} /></label>
        <button className="primaryButton areaFinderSubmit" disabled={state === "loading"} type="submit">{state === "loading" ? <LoaderCircle className="areaSpin" size={18} /> : <Crosshair size={18} />}{state === "loading" ? t.loading : t.run}</button>
        <p className="areaFinderAssurance"><ShieldCheck size={15} />{t.waiting}</p>
      </form>

      {state === "idle" && <AreaEmptyState t={t} />}
      {state === "loading" && <AreaLoading t={t} stage={loadingStage} />}
      {state === "error" && <div className="areaNotice error"><AlertTriangle size={19} /><span>{error || t.error}</span></div>}

      {result && (
        <>
          {result.status === "BUDGET_NOT_VIABLE" && <div className="areaNotice warning"><AlertTriangle size={19} /><span>{t.budgetWarning}</span></div>}
          {result.status === "INSUFFICIENT_AREA_DATA" && <div className="areaNotice warning"><AlertTriangle size={19} /><span>{t.insufficient}</span></div>}
          {result.areaDiscovery?.usedGeneratedZones && <div className="areaNotice"><Database size={19} /><span>{t.generatedZone}</span></div>}

          <section className="areaRankGrid" aria-label={t.compare}>
            {(result.rankedAreas || []).map((area, index) => (
              <button type="button" key={area.areaId} onClick={() => setSelected(index)} className={`areaRankCard ${selected === index ? "selected" : ""}`}>
                <span className="areaRankMeta">#{area.rank} · {t[resultLabels[area.resultType]]}</span>
                <strong>{localAreaName(area, language)}</strong>
                <div className="areaScoreLine"><b>{value(area.score)}</b><span>/100</span></div>
                <div className="areaCardStats"><span>{t.competition}<b>{value(area.factors?.competition?.nearbyCompetitors)}</b></span><span>{t.confidence}<b>{area.confidence?.level || t.noData}</b></span></div>
              </button>
            ))}
          </section>

          {selectedArea && <AreaDetail area={selectedArea} result={result} t={t} language={language} />}

          <section className="platformGrid">
            <article className="platformCard areaMapCard">
              <div className="platformCardHeader"><MapPinned size={18} /><h2>{t.map}</h2></div>
              <AreaMap
                result={mapResult}
                selectedLocation={selectedArea ? { coordinates: selectedArea.centroid, districtId: selectedArea.name } : null}
                onLocationSelect={({ districtId }) => {
                  const index = result.rankedAreas?.findIndex((area) => area.name === districtId) ?? -1;
                  if (index >= 0) setSelected(index);
                }}
              />
            </article>
          </section>

          <AreaComparison areas={result.rankedAreas || []} t={t} language={language} />
          <AreaMethodology result={result} t={t} />
        </>
      )}
    </PlatformPageShell>
  );

  function update(key, valueToSet) {
    setForm((current) => ({ ...current, [key]: valueToSet }));
  }
}

function AreaEmptyState({ t }) {
  return <section className="areaEmpty"><div><Crosshair size={24} /></div><h2>{t.emptyTitle}</h2><p>{t.emptyBody}</p><div className="areaEmptyBars" aria-hidden="true"><span /><span /><span /></div></section>;
}

function AreaLoading({ t, stage }) {
  return <section className="areaLoading"><LoaderCircle className="areaSpin" size={24} /><div><strong>{t.stages[stage]}</strong><span>{t.loading}</span></div><div className="areaLoadingTrack"><i /></div><ol className="areaLoadingStages">{t.stages.map((item, index) => <li className={index <= stage ? "active" : ""} key={item}>{item}</li>)}</ol></section>;
}

function AreaDetail({ area, result, t, language }) {
  const factors = area.factors || {};
  return <section className="areaDetailGrid">
    <article className="platformCard areaDecisionCard">
      <div className="areaDecisionHeader"><div><span>#{area.rank} · {t[resultLabels[area.resultType]]}</span><h2>{localAreaName(area, language)}</h2></div><div className="areaDecisionScore"><strong>{value(area.score)}</strong><span>/100</span></div></div>
      <div className="areaFactorGrid">
        <Factor label={t.competition} value={factors.competition ? factors.competition.nearbyCompetitors : null} detail={factors.competition ? `${factors.competition.radiusKm} km` : null} />
        <Factor label={t.pressure} value={score(factors.futureMarketPressure?.score)} />
        <Factor label={t.saturation} value={factors.saturation?.level || null} />
        <Factor label={t.budgetFit} value={score(factors.budgetFit?.score)} />
        <Factor label={t.property} value={score(factors.propertyFit?.score)} />
        <Factor label={t.demographics} value={factors.demographicFit?.score ? score(factors.demographicFit.score) : null} />
      </div>
    </article>
    <article className="platformCard areaEvidenceCard">
      <h3><CheckCircle2 size={17} />{t.strengths}</h3><ReasonList items={area.strengths} empty={t.noData} />
      <h3><AlertTriangle size={17} />{t.risks}</h3><ReasonList items={area.risks} empty={t.noData} />
      {!!area.missingData?.length && <p className="areaMissing"><b>{t.missing}:</b> {area.missingData.join(", ")}</p>}
    </article>
    <article className="platformCard areaPropertyCard">
      <h3><Building2 size={17} />{t.properties}</h3>
      {area.properties?.length ? <div className="areaPropertyList">{area.properties.map((property) => <div key={property.id}><strong>{property.title}</strong><span>{property.address || t.noData}</span><b>{property.price ? `${formatMoney(property.price)} ${property.currency}` : t.noData}</b></div>)}</div> : <p className="platformMuted">{t.noProperties}</p>}
    </article>
  </section>;
}

function Factor({ label, value: factorValue, detail }) {
  return <div><span>{label}</span><strong>{factorValue ?? "N/A"}</strong>{detail && <small>{detail}</small>}</div>;
}

function ReasonList({ items = [], empty }) {
  if (!items.length) return <p className="platformMuted">{empty}</p>;
  return <ul className="areaReasonList">{items.map((item) => <li key={item.code}>{item.message}</li>)}</ul>;
}

function AreaComparison({ areas, t, language }) {
  return <section className="platformCard areaComparison"><div className="platformCardHeader"><Crosshair size={18} /><h2>{t.compare}</h2></div><div className="tableWrap"><table><thead><tr><th>#</th><th>{t.area}</th><th>{t.score}</th><th>{t.competition}</th><th>{t.pressure}</th><th>{t.saturation}</th><th>{t.budgetFit}</th><th>{t.confidence}</th></tr></thead><tbody>{areas.map((area) => <tr key={area.areaId}><td>{area.rank}</td><td><strong>{localAreaName(area, language)}</strong><span>{t[resultLabels[area.resultType]]}</span></td><td>{score(area.score)}</td><td>{value(area.factors?.competition?.nearbyCompetitors)}</td><td>{score(area.factors?.futureMarketPressure?.score)}</td><td>{area.factors?.saturation?.level || t.noData}</td><td>{score(area.factors?.budgetFit?.score)}</td><td>{area.confidence?.level || t.noData} · {area.confidence?.coverage ?? 0}%</td></tr>)}</tbody></table></div></section>;
}

function AreaMethodology({ result, t }) {
  const weights = Object.entries(result.methodology?.weights || {}).map(([key, weight]) => `${key}: ${Math.round(weight * 100)}%`).join(" · ");
  return <section className="areaMethodGrid"><article className="platformCard"><div className="platformCardHeader"><Database size={18} /><h2>{t.sources}</h2></div><dl className="areaSourceList"><div><dt>{t.calculated}</dt><dd>{result.generatedAt ? new Date(result.generatedAt).toLocaleString() : t.noData}</dd></div><div><dt>{t.radius}</dt><dd>{result.methodology?.comparisonRadiusKm ?? t.noData} km</dd></div><div><dt>{t.weights}</dt><dd>{weights || t.noData}</dd></div>{(result.sources || []).map((source, index) => <div key={`${source.kind}-${index}`}><dt>{source.name}</dt><dd>{source.status} · {source.records ?? t.noData} {t.records}</dd></div>)}</dl></article><article className="platformCard"><div className="platformCardHeader"><AlertTriangle size={18} /><h2>{t.limitations}</h2></div><ul className="areaReasonList">{(result.limitations || []).map((item) => <li key={item}>{item}</li>)}</ul></article></section>;
}

function toMapResult(result, form) {
  return {
    input: { city: result.city?.name || form.city, businessType: result.business?.category || form.businessType, budget: result.business?.budget || Number(form.budget) },
    competitors: result.map?.competitors || [],
    market: { map: { center: result.map?.center || null, bounds: result.map?.bounds || null } },
    opportunityAreas: (result.analyzedAreas || []).map((area) => ({
      name: area.name,
      coordinates: area.centroid,
      score: area.score,
      competitorCountNearby: area.competition?.nearbyCompetitors ?? null,
      saturation: String(area.saturation?.level || "unknown").toLowerCase(),
      underservedScore: null,
      footTraffic: null,
      reason: `Fixed-radius area score with ${area.confidence?.coverage ?? 0}% evidence coverage.`
    }))
  };
}

function localAreaName(area, language) {
  if (area.areaType !== "CUSTOM_ZONE") return area.name;
  const number = String(area.name).match(/\d+/)?.[0] || "";
  return language === "kk" ? `Талдау аймағы ${number}` : language === "ru" ? `Зона анализа ${number}` : area.name;
}

function value(raw) {
  const number = Number(raw);
  return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(number) ? String(Math.round(number)) : "N/A";
}

function score(raw) {
  const formatted = value(raw);
  return formatted === "N/A" ? formatted : `${formatted}/100`;
}
