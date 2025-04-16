"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState   } from "react";


export default function AdminPage() {
  const searchParams = useSearchParams();
  const [isAdmin, setIsAdmin] = useState(false);
  
  if (!searchParams) {
    return <div>Access denied</div>;
  }

  if (!searchParams.has("KU61qVYyQ48KG8qKeuflvveMFbaLT6h0")) {
    return <div>Access denied</div>;
  }

  // Example of checking for specific parameters
  const secret = searchParams.get("KU61qVYyQ48KG8qKeuflvveMFbaLT6h0");

  if (!secret) {
    return <div>Access denied</div>;
  }

  const checkAdminAccess = async () => {
    try {
      if (!secret) {
        return <div>Access denied</div>;
      }
      const response = await fetch('/api/admin', {
        headers: {
          'x-admin-secret': secret || '',
        },
      });
      
      if (response.ok) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('Error checking admin access:', error);
      return <div>Access denied</div>;
    }
  };

  // Call the function when the component mounts
  useEffect(() => {
    if (secret) {
      console.log(secret);
      checkAdminAccess();
    }
  }, [secret]);

  return (
    <div>
      <h1>Admin Page</h1>
      {isAdmin && <div>Admin access granted</div>}
      {!isAdmin && <div>Access denied</div>}
    </div>
  );
}

