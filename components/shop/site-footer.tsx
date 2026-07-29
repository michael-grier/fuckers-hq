export function SiteFooter() {
  return (
    <footer className="border-t bg-neutral-950 text-white">
      <div className="flex flex-col gap-3 px-6 py-8 md:flex-row md:items-center md:justify-between lg:px-8">
        <p className="font-bold font-grotesk text-xl tracking-tight">
          Fuckers <span className="text-accent">Skateboards</span>
        </p>
        <p className="text-sm text-white/60">
          Guest checkout, Stripe-hosted payments, and admin-managed inventory.
        </p>
      </div>
    </footer>
  );
}
