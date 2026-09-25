const { extraJobs, extraServices, approximatePoint, locationFor } = require("./manualExamples");

const districtNamesRu = {
  "14th Microdistrict": "14-й микрорайон",
  "15th Microdistrict": "15-й микрорайон",
  "17th Microdistrict": "17-й микрорайон",
  Shygys: "Шыгыс",
  "3rd Microdistrict": "3-й микрорайон"
};

const subtypeNamesRu = {
  Tutors: "Репетиторы", Courses: "Курсы", "Language schools": "Языковые школы", "Educational centers": "Учебные центры", "Exam prep": "Подготовка к экзаменам",
  Vacancies: "Вакансии", "Full-time": "Полный день", "Part-time": "Подработка", Temporary: "Временная работа", Internships: "Стажировки", "Entry-level": "Без опыта", "CV creation": "Создание резюме",
  "Repair specialists": "Ремонт", Plumbers: "Сантехники", Electricians: "Электрики", Cleaners: "Уборка", Babysitters: "Няни", Photographers: "Фотографы", Delivery: "Доставка", "Beauty professionals": "Красота",
  Buy: "Купить", Sell: "Продать", Rent: "Арендовать", "Cafés": "Кафе", Restaurants: "Рестораны", Clinics: "Клиники", Gyms: "Спортзалы", Salons: "Салоны", Shops: "Магазины", Entertainment: "Досуг"
};

const tagNamesRu = {
  English: "Английский", Evenings: "Вечером", "In person": "Очно", IELTS: "IELTS", "Small groups": "Маленькие группы", "Exam prep": "Экзамены",
  Kazakh: "Казахский", Beginner: "Для начинающих", Flexible: "Гибкий график", Math: "Математика", "Part-time": "Подработка", Weekend: "Выходные", "Quick apply": "Быстрый отклик",
  Internship: "Стажировка", Marketing: "Маркетинг", "Entry level": "Без опыта", CV: "Резюме", Interview: "Собеседование", Online: "Онлайн", Repair: "Ремонт", "Home visit": "Выезд на дом",
  "Same day": "В тот же день", Delivery: "Доставка", Electrician: "Электрик", "Verified demo": "Демо-профиль", Beauty: "Красота", Appointment: "Запись", Salon: "Салон", Plumber: "Сантехник", Repairs: "Починка",
  Cleaning: "Уборка", Home: "Для дома", Booking: "Запись", Babysitter: "Няня", Photography: "Фотосъёмка", Events: "Мероприятия", Buy: "Купить", Pickup: "Самовывоз", Kids: "Детям",
  Rent: "Аренда", Tools: "Инструменты", Sell: "Продать", Furniture: "Мебель", Coffee: "Кофе", "Wi-Fi": "Wi-Fi", Breakfast: "Завтраки", Clinic: "Клиника", "Family care": "Семейная медицина",
  Gym: "Спортзал", Classes: "Занятия", Membership: "Абонемент", Restaurant: "Ресторан", Lunch: "Обед", Family: "Для семьи", Shop: "Магазин", Local: "Рядом", Entertainment: "Досуг", Activities: "Активности"
};

const listingCopyRu = {
  "edu-1": ["Репетитор разговорного английского", "Индивидуальная практика английского для подростков и взрослых."],
  "edu-2": ["Подготовка к IELTS", "Занятия в небольшой группе и еженедельные пробные тесты."],
  "edu-3": ["Казахский для повседневной жизни", "Практические уроки казахского языка для начинающих."],
  "edu-4": ["Подготовка к экзаменам по математике", "Еженедельные занятия и повторение школьной программы."],
  "edu-5": ["Учебный центр по школьным предметам", "Демо-занятия в небольших группах по основным предметам и навыкам учёбы."],
  "job-1": ["Продавец-консультант на выходные", "Демо-вакансия с гибким графиком по выходным."],
  "job-2": ["Стажёр по работе с соцсетями", "Оплачиваемая стажировка с наставником и контентом для местных компаний."],
  "job-3": ["Специалист поддержки клиентов", "Демо-вакансия начального уровня с обучением и сменным графиком."],
  "job-4": ["Координатор клиентских заявок", "Демо-вакансия на полный день с обучением на старте."],
  "job-5": ["Помощник на городские мероприятия", "Временная демо-работа на отдельных городских событиях."],
  "srv-1": ["Ремонт бытовой техники", "Диагностика и ремонт распространённых бытовых приборов."],
  "srv-2": ["Электрик для домашних работ", "Установка оборудования и поиск неисправностей в электрике."],
  "srv-3": ["Укладка и причёска", "Демо-запись на укладку в салоне рядом с вами."],
  "srv-4": ["Сантехник для ремонта дома", "Демо-услуга по мелкому ремонту и установке сантехники."],
  "srv-5": ["Уборка квартиры", "Демо-запись на уборку в удобное время."],
  "srv-6": ["Няня на вечер", "Демо-профиль специалиста по уходу за детьми для вечерних заказов."],
  "srv-7": ["Семейный и событийный фотограф", "Демо-фотограф для семейных съёмок и небольших мероприятий."],
  "srv-8": ["Доставка продуктов и посылок", "Демо-услуга курьерской доставки по районам Актау."],
  "market-1": ["Детский велосипед", "Подержанный городской велосипед в хорошем состоянии."],
  "market-2": ["Аренда аккумуляторного шуруповёрта", "Аренда инструмента на короткий срок для домашних работ."],
  "market-3": ["Комплект: письменный стол и стул", "Компактный комплект для рабочего или учебного места."],
  "place-1": ["Кофейня у моря · демо", "Кофе и лёгкие закуски в спокойной обстановке."],
  "place-2": ["Семейная клиника · демо", "Демо-карточка семейной клиники в городском каталоге."],
  "place-3": ["Фитнес-клуб у моря · демо", "Демо-карточка спортзала и групповых занятий."],
  "place-4": ["Ресторан у моря · демо", "Демо-ресторан с меню для всей семьи."],
  "place-5": ["Салон Studio A · демо", "Демо-карточка салона с информацией о записи."],
  "place-6": ["Магазин товаров для дома · демо", "Демо-карточка местного магазина товаров для дома."],
  "place-7": ["Семейный игровой зал · демо", "Демо-место для семейного отдыха и активностей в помещении."]
};

function listing(id, category, subtype, title, provider, district, priceLabel, rating, ratingCount, description, tags) {
  const localized = listingCopyRu[id] || [title, description];
  const localizedDistrict = districtNamesRu[district] || district;
  const number = Number(id.split("-")[1]);
  const assignedLocation = ["jobs", "services"].includes(category) ? locationFor(category, number) : null;
  const resultDistrict = assignedLocation?.district || localizedDistrict;
  return {
    id, category, subtype, subtypeLabel: subtypeNamesRu[subtype] || subtype, title: localized[0], provider, district: resultDistrict, priceLabel: localizePrice(priceLabel), priceAmount: parsePriceAmount(priceLabel), currency: "KZT", rating, ratingCount, description: localized[1], tags: tags.map((tag) => tagNamesRu[tag] || tag),
    city: "Актау",
    address: assignedLocation?.address || `${localizedDistrict}, Актау · примерная точка`,
    coordinates: assignedLocation?.coordinates || approximatePoint(localizedDistrict, number + ({ education: 140, marketplace: 210, places: 280 }[category] || 0)),
    locationKind: assignedLocation?.locationKind || null,
    reviewSummary: "Демо-отзыв: доброжелательное обслуживание и понятные условия.",
    demo: true,
    source: "demo",
    sourceLabel: "Демо-данные MVP · не подтверждено",
    lastUpdatedAt: null,
    marketplace: category === "marketplace" ? {
      transactionType: subtype === "Rent" ? "rent" : "sale",
      category: id === "market-1" ? "Детям" : id === "market-2" ? "Инструменты" : id === "market-3" ? "Мебель" : "Другое",
      condition: "Хорошее",
      area: localizedDistrict,
      sellerName: provider,
      sellerRating: rating,
      sellerRatingCount: ratingCount,
      publishedAt: id === "market-1" ? "2026-09-20T09:00:00.000Z" : id === "market-2" ? "2026-09-18T12:00:00.000Z" : "2026-09-16T10:00:00.000Z"
    } : undefined
  };
}

function parsePriceAmount(value) {
  const match = String(value).match(/\d[\d,\s]*/);
  if (!match) return null;
  const amount = Number(match[0].replace(/\D/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function localizePrice(value) {
  return value
    .replaceAll("from ", "от ")
    .replaceAll(" / lesson", " / занятие")
    .replaceAll(" / month", " / месяц")
    .replaceAll(" / hour", " / час")
    .replaceAll(" / day", " / день")
    .replaceAll("Paid internship", "Оплачиваемая стажировка")
    .replaceAll("Full-time", "Полный день")
    .replaceAll("Coffee", "Кофе")
    .replaceAll("Lunch", "Обед")
    .replaceAll("Home goods", "Товары для дома")
    .replaceAll("Appointments available", "Есть свободное время")
    .replaceAll("Activities", "Активности");
}

// Clearly marked demo records make the new directories navigable without claiming unverified local listings.
const listings = [
  listing("edu-1", "education", "Tutors", "English conversation tutor", "Aktau Learning Studio", "14th Microdistrict", "4,000 ₸ / lesson", 4.9, 28, "One-to-one English practice for teens and adults.", ["English", "Evenings", "In person"]),
  listing("edu-2", "education", "Courses", "IELTS preparation course", "Caspian Study Lab", "17th Microdistrict", "from 32,000 ₸ / month", 4.8, 19, "Small-group IELTS preparation with weekly practice tests.", ["IELTS", "Small groups", "Exam prep"]),
  listing("edu-3", "education", "Language schools", "Kazakh for everyday life", "Til Qadam", "15th Microdistrict", "3,500 ₸ / lesson", 4.7, 14, "Practical Kazakh language lessons for beginners.", ["Kazakh", "Beginner", "Flexible"]),
  listing("edu-4", "education", "Exam prep", "Math exam preparation", "Caspian Study Lab", "Shygys", "5,000 ₸ / lesson", 4.8, 17, "Weekly practice and revision sessions for school exams.", ["Math", "Exam prep", "In person"]),
  listing("edu-5", "education", "Educational centers", "School subject learning center", "Caspian Skills Center · demo", "17th Microdistrict", "from 18,000 ₸ / month", 4.7, 11, "Demo small-group classes in core school subjects and study skills.", ["Math", "English", "Small groups"]),
  listing("job-1", "jobs", "Part-time", "Weekend shop assistant", "Caspian Market Demo", "14th Microdistrict", "from 1,200 ₸ / hour", 4.6, 12, "Part-time retail role with a flexible weekend schedule.", ["Part-time", "Weekend", "Quick apply"]),
  listing("job-2", "jobs", "Internships", "Junior social media intern", "Coastline Media Demo", "3rd Microdistrict", "Paid internship", 4.8, 9, "A supervised internship creating local business content.", ["Internship", "Marketing", "Entry level"]),
  listing("job-3", "jobs", "Entry-level", "Customer support specialist", "Caspian Connect · демо", "15th Microdistrict", "220,000–260,000 ₸ / месяц", 4.7, 18, "Demo entry-level vacancy with onboarding and shift-based work.", ["Entry level", "Customer support", "Training"]),
  listing("job-4", "jobs", "Vacancies", "Customer request coordinator", "Caspian Service Desk · демо", "14th Microdistrict", "from 280,000 ₸ / month", 4.6, 12, "Demo full-time position with daytime hours and paid onboarding.", ["Full-time", "Office", "Customer service"]),
  listing("job-5", "jobs", "Temporary", "City event assistant", "Aktau Event Team · демо", "3rd Microdistrict", "18,000 ₸ / shift", 4.8, 7, "Temporary demo role for selected local events and weekend shifts.", ["Temporary", "Events", "Weekend"]),
  listing("srv-1", "services", "Repair specialists", "Home appliance repair", "Reliable Fix Demo", "15th Microdistrict", "from 5,000 ₸", 4.8, 34, "Diagnostics and common home appliance repairs.", ["Repair", "Home visit", "Same day"]),
  listing("srv-2", "services", "Electricians", "Electrician for small home jobs", "Caspian Electric Demo", "Shygys", "from 4,500 ₸", 4.9, 41, "Installation and troubleshooting for household electrical work.", ["Electrician", "Home visit", "Verified demo"]),
  listing("srv-3", "services", "Beauty professionals", "Hair styling appointment", "Studio A Demo", "3rd Microdistrict", "from 7,000 ₸", 4.7, 25, "Book a styling appointment at a neighborhood salon.", ["Beauty", "Appointment", "Salon"]),
  listing("srv-4", "services", "Plumbers", "Plumber for home repairs", "Caspian Pipe Demo", "14th Microdistrict", "from 4,000 ₸", 4.8, 21, "Demo local plumbing service for small repairs and installation.", ["Plumber", "Home visit", "Repairs"]),
  listing("srv-5", "services", "Cleaners", "Apartment cleaning", "Clear Home Demo", "17th Microdistrict", "from 8,000 ₸", 4.9, 36, "Demo home cleaning appointment with flexible time slots.", ["Cleaning", "Home", "Booking"]),
  listing("srv-6", "services", "Babysitters", "Evening babysitter", "Family Circle Demo", "15th Microdistrict", "from 2,500 ₸ / hour", 4.8, 13, "Demo childcare profile for planned evening bookings.", ["Babysitter", "Evenings", "Booking"]),
  listing("srv-7", "services", "Photographers", "Family and event photographer", "Light Frame Demo", "3rd Microdistrict", "from 20,000 ₸", 4.9, 29, "Demo photographer for family sessions and small events.", ["Photography", "Events", "Booking"]),
  listing("srv-8", "services", "Delivery", "Grocery and parcel delivery", "Aktau Courier Team · demo", "14th Microdistrict", "from 2,500 ₸", 4.7, 16, "Demo courier service for groceries and small parcels around Aktau.", ["Delivery", "Same day", "Home"]),
  listing("market-1", "marketplace", "Buy", "Children's bicycle", "Local family demo", "14th Microdistrict", "18,000 ₸", 4.8, 7, "Used city bicycle in good condition.", ["Buy", "Pickup", "Kids"]),
  listing("market-2", "marketplace", "Rent", "Cordless drill for rent", "Tool Share Demo", "17th Microdistrict", "2,500 ₸ / day", 4.9, 16, "Short-term tool rental for home projects.", ["Rent", "Tools", "Pickup"]),
  listing("market-3", "marketplace", "Sell", "Desk and chair set", "Aktau Home Demo", "Shygys", "35,000 ₸", 4.6, 5, "Compact desk set suitable for a study corner.", ["Sell", "Furniture", "Pickup"]),
  listing("place-1", "places", "Cafés", "Harbor Coffee Demo", "Harbor Coffee", "3rd Microdistrict", "Coffee · 1,500 ₸", 4.8, 96, "Coffee and light bites in a quiet neighborhood setting.", ["Coffee", "Wi-Fi", "Breakfast"]),
  listing("place-2", "places", "Clinics", "Caspian Family Clinic Demo", "Caspian Family Clinic", "14th Microdistrict", "Appointments available", 4.7, 74, "A demo listing for a local family clinic directory.", ["Clinic", "Family care", "Appointment"]),
  listing("place-3", "places", "Gyms", "Coastline Fitness Demo", "Coastline Fitness", "17th Microdistrict", "from 15,000 ₸ / month", 4.6, 58, "A demo listing for fitness and group classes.", ["Gym", "Classes", "Membership"]),
  listing("place-4", "places", "Restaurants", "Seaside Kitchen Demo", "Seaside Kitchen", "15th Microdistrict", "Lunch · from 4,500 ₸", 4.7, 83, "A demo restaurant profile with a family-friendly menu.", ["Restaurant", "Lunch", "Family"]),
  listing("place-5", "places", "Salons", "Studio A Salon Demo", "Studio A", "Shygys", "Appointments available", 4.8, 67, "A demo salon directory profile with appointment information.", ["Salon", "Beauty", "Appointment"]),
  listing("place-6", "places", "Shops", "Caspian Home Store Demo", "Caspian Home", "14th Microdistrict", "Home goods", 4.6, 52, "A demo neighborhood shop profile for home essentials.", ["Shop", "Home", "Local"]),
  listing("place-7", "places", "Entertainment", "Caspian Play Hall Demo", "Caspian Play Hall", "3rd Microdistrict", "Activities · from 2,000 ₸", 4.7, 48, "A demo indoor activity listing for families and groups.", ["Entertainment", "Family", "Activities"]),
  listing("place-8", "places", "Pharmacies", "Аптека рядом · демо", "Аптека рядом · демо", "15th Microdistrict", "от 1 000 ₸", 4.7, 12, "Демонстрационная карточка аптеки для поиска мест на карте Актау.", ["Аптека", "Демо"])
];

const educationProfiles = {
  "edu-1": { instructor: "Алия · вымышленный пример", subjects: ["Английский", "Разговорная практика"], qualifications: "Пример квалификации: CELTA, уровень C1 · не проверено", experienceYears: 7, format: "hybrid", lessonType: "individual", schedule: [{ day: 2, from: "17:00", to: "20:00" }, { day: 4, from: "17:00", to: "20:00" }, { day: 6, from: "11:00", to: "14:00" }], availabilityNote: "Ближайшее время согласуется напрямую", durationMinutes: 60 },
  "edu-2": { instructor: "Команда курса · вымышленный пример", subjects: ["Английский", "IELTS", "Подготовка к экзаменам"], qualifications: "Описание команды и сертификатов приведено как пример · не проверено", experienceYears: null, format: "online", lessonType: "group", schedule: [{ day: 1, from: "19:00", to: "20:30" }, { day: 3, from: "19:00", to: "20:30" }], availabilityNote: "Новый поток: дата начала уточняется", durationMinutes: 90 },
  "edu-3": { instructor: "Преподаватель школы · вымышленный пример", subjects: ["Казахский", "Разговорная практика", "Начальный уровень"], qualifications: "Демонстрационное описание методики · квалификация не подтверждена", experienceYears: 5, format: "hybrid", lessonType: "group", schedule: [{ day: 2, from: "18:00", to: "19:30" }, { day: 5, from: "18:00", to: "19:30" }], availabilityNote: "Пробное занятие: время по согласованию", durationMinutes: 90 },
  "edu-4": { instructor: "Марат · вымышленный пример", subjects: ["Математика", "Алгебра", "Подготовка к экзаменам"], qualifications: "Демонстрационное описание: профильное образование · не проверено", experienceYears: 8, format: "offline", lessonType: "individual", schedule: [{ day: 1, from: "16:00", to: "19:00" }, { day: 3, from: "16:00", to: "19:00" }, { day: 5, from: "16:00", to: "19:00" }], availabilityNote: "Свободные часы зависят от расписания · уточнить перед записью", durationMinutes: 60 },
  "edu-5": { instructor: "Учебная команда · вымышленный пример", subjects: ["Математика", "Английский", "Навыки учёбы"], qualifications: "Демо-описание учебной команды · квалификации не проверены", experienceYears: null, format: "hybrid", lessonType: "group", schedule: [{ day: 2, from: "17:00", to: "18:30" }, { day: 4, from: "17:00", to: "18:30" }], availabilityNote: "Набор группы открыт в демонстрационных данных", durationMinutes: 90 }
};

const jobProfiles = {
  "job-1": { employmentType: "part-time", workFormat: "onsite", schedule: "Суббота и воскресенье · 10:00–18:00", experienceYears: 0, salaryMin: 1400, salaryMax: 1400, salaryPeriod: "час", publishedAt: "2026-09-18", requiredSkills: ["Общение с покупателями", "Работа с кассой"], requirements: ["Грамотная речь", "Готовность работать по выходным"], employer: { slug: "caspian-market-demo", name: "Caspian Market · демо", industry: "Розничная торговля", description: "Вымышленный магазин у дома для показа отклика и профиля работодателя." } },
  "job-2": { employmentType: "internship", workFormat: "hybrid", schedule: "Пн–Пт · гибкое дневное время", experienceYears: 0, salaryMin: 180000, salaryMax: 220000, salaryPeriod: "месяц", publishedAt: "2026-09-20", requiredSkills: ["Социальные сети", "Написание текстов", "Canva"], requirements: ["Интерес к контенту", "Базовая грамотность", "Портфолио будет плюсом"], employer: { slug: "coastline-media-demo", name: "Coastline Media · демо", industry: "Маркетинг и медиа", description: "Учебный пример небольшой маркетинговой команды. Не является подтверждённой компанией." } },
  "job-3": { employmentType: "full-time", workFormat: "onsite", schedule: "Смены 2/2 · 09:00–21:00", experienceYears: 0, salaryMin: 220000, salaryMax: 260000, salaryPeriod: "месяц", publishedAt: "2026-09-17", requiredSkills: ["Общение с клиентами", "Русский язык", "Казахский язык"], requirements: ["Опыт не обязателен", "Спокойное общение", "Обучение предусмотрено"], employer: { slug: "caspian-connect-demo", name: "Caspian Connect · демо", industry: "Клиентская поддержка", description: "Демонстрационный профиль работодателя для прототипа TezTap." } },
  "job-4": { employmentType: "full-time", workFormat: "hybrid", schedule: "Пн–Пт · 09:00–18:00", experienceYears: 1, salaryMin: 280000, salaryMax: 330000, salaryPeriod: "месяц", publishedAt: "2026-09-15", requiredSkills: ["Работа с таблицами", "Деловая переписка", "CRM"], requirements: ["Опыт работы от 1 года", "Внимание к деталям", "Базовые навыки ПК"], employer: { slug: "caspian-service-desk-demo", name: "Caspian Service Desk · демо", industry: "Операционная поддержка", description: "Вымышленный работодатель с демонстрационной вакансией." } },
  "job-5": { employmentType: "temporary", workFormat: "onsite", schedule: "Отдельные даты · обычно выходные", experienceYears: 0, salaryMin: 18000, salaryMax: 18000, salaryPeriod: "смена", publishedAt: "2026-09-21", requiredSkills: ["Командная работа", "Общение с гостями"], requirements: ["Возраст 18+", "Готовность к сменной занятости"], employer: { slug: "aktau-event-team-demo", name: "Aktau Event Team · демо", industry: "Мероприятия", description: "Демо-профиль организатора городских событий." } }
};

const serviceProfiles = {
  "srv-1": { priceFrom: 5000, pricePeriod: "выезд", serviceArea: ["15-й микрорайон", "14-й микрорайон", "17-й микрорайон"], availableDate: "2026-09-24", availableTime: "18:30", urgentToday: true, portfolio: [] },
  "srv-2": { priceFrom: 4500, pricePeriod: "работа", serviceArea: ["Шыгыс", "15-й микрорайон"], availableDate: "2026-09-25", availableTime: "10:00", urgentToday: false, portfolio: [] },
  "srv-3": { priceFrom: 7000, pricePeriod: "услуга", serviceArea: ["3-й микрорайон", "Шыгыс"], availableDate: "2026-09-24", availableTime: "17:00", urgentToday: true, portfolio: [] },
  "srv-4": { priceFrom: 4000, pricePeriod: "выезд", serviceArea: ["14-й микрорайон", "15-й микрорайон"], availableDate: "2026-09-24", availableTime: "19:00", urgentToday: true, portfolio: [] },
  "srv-5": { priceFrom: 8000, pricePeriod: "заказ", serviceArea: ["17-й микрорайон", "Шыгыс"], availableDate: "2026-09-26", availableTime: "09:00", urgentToday: false, portfolio: [] },
  "srv-6": { priceFrom: 2500, pricePeriod: "час", serviceArea: ["15-й микрорайон", "14-й микрорайон"], availableDate: "2026-09-26", availableTime: "18:00", urgentToday: false, portfolio: [] },
  "srv-7": { priceFrom: 20000, pricePeriod: "съёмка", serviceArea: ["Актау"], availableDate: "2026-09-28", availableTime: "12:00", urgentToday: false, portfolio: [] },
  "srv-8": { priceFrom: 2500, pricePeriod: "доставка", serviceArea: ["14-й микрорайон", "15-й микрорайон", "17-й микрорайон", "Шыгыс"], availableDate: "2026-09-24", availableTime: "20:00", urgentToday: true, portfolio: [] }
};

listings.push(...extraJobs, ...extraServices);

const placeProfiles = {
  "place-1": { openingHours: "Mo-Su 08:00-23:00", priceLevel: 2, averageBill: 3500, priceRange: "Средний чек около 3 500 ₸", bookingAvailable: false, images: [] },
  "place-2": { openingHours: "Mo-Sa 09:00-18:00; Su off", priceLevel: 3, averageBill: 7000, priceRange: "Приём от 7 000 ₸", bookingAvailable: true, images: [] },
  "place-3": { openingHours: "24/7", priceLevel: 2, averageBill: 15000, priceRange: "Абонемент от 15 000 ₸ / месяц", bookingAvailable: true, images: [] },
  "place-4": { openingHours: "Mo-Su 11:00-23:00", priceLevel: 2, averageBill: 4500, priceRange: "Средний чек около 4 500 ₸", bookingAvailable: true, images: [] },
  "place-5": { openingHours: "Mo-Su 10:00-20:00", priceLevel: 2, averageBill: 7000, priceRange: "Услуги от 7 000 ₸", bookingAvailable: true, images: [] },
  "place-6": { openingHours: "Mo-Su 09:00-21:00", priceLevel: 2, averageBill: null, priceRange: "Цены зависят от товара", bookingAvailable: false, images: [] },
  "place-7": { openingHours: "Mo-Su 12:00-22:00", priceLevel: 1, averageBill: 2000, priceRange: "Билет от 2 000 ₸", bookingAvailable: true, images: [] },
  "place-8": { openingHours: "24/7", priceLevel: 1, averageBill: null, priceRange: "Товары от 1 000 ₸", bookingAvailable: false, images: [] }
};

for (const item of listings) {
  if (item.category === "education") item.education = educationProfiles[item.id];
  if (item.category === "jobs" && jobProfiles[item.id]) item.job = jobProfiles[item.id];
  if (item.category === "services" && serviceProfiles[item.id]) item.service = serviceProfiles[item.id];
  if (item.category === "jobs" && item.job?.salaryMin != null) {
    const { salaryMin, salaryMax, salaryPeriod } = item.job;
    item.priceAmount = salaryMin;
    item.priceLabel = `${salaryMin.toLocaleString("ru-RU")}${salaryMax && salaryMax !== salaryMin ? `–${salaryMax.toLocaleString("ru-RU")}` : ""} ₸ / ${salaryPeriod || "месяц"}`;
  }
  if (item.demo && item.category === "jobs") item.sourceLabel = "Пример TezTap · не опубликовано работодателем";
  if (item.demo && item.category === "services") item.sourceLabel = "Пример TezTap · не опубликовано исполнителем";
  if (item.category === "places") {
    const { openingHours, ...place } = placeProfiles[item.id];
    item.openingHours = openingHours;
    item.place = place;
  }
}

const categories = [
  { key: "education", title: "Образование", description: "Репетиторы, курсы, языковые школы и подготовка к экзаменам.", href: "/education", icon: "graduation" },
  { key: "jobs", title: "Работа", description: "Вакансии, подработка, стажировки и помощь с резюме.", href: "/jobs", icon: "briefcase" },
  { key: "services", title: "Услуги рядом", description: "Специалисты для дома, семьи и личного ухода.", href: "/services", icon: "wrench" },
  { key: "marketplace", title: "Маркетплейс", description: "Покупайте, продавайте и арендуйте в Актау.", href: "/marketplace", icon: "store" },
  { key: "places", title: "Места", description: "Кафе, клиники, спорт, магазины и досуг на карте.", href: "/places", icon: "map" }
];

module.exports = { categories, listings };
