import { api } from "~/trpc/server";
import { HydrateClient } from "~/trpc/server";
import { QuestionComponent } from "./_components/question";
import { ModeToggle } from "./_components/mode-toggle";
export default async function Home() {
  const question = await api.questions.getRandom();

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-between bg-[#121212]">
        <header className="flex w-full justify-start p-4">
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
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">

          {question && <QuestionComponent initialQuestion={question} />}
        </div>
      </main>
    </HydrateClient>
  );
}
