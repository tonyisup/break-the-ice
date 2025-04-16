"use client";

import { Button } from "~/components/ui/button";
import Admin from "../_components/admin/admin";
import { useSession, signIn } from "next-auth/react";

export default function AdminPage() {
  const { data: session } = useSession();


  return (
    <div className="h-full flex flex-col gap-4 items-center justify-center">
      <h1>Admin Page</h1>
      {!session?.user.admin && <Button variant="outline" onClick={() => signIn()}>Login</Button>}
      {session?.user.admin && <Admin />}
    </div>
  );
}

