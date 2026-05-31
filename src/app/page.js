"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Home,
  Loader2,
  MapPin,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp
} from "lucide-react";

const verdictCopy = {
  yes: { label: "Yes", icon: CheckCircle2, className: "yes" },
  maybe: { label: "Maybe", icon: AlertTriangle, className: "maybe" },
  no: { label: "No", icon: ThumbsDown, className: "no" }
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function pct(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

export default function HomePage() {
  const [address, setAddress] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function analyze(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setReport(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, purchasePrice: Number(purchasePrice) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Analysis failed.");
      setReport(payload);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="input-panel" aria-label="Property analysis form">
          <div className="brand-lockup">
            <div className="brand-icon">
              <Home size={23} />
            </div>
            <div>
              <p className="eyebrow">Property screen</p>
              <h1>Should I Buy The House?</h1>
            </div>
          </div>

          <form onSubmit={analyze} className="analysis-form">
            <label>
              <span>US property address</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="123 Main St, Atlanta, GA"
                autoComplete="street-address"
                required
              />
            </label>
            <label>
              <span>Expected purchase price</span>
              <input
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(event.target.value)}
                placeholder="350000"
                inputMode="numeric"
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <BarChart3 size={18} />}
              Analyze property
            </button>
          </form>

          <div className="assumption-box">
            <p>V1 screening uses free/free-tier data first. Missing paid data lowers confidence instead of being guessed.</p>
          </div>
        </aside>

        <section className="report-area" aria-live="polite">
          {loading && <LoadingReport />}
          {error && <ErrorState message={error} />}
          {!loading && !error && !report && <EmptyState />}
          {report && <Report report={report} />}
        </section>
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <MapPin size={42} />
      <h2>Enter an address to start the investment screen.</h2>
      <p>The report will combine estimated rent, risk signals, comps, trend confidence, and source caveats into one verdict.</p>
    </div>
  );
}

function LoadingReport() {
  return (
    <div className="loading-state">
      <Loader2 className="spin" size={36} />
      <h2>Checking property signals</h2>
      <p>Normalizing the address, gathering available sources, and calculating a grounded verdict.</p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="error-state">
      <ShieldAlert size={38} />
      <h2>Could not complete the analysis</h2>
      <p>{message}</p>
    </div>
  );
}

function Report({ report }) {
  const verdict = verdictCopy[report.verdict] || verdictCopy.maybe;
  const VerdictIcon = verdict.icon;
  const sourceCounts = useMemo(() => {
    return report.sources.reduce(
      (counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }),
      {}
    );
  }, [report.sources]);

  return (
    <div className="report-grid">
      <section className={`verdict-panel ${verdict.className}`}>
        <div>
          <p className="eyebrow">Investment verdict</p>
          <div className="verdict-title">
            <VerdictIcon size={34} />
            <span>{verdict.label}</span>
          </div>
          <p>{report.summary}</p>
        </div>
        <div className="score-ring">
          <strong>{report.score}</strong>
          <span>/100</span>
        </div>
      </section>

      <section className="wide-card">
        <div className="section-heading">
          <h2>{report.address}</h2>
          <span className={`confidence ${report.confidence}`}>{report.confidence} confidence</span>
        </div>
        <div className="metric-grid">
          <Metric icon={DollarSign} label="Estimated rent" value={money(report.financials.rentEstimate)} />
          <Metric icon={BarChart3} label="Gross yield" value={pct(report.financials.grossYield)} />
          <Metric icon={Clock} label="Monthly cash flow" value={money(report.financials.estimatedCashFlow)} />
          <Metric icon={Home} label="Purchase price" value={money(report.financials.purchasePrice)} />
        </div>
      </section>

      <section className="card">
        <h2>Pros</h2>
        <ReasonList items={report.pros} fallback="No clear positive signals were available." icon={ThumbsUp} />
      </section>

      <section className="card">
        <h2>Cons</h2>
        <ReasonList items={report.cons} fallback="No major negative signals were found in available data." icon={ThumbsDown} />
      </section>

      <section className="wide-card">
        <div className="section-heading">
          <h2>Live environment ratings</h2>
          <span>{report.components.environment}/100 environment</span>
        </div>
        <div className="rating-list">
          {report.environment.map((item) => (
            <div className="rating-row" key={item.label}>
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
              <span className={`severity ${item.severity}`}>{item.score ?? "N/A"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Rental comps</h2>
        <div className="comp-list">
          {report.comps.map((comp) => (
            <div className="comp-row" key={comp.label}>
              <span>{comp.label}</span>
              <strong>{money(comp.rent)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Historical trends</h2>
        <p className="trend-label">{report.trends.label}</p>
        <p>{report.trends.detail}</p>
        <div className="trend-score">{report.trends.score}/100 trend signal</div>
      </section>

      <section className="wide-card">
        <div className="section-heading">
          <h2>Sources & caveats</h2>
          <span>{sourceCounts.available || 0} available / {sourceCounts.partial || 0} partial</span>
        </div>
        <div className="caveat-grid">
          <div>
            <h3>Caveats</h3>
            <ul>
              {report.caveats.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <h3>Sources</h3>
            <ul className="source-list">
              {report.sources.map((item) => (
                <li key={`${item.name}-${item.detail}`}>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.name} <ExternalLink size={13} />
                    </a>
                  ) : (
                    <span>{item.name}</span>
                  )}
                  <em>{item.status}: {item.detail}</em>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReasonList({ items, fallback, icon: Icon }) {
  const list = items.length ? items : [fallback];
  return (
    <ul className="reason-list">
      {list.map((item) => (
        <li key={item}>
          <Icon size={17} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
