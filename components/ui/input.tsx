import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-colors placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground file:mr-3 file:inline-flex file:h-7 file:items-center file:justify-center file:rounded-md file:border-0 file:bg-primary file:px-3 file:font-medium file:text-primary-foreground file:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
