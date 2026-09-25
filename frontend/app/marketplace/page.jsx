import DirectoryPage from "../../components/discovery/directory-page";

export default async function MarketplacePage({ searchParams }) {
  const params = await searchParams;
  return <DirectoryPage category="marketplace" initialQuery={String(params?.q || "")} initialFocusId={String(params?.focus || "")} />;
}
