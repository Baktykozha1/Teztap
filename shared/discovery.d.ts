export type DiscoveryCategory = "education" | "jobs" | "services" | "marketplace" | "places";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ReviewSummary {
  rating: number;
  ratingCount: number;
  summary: string;
  tags: string[];
}

export interface EducationScheduleSlot {
  day: number;
  from: string;
  to: string;
}

export interface EducationMetadata {
  instructor?: string;
  subjects: string[];
  qualifications?: string | null;
  experienceYears?: number | null;
  format?: "online" | "offline" | "hybrid" | null;
  lessonType?: "individual" | "group" | null;
  schedule?: EducationScheduleSlot[];
  availabilityNote?: string | null;
  durationMinutes?: number | null;
}

export interface JobMetadata {
  employmentType: "full-time" | "part-time" | "temporary" | "internship" | "entry-level";
  workFormat: "remote" | "hybrid" | "onsite";
  schedule: string;
  experienceYears?: number | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryPeriod?: string;
  publishedAt?: string | null;
  requiredSkills: string[];
  requirements: string[];
  employer: { slug: string; name: string; industry?: string | null; description?: string | null };
}

export interface ServiceMetadata {
  priceFrom?: number | null;
  pricePeriod?: string | null;
  serviceArea?: string[];
  availableDate?: string | null;
  availableTime?: string | null;
  urgentToday?: boolean;
  portfolio?: string[];
}

export interface MarketplaceMetadata {
  transactionType: "sale" | "rent";
  category: string;
  condition: "Новое" | "Как новое" | "Хорошее" | "Есть следы использования" | string;
  area: string;
  sellerName: string;
  sellerRating?: number | null;
  sellerRatingCount?: number | null;
  publishedAt: string;
  imageUrl?: string | null;
  imageName?: string | null;
  imageDataUrl?: string | null;
}

export interface PlaceMetadata {
  priceLevel?: 1 | 2 | 3 | 4 | null;
  averageBill?: number | null;
  priceRange?: string | null;
  bookingAvailable?: boolean | null;
  images?: string[];
}

export interface DiscoveryListing {
  id: string;
  category: DiscoveryCategory;
  subtype: string;
  title: string;
  description: string;
  provider: string;
  city: string;
  district: string;
  address: string;
  coordinates: Coordinates;
  distanceKm: number | null;
  source: "openstreetmap" | "2gis" | "public_dataset" | "user_generated" | "organization" | "demo";
  sourceLabel: string;
  sourceUrl?: string | null;
  lastUpdatedAt: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactUrl?: string | null;
  education?: EducationMetadata | null;
  job?: JobMetadata | null;
  service?: ServiceMetadata | null;
  marketplace?: MarketplaceMetadata | null;
  place?: PlaceMetadata | null;
  priceLabel?: string | null;
  priceAmount?: number | null;
  currency?: string;
  rating?: number | null;
  ratingCount?: number | null;
  reviewSummary?: string | null;
  tags?: string[];
  demo: boolean;
  available?: boolean;
  availabilityStatus?: "available" | "unavailable" | "sold" | "cancelled" | "inactive" | "closed" | string;
  openingHours?: string | null;
  openUntilHour?: number | null;
  availableToday?: boolean | null;
}

export interface RecommendationFactor {
  key: "rating" | "popularity" | "distance" | "category";
  label: string;
  score: number;
  maxScore: number;
  advantage: string;
}

export interface ScoredDiscoveryListing extends DiscoveryListing {
  distanceKm: number | null;
  recommendationScore: number;
  recommendationFactors: RecommendationFactor[];
  recommendationAdvantages: string[];
  recommendationDisadvantages: string[];
  recommendationExplanation: string;
  withinRadius: boolean;
  available: boolean;
  eligibleForRecommendation: boolean;
}

export interface DiscoveryFilters {
  query: string;
  district: string;
  subtype: string;
  sort: "recommended" | "distance" | "rating" | "price";
}
