"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function Home() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
    } else if (userData) {
      if (userData.role === "LEAD") {
        router.push("/dashboard/lead");
      } else {
        router.push("/dashboard/designer");
      }
    }
  }, [user, userData, loading, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
        <p className="text-sm font-medium text-zinc-500 animate-pulse">Loading workspace...</p>
      </div>
    </div>
  );
}
