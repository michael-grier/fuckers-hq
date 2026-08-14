const skeletonItems = ["product-one", "product-two", "product-three", "product-four"];

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6">
      <div className="grid w-full gap-6 md:grid-cols-4">
        {skeletonItems.map((item) => (
          <div className="space-y-3" key={item}>
            <div className="aspect-[4/5] animate-pulse rounded-lg bg-muted" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </main>
  );
}
