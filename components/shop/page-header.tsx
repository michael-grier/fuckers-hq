type PageHeaderProps = {
  title: string;
  description?: string;
};

// Edge-anchored page header matching the landing page design language:
// full-width with viewport-edge padding, Space Grotesk title.
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="border-b px-6 pb-8 lg:px-8">
      <h1 className="mt-3 font-grotesk font-semibold text-4xl tracking-tight md:text-5xl">
        {title}
      </h1>
      {description ? <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p> : null}
    </header>
  );
}
