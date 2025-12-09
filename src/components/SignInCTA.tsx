
import { Button } from "@/components/ui/button";
import { SignInButton } from "@clerk/clerk-react";

interface SignInCTAProps {
  bgGradient: [string, string];
  title: string;
  featureHighlight: {
    pre: string;
    highlight: string;
    post: string;
  };
}

export function SignInCTA({ bgGradient, title, featureHighlight }: SignInCTAProps) {
  return (
    <div className="w-full max-w-md mx-auto p-1 rounded-[30px]" style={{ background: `linear-gradient(135deg, ${bgGradient[1]}, ${bgGradient[0]})` }}>
      <div className="w-full h-full bg-white/95 dark:bg-gray-900/95 rounded-[27px] p-8 flex flex-col gap-6 items-center text-center">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
            {featureHighlight.pre} <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600">{featureHighlight.highlight}</span> {featureHighlight.post}
          </p>
        </div>
        <SignInButton mode="modal">
          <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-full py-6 text-lg font-bold shadow-lg transition-all hover:scale-105 hover:shadow-xl">
            Sign In for Free
          </Button>
        </SignInButton>
      </div>
    </div>
  );
}
