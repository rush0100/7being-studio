"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "th" | "zh" | "en";

const STR = {
  th: {
    realm: "7Being Studio",
    studio: "",
    view: "มุมมอง",
    flow: "โฟลว์",
    live: "สด",
    lang: "ภาษา",
    scanEmpty: "ยังไม่พบ headset",
    scanSearching: "ค้นหา headset ใกล้เคียง…",
    scanConnected: "มีเครื่องต่ออยู่แล้ว",
    noneFound: "ไม่พบ headset",
    found: "พบ {n} เครื่อง",
    lsl: "EPOC X ใช้ LSL adapter ซื้อ EmotivPRO ที่ emotiv.com/emotivpro แล้วติดต่อ hello@rush0100.com",
  },
  zh: {
    realm: "7Being Studio",
    studio: "",
    view: "视图",
    flow: "流程",
    live: "实时",
    lang: "语言",
    scanEmpty: "未找到头戴设备",
    scanSearching: "正在搜索附近的头戴设备…",
    scanConnected: "已有设备连接",
    noneFound: "未找到头戴设备",
    found: "找到 {n} 台",
    lsl: "EPOC X 使用 LSL 适配器。请先在 emotiv.com/emotivpro 购买 EmotivPRO，然后联系 hello@rush0100.com",
  },
  en: {
    realm: "7Being Studio",
    studio: "",
    view: "View",
    flow: "Flow",
    live: "Live",
    lang: "Language",
    scanEmpty: "No headset found",
    scanSearching: "Looking for a nearby headset…",
    scanConnected: "A device is already connected",
    noneFound: "No headset found",
    found: "Found {n}",
    lsl: "EPOC X uses an LSL adapter. Buy EmotivPRO at emotiv.com/emotivpro, then contact hello@rush0100.com",
  },
} as const;

type Key = keyof (typeof STR)["en"];

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: Key) => string;
};

const I18nContext = createContext<Ctx | null>(null);

function initialLang(): Lang {
  if (typeof window === "undefined") return "th";
  const saved = window.localStorage.getItem("7being-lang");
  if (saved === "th" || saved === "zh" || saved === "en") return saved;
  const nav = window.navigator.language.toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("en")) return "en";
  return "th";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("th");

  useEffect(() => {
    setLangState(initialLang());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
    window.localStorage.setItem("7being-lang", lang);
    document.title = "7Being Studio";
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang: setLangState,
      t: (key) => STR[lang][key],
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
