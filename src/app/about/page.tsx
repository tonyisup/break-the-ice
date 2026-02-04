import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function AboutPage() {
  return (
    <PlaceholderPage title="About Us">
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-bold mb-4">Beyond the Small Talk</h2>
          <p>
            Break the Ice(berg) was born from a simple belief: starting a conversation shouldn't be the hardest part of your day.
            Whether you're leading a team, teaching a class, or just meeting someone new, a single thoughtful question
            can transform a room full of strangers into a community of connected individuals.
          </p>
        </section>

        <section className="bg-white/5 p-6 rounded-xl border border-white/10 italic">
          <h2 className="text-xl font-semibold mb-3 not-italic">The Inspiration</h2>
          <p>
            "For eight years, I've been a regular at group fitness classes. Every single session starts the same way:
            with a 'Question of the Day.' Attending the very first class of the morning meant I often found myself
            huddled with instructors, brainstorming questions minutes before the doors opened."
          </p>
          <p className="mt-4">
            "When AI began to evolve, I saw an opportunity. I realized I could leverage this technology to move
            past the standard 'what's your favorite color' questions and generate prompts that spark real
            storytelling and genuine laughter."
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">AI with a Human Touch</h2>
          <p>
            We don't just use AI to generate text; we use it to match your mood. By blending advanced language models
            with custom styles and tones, Break the Ice helps you find the right words for any
            occasion—from professional networking to late-night campfire chats.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">A Solo Passion Project</h2>
          <p>
            This is a solo project built with a 'build in public' philosophy. I'm constantly refining the experience
            based on how people actually use it. Because this isn't built by a faceless corporation, your feedback
            goes directly to the person responsible for every line of code.
          </p>
          <p className="mt-4">
            You own your questions, you control your data, and we're just here to help you break the ice.
          </p>
        </section>

        <div className="pt-6 border-t border-white/10 text-center">
          <p className="text-sm text-muted-foreground">
            Thank you for being part of the journey. Let's keep the conversation going.
          </p>
        </div>
      </div>
    </PlaceholderPage>
  );
}
