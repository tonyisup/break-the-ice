// src/pages/menu.tsx
import { type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

const Menu: NextPage = () => {
  const { data: session } = useSession();
  
  return (
    <>
      <Head>
        <title>Menu | Fitness Icebreakers</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>
      
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#2e026d] to-[#15162c]">
        <header className="flex w-full items-center p-4">
          <Link
            href="/"
            className="rounded-full p-2 text-white hover:bg-white/10"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </Link>
          <h1 className="ml-4 text-2xl font-bold text-white">Menu</h1>
        </header>
        
        <main className="flex flex-1 flex-col p-4">
          <div className="rounded-xl bg-white/10 p-6 text-white">
            <h2 className="mb-4 text-xl font-semibold">Fitness Icebreakers</h2>
            <p className="mb-6">
              Simple icebreaker questions to help fitness class participants connect.
            </p>
            
            {session ? (
              <div className="space-y-4">
                <p>Signed in as {session.user?.name}</p>
                <Link 
                  href="/admin" 
                  className="block rounded-lg bg-white/20 p-3 text-center font-medium hover:bg-white/30"
                >
                  Admin Dashboard
                </Link>
                <button
                  onClick={() => void signOut()}
                  className="w-full rounded-lg bg-white/20 p-3 text-center font-medium hover:bg-white/30"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => void signIn()}
                className="w-full rounded-lg bg-white/20 p-3 text-center font-medium hover:bg-white/30"
              >
                Sign In (Admin Only)
              </button>
            )}
          </div>
        </main>
      </div>
    </>
  );
};

export default Menu;
