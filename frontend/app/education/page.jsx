import DirectoryPage from "../../components/discovery/directory-page";

export default async function EducationPage({ searchParams }) {
  const params = await searchParams;
  return <DirectoryPage category="education" initialFocusId={String(params?.focus || "")} />;
}
