export function SiteFooter() {
  return (
    <footer className="border-t bg-neutral-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <p className="font-black text-xl">Fuckers HQ</p>
        <p className="text-sm text-white/60">
          Guest checkout, Stripe-hosted payments, and admin-managed inventory.
        </p>
      </div>
    </footer>
  );
}
