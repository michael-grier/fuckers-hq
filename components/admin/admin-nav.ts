import { LayoutDashboard, type LucideIcon, Package, ReceiptText } from "lucide-react";
import type { Route } from "next";

export type AdminNavLink = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Match the pathname exactly instead of by prefix (for the dashboard root). */
  exact?: boolean;
};

export type AdminNavGroup = {
  label: string | null;
  links: AdminNavLink[];
};

export const adminNavGroups: ReadonlyArray<AdminNavGroup> = [
  {
    label: null,
    links: [{ href: "/admin" as Route, label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Catalog",
    links: [{ href: "/admin/products" as Route, label: "Products", icon: Package }],
  },
  {
    label: "Sales",
    links: [{ href: "/admin/orders" as Route, label: "Orders", icon: ReceiptText }],
  },
];

export const adminNavLinks: ReadonlyArray<AdminNavLink> = adminNavGroups.flatMap(
  (group) => group.links,
);

export function isAdminNavLinkActive(pathname: string, link: AdminNavLink): boolean {
  if (link.exact) {
    return pathname === link.href;
  }

  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
