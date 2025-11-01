import { SignInButton, UserButton } from "@clerk/clerk-react";
import { Button } from "./components/ui/button";
import { LogIn } from "lucide-react";
import { Authenticated, Unauthenticated } from "convex/react";

export function InlineSignInButton() {
  return (
    <>    
      <Unauthenticated>
        <SignInButton mode="modal">
          <Button>
            <LogIn className="w-4 h-4" />
            <span className="hidden sm:inline">Sign In</span>
          </Button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <UserButton />
      </Authenticated>
    </>
  );
}
