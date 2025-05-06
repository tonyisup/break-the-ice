import { HydrateClient } from "~/trpc/server";
import { QuestionComponent } from "./_components/questions";
import { ModeToggle } from "./_components/mode-toggle";
import { api } from "~/trpc/server";
import { SettingsIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";

export default async function Home() {
  const initialQuestions = await api.questions.getRandom();
  return (
    <HydrateClient>
      <main className="min-h-screen p-4 flex flex-col dark:bg-[#121212] light:bg-[#fafafa]">
        <header className="pb-4 flex items-center gap-2">
          <ModeToggle />
          {/* <Button size="icon" variant="outline" aria-label="filter questions" asChild>
            <Link href="/settings" aria-label="filter questions">
              <SettingsIcon aria-hidden="true" />
            </Link>
          </Button> */}
        </header>
        {initialQuestions && <QuestionComponent initialQuestions={initialQuestions} />}
        <footer>
          &nbsp;
        </footer>
      </main>
    </HydrateClient>
  );
}
