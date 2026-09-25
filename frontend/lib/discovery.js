const AKTAU_CENTER = { lat: 43.6532, lng: 51.1975 };

function distanceKm(left, right = AKTAU_CENTER) {
  if (!isCoordinate(left) || !isCoordinate(right)) return null;
  const radians = (value) => (value * Math.PI) / 180;
  const dLat = radians(right.lat - left.lat);
  const dLng = radians(right.lng - left.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(left.lat)) * Math.cos(radians(right.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function recommendationScore({ rating = 0, ratingCount = 0, distance = null, categoryFit = 1 }) {
  const ratingPoints = (clamp(Number(rating) / 5) * 40);
  const reviewPoints = Math.min(20, Math.log1p(Math.max(0, Number(ratingCount))) / Math.log(101) * 20);
  const distancePoints = distance == null ? 10 : Math.max(0, 20 * (1 - Math.min(distance, 10) / 10));
  const categoryPoints = clamp(Number(categoryFit)) * 20;
  return Math.round(ratingPoints + reviewPoints + distancePoints + categoryPoints);
}

function scoreListing(item, { center = AKTAU_CENTER, radiusKm = Infinity } = {}) {
  const distance = distanceKm(item.coordinates, center);
  const scoreInput = { ...item, distance };
  const factors = recommendationFactors(scoreInput);
  const withinRadius = Number.isFinite(Number(radiusKm)) && radiusKm !== Infinity
    ? distance != null && distance <= Number(radiusKm)
    : true;
  const available = item.available !== false && !["unavailable", "sold", "cancelled", "inactive", "closed"].includes(String(item.availabilityStatus || "").toLowerCase());
  const priceAmount = getPriceAmount(item);
  const disadvantages = [];
  if (item.rating === null || item.rating === undefined || item.rating === "" || !Number.isFinite(Number(item.rating))) disadvantages.push("Рейтинг пока не подтверждён.");
  if (distance == null) disadvantages.push("Координаты не указаны, расстояние неизвестно.");
  if (priceAmount == null) disadvantages.push("Цена не указана и не участвует в оценке TezTap.");
  if (item.availabilityStatus == null && item.available == null) disadvantages.push("Актуальная доступность не подтверждена.");
  if (!withinRadius) disadvantages.push(`Объект находится вне выбранного радиуса ${radiusKm} км.`);
  if (!available) disadvantages.push("Объект помечен как недоступный.");
  const advantages = factors.filter((factor) => factor.score >= factor.maxScore * 0.7 && factor.maxScore > 0).map((factor) => factor.advantage);
  const total = recommendationScore(scoreInput);
  const explanation = `Оценка ${total}/100 рассчитана по исходной формуле TezTap: рейтинг — 40%, популярность по отзывам — 20%, расстояние — 20%, соответствие категории — 20%. Цена и доступность показаны отдельно и не меняют исходный результат.`;
  return {
    ...item,
    distanceKm: distance,
    recommendationScore: total,
    recommendationFactors: factors,
    recommendationAdvantages: advantages,
    recommendationDisadvantages: disadvantages,
    recommendationExplanation: explanation,
    priceAmount,
    withinRadius,
    available,
    eligibleForRecommendation: withinRadius && available
  };
}

function recommendationFactors({ rating = 0, ratingCount = 0, distance = null, categoryFit = 1 }) {
  const normalizedRating = clamp(Number(rating) / 5);
  const popularityScore = Math.min(20, Math.log1p(Math.max(0, Number(ratingCount))) / Math.log(101) * 20);
  const distanceScore = distance == null ? 10 : Math.max(0, 20 * (1 - Math.min(distance, 10) / 10));
  const categoryScore = clamp(Number(categoryFit)) * 20;
  return [
    { key: "rating", label: "Рейтинг", score: normalizedRating * 40, maxScore: 40, advantage: "Высокая оценка пользователей" },
    { key: "popularity", label: "Популярность и отзывы", score: popularityScore, maxScore: 20, advantage: "Есть отзывы и подтверждённый интерес" },
    { key: "distance", label: "Расстояние", score: distanceScore, maxScore: 20, advantage: "Удобное расположение рядом" },
    { key: "category", label: "Соответствие категории", score: categoryScore, maxScore: 20, advantage: "Подходит выбранной категории" }
  ];
}

function getPriceAmount(item) {
  const value = item.priceAmount ?? item.price;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function interpretDiscoveryRequest(query = "") {
  const text = String(query).trim().toLowerCase().replaceAll("ё", "е");
  const category = /\b(gym|fitness|cafe|restaurant|clinic|salon|shop|place)\b|спортзал|фитнес|кафе|ресторан|клиник|салон|магазин/.test(text)
    ? "places"
    : /tutor|математ|репетитор|course|ielts|язык|экзамен/.test(text)
      ? "education"
      : /vacan|job|work|sales assistant|продав|стажиров|работ/.test(text)
        ? "jobs"
        : /repair|washing machine|washer|plumb|electric|ремонт|стирал|сантех|электрик|уборк|нян/.test(text)
          ? "services"
          : /marketplace|buy|sell|rent|купить|продать|аренд/.test(text)
            ? "marketplace"
            : null;
  const subtypes = /gym|fitness|спортзал|фитнес/.test(text) ? ["Gyms"]
    : /math|математ/.test(text) ? ["Tutors", "Exam prep"]
      : /tutor|репетитор/.test(text) ? ["Tutors"]
        : /sales assistant|продав/.test(text) ? ["Part-time", "Vacancies"]
          : /washing machine|washer|стирал|бытов.*техник/.test(text) ? ["Repair specialists"]
            : /repair|ремонт/.test(text) ? ["Repair specialists"] : [];
  const budgetMatch = text.match(/(?:under|below|less than|до|меньше|не дороже)\s*([\d\s,._]+)\s*(?:tenge|тенге|тг|₸)?/i);
  const budgetAmount = budgetMatch ? Number(budgetMatch[1].replace(/\D/g, "")) : null;
  const distanceMatch = text.match(/(?:within|radius|в радиусе|радиусом)\s*(\d+(?:[.,]\d+)?)\s*(?:km|км)/i);
  const hourMatch = text.match(/(?:after|после)\s*(\d{1,2})(?::\d{2})?\s*(pm|am|вечера|ночи)?/i);
  let requestedHourAfter = hourMatch ? Number(hourMatch[1]) : null;
  if (requestedHourAfter != null && /pm|вечера|ночи/i.test(hourMatch[2] || "") && requestedHourAfter < 12) requestedHourAfter += 12;
  const district = /(?:14th\s+microdistrict|14-й\s+микрорайон|14\s+микрорайон)/i.test(text) ? "14-й микрорайон"
    : /(?:15th\s+microdistrict|15-й\s+микрорайон|15\s+микрорайон)/i.test(text) ? "15-й микрорайон"
      : /(?:17th\s+microdistrict|17-й\s+микрорайон|17\s+микрорайон)/i.test(text) ? "17-й микрорайон" : null;
  return {
    query: String(query).trim(), category, subtypes, budgetAmount,
    budgetInclusive: !/under|below|less than|меньше/.test(text),
    preferLowPrice: /affordable|cheap|budget|недорог|дешев|доступн/.test(text),
    nearMe: /near me|nearby|my location|рядом со мной|поблизости/.test(text),
    requestedHourAfter,
    requiresToday: /today|сегодня/.test(text),
    radiusKm: distanceMatch ? Number(distanceMatch[1].replace(",", ".")) : null,
    district,
    topicKeywords: /gym|fitness|спортзал|фитнес/.test(text) ? ["gym", "fitness", "спортзал", "фитнес"]
      : /math|математ/.test(text) ? ["math", "математ"]
        : /sales assistant|продав/.test(text) ? ["sales assistant", "продавец", "консультант"]
          : /washing machine|washer|стирал|бытов.*техник/.test(text) ? ["washing machine", "стирал", "техник"] : []
  };
}

function matchesDiscoveryIntent(item, intent) {
  if (!intent) return true;
  if (intent.category && item.category !== intent.category) return false;
  if (intent.subtypes?.length && !intent.subtypes.includes(item.subtype)) return false;
  if (intent.district && item.district !== intent.district) return false;
  if (intent.budgetAmount != null && (item.priceAmount == null || (intent.budgetInclusive === false ? Number(item.priceAmount) >= intent.budgetAmount : Number(item.priceAmount) > intent.budgetAmount))) return false;
  if (intent.requiresToday && item.availableToday === false) return false;
  if (intent.requestedHourAfter != null && item.openUntilHour !== null && item.openUntilHour !== undefined && item.openUntilHour !== "" && Number.isFinite(Number(item.openUntilHour)) && Number(item.openUntilHour) <= intent.requestedHourAfter) return false;
  if (intent.topicKeywords?.length) {
    const haystack = [item.title, item.description, item.subtype, item.subtypeLabel, ...(item.tags || [])].join(" ").toLowerCase().replaceAll("ё", "е");
    if (!intent.topicKeywords.some((keyword) => haystack.includes(keyword))) return false;
  }
  return item.available !== false && !["unavailable", "sold", "cancelled", "inactive", "closed"].includes(String(item.availabilityStatus || "").toLowerCase());
}

function isCoordinate(value) {
  return value?.lat !== null && value?.lat !== undefined && value?.lat !== "" && value?.lng !== null && value?.lng !== undefined && value?.lng !== "" && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng)) && Math.abs(Number(value.lat)) <= 90 && Math.abs(Number(value.lng)) <= 180;
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

module.exports = { AKTAU_CENTER, distanceKm, recommendationScore, scoreListing, interpretDiscoveryRequest, matchesDiscoveryIntent };
