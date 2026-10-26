import type { SectionId } from "./shop";

export const SECTIONS: Record<
  SectionId,
  { title: string; label: string; accent: string; secondary: string; bg: string; glyph: string; desc: string }
> = {
  sets: {
    title: "Коллекции",
    label: "CURATED OBJECTS",
    accent: "#B89A70",
    secondary: "#D8C7A8",
    bg: "#151515",
    glyph: "01",
    desc: "Продуманные сочетания изделий и аксессуаров. Комплектация каждой коллекции указывается в карточке товара.",
  },
  cigars: {
    title: "Сигары",
    label: "CIGARS · SELECTED COLLECTION",
    accent: "#B89A70",
    secondary: "#D8C7A8",
    bg: "#101010",
    glyph: "C",
    desc: "Каталог сигар с характеристиками, происхождением и актуальным наличием от продавца.",
  },
  cigarettes: {
    title: "Сигареты",
    label: "CIGARETTES · SELECTED COLLECTION",
    accent: "#9E9A92",
    secondary: "#D1CDC3",
    bg: "#151515",
    glyph: "S",
    desc: "Каталог сигарет с подробными характеристиками и актуальным наличием от продавца.",
  },
  tobacco: {
    title: "Табак",
    label: "TOBACCO · BLENDS",
    accent: "#9E9A92",
    secondary: "#D1CDC3",
    bg: "#151515",
    glyph: "T",
    desc: "Табачные изделия с информацией о формате, составе и производителе.",
  },
  accessories: {
    title: "Аксессуары",
    label: "ACCESSORIES · OBJECTS",
    accent: "#B89A70",
    secondary: "#E2D6C2",
    bg: "#101010",
    glyph: "A",
    desc: "Предметы для хранения и ухода, инструменты и аксессуары с вниманием к материалам и исполнению.",
  },
};

export const rub = (n: number) =>
  `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

export function positionCount(n: number) {
  const mod = n % 100;
  return `${n} ${mod >= 11 && mod <= 14 ? "позиций" : n % 10 === 1 ? "позиция" : n % 10 >= 2 && n % 10 <= 4 ? "позиции" : "позиций"}`;
}
