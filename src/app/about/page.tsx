import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function AboutPage() {
  return (
    <PlaceholderPage title="A question before class">
      <div className="space-y-6">
        <p>For eight years, I've been a regular at group fitness classes. Every session starts with a question of the day.</p>
        <p>I usually attend the first class of the morning. Before the doors opened, I would help the instructors think of a question. We wanted something everyone could answer, without asking the same thing every week.</p>
        <p>I built Break the Ice to make that part easier. Browse questions, save the ones you like, and choose a style or tone that suits your group. AI helps create variations when you need a fresh question.</p>
        <p>Teams can keep a shared collection and schedule questions ahead of a class, meeting, or workshop.</p>
        <p>I build and maintain this app myself. If a question feels awkward or something doesn't work, <a href="/contact">send me a note</a>. I read the feedback.</p>
      </div>
    </PlaceholderPage>
  );
}
