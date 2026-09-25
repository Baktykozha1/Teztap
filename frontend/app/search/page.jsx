import DirectoryPage from "../../components/discovery/directory-page";

export default async function SearchPage({ searchParams }) {
  const params = await searchParams;
  return <DirectoryPage initialQuery={String(params?.q || "").trim()} />;
}
