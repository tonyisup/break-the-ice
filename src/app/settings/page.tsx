import { api } from "~/trpc/server";
import { BackButton } from "~/components/settings/BackButton";
import { SettingsManager } from "~/components/settings/SettingsManager";

export default async function SettingsPage() {
  const allCategories = await api.questions.getAllCategories();
  const allTags = await api.questions.getAllTags();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <BackButton />
      </div>

      <SettingsManager allCategories={allCategories} allTags={allTags} />
    </div>
  );
} 