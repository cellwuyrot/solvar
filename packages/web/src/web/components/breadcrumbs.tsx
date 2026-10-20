import { ChevronRight, Home } from "lucide-react";
import { Link } from "wouter";
import { useMemo } from "react";

type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const jsonLd = useMemo(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: `${origin}/` },
        ...items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 2,
          name: item.label,
          ...(item.href ? { item: new URL(item.href, origin || "https://example.com").toString() } : {}),
        })),
      ],
    };
  }, [items]);

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <nav aria-label="Хлебные крошки" className="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-gold">
            <Home size={14} aria-hidden="true" />
            <span>Главная</span>
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            <ChevronRight size={14} className="text-[#a9ada3]" aria-hidden="true" />
            {item.href ? (
              <Link href={item.href} className="hover:text-gold">
                {item.label}
              </Link>
            ) : (
              <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
      </nav>
    </>
  );
}
