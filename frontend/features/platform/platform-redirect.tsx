"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function PlatformRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/platform");
  }, [router]);
  return null;
}
