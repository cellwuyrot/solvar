import { useEffect } from "react";
import type { Product, Settings } from "../../shared/shop";

const DEFAULT_DESCRIPTION =
  "SOLVAR — сигары, табак и аксессуары в эстетике строгого минимализма.";

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function setProperty(property: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonical(url: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = url;
}

export function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  pathname,
  settings,
  products = [],
  type = "website",
}: {
  title: string;
  description?: string;
  pathname?: string;
  settings?: Settings;
  products?: Product[];
  type?: "website" | "product";
}) {
  useEffect(() => {
    const url = new URL(pathname || window.location.pathname, window.location.origin).toString();
    const siteName = settings?.name || "SOLVAR";
    document.title = title.includes(siteName) ? title : `${title} — ${siteName}`;
    setMeta("description", description);
    setMeta("robots", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1");
    setMeta("theme-color", "#101010");
    setProperty("og:type", type);
    setProperty("og:title", document.title);
    setProperty("og:description", description);
    setProperty("og:url", url);
    setProperty("og:site_name", siteName);
    setProperty("og:image", `${window.location.origin}/og-image.png`);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", document.title);
    setMeta("twitter:description", description);
    setMeta("twitter:image", `${window.location.origin}/og-image.png`);
    setCanonical(url);

    const existing = document.getElementById("seo-jsonld");
    existing?.remove();
    const script = document.createElement("script");
    script.id = "seo-jsonld";
    script.type = "application/ld+json";
    const website = {
      "@type": "WebSite",
      name: siteName,
      description,
      url,
    };
    const itemList = products.length
      ? {
          "@type": "ItemList",
          name: `${siteName} — каталог`,
          numberOfItems: products.length,
          itemListElement: products.slice(0, 24).map((product, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item: {
              "@type": "Product",
              name: product.name,
              description: product.description || product.sub,
              brand: product.brand || siteName,
              category: product.category,
              offers: {
                "@type": "Offer",
                priceCurrency: "RUB",
                price: product.price,
                ...(product.availability === "in_stock" ? { availability: "https://schema.org/InStock" } : product.availability === "out_of_stock" ? { availability: "https://schema.org/OutOfStock" } : {}),
                url: `${window.location.origin}/products/${encodeURIComponent(product.id)}`,
              },
            },
          })),
        }
      : null;
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": type === "product" && products[0] ? [{ ...itemList?.itemListElement[0].item, "@type": "Product" }] : itemList ? [website, itemList] : [website],
    });
    document.head.appendChild(script);

    return () => {
      if (document.getElementById("seo-jsonld") === script) script.remove();
    };
  }, [description, pathname, products, settings?.name, title, type]);

  return null;
}
