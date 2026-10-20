import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { CartDrawer, Toast } from "../components/cart-drawer";
import { Header } from "../components/header";
import { Breadcrumbs } from "../components/breadcrumbs";
import { CollectionSection } from "../components/sections";
import { Footer3D } from "../components/footer-3d";
import { Seo } from "../components/seo";
import { SECTIONS, sectionSchema, type SectionId } from "../../shared/shop";
import { positionCount } from "../../shared/catalog-display";
import { useShop } from "../queries/shop";

export default function CollectionPage() {
  const { slug } = useParams();
  const parsed = sectionSchema.safeParse(slug);
  const id = parsed.success ? (parsed.data as SectionId) : null;
  const q = useShop();
  const s = id ? SECTIONS[id] : undefined;
  const count = useMemo(() => (id ? q.data?.products.filter((p) => p.section === id).length || 0 : 0), [id, q.data]);

  if (!id || !s) {
    return (
      <>
        <Seo title="Коллекция не найдена" />
        <Header />
        <main className="container min-h-[60vh] py-16 md:py-24">
          <Breadcrumbs items={[{ label: "Коллекция не найдена" }]} />
          <h1 className="serif mt-8 text-5xl">Страница не найдена</h1>
          <Link className="btn mt-8" href="/">
            Вернуться в магазин
          </Link>
        </main>
        <Footer3D />
        <CartDrawer />
        <Toast />
      </>
    );
  }

  return (
    <>
      <Seo
        title={s.title}
        description={`${s.title}: ${s.desc} SOLVAR — каталог сигар, табака и аксессуаров SOLVAR.`}
        pathname={`/collections/${id}`}
        settings={q.data?.settings}
        products={q.data?.products.filter((p) => p.section === id)}
      />
      <Header />
      <main>
        <div className="container pt-6 md:pt-8">
          <Breadcrumbs items={[{ label: "Коллекции", href: "/#collections" }, { label: s.title }]} />
          <div className="mt-6 border-b border-[#36322c] pb-6">
            <p className="eyebrow">{s.title}</p>
            <h1 className="serif mt-2 text-5xl leading-none md:text-6xl">{s.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted">{s.desc}</p>
            {!q.isPending && !q.isError && <p className="mt-3 text-sm text-muted">{positionCount(count)} в коллекции</p>}
          </div>
        </div>
        <CollectionSection id={id} />
      </main>
      <Footer3D />
      <CartDrawer />
      <Toast />
    </>
  );
}
