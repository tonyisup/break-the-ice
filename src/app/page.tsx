import { HydrateClient } from "~/trpc/server";
import { QuestionComponent } from "./_components/questions";
import { ModeToggle } from "./_components/mode-toggle";
import { api } from "~/trpc/server";

export default async function Home() {
  const initialQuestions = await api.questions.getRandom();
  return (
    <HydrateClient>
      <main className="min-h-screen p-4 flex flex-col dark:bg-[#121212] light:bg-[#fafafa]">
        <header className="pb-4 flex justify-between items-center">
          <ModeToggle />
        </header>
        {initialQuestions && <QuestionComponent initialQuestions={initialQuestions} />}
        <footer>
          &nbsp;
        </footer>
      </main>
    </HydrateClient>
  );
}
