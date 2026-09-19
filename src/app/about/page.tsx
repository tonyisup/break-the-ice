import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function AboutPage() {
  return (
    <PlaceholderPage title="About Break the Ice">
      <div className="space-y-8">
        <section>
          <h2 className="mb-4 text-2xl font-bold">It started before the first class of the morning.</h2>
          <p>
            For eight years, I’ve attended group fitness classes that start with a question of the day.
            At the first class of the morning, I would often join the instructors in coming up with
            a question just minutes before the doors opened.
          </p>
          <p className="mt-4">
            Break the Ice grew out of that routine: a place to find a question when you have
            people to bring together and very little time to prepare.
          </p>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-semibold">Find something worth asking.</h2>
          <p>
            Browse the question feed, explore different styles and tones, and save the questions
            you want to use again. Teams can share collections and schedule prompts for their sessions.
            AI helps create new questions and remix existing ones.
          </p>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-semibold">Built by one person, shaped by use.</h2>
          <p>
            This is a solo project. I’m improving it as people use it in classes, meetings,
            workshops, and around the dinner table. If a question falls flat or something
            gets in your way, the feedback button sends your note directly to me.
          </p>
        </section>
      </div>
    </PlaceholderPage>
  );
}
