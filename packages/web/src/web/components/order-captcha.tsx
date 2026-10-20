import { useEffect, useRef } from "react";
type Turnstile = { render: (el: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
export function OrderCaptcha({ siteKey, onToken, onError }: { siteKey: string; onToken: (token: string) => void; onError: (message: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const tokenCallback = useRef(onToken), errorCallback = useRef(onError);
  tokenCallback.current = onToken; errorCallback.current = onError;
  useEffect(() => {
    let cancelled = false, widget = "";
    const render = () => { if (cancelled || !ref.current || !window.turnstile) return;
      widget = window.turnstile.render(ref.current, { sitekey: siteKey, action: "order", theme: "light",
        callback: (token: string) => tokenCallback.current(token),
        "expired-callback": () => tokenCallback.current(""),
        "error-callback": () => { tokenCallback.current(""); errorCallback.current("Не удалось загрузить проверку от роботов. Обновите форму или свяжитесь с магазином."); },
      });
    };
    if (window.turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>('script[data-order-captcha]');
      if (!script) { script = document.createElement("script"); script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; script.dataset.orderCaptcha = "true"; document.head.appendChild(script); }
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", () => errorCallback.current("Проверка от роботов недоступна"), { once: true });
    }
    return () => { cancelled = true; if (widget && window.turnstile) window.turnstile.remove(widget); };
  }, [siteKey]);
  return <div ref={ref} aria-label="Проверка от роботов" />;
}
