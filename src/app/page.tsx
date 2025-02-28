import { api } from "~/trpc/server";
import { HydrateClient } from "~/trpc/server";
import { QuestionComponent } from "./_components/question";

export default async function Home() {
  const question = await api.questions.getRandom();

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <header className="flex w-full justify-end p-4">            
            {/* 
            TODO: display  menu
            <button
              onClick={() => router.push("/menu")}
              className="rounded-full p-2 text-white hover:bg-white/10"
            >
              <Bars3Icon className="h-6 w-6" />
            </button> */}
          </header>

          {question && <QuestionComponent initialQuestion={question} />}
        </div>
      </main>
    </HydrateClient>
  );
}
