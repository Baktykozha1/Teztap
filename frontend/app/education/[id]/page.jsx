import { EducationProfile } from "../../../components/discovery/education-ui";
import { listings } from "../../../lib/discovery-data";

export default async function EducationProfilePage({ params }) {
  const { id } = await params;
  const educationListings = listings.filter((item) => item.category === "education");
  const initialListing = educationListings.find((item) => item.id === id) || null;
  return <EducationProfile id={id} initialListing={initialListing} listings={educationListings} />;
}
