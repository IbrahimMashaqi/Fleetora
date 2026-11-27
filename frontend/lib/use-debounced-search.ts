"use client";
import { useEffect, useState } from "react";
export function useDebouncedSearch(initial = "") {
  const [text, setText] = useState(initial),
    [search, setSearch] = useState(initial);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  return { text, search, setText, apply: () => setSearch(text.trim()) };
}
