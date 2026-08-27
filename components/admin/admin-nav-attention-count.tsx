import { Badge } from "@/components/ui/badge";

/** Shows the number of orders awaiting an operator action in admin navigation. */
export function AdminNavAttentionCount({ count }: { count: number }) {
  if (count < 1) {
    return null;
  }

  return (
    <Badge
      aria-label={`${count} ${count === 1 ? "order needs" : "orders need"} action`}
      className="ml-auto min-w-5 rounded-full px-1.5 font-bold text-[11px]"
      variant="destructive"
    >
      {count}
    </Badge>
  );
}
