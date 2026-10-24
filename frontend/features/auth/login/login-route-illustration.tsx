import styles from "./login.module.css";
import { useLocale } from "@/lib/i18n";
const routePath =
  "M 76 370 C 142 370 138 318 210 318 S 294 350 318 295 S 290 224 365 218 S 440 241 486 199 S 516 150 566 150";

const routeStops = [
  { label: "Pickup", x: 76, y: 370, labelX: 91, labelY: 394 },
  { label: "Transfer", x: 210, y: 318, labelX: 226, labelY: 300 },
  { label: "Handoff", x: 365, y: 218, labelX: 382, labelY: 201 },
  { label: "Delivery", x: 566, y: 150, labelX: 514, labelY: 133 },
] as const;

const compactRoutePath =
  "M 64 68 C 126 68 160 46 230 60 S 326 78 402 58 S 492 50 576 62";

const compactRouteStops = [
  { label: "", x: 64, y: 68, labelX: 64, labelY: 68 },
  { label: "", x: 230, y: 60, labelX: 230, labelY: 60 },
  { label: "", x: 402, y: 58, labelX: 402, labelY: 58 },
  { label: "", x: 576, y: 62, labelX: 576, labelY: 62 },
] as const;

function RouteMap({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  const stops = compact ? compactRouteStops : routeStops;
  const path = compact ? compactRoutePath : routePath;

  return (
    <svg
      {...(compact
        ? { "aria-hidden": "true" as const }
        : {
            role: "img" as const,
            "aria-labelledby": "login-route-svg-title login-route-svg-description",
          })}
      viewBox={compact ? "0 0 640 120" : "0 0 640 520"}
      preserveAspectRatio="xMidYMid meet"
      className={compact ? styles["login-route-map-mobile"] : styles["login-route-map-desktop"]}
    >
      {!compact && (
        <>
          <title id="login-route-svg-title">
            {t("Route from pickup through transfer and handoff to delivery")}
          </title>
          <desc id="login-route-svg-description">
            {t("Four marked stages follow one highlighted delivery route. A signal moves along the route.")}
          </desc>

          <g
            className={`${styles["login-route-technical"]}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.065"
            strokeWidth="1"
          >
            <path d="M-30 94H148l43 34h127M-20 119h156l50 40h76M-20 467h154l40-38h104M408 60v54l38 30h226M450 82v39l46 35h184M467 440h84l39-36h85M495 463h66l52-53h62" />
            <path d="M75 0v99l28 23v57M119 0v78l30 25v84M542 278h55l42 38v75M575 263h40l49 43v106M236 0v73l32 28v58M300 438v38l-27 27v45" />
            <path d="M22 243c43-50 86-51 126-8m328-34c35-45 75-49 118-16M63 506c36-36 76-39 113-9m270-380c44-36 87-35 129 2" />
          </g>
        </>
      )}

      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeOpacity={compact ? "0.12" : "0.08"}
        strokeWidth={compact ? "22" : "34"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      <path
        d={path}
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.95"
        strokeWidth={compact ? "2" : "2.5"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {!compact && (
        <path
          data-testid="login-route-seam-path"
          d="M 566 150 C 588 150 602 150 624 150"
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.34"
          strokeWidth="2"
          strokeDasharray="2 8"
          strokeLinecap="round"
        />
      )}

      {stops.map((stop, index) => (
        <g key={stop.label || index}>
          <circle
            className={`${styles["login-route-node-pulse"]}`}
            cx={stop.x}
            cy={stop.y}
            r={compact ? "10" : "13"}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1.5"
            style={{ animationDelay: `${index * 650}ms` }}
          />
          <circle
            cx={stop.x}
            cy={stop.y}
            r={compact ? "6" : "7"}
            fill="var(--brand-navy)"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx={stop.x} cy={stop.y} r="2.5" fill="var(--primary)" />
          {!compact && (
            <text
              className={`${styles["login-route-label"]}`}
              x={stop.labelX}
              y={stop.labelY}
              fill="currentColor"
              fillOpacity="0.92"
              fontFamily="var(--font-inter), sans-serif"
              fontSize="12"
              fontWeight="600"
              letterSpacing="0.3"
            >
              {stop.label ? t(stop.label) : ""}
            </text>
          )}
        </g>
      ))}

      <circle
        data-testid="login-route-signal"
        className={`${styles["login-route-signal"]}`}
        r={compact ? "4" : "5"}
        fill="var(--primary)"
        stroke="var(--brand-navy)"
        strokeWidth="2"
      >
        <animateMotion
          dur="18s"
          begin="0s"
          repeatCount="indefinite"
          rotate="auto"
          path={path}
        />
      </circle>
      <circle
        className={`${styles["login-route-signal-static"]}`}
        cx={stops[0].x}
        cy={stops[0].y}
        r={compact ? "4" : "5"}
        fill="var(--primary)"
        stroke="var(--brand-navy)"
        strokeWidth="2"
      />
    </svg>
  );
}

export function LoginRouteIllustration() {
  const { t } = useLocale();
  return (
    <aside
      aria-labelledby="login-route-heading"
      data-testid="login-route-panel"
      className={`${styles["login-route-panel"]} order-2 relative isolate flex min-h-[148px] flex-col overflow-hidden bg-brand-navy text-white lg:order-1 lg:min-h-svh lg:px-12 lg:py-12 xl:px-16`}
    >
      <div className="login-route-copy relative z-10 max-w-xl">
        <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-white/80 lg:block">
          {t("Fleetora / Route systems")}
        </p>
        <h2 id="login-route-heading" className="sr-only lg:not-sr-only lg:mt-7 lg:max-w-lg lg:text-4xl lg:font-semibold lg:leading-[1.12] lg:tracking-[-0.035em] xl:text-[44px]">
          {t("Every handoff,")}
          <br />
          <span className="text-primary">{t("in view.")}</span>
        </h2>
        <p className="mt-4 hidden max-w-sm text-base leading-7 text-white/80 lg:block">
          {t("Clear visibility from pickup to delivery.")}
        </p>
      </div>
      <p className="sr-only">{t("Routes from pickup through transfer and handoff to delivery.")}</p>
      <RouteMap />
      <RouteMap compact />
    </aside>
  );
}
