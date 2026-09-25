import DirectoryPage from "../../components/discovery/directory-page";

export default async function PlacesPage({ searchParams }) {
  const params = await searchParams;
  return <DirectoryPage category="places" initialQuery={String(params?.q || "")} initialFocusId={String(params?.focus || "")} />;
}
