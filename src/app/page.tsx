import { api, HydrateClient } from "~/trpc/server";
import { QuestionComponent } from "./_components/questions";
import { ModeToggle } from "./_components/mode-toggle";

export default async function Home() {
  const questions = await api.questions.getRandomStack({ skips: [], likes: [] });

  return (
    <HydrateClient>
      <main className="min-h-screen p-4 flex flex-col dark:bg-[#121212] light:bg-[#fafafa]">
        <header className="pb-4 flex justify-between items-center">
          <ModeToggle />
        </header>
        {questions && questions.length > 0 && <QuestionComponent initialQuestions={questions} />}
        <footer>
          &nbsp;
        </footer>
      </main>
    </HydrateClient>
  );
}
