import { Instagram, Youtube } from "lucide-react";

const socialLinks: ReadonlyArray<{
  href: string;
  label: string;
  Icon: typeof Instagram;
}> = [
  { href: "https://www.instagram.com/fuckers.hq/", label: "Instagram", Icon: Instagram },
  { href: "https://www.youtube.com/@f.ckers_skateboards", label: "YouTube", Icon: Youtube },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-surface-chrome text-white">
      <div className="flex flex-col gap-3 px-6 py-8 md:flex-row md:items-center md:justify-between lg:px-8">
        <p className="font-bold font-grotesk text-xl tracking-tight">
          Fuckers <span className="text-accent">Skateboards</span>
        </p>
        <ul aria-label="Social media" className="flex items-center gap-2">
          {socialLinks.map(({ href, label, Icon }) => (
            <li key={href}>
              <a
                className="grid size-10 place-items-center rounded-md text-white/80 outline-none transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
                href={href}
                rel="noreferrer"
                target="_blank"
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="sr-only">{label}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
