"use client";

import { useState, useEffect } from "react";
import { useDebounce } from "~/hooks/useDebounce";
import { Input } from "~/components/ui/input";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { Search } from "lucide-react";
import { Label } from "@radix-ui/react-dropdown-menu";

interface SearchInputProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  delay?: number;
}

export function SearchInput({
  onSearch,
  placeholder = "Search...",
  delay = 300,
}: SearchInputProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, delay);

  // Effect to trigger search when debounced value changes
  useEffect(() => {
    onSearch(debouncedSearchTerm);
  }, [debouncedSearchTerm, onSearch]);

  return (<div className="flex w-full items-center gap-2">
    <Label className="sr-only">Search</Label>
    <Input
      type="text"
      placeholder={placeholder}
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="w-full max-w-md"
    />
    {!searchTerm && <Search className="ml-[-32px] w-4 h-4" />}
    {searchTerm && <Button className="ml-[-32px] w-4 h-4" variant="ghost" size="icon" onClick={() => {
      setSearchTerm("");
    }}><X /></Button>}
  </div>
  );
} 