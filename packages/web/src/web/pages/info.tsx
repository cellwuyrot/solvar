import { useParams } from "wouter";
import { Header } from "../components/header";
import { Breadcrumbs } from "../components/breadcrumbs";
import { Seo } from "../components/seo";
import { Footer3D } from "../components/footer-3d";
import { CartDrawer, Toast } from "../components/cart-drawer";
import { useShop } from "../queries/shop";
import type { Settings } from "../../shared/shop";
const pages: Record<string, { title: string; key: keyof Settings }> = {
  delivery: { title: "Доставка", key: "delivery" },
  payment: { title: "Оплата", key: "payment" },
  privacy: { title: "Политика конфиденциальности", key: "privacy" },
  offer: { title: "Публичная оферта", key: "offer" },
  returns: { title: "Возврат", key: "returns" },
};
export default function Info() {
  const { slug } = useParams();
  const q = useShop();
  const p = pages[slug || ""];
  return (
    <>
      <Seo
        title={p?.title || "Страница не найдена"}
        description={p ? `${p.title}. Информация SOLVAR о доставке, оплате и условиях продажи.` : "Страница SOLVAR не найдена."}
        pathname={`/info/${slug || ""}`}
        settings={q.data?.settings}
      />
      <Header />
      <main className="info-main container min-h-[55vh] py-10 md:py-16">
        <Breadcrumbs items={[{ label: "Информация" }, { label: p?.title || "Страница не найдена" }]} />
        <h1 className="serif my-8 text-5xl md:text-6xl">{p?.title || "Страница не найдена"}</h1>
        {q.isPending ? (
          <div className="spinner" />
        ) : q.isError ? (
          <p className="error">Не удалось загрузить информацию.</p>
        ) : (
          <div className="max-w-3xl whitespace-pre-wrap text-base leading-7 text-muted">
            {p
              ? String(q.data?.settings[p.key] || "Информация готовится.")
              : "Проверьте адрес страницы."}
          </div>
        )}
      </main>
      <Footer3D />
      <CartDrawer />
      <Toast />
    </>
  );
}
