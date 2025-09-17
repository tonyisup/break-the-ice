import { SignInButton } from "@clerk/clerk-react";

export function SignIn() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-center text-4xl font-bold mb-8">Welcome to Break the Ice(berg)</h1>
      <p className="text-lg mb-8">Please sign in to continue</p>
      <SignInButton mode="modal">
        <button className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-full text-lg transition-transform transform hover:scale-105">
          Sign In
        </button>
      </SignInButton>
    </div>
  );
}
