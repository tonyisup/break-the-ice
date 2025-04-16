"use client";

import { Button } from "~/components/ui/button";
import Admin from "../_components/admin/admin";
import { useSession, signIn, signOut } from "next-auth/react";

export default function AdminPage() {
  const { data: session } = useSession();


  return (
    <div className="h-full flex flex-col gap-4 items-center justify-center">      
      {session?.user && <Button variant="outline" onClick={() => signOut()}>Logout</Button>}
      {!session?.user && <Button variant="outline" onClick={() => signIn()}>Login</Button>}
      {session?.user && <Admin />}
    </div>
  );
}

