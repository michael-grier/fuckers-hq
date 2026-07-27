"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type QuantityControlProps = {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  onChange: (value: number) => void;
};

export function QuantityControl({
  value,
  min = 1,
  max = 99,
  label,
  onChange,
}: QuantityControlProps) {
  const labelSuffix = label ? ` for ${label}` : "";

  return (
    <div className="inline-grid grid-cols-[2.5rem_3rem_2.5rem] overflow-hidden rounded-md border">
      <Button
        className="rounded-none"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Minus aria-hidden="true" />
        <span className="sr-only">Decrease quantity{labelSuffix}</span>
      </Button>
      <output
        aria-label={label ? `Quantity for ${label}` : undefined}
        aria-live="polite"
        className="grid place-items-center border-x font-bold"
      >
        {value}
      </output>
      <Button
        className="rounded-none"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Plus aria-hidden="true" />
        <span className="sr-only">Increase quantity{labelSuffix}</span>
      </Button>
    </div>
  );
}
