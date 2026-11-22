import { Link } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import { siteConfig } from "@/config/site";

export default function AboutPage() {
  return (
    <PlaceholderPage title={`About ${siteConfig.name}`}>
      <div className="space-y-8">
        <section>
          <h2>It started before the first class of the morning.</h2>
          <p>
            For eight years, I’ve attended group fitness classes that start with a question of the day.
            At the first class of the morning, I would often join the instructors in coming up with
            a question just minutes before the doors opened.
          </p>
          <p>
            {siteConfig.name} grew out of that routine: a place to find a question when you have
            people to bring together and very little time to prepare.
          </p>
        </section>
        <section>
          <h2>Find something worth asking.</h2>
          <p>
            Browse the question feed, explore different styles and tones, and save the questions
            you want to use again. AI helps create new questions and remix existing ones.
          </p>
        </section>
        <section>
          <h2>Built by one person, shaped by use.</h2>
          <p>
            This is a solo project. I’m improving it as people use it in classes, meetings,
            workshops, and around the dinner table. If a question falls flat or something
            gets in your way, reach out on the{" "}
            <Link to="/contact">contact page</Link>—or use the feedback button when you’re signed in.
          </p>
        </section>
      </div>
    </PlaceholderPage>
  );
}
