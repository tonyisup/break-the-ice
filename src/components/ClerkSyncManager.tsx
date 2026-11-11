import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function ClerkSyncManager() {
  const { isSignedIn } = useAuth();
  const storeUser = useMutation(api.core.users.store);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    void storeUser();
  }, [isSignedIn, storeUser]);

  return null;
}
