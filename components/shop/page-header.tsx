type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
};

// Edge-anchored page header matching the landing page design language:
// full-width with viewport-edge padding, gold-dash eyebrow, Space Grotesk title.
export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="border-b px-6 pb-8 lg:px-8">
      <p className="flex items-center gap-2 font-grotesk font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]">
        <span aria-hidden="true" className="h-0.5 w-6 bg-accent" />
        {eyebrow}
      </p>
      <h1 className="mt-3 font-grotesk font-semibold text-4xl tracking-tight md:text-5xl">
        {title}
      </h1>
      {description ? <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p> : null}
    </header>
  );
}
