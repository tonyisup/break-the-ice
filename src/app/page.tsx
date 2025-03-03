import { api } from "~/trpc/server";
import { HydrateClient } from "~/trpc/server";
import { QuestionComponent } from "./_components/question";
import { ModeToggle } from "./_components/mode-toggle";

export default async function Home() {
  const question = await api.questions.getRandom();

  return (
    <HydrateClient>
      <main className="min-h-screen p-4 flex flex-col dark:bg-[#121212] light:bg-[#fafafa]">
        <header className="pb-4">
          {/* 
            TODO: display  menu
            <button
              onClick={() => router.push("/menu")}
              className="rounded-full p-2 text-white hover:bg-white/10"
            >
              <Bars3Icon className="h-6 w-6" />
            </button> */}
          <ModeToggle />
        </header>
        {question && <QuestionComponent initialQuestion={question} />}
      </main>
    </HydrateClient>
  );
}
