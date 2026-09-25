"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  ChevronRight,
  Globe2,
  MapPinned,
  Sparkles,
  Target,
  TrendingUp
} from "lucide-react";

const COPY = {
  kk: {
    language: "Тіл",
    how: "Қалай жұмыс істейді",
    intelligence: "Мүмкіндіктер",
    audience: "Кімге арналған",
    open: "Платформаны ашу",
    eyebrow: "AI негізіндегі геоэкономикалық интеллект",
    title: "Бизнесіңіз қай жерде жеңіске жететінін анықтаңыз.",
    body: "Нарықты, локацияларды және бәсекені нақты деректер мен AI көмегімен талдаңыз. Идеядан сенімді шешімге дейін бір платформада өтіңіз.",
    primary: "Мүмкіндікті талдау",
    secondary: "Жұмыс істеу принципі",
    proof: ["Нақты нарық деректері", "Түсіндірілетін бағалау", "AI стратегиялық талдауы"],
    processEyebrow: "Шешім қабылдау жолы",
    processTitle: "Нарық сұрағынан нақты әрекетке дейін.",
    processBody: "TezTap деректерді жинайды, мүмкіндікті есептейді және нәтижені бизнес тілімен түсіндіреді.",
    steps: [
      ["01", "Бизнесіңізді сипаттаңыз", "Санат, қала және қолжетімді бюджет."],
      ["02", "Нарықты талдаңыз", "Бәсекелестер, аудандар және сұраныс сигналдары."],
      ["03", "Мүмкіндікті салыстырыңыз", "Локациялар, тәуекел және инвестициялық сәйкестік."],
      ["04", "Нақты шешім қабылдаңыз", "Түсіндірілген ұсыныс және келесі қадамдар."]
    ],
    previewEyebrow: "Біртұтас интеллект кеңістігі",
    previewTitle: "Карта мен аналитика бірге жұмыс істейді.",
    previewBody: "Локацияны таңдаңыз, дәлелдерді қараңыз және барлық көрсеткіштің неге өзгергенін түсініңіз.",
    waiting: "Талдау деректерді енгізгеннен кейін есептеледі",
    score: "Мүмкіндік бағасы",
    map: "Нарық картасы",
    evidence: "Негізгі дәлелдер",
    valuesEyebrow: "TezTap артықшылығы",
    valuesTitle: "Кәсіпкерге қажет интеллект, артық шу жоқ.",
    values: [
      ["Нарық мүмкіндіктері", "Қамтылмаған санаттарды, әлсіз бәсекені және сұраныс алшақтығын анықтайды."],
      ["Локация таңдауы", "Аудандарды мүмкіндік, тәуекел және бизнес форматына сәйкестік бойынша салыстырады."],
      ["AI кеңесші", "Есептелген деректерді түсіндіреді және стратегиялық сұрақтарға контекстпен жауап береді."]
    ],
    dynamicEyebrow: "Динамикалық нарық моделі",
    dynamicTitle: "TezTap бүгінгі нарықты ғана емес, оның қалай өзгеруі мүмкін екенін де көрсетеді.",
    dynamicBody: "Жоспарланған бизнестер нақты компаниялардан бөлек сақталады және болашақ бәсеке қысымына бақыланатын салмақпен әсер етеді.",
    timeline: ["Қазіргі бизнес", "Жоспарланған бизнес", "Болжамды нарық", "Балама мүмкіндік"],
    audienceTitle: "Бір платформа. Әртүрлі шешімдер.",
    audiences: ["Кәсіпкерлер", "Франшизалар", "Инвесторлар", "Банктер", "Девелоперлер", "Мемлекеттік ұйымдар"],
    finalTitle: "Келесі бизнес шешіміңізді деректерден бастаңыз.",
    finalBody: "Қаланы, бизнес бағытын және бюджетіңізді таңдаңыз. TezTap қалғанын есептейді.",
    finalCta: "Талдауды бастау",
    footer: "AI-powered market intelligence for better business decisions."
  },
  ru: {
    language: "Язык",
    how: "Как это работает",
    intelligence: "Возможности",
    audience: "Для кого",
    open: "Открыть платформу",
    eyebrow: "Геоэкономическая аналитика на базе AI",
    title: "Найдите место, где ваш бизнес сможет выиграть.",
    body: "Анализируйте рынки, локации и конкуренцию на основе реальных данных и AI. Пройдите путь от идеи до обоснованного решения в одной платформе.",
    primary: "Анализировать возможность",
    secondary: "Как работает TezTap",
    proof: ["Реальные рыночные данные", "Объяснимые оценки", "Стратегический AI-анализ"],
    processEyebrow: "Путь к решению",
    processTitle: "От рыночного вопроса к конкретному действию.",
    processBody: "TezTap собирает данные, рассчитывает возможность и объясняет результат на языке бизнеса.",
    steps: [
      ["01", "Опишите бизнес", "Категория, город и доступный бюджет."],
      ["02", "Изучите рынок", "Конкуренты, районы и сигналы спроса."],
      ["03", "Сравните возможности", "Локации, риски и инвестиционное соответствие."],
      ["04", "Примите решение", "Обоснованная рекомендация и следующие шаги."]
    ],
    previewEyebrow: "Единое пространство аналитики",
    previewTitle: "Карта и аналитика работают вместе.",
    previewBody: "Выберите локацию, изучите доказательства и поймите, почему меняется каждый показатель.",
    waiting: "Оценка появится после ввода данных и запуска анализа",
    score: "Оценка возможности",
    map: "Карта рынка",
    evidence: "Ключевые доказательства",
    valuesEyebrow: "Преимущество TezTap",
    valuesTitle: "Нужная бизнес-аналитика без лишнего шума.",
    values: [
      ["Рыночные возможности", "Находит незакрытые категории, слабую конкуренцию и разрывы между спросом и предложением."],
      ["Выбор локации", "Сравнивает районы по возможности, риску и соответствию формату бизнеса."],
      ["AI-консультант", "Объясняет рассчитанные данные и отвечает на стратегические вопросы с учётом контекста."]
    ],
    dynamicEyebrow: "Динамическая модель рынка",
    dynamicTitle: "TezTap показывает не только рынок сегодня, но и то, как он может измениться.",
    dynamicBody: "Планируемые бизнесы хранятся отдельно от действующих компаний и влияют на будущую конкуренцию с контролируемым весом.",
    timeline: ["Действующий бизнес", "Планируемый бизнес", "Будущий рынок", "Альтернативная возможность"],
    audienceTitle: "Одна платформа. Разные решения.",
    audiences: ["Предприниматели", "Франшизы", "Инвесторы", "Банки", "Девелоперы", "Государственные организации"],
    finalTitle: "Начните следующее бизнес-решение с данных.",
    finalBody: "Выберите город, бизнес-направление и бюджет. Остальное рассчитает TezTap.",
    finalCta: "Начать анализ",
    footer: "AI-powered market intelligence for better business decisions."
  },
  en: {
    language: "Language",
    how: "How it works",
    intelligence: "Intelligence",
    audience: "For whom",
    open: "Open platform",
    eyebrow: "AI-powered geo-economic intelligence",
    title: "Find where your business can win.",
    body: "Analyze markets, locations, and competition with real-world data and AI. Move from an idea to a defensible decision in one platform.",
    primary: "Analyze an opportunity",
    secondary: "See how it works",
    proof: ["Real market data", "Explainable scoring", "Strategic AI analysis"],
    processEyebrow: "Decision workflow",
    processTitle: "From a market question to a clear action.",
    processBody: "TezTap gathers evidence, calculates the opportunity, and explains the result in business language.",
    steps: [
      ["01", "Define your business", "Category, city, and available budget."],
      ["02", "Read the market", "Competitors, districts, and demand signals."],
      ["03", "Compare opportunities", "Locations, risks, and investment fit."],
      ["04", "Make the decision", "An explained recommendation and next steps."]
    ],
    previewEyebrow: "One intelligence workspace",
    previewTitle: "Map and analytics work together.",
    previewBody: "Select a location, inspect the evidence, and understand why every metric changes.",
    waiting: "Calculated after business data and an analysis request",
    score: "Opportunity score",
    map: "Market map",
    evidence: "Key evidence",
    valuesEyebrow: "The TezTap advantage",
    valuesTitle: "The intelligence entrepreneurs need, without the noise.",
    values: [
      ["Market opportunities", "Detect underserved categories, weak competition, and gaps between demand and supply."],
      ["Location selection", "Compare districts by opportunity, risk, and fit for the selected business format."],
      ["AI consultant", "Interpret calculated analytics and answer strategic questions with full market context."]
    ],
    dynamicEyebrow: "Dynamic market model",
    dynamicTitle: "TezTap shows not only the market today, but how it may change.",
    dynamicBody: "Planned businesses remain separate from operating companies and influence future competition through controlled, explainable weights.",
    timeline: ["Existing business", "Planned business", "Projected market", "Alternative opportunity"],
    audienceTitle: "One platform. Different decisions.",
    audiences: ["Entrepreneurs", "Franchises", "Investors", "Banks", "Developers", "Public organizations"],
    finalTitle: "Start your next business decision with evidence.",
    finalBody: "Choose a city, business category, and budget. TezTap calculates the rest.",
    finalCta: "Start analysis",
    footer: "AI-powered market intelligence for better business decisions."
  }
};

const VALUE_ICONS = [Target, MapPinned, Bot];

export default function WelcomePage() {
  const [language, setLanguage] = useState("kk");
  const t = COPY[language];

  return (
    <main className="landingPage">
      <header className="landingHeader">
        <Link href="/" className="landingWordmark">TezTap</Link>
        <nav className="landingNav" aria-label="Landing navigation">
          <a href="#how">{t.how}</a>
          <a href="#intelligence">{t.intelligence}</a>
          <a href="#audience">{t.audience}</a>
        </nav>
        <div className="landingHeaderActions">
          <div className="landingLanguage" aria-label={t.language}>
            <Globe2 size={15} />
            {["kk", "ru", "en"].map((item) => (
              <button type="button" key={item} className={language === item ? "active" : ""} onClick={() => setLanguage(item)}>
                {item === "kk" ? "QAZ" : item.toUpperCase()}
              </button>
            ))}
          </div>
          <Link href="/analyze" className="landingHeaderCta">{t.open}<ArrowRight size={16} /></Link>
        </div>
      </header>

      <section className="landingHero" aria-labelledby="landing-title">
        <div className="landingHeroImage" aria-hidden="true" />
        <div className="landingHeroContent">
          <span className="landingEyebrow"><Sparkles size={16} />{t.eyebrow}</span>
          <h1 id="landing-title">{t.title}</h1>
          <p>{t.body}</p>
          <div className="landingHeroActions">
            <Link href="/analyze" className="landingPrimaryCta">{t.primary}<ArrowRight size={18} /></Link>
            <a href="#how" className="landingSecondaryCta">{t.secondary}<ChevronRight size={17} /></a>
          </div>
          <div className="landingProof">
            {t.proof.map((item) => <span key={item}><Check size={14} />{item}</span>)}
          </div>
        </div>
      </section>

      <section className="landingSection landingProcess" id="how">
        <div className="landingSectionIntro">
          <span className="landingEyebrow">{t.processEyebrow}</span>
          <h2>{t.processTitle}</h2>
          <p>{t.processBody}</p>
        </div>
        <div className="landingSteps">
          {t.steps.map(([number, title, body]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landingSection landingPreviewSection" id="intelligence">
        <div className="landingSectionIntro compact">
          <span className="landingEyebrow">{t.previewEyebrow}</span>
          <h2>{t.previewTitle}</h2>
          <p>{t.previewBody}</p>
        </div>
        <div className="landingProductPreview">
          <div className="landingPreviewBar">
            <strong>TezTap</strong>
            <span>{t.map}</span>
            <span>{t.score}</span>
            <span>AI</span>
          </div>
          <div className="landingPreviewBody">
            <div className="landingPreviewMap">
              <span><MapPinned size={16} />{t.map}</span>
            </div>
            <aside className="landingPreviewInsight">
              <span>{t.score}</span>
              <strong>—<small>/100</small></strong>
              <p>{t.waiting}</p>
              <div>
                <span>{t.evidence}</span>
                <i /><i /><i />
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="landingSection landingValues">
        <div className="landingSectionIntro">
          <span className="landingEyebrow">{t.valuesEyebrow}</span>
          <h2>{t.valuesTitle}</h2>
        </div>
        <div className="landingValueGrid">
          {t.values.map(([title, body], index) => {
            const Icon = VALUE_ICONS[index];
            return (
              <article key={title}>
                <Icon size={22} />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landingDynamic">
        <div className="landingDynamicCopy">
          <span className="landingEyebrow">{t.dynamicEyebrow}</span>
          <h2>{t.dynamicTitle}</h2>
          <p>{t.dynamicBody}</p>
        </div>
        <div className="landingTimeline">
          {t.timeline.map((item, index) => (
            <div key={item}>
              <span>{index + 1}</span>
              <strong>{item}</strong>
              {index < t.timeline.length - 1 ? <ChevronRight size={18} /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="landingSection landingAudience" id="audience">
        <div className="landingAudienceTitle">
          <Building2 size={24} />
          <h2>{t.audienceTitle}</h2>
        </div>
        <div className="landingAudienceList">
          {t.audiences.map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>

      <section className="landingFinalCta">
        <div>
          <TrendingUp size={25} />
          <h2>{t.finalTitle}</h2>
          <p>{t.finalBody}</p>
        </div>
        <Link href="/analyze" className="landingPrimaryCta">{t.finalCta}<ArrowRight size={18} /></Link>
      </section>

      <footer className="landingFooter">
        <strong>TezTap</strong>
        <span>{t.footer}</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}
