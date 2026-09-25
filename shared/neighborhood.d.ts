import type { Coordinates } from "./discovery";

export type NeighborhoodLocationType = "city" | "microdistrict" | "complex" | "building";
export type NeighborhoodVerification = "verified" | "open-data-unverified" | "community-reviewed" | "demo" | "unverified";
export type AnnouncementCategory = "water" | "electricity" | "heating" | "gas" | "internet" | "elevator" | "road" | "cleaning" | "other";
export type AnnouncementStatus = "planned" | "ongoing" | "resolved" | "cancelled" | "reported";

export interface NeighborhoodLocation {
  id: string;
  type: NeighborhoodLocationType;
  parentId: string | null;
  name: string;
  address: string;
  coordinates: Coordinates;
  source: string;
  sourceLabel: string;
  verificationStatus: NeighborhoodVerification;
  demo: boolean;
}

export interface NeighborhoodAnnouncement {
  id: string;
  affectedLocationIds: string[];
  category: AnnouncementCategory;
  title: string;
  description: string;
  startAt: string;
  expectedEndAt: string | null;
  status: AnnouncementStatus;
  publishingOrganization: string;
  source: string;
  sourceLabel: string;
  verificationLevel: "official" | "administrator" | "resident-report";
  publishedAt: string;
  updatedAt: string;
}

export interface NeighborhoodFollow {
  locationId: string;
  primaryHome?: boolean;
  notificationsEnabled: boolean;
  /** Missing values from older records mean all announcement categories. */
  notificationCategories?: AnnouncementCategory[];
}

export interface NeighborhoodIssueSubscription {
  category: AnnouncementCategory;
  createdAt: string;
}

export interface NeighborhoodCityIssue extends NeighborhoodAnnouncement {
  coordinates: Coordinates;
  address: string;
  affectedLocations: NeighborhoodLocation[];
}
