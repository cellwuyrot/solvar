import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ImagePlus,
  LayoutGrid,
  Gem,
  RotateCcw,
  LogOut,
  Mail,
  Package,
  ClipboardList,
  Plus,
  Save,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { authClient, clearToken } from "../lib/auth";
import {
  useAdmin,
  useManagement,
  useSaveProduct,
  useDeleteProduct,
  useSaveSettings,
  useSaveBrand,
  useUpload,
  useUploadLogo,
} from "../queries/shop";
import {
  SECTIONS,
  productSchema,
  rub,
  type Product,
  type Settings,
  type SectionId,
  BRAND_DEFAULTS,
} from "../../shared/shop";
import { Modal } from "../components/modal";
import { Packshot } from "../components/product-card";
import { AdminMembers } from "../components/admin-members";
import { AdminVisits, StaffPassword } from "../components/admin-visits";
import { ManagerMembers } from "../components/manager-members";
import { AdminOrders } from "../components/admin-orders";
import { AdminMailbox } from "../components/admin-mailbox";
import { AdminImageBulk } from "../components/admin-image-bulk";
import { AdminDuplicates } from "../components/admin-duplicates";
import { ProductBulkTools } from "../components/admin-bulk";
function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось выполнить действие";
}
export default function Admin() {
  const me = useAdmin();
  const cache = useQueryClient();
  if (me.isPending)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="spinner" />
      </div>
    );
  if (me.isError) return <Login onDone={() => cache.invalidateQueries()} />;
  if (me.data.role === "manager") return <div className="admin-main"><div className="flex flex-wrap justify-between gap-4 mb-6"><h1 className="text-3xl">Записи на визит</h1><button className="btn btn-outline" onClick={async () => { await authClient.signOut(); clearToken(); cache.clear(); window.location.assign("/admin"); }}>Выйти</button></div><p className="mb-4">{me.data.email}</p><AdminVisits role="manager" userId={me.data.id} /><StaffPassword /></div>;
  return (
    <Dashboard
      email={me.data.email}
      role={me.data.role}
      userId={me.data.id}
      onLogout={async () => {
        await authClient.signOut();
        clearToken();
        cache.clear();
        window.location.assign("/admin");
      }}
    />
  );
}
function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authClient.signIn.email({ email, password });
      if (r.error)
        throw new Error("Неверные данные или вход временно ограничен. Проверьте email и пароль.");
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f3f0e9] text-[#252824] p-5">
      <Link href="/" className="mb-8 text-xs tracking-[.2em]">
        SOLVAR
      </Link>
      <form
        onSubmit={submit}
        className="w-full max-w-sm border border-[#d9ddcc] bg-white p-8 shadow-lg"
      >
        <ShieldCheck size={26} className="text-gold" />
        <h1 className="serif mt-4 text-4xl">Вход в управление</h1>
        <p className="mb-6 mt-2 text-xs text-muted">Только для сотрудников магазина.</p>
        <label className="field-label">
          Email
          <input
            aria-label="Email"
            type="email"
            autoComplete="username"
            required
            className="field mt-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field-label mt-4">
          Пароль
          <input
            aria-label="Пароль"
            type="password"
            autoComplete="current-password"
            required
            className="field mt-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error mt-4">{error}</p>}
        <button className="btn mt-6 w-full" disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          {busy ? "Проверяем…" : "Войти"}
        </button>
        <Link href="/" className="mt-5 block text-center text-xs text-muted">
          ← Вернуться в магазин
        </Link>
      </form>
    </div>
  );
}
function Dashboard({ email, role, userId, onLogout }: { email: string; userId: string; role: "owner" | "admin"; onLogout: () => void }) {
  const q = useManagement();
  const [tab, setTab] = useState<"products" | "sets" | "brand" | "settings" | "orders" | "mail" | "members" | "visits">("products");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [edit, setEdit] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const del = useDeleteProduct();
  const [deleting, setDeleting] = useState<Product | null>(null);
  const products = q.data?.products || [];
  const filtered = products.filter(
    (p) =>
      (tab === "sets" ? p.section === "sets" : p.section !== "sets") &&
      (!country || p.section === country) &&
      (p.name + " " + p.id + " " + p.brand).toLowerCase().includes(search.toLowerCase()),
  );
  const newProduct = () => {
    setCreating(true);
    setEdit(
      productSchema.parse({
        id: `${tab === "sets" ? "S" : "P"}_${Date.now()}`,
        name: "Новый товар",
        section: tab === "sets" ? "sets" : "cigars",
        price: 0,
        active: false,
        availability: "unknown",
        sort: products.length,
      }),
    );
  };
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link href="/" className="text-sm font-bold tracking-[.12em]">
          SOLVAR
        </Link>
        <p className="mb-8 mt-2 text-xs text-muted">ПАНЕЛЬ УПРАВЛЕНИЯ</p>
        {(
          [
            ["products", "Товары", LayoutGrid],
            ["orders", "Заказы клиентов", ClipboardList],
            ["mail", "Почта", Mail],
            ["sets", "Наборы", Package],
            ["brand", "Логотип", Gem],
            ["settings", "Настройки", SettingsIcon],
            ["visits", "Визиты / Telegram", Package],
          ] as const
        ).map(([id, title, Icon]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setSearch("");
              setCountry("");
            }}
            className={`admin-tab ${tab === id ? "active" : ""}`}
          >
            <Icon size={15} />
            {title}
          </button>
        ))}
        {role === "owner" && <button className={`admin-tab ${tab === "members" ? "active" : ""}`} onClick={() => setTab("members")}>Команда</button>}
        <div className="mt-6 border-t border-[#eee] pt-5 md:absolute md:bottom-6 md:left-5 md:right-5">
          <p className="mb-4 truncate text-xs text-muted">{email}</p>
          <Link href="/" className="flex items-center gap-2 text-xs">
            <ArrowLeft size={13} />В магазин
          </Link>
          <button onClick={onLogout} className="mt-4 flex items-center gap-2 text-xs text-muted">
            <LogOut size={13} />
            Выйти
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-1">УПРАВЛЕНИЕ</p>
            <h1 className="serif text-4xl">
              {tab === "visits" ? "Записи на визит" : tab === "members" ? "Команда" : tab === "orders" ? "Заказы клиентов" : tab === "mail" ? "Почта" : tab === "brand" ? "Логотип и фавикон" : tab === "settings"
                ? "Настройки магазина"
                : tab === "sets"
                  ? "Авторские наборы"
                  : "Каталог товаров"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Управление карточками каталога и заявками на резервирование.
            </p>
          </div>
          {(tab === "products" || tab === "sets") && (
            <button className="btn" onClick={newProduct}>
              <Plus size={16} />
              Добавить {tab === "sets" ? "набор" : "товар"}
            </button>
          )}
        </div>
        {(tab === "products" || tab === "sets") && <><AdminDuplicates /><AdminImageBulk /><ProductBulkTools /></>}
        {q.isPending ? (
          <div className="spinner" />
        ) : q.isError ? (
          <p className="error">
            Не удалось загрузить данные: {errorText(q.error)}{" "}
            <button onClick={() => q.refetch()}>Повторить</button>
          </p>
        ) : tab === "visits" ? (<><AdminVisits role={role} userId={userId} /><StaffPassword /></>) : tab === "members" && role === "owner" ? (<><ManagerMembers /><AdminMembers /></>) : tab === "orders" ? (
          <AdminOrders role={role} />
        ) : tab === "mail" ? (
          <AdminMailbox />
        ) : tab === "brand" ? (
          <BrandEditor initial={q.data!.settings} />
        ) : tab === "settings" ? (
          <SettingsEditor initial={q.data!.settings} />
        ) : (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="admin-form">
                <p className="field-label">Отдельных товаров</p>
                <b className="serif text-3xl">
                  {products.filter((p) => p.section !== "sets").length}
                </b>
              </div>
              <div className="admin-form">
                <p className="field-label">Наборов</p>
                <b className="serif text-3xl">
                  {products.filter((p) => p.section === "sets").length}
                </b>
              </div>
              <div className="admin-form">
                <p className="field-label">На витрине</p>
                <b className="serif text-3xl">{products.filter((p) => p.active).length}</b>
              </div>
            </div>
            <p className="mb-5 border border-[#554735] bg-[#eee9df] p-3 text-sm leading-relaxed text-[#655c49]">
              Стартовые карточки — шаблоны и скрыты от посетителей. Замените названия, характеристики, изображения и цены на подтверждённые данные. Себестоимость доступна только администратору.
            </p>
            <div className="flex flex-wrap gap-3 border border-b-0 border-[#e2e5dc] bg-white p-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-muted" size={15} />
                <input
                  className="field pl-9"
                  aria-label="Поиск каталога"
                  placeholder="Название, бренд или ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {tab === "products" && (
                <select
                  className="field w-auto"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="">Все разделы</option>
                  {(["cigars", "cigarettes", "tobacco", "accessories"] as SectionId[]).map((id) => (
                    <option key={id} value={id}>
                      {SECTIONS[id].title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="table-wrap border border-[#e2e5dc] bg-white">
              <table>
                <thead>
                  <tr>
                    <th>ТОВАР</th>
                    <th>ЦЕНА</th>
                    <th>СЕБЕСТОИМОСТЬ</th>
                    <th>ВИДИМОСТЬ</th>
                    <th>ДЕЙСТВИЯ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id}>
                      <td aria-label={p.name}>
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 shrink-0">
                            <Packshot p={p} small />
                          </div>
                          <div className="max-w-[380px]">
                            <b className="block text-xs">{p.name}</b>
                            <span className="text-xs text-muted">
                              {p.id} · {p.country || SECTIONS[p.section].title}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap font-semibold">{rub(p.price)}</td>
                      <td>{rub(p.cost)}</td>
                      <td>
                        <span
                          className={`px-2 py-1 text-xs ${p.active ? "bg-[#edf3e6] text-[#526445]" : "bg-[#eee] text-muted"}`}
                        >
                          {p.active ? "Опубликован" : "Скрыт"}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-3">
                          <button className="text-sm text-gold" onClick={() => { setCreating(false); setEdit(p); }}
                            aria-label={`Метатеги: ${p.name}`}>Метатеги</button>
                          <button
                            className="text-sm text-gold"
                            onClick={() => {
                              setCreating(false);
                              setEdit(p);
                            }}
                          >
                            Изменить
                          </button>
                          <button
                            className="text-[#9c302d]"
                            onClick={() => setDeleting(p)}
                            aria-label={`Удалить ${p.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <p className="p-8 text-center text-xs text-muted">Товаров не найдено.</p>
              )}
            </div>
          </>
        )}
        {edit && (
          <ProductEditor
            initial={edit}
            all={products}
            creating={creating}
            onClose={() => setEdit(null)}
          />
        )}
        {deleting && (
          <Modal label="Подтвердить удаление" onClose={() => setDeleting(null)}>
            <div className="modal-panel max-w-sm p-7" style={{ zIndex: 81 }}>
              <h3 className="serif text-3xl">Удалить товар?</h3>
              <p className="my-4 text-xs leading-relaxed text-muted">
                «{deleting.name}» будет удалён из каталога. Если товар входит в набор, сначала
                уберите его из состава или скройте вместо удаления.
              </p>
              {del.isError && <p className="error mb-3">{errorText(del.error)}</p>}
              <div className="flex gap-3">
                <button className="btn btn-outline" onClick={() => setDeleting(null)}>
                  Отмена
                </button>
                <button
                  className="btn"
                  disabled={del.isPending}
                  onClick={() =>
                    del.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
                  }
                >
                  {del.isPending ? "Удаляем…" : "Удалить"}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}
function ProductEditor({
  initial,
  all,
  creating,
  onClose,
}: {
  initial: Product;
  all: Product[];
  creating: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Product>({
    ...initial,
    contents: initial.contents.map((c) => ({ ...c })),
  });
  const save = useSaveProduct();
  const upload = useUpload();
  const [error, setError] = useState("");
  const set = <K extends keyof Product>(key: K, value: Product[K]) =>
    setDraft((s) => ({ ...s, [key]: value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (creating && all.some((p) => p.id === draft.id)) {
      setError("Этот ID уже занят");
      return;
    }
    const parsed = productSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }
    save.mutate(parsed.data, { onSuccess: onClose });
  }
  async function fileUpload(file: File) {
    setError("");
    if (file.size > 2 * 1024 * 1024) {
      setError("Файл должен быть не больше 2 МБ");
      return;
    }
    try {
      const reader = new FileReader();
      const data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await upload.mutateAsync({ data });
      set("image", r.image);
    } catch (e) {
      setError(errorText(e));
    }
  }
  const text = (key: keyof Product, label: string, type = "text") => (
    <label>
      <span className="field-label">{label}</span>
      <input
        className="field"
        aria-label={label}
        type={type}
        value={String(draft[key] ?? "")}
        required={key === "name" || key === "id"}
        disabled={key === "id" && !creating}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </label>
  );
  return (
    <Modal label="Редактор товара" onClose={onClose}>
      <form onSubmit={submit} className="modal-panel max-w-3xl p-6 md:p-8" style={{ zIndex: 81 }}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="serif text-3xl">{creating ? "Новая позиция" : "Редактирование"}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть редактор">
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("name", "Название")}
          <fieldset className="sm:col-span-2 border border-[#e2e5dc] p-4 grid gap-3">
            <legend className="font-semibold px-2">Метатеги карточки</legend>
            {text("seoTitle", "SEO Title (до 160 символов)")}
            <label className="field-label">Meta description (до 320 символов)
              <textarea className="field" rows={3} maxLength={320} value={draft.seoDescription}
                onChange={e => set("seoDescription", e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.seoNoindex}
              onChange={e => set("seoNoindex", e.target.checked)} /> Исключить карточку из индексации</label>
          </fieldset>
          <label className="field-label">Наличие<select className="field" value={draft.availability} onChange={e => set("availability", e.target.value as Product["availability"])}><option value="unknown">Уточняется</option><option value="in_stock">В наличии</option><option value="out_of_stock">Нет в наличии</option></select></label>
          {text("ingredients", "Состав / материалы")}
          {text("allergens", "Характеристики / примечания")}
          {text("storage", "Условия хранения")}
          {text("shelfLife", "Производитель / коллекция")}
          {text("id", "ID (не меняется после создания)")}
          <label>
            <span className="field-label">Раздел</span>
            <select
              className="field"
              value={draft.section}
              onChange={(e) => {
                const section = e.target.value as SectionId;
                setDraft((s) => ({
                  ...s,
                  section,
                  contents: section === "sets" ? s.contents : [],
                }));
              }}
            >
              {Object.entries(SECTIONS).map(([id, s]) => (
                <option value={id} key={id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          {text("country", "Происхождение / регион")}
          {text("category", "Категория")}
          {text("brand", "Бренд")}
          {text("weight", "Вес / количество")}
          <label>
            <span className="field-label">Внутреннее поле (0–5, опционально)</span>
            <input
              className="field"
              type="number"
              min={0}
              max={5}
              step={1}
              aria-label="Внутреннее поле (0–5, опционально)"
              value={draft.spice}
              onChange={(e) => set("spice", Number(e.target.value))}
            />
          </label>
          {(
            [
              ["price", "Цена, ₽"],
              ["oldPrice", "Старая цена, ₽ (необязательно)"],
              ["cost", "Себестоимость, ₽ — только в админке"],
              ["sort", "Порядок сортировки"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <span className="field-label">{label}</span>
              <input
                className="field"
                type="number"
                min={0}
                step={key === "sort" ? 1 : "0.01"}
                aria-label={label}
                value={draft[key] ?? ""}
                onChange={(e) =>
                  set(
                    key,
                    key === "oldPrice" && e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </label>
          ))}
          {text("badge", "Бейдж на карточке")}
          {draft.section === "sets"
            ? text("people", "Комплектация")
            : text("season", "Формат / размер")}
          <label className="sm:col-span-2">
            <span className="field-label">Краткое описание</span>
            <textarea
              className="field"
              rows={2}
              aria-label="Краткое описание"
              value={draft.sub}
              onChange={(e) => set("sub", e.target.value)}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="field-label">Подробное описание</span>
            <textarea
              className="field"
              rows={3}
              aria-label="Подробное описание"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-5 sm:col-span-2">
            {(
              [
                ["active", "Опубликовать в каталоге"],
                ["featured", "Выбор SOLVAR"],
              ] as const
            ).map(([key, label]) => (
              <label className="flex items-center gap-2 text-xs" key={key}>
                <input
                  aria-label={label}
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  className="accent-[#b89a70]"
                />
                {label}
              </label>
            ))}
          </div>
          {draft.active && draft.price <= 0 && <p className="sm:col-span-2 text-xs text-muted">Чтобы сохранить публикацию в каталоге, укажите цену больше нуля.</p>}
          <div className="sm:col-span-2">
            <span className="field-label">Изображение (JPG, PNG, WebP, до 2 МБ)</span>
            <div className="flex items-start gap-4">
              <div className="h-28 w-28 shrink-0 border border-[#eee]">
                <Packshot p={draft} small />
              </div>
              <div className="flex-1">
                <label className="btn btn-outline cursor-pointer">
                  <ImagePlus size={15} />
                  {upload.isPending ? "Обрабатываем…" : "Загрузить файл"}
                  <input
                    disabled={upload.isPending}
                    aria-label="Загрузить изображение"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) fileUpload(f);
                    }}
                  />
                </label>
                <input
                  className="field mt-3"
                  aria-label="URL изображения"
                  placeholder="Или HTTPS-ссылка на изображение"
                  value={draft.image.startsWith("data:") ? "" : draft.image}
                  onChange={(e) => set("image", e.target.value)}
                />
                {draft.image && (
                  <button
                    type="button"
                    onClick={() => set("image", "")}
                    className="mt-2 text-xs text-[#9c302d]"
                  >
                    Убрать изображение
                  </button>
                )}
                <p className="mt-2 text-xs text-muted">
                  Изображение сохранится вместе с товаром после нажатия «Сохранить».
                </p>
              </div>
            </div>
          </div>
          {draft.section === "sets" && (
            <div className="sm:col-span-2">
              <h3 className="mb-3 text-sm font-semibold">Состав / материалы набора</h3>
              {draft.contents.map((c, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <select
                    className="field flex-1"
                    value={c.productId}
                    onChange={(e) =>
                      set(
                        "contents",
                        draft.contents.map((v, j) =>
                          j === i ? { ...v, productId: e.target.value } : v,
                        ),
                      )
                    }
                  >
                    {all
                      .filter((p) => p.section !== "sets")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label="Количество в наборе"
                    className="field w-20"
                    type="number"
                    min={1}
                    max={100}
                    value={c.qty}
                    onChange={(e) =>
                      set(
                        "contents",
                        draft.contents.map((v, j) =>
                          j === i ? { ...v, qty: Number(e.target.value) } : v,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label="Убрать из состава"
                    onClick={() =>
                      set(
                        "contents",
                        draft.contents.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-outline mt-2"
                onClick={() => {
                  const p = all.find(
                    (p) =>
                      p.section !== "sets" && !draft.contents.some((c) => c.productId === p.id),
                  );
                  if (p) set("contents", [...draft.contents, { productId: p.id, qty: 1 }]);
                }}
              >
                <Plus size={13} />
                Добавить в состав
              </button>
              <p className="mt-3 text-xs text-muted">
                Цена набора задаётся вручную. Изменение состава не пересчитывает цену автоматически.
              </p>
              <label className="mt-4 block">
                <span className="field-label">Что докупить самостоятельно</span>
                <input
                  className="field"
                  aria-label="Что докупить самостоятельно"
                  value={draft.extras}
                  onChange={(e) => set("extras", e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
        {(error || save.isError) && <p className="error mt-5">{error || errorText(save.error)}</p>}
        <div className="mt-6 flex justify-end gap-3 border-t border-[#eee] pt-5">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" disabled={save.isPending || upload.isPending}>
            <Save size={15} />
            {save.isPending ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SettingsEditor({ initial }: { initial: Settings }) {
  const [draft, setDraft] = useState({ ...initial });
  const save = useSaveSettings();
  const [done, setDone] = useState(false);
  const groups: { title: string; fields: [keyof Settings, string, boolean?][] }[] = [
    {
      title: "Бренд и главная страница",
      fields: [
        ["name", "Название магазина"],
        ["tagline", "Слоган"],
        ["heroTitle", "Заголовок первого экрана", true],
        ["heroText", "Описание первого экрана", true],
        ["about", "О магазине", true],
      ],
    },
    {
      title: "Реквизиты и контакты",
      fields: [
        ["company", "Название юридического лица / ИП"],
        ["inn", "ИНН"],
        ["ogrn", "ОГРН / ОГРНИП"],
        ["phone", "Телефон"],
        ["email", "Контактный email"],
        ["address", "Адрес"],
        ["hours", "Время работы"],
        ["telegram", "Telegram — HTTPS-ссылка"],
        ["vk", "VK — HTTPS-ссылка"],
        ["avito", "Авито — HTTPS-ссылка"],
      ],
    },
    {
      title: "Доставка и оплата",
      fields: [
        ["freeShipping", "Бесплатная доставка от, ₽"],
        ["deliveryFee", "Стоимость доставки, ₽"],
        ["delivery", "Условия доставки", true],
        ["payment", "Способы оплаты", true],
      ],
    },
    {
      title: "Юридические страницы",
      fields: [
        ["privacy", "Политика конфиденциальности", true],
        ["offer", "Публичная оферта", true],
        ["returns", "Возврат", true],
      ],
    },
  ];
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    save.mutate(draft, { onSuccess: () => setDone(true) });
  }
  return (
    <form onSubmit={submit}>
      <div className="mb-5 border border-[#e2d5ba] bg-[#fffaf1] p-4 text-sm leading-relaxed text-[#8c7040]">
        Реквизиты и контакты намеренно пусты: заполните реальные данные. Тексты юридических страниц
        — предупреждения, а не готовые правовые документы. Заполните их перед запуском магазина.
      </div>
      {groups.map((g) => (
        <section className="admin-form mb-5" key={g.title}>
          <h2 className="serif mb-5 text-3xl">{g.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {g.fields.map(([key, label, long]) => (
              <label key={key} className={long ? "sm:col-span-2" : ""}>
                <span className="field-label">{label}</span>
                {long ? (
                  <textarea
                    className="field"
                    rows={key === "privacy" || key === "offer" || key === "returns" ? 8 : 3}
                    aria-label={label}
                    value={draft[key]}
                    onChange={(e) => {
                      setDraft((s) => ({ ...s, [key]: e.target.value }));
                      setDone(false);
                    }}
                  />
                ) : (
                  <input
                    className="field"
                    type={typeof initial[key] === "number" ? "number" : "text"}
                    min={0}
                    required={key === "name"}
                    aria-label={label}
                    value={draft[key]}
                    onChange={(e) => {
                      setDraft((s) => ({
                        ...s,
                        [key]:
                          typeof initial[key] === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                      }));
                      setDone(false);
                    }}
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      ))}
      {save.isError && <p className="error mb-4">{errorText(save.error)}</p>}
      {done && (
        <p className="success mb-4 flex gap-2">
          <Check size={15} />
          Настройки сохранены на сервере.
        </p>
      )}
      <button className="btn" disabled={save.isPending}>
        <Save size={15} />
        {save.isPending ? "Сохраняем…" : "Сохранить все настройки"}
      </button>
    </form>
  );
}

type BrandKey = keyof typeof BRAND_DEFAULTS;
function BrandEditor({ initial }: { initial: Settings }) {
  const [draft, setDraft] = useState({ logoMark: initial.logoMark, logoHero: initial.logoHero, favicon: initial.favicon });
  const save = useSaveBrand();
  const upload = useUploadLogo();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const slots: [BrandKey, string, string][] = [
    ["logoMark", "Знак в шапке и подвале", "Квадратный или вертикальный знак, лучше PNG на прозрачном фоне."],
    ["logoHero", "Большой знак на главной", "Показывается на тёмном фоне первого экрана."],
    ["favicon", "Фавикон (иконка вкладки)", "Автоматически уменьшается до 64×64."],
  ];
  async function pick(key: BrandKey, file: File) {
    setError("");
    setDone(false);
    if (file.size > 2 * 1024 * 1024) return setError("Файл должен быть не больше 2 МБ");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await upload.mutateAsync({ data, kind: key });
      setDraft((d) => ({ ...d, [key]: res.image }));
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); setDone(false); save.mutate(draft, { onSuccess: () => setDone(true) }); }}>
      <section className="admin-form mb-5">
        <h2 className="serif mb-2 text-3xl">Изображения бренда</h2>
        <p className="mb-4 text-sm text-muted">Загрузите новый файл или верните стандартный знак SOLVAR. Изменения появятся на сайте после сохранения.</p>
        {slots.map(([key, title, hint]) => (
          <div className="logo-slot" key={key}>
            <div className={`logo-preview${key === "favicon" ? " is-small" : ""}`}>
              <img src={draft[key] || BRAND_DEFAULTS[key]} alt={title} />
            </div>
            <div>
              <p className="field-label">{title}</p>
              <p className="mb-3 text-xs text-muted">{hint} {draft[key] ? "Используется своё изображение." : "Сейчас стандартное."}</p>
              <div className="flex flex-wrap gap-3">
                <label className="btn btn-outline cursor-pointer">
                  <ImagePlus size={15} />
                  {upload.isPending ? "Загружаем…" : "Загрузить"}
                  <input type="file" disabled={upload.isPending || save.isPending} className="brand-file-input" aria-label={`Загрузить: ${title}`} accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(key, f); e.target.value = ""; }} />
                </label>
                {draft[key] && (
                  <button type="button" disabled={upload.isPending || save.isPending} className="btn btn-outline" onClick={() => { setDraft((d) => ({ ...d, [key]: "" })); setDone(false); }}>
                    <RotateCcw size={15} />По умолчанию
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>
      {(error || save.isError) && <p className="error mb-4">{error || errorText(save.error)}</p>}
      {done && <p className="success mb-4 flex gap-2"><Check size={15} />Логотип сохранён.</p>}
      <button className="btn" disabled={save.isPending || upload.isPending}>
        <Save size={15} />
        {save.isPending ? "Сохраняем…" : "Сохранить логотип"}
      </button>
    </form>
  );
}
