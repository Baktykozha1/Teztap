import type { Coordinates, DiscoveryCategory, DiscoveryListing } from "./discovery";

export interface MapLocation {
  coordinates: Coordinates;
  address: string;
  districtId: string | null;
}

export interface AktauMapListing extends DiscoveryListing {
  category: DiscoveryCategory;
}

export interface NeighborhoodMapListing {
  id: string;
  category: "neighborhood" | "neighborhood-alert";
  title: string;
  address: string;
  district: string;
  coordinates: Coordinates;
  sourceLabel: string;
  description: string;
  demo: boolean;
}

export interface AktauMapProps {
  result: {
    input?: { city?: string };
    market?: { competitorCount?: number; map?: { center?: Coordinates } };
    competitors?: unknown[];
  };
  listings: (AktauMapListing | NeighborhoodMapListing)[];
  searchOrigin: MapLocation;
  selectedLocation?: MapLocation | null;
  selectedListingId?: string | null;
  highlightedListingIds?: string[];
  radiusKm: number;
  autoLocateKey?: string | null;
  isVisible?: boolean;
  onSearchOriginChange(location: MapLocation): void;
  onListingSelect?(listing: AktauMapListing | NeighborhoodMapListing): void;
}
