import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton, useUser } from "@clerk/clerk-react";
import { Outlet } from "react-router-dom";
import "@fontsource-variable/manrope";

export default function AdminLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <Unauthenticated>
        <div className="admin-shell flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 max-w-md w-full text-center">
            <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
            <p className="text-muted-foreground mb-6">
              Please sign in with an administrator account to continue.
            </p>
            <SignInButton mode="modal">
              <button className="w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:opacity-90 transition-opacity">
                Sign In
              </button>
            </SignInButton>
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="admin-shell flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-col items-center gap-4">
            <div className="size-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-muted-foreground">
              Authenticating...
            </p>
          </div>
        </div>
      </AuthLoading>
      <Authenticated>
        <AdminContent>{children || <Outlet />}</AdminContent>
      </Authenticated>
    </ErrorBoundary>
  );
}

function AdminContent({ children }: { children: React.ReactNode }) {
  const { isSignedIn, user, isLoaded } = useUser();

  if (!isLoaded) return null;

  if (!isSignedIn || !user?.publicMetadata?.isAdmin) {
    return (
      <div className="admin-shell flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">
            Access Denied
          </h1>
          <p className="text-muted-foreground mb-6">
            You do not have the required permissions to access this area.
          </p>
          <a
            href="/"
            className="inline-block w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-2 rounded-md font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Return Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="admin-shell flex min-h-screen w-full bg-background">
        <AdminSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center border-b bg-background/90 px-4 backdrop-blur-sm sm:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="size-11 md:size-9" />
              <div className="h-4 w-px bg-border" aria-hidden="true" />
              <div
                className="flex items-center gap-2"
                aria-label="Break the Ice administration"
              >
                <span className="text-sm font-semibold text-foreground">
                  Break the Ice
                </span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  Admin
                </span>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
