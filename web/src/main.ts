import "./styles.css";
import type { DetailedStats, Meta, ProblemDetail, ProblemSummary, TableRow } from "./types";

const app = document.getElementById("app")!;

let meta: Meta | null = null;
let rows: TableRow[] = [];
let detailedStats: DetailedStats | null = null;
let activeCodeTab = 0;

function cellKey(language: string, label: string): string {
  return `${language}|${label}`;
}

function isExcludedFromGeneration(summary: ProblemSummary | null): boolean {
  if (!summary?.stop_reason) return false;
  const reason = summary.stop_reason.toLowerCase();
  return reason === "time_limit" || reason === "solution_limit";
}

function isSlowRuntime(summary: ProblemSummary | null): boolean {
  const sec = summary?.runtime_sec;
  return sec != null && sec > 60;
}

function rowHighlight(summary: ProblemSummary | null): {
  className: string;
  title: string;
} {
  if (isExcludedFromGeneration(summary)) {
    return {
      className: "row-excluded-generation",
      title: "Excluded from data generation (reference run hit time or solution limit)",
    };
  }
  if (isSlowRuntime(summary)) {
    return {
      className: "row-slow-runtime",
      title: "Reference run took more than 60 seconds",
    };
  }
  return { className: "", title: "" };
}

function filterRows(filter: string, familyFilter: string): TableRow[] {
  const q = filter.trim().toLowerCase();
  return rows
    .filter((row) => {
      if (familyFilter && row.family !== familyFilter) return false;
      if (!q) return true;
      return (
        row.problem_id.toLowerCase().includes(q) ||
        row.family.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.problem_id.localeCompare(b.problem_id));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  return JSON.stringify(value, null, 2);
}

function formatSpaceSize(size: number | null | undefined): string {
  if (size === null || size === undefined) return "—";
  const n = size;
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return Number.isInteger(v) ? `${v}M` : `${v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return Number.isInteger(v) ? `${v}K` : `${v.toFixed(1)}K`;
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatRuntimeSec(sec: number | null | undefined): string {
  if (sec == null || sec < 0) return "—";
  if (sec < 0.01) return `${(sec * 1000).toFixed(0)}ms`;
  if (sec < 10) return `${sec.toFixed(2)}s`;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  return `${Math.round(sec)}s`;
}

const CODE_NOT_AVAILABLE =
  "Code not available for this attempt (only metadata was stored).";

function attemptCodeText(
  attempt: { code?: string | null } | undefined
): string {
  const code = attempt?.code;
  if (code != null && code.trim() !== "") {
    return code;
  }
  return CODE_NOT_AVAILABLE;
}

function formatLimitLine(summary: ProblemSummary): string {
  const reason = summary.stop_reason || "";
  if (reason === "complete") {
    return summary.is_solution_space_complete ? "complete" : "complete*";
  }
  if (reason === "time_limit") {
    return "time_limit";
  }
  if (reason === "solution_limit") {
    const cap = summary.solution_space_size;
    if (cap != null) {
      return `solution_limit (${formatSpaceSize(cap)})`;
    }
    return "solution_limit";
  }
  return reason || "—";
}

function renderSummaryCell(summary: ProblemSummary | null): string {
  if (!summary) {
    return `<td class="sticky-col-3 summary-cell"><span class="summary-missing">—</span></td>`;
  }
  const type = summary.problem_type || "—";
  const typeClass = type === "COP" ? "cop" : type === "CSP" ? "csp" : "";
  const space = formatSpaceSize(summary.solution_space_size);
  const runtime = formatRuntimeSec(summary.runtime_sec);
  const limit = formatLimitLine(summary);
  const title = [
    type,
    `solution space: ${space}`,
    `runtime: ${runtime}`,
    limit,
    summary.is_solution_space_complete === false ? "(space incomplete)" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <td class="sticky-col-3 summary-cell" title="${escapeHtml(title)}">
      <div class="summary-block">
        <span class="summary-type ${typeClass}">${escapeHtml(type)}</span>
        <span class="summary-space">space ${escapeHtml(space)}</span>
        <span class="summary-runtime">${escapeHtml(runtime)}</span>
        <span class="summary-limit">${escapeHtml(limit)}</span>
      </div>
    </td>
  `;
}

function renderTableHeader(): string {
  if (!meta) return "";
  const langCols = meta.languages
    .map(
      (lang) =>
        `<th class="lang-header" colspan="${meta!.labels.length}">${escapeHtml(lang)}</th>`
    )
    .join("");

  const labelCols = meta.languages
    .flatMap((lang) =>
      meta!.labels.map(
        (label) =>
          `<th title="${escapeHtml(lang)} · ${escapeHtml(label)}">${escapeHtml(label)}</th>`
      )
    )
    .join("");

  return `
    <thead>
      <tr>
        <th class="sticky-col-index" rowspan="2">#</th>
        <th class="sticky-col" rowspan="2">Family</th>
        <th class="sticky-col-2 sorted-col" rowspan="2" title="Sorted A→Z">Problem ID ↑</th>
        <th class="sticky-col-3" rowspan="2" title="CSP/COP · solution space · runtime · stop reason">Type / Space</th>
        ${langCols}
      </tr>
      <tr>${labelCols}</tr>
    </thead>
  `;
}

function renderCell(
  row: TableRow,
  language: string,
  label: string
): string {
  const key = cellKey(language, label);
  const cell = row.cells[key];
  if (!cell) return "<td>—</td>";

  let statusClass = "missing";
  let statusText = "—";
  if (cell.status === "recorded") {
    if (cell.succeed) {
      statusClass = "success";
      statusText = "succeed";
    } else {
      statusClass = "fail";
      statusText = "failed";
    }
  }

  const attempts =
    cell.attempts > 0 ? `${cell.attempts} attempt${cell.attempts === 1 ? "" : "s"}` : "0 attempts";

  return `
    <td>
      <button
        type="button"
        class="cell-btn ${statusClass}"
        data-problem-id="${escapeHtml(row.problem_id)}"
        data-language="${escapeHtml(language)}"
        data-label="${escapeHtml(label)}"
        title="View details"
      >
        <span class="status">${statusText}</span>
        <span class="attempts">${attempts}</span>
      </button>
    </td>
  `;
}

function renderTableBody(filter: string, familyFilter: string): string {
  if (!meta) return "";
  const filtered = filterRows(filter, familyFilter);

  const body = filtered
    .map((row, index) => {
      const cells = meta!.languages
        .flatMap((lang) =>
          meta!.labels.map((label) => renderCell(row, lang, label))
        )
        .join("");
      const highlight = rowHighlight(row.summary);
      const rowClass = highlight.className;
      const rowTitle = highlight.title;
      return `
        <tr class="${rowClass}"${rowTitle ? ` title="${escapeHtml(rowTitle)}"` : ""}>
          <td class="sticky-col-index row-num">${index + 1}</td>
          <td class="sticky-col"><span class="family-tag" title="${escapeHtml(row.family)}">${escapeHtml(row.family)}</span></td>
          <td class="sticky-col-2">${escapeHtml(row.problem_id)}</td>
          ${renderSummaryCell(row.summary)}
          ${cells}
        </tr>
      `;
    })
    .join("");

  return `<tbody>${body}</tbody>`;
}

type LangStats = {
  problems: number;
  succeeded: number;
  byLabel: Record<string, number>;
};

type BenchStats = {
  perLang: Record<string, LangStats>;
  overall: LangStats;
};

function computeStats(): BenchStats {
  const LABEL_KEYS = [
    "equivalent",
    "unsound",
    "incomplete",
    "unsound-incomplete",
    "non-executable",
  ];

  if (!meta) {
    return { perLang: {}, overall: { problems: 0, succeeded: 0, byLabel: {} } };
  }

  const subset = [...rows].sort((a, b) =>
    a.problem_id.localeCompare(b.problem_id)
  );

  const perLang: Record<string, LangStats> = {};
  for (const lang of meta.languages) {
    perLang[lang] = { problems: 0, succeeded: 0, byLabel: {} };
    for (const lbl of LABEL_KEYS) perLang[lang].byLabel[lbl] = 0;
  }

  const overallProblems = new Set<string>();

  for (const row of subset) {
    for (const lang of meta.languages) {
      const hasAnyCell = meta.labels.some((lbl) => {
        const cell = row.cells[cellKey(lang, lbl)];
        return cell && cell.status === "recorded";
      });
      if (hasAnyCell) {
        perLang[lang].problems += 1;
        overallProblems.add(row.problem_id);
      }
      for (const lbl of LABEL_KEYS) {
        const cell = row.cells[cellKey(lang, lbl)];
        if (cell && cell.succeed === true) {
          perLang[lang].byLabel[lbl] += 1;
          perLang[lang].succeeded += 1;
        }
      }
    }
  }

  // Overall = simple sum across all languages (each lang-problem-label counted independently)
  const overallByLabel: Record<string, number> = {};
  for (const lbl of LABEL_KEYS) {
    overallByLabel[lbl] = meta.languages.reduce(
      (sum, lang) => sum + (perLang[lang].byLabel[lbl] ?? 0),
      0
    );
  }
  const overallSucceeded = meta.languages.reduce(
    (sum, lang) => sum + perLang[lang].succeeded,
    0
  );

  return {
    perLang,
    overall: {
      problems: overallProblems.size,
      succeeded: overallSucceeded,
      byLabel: overallByLabel,
    },
  };
}

const LABEL_DISPLAY: { key: string; short: string; title: string; colorClass: string }[] = [
  { key: "equivalent",        short: "EQ",      title: "Equivalent",        colorClass: "lstat-eq"      },
  { key: "unsound",           short: "UNS",     title: "Unsound",           colorClass: "lstat-uns"     },
  { key: "incomplete",        short: "INC",     title: "Incomplete",        colorClass: "lstat-inc"     },
  { key: "unsound-incomplete",short: "MIX",     title: "Unsound-Incomplete",colorClass: "lstat-mix"     },
  { key: "non-executable",    short: "NONEXEC", title: "Non-Executable",    colorClass: "lstat-nonexec" },
];

function pct(n: number, total: number): string {
  if (!total) return "—";
  return (n / total * 100).toFixed(1) + "%";
}

function renderStats(): string {
  if (!meta) return "";
  const s = computeStats();
  const langs = meta.languages;

  const headerCols = langs
    .map((l) => `<th class="stats-col">${escapeHtml(l)}</th>`)
    .join("") + `<th class="stats-col stats-overall">Overall</th>`;

  function metaRow(label: string, getValue: (st: LangStats) => string): string {
    const cells = langs
      .map((l) => `<td class="stats-col">${getValue(s.perLang[l])}</td>`)
      .join("") + `<td class="stats-col stats-overall">${getValue(s.overall)}</td>`;
    return `<tr class="stats-meta-row"><td class="stats-label">${label}</td>${cells}</tr>`;
  }

  function labelRow(ld: typeof LABEL_DISPLAY[0]): string {
    const cells = langs.map((l) => {
      const n = s.perLang[l].byLabel[ld.key] ?? 0;
      const total = s.perLang[l].succeeded;
      return `<td class="stats-col">
        <span class="stats-count">${n}</span>
        <span class="stats-pct">(${pct(n, total)})</span>
      </td>`;
    }).join("");
    const on = s.overall.byLabel[ld.key] ?? 0;
    const ot = s.overall.succeeded;
    const overallCell = `<td class="stats-col stats-overall">
      <span class="stats-count">${on}</span>
      <span class="stats-pct">(${pct(on, ot)})</span>
    </td>`;
    return `<tr class="stats-label-row ${ld.colorClass}">
      <td class="stats-label">
        <span class="stats-short" title="${escapeHtml(ld.title)}">${ld.short}</span>
      </td>
      ${cells}${overallCell}
    </tr>`;
  }

  return `
    <div class="stats-card">
      <h2 class="stats-heading">Generation Statistics <span class="stats-subtitle">(all ${rows.length} problems)</span></h2>
      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th class="stats-label">Stat.</th>
              ${headerCols}
            </tr>
          </thead>
          <tbody>
            ${metaRow("Problems",  (st) => String(st.problems))}
            ${metaRow("Succeeded", (st) => `<strong>${st.succeeded}</strong>`)}
            <tr class="stats-divider"><td colspan="${langs.length + 2}"></td></tr>
            ${LABEL_DISPLAY.map(labelRow).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

const LABEL_SHORT: Record<string, string> = {
  "equivalent": "EQ",
  "unsound": "UNS",
  "incomplete": "INC",
  "unsound-incomplete": "MIX",
  "non-executable": "NONEXEC",
};

const LABEL_COLOR_CLASS: Record<string, string> = {
  "equivalent": "lstat-eq",
  "unsound": "lstat-uns",
  "incomplete": "lstat-inc",
  "unsound-incomplete": "lstat-mix",
  "non-executable": "lstat-nonexec",
};

function rateClass(rate: number): string {
  if (rate >= 80) return "rate-high";
  if (rate >= 50) return "rate-mid";
  return "rate-low";
}

function fmtAvg(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function fmtMed(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtTot(v: number): string {
  return v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(v);
}

import type { CaseStats } from "./types";

function statsRow(
  langLabel: string,
  labelKey: string | null,
  s: CaseStats,
  rowClass = ""
): string {
  const colorCls = labelKey ? LABEL_COLOR_CLASS[labelKey] ?? "" : "";
  const shortLabel = labelKey ? LABEL_SHORT[labelKey] ?? labelKey : langLabel;
  const isAllRow = labelKey === null;
  return `
    <tr class="dstat-row ${rowClass} ${colorCls}">
      <td class="dstat-label-col ${isAllRow ? "dstat-all-label" : "dstat-sub-label"}">
        ${isAllRow
          ? `<strong>${escapeHtml(shortLabel)}</strong>`
          : `<span class="dstat-short" title="${escapeHtml(labelKey ?? "")}">${escapeHtml(shortLabel)}</span>`}
      </td>
      <td class="dstat-num">${s.cases}</td>
      <td class="dstat-num dstat-succ">${s.succ}</td>
      <td class="dstat-num dstat-fail">${s.fail}</td>
      <td class="dstat-num">
        <span class="dstat-rate ${rateClass(s.rate)}">${s.rate.toFixed(1)}%</span>
      </td>
      <td class="dstat-num">${fmtTot(s.tot)}</td>
      <td class="dstat-num">${fmtAvg(s.avg)}</td>
      <td class="dstat-num">${fmtMed(s.med)}</td>
      <td class="dstat-num">${s.first}</td>
      <td class="dstat-num dstat-opp">${s.opp}</td>
    </tr>`;
}

function renderDetailedStats(): string {
  const ds = detailedStats;
  if (!ds) return "";

  const langRows = ds.languages.map((lang) => {
    const ld = ds.per_language[lang];
    if (!ld) return "";
    const labelRows = ds.label_keys
      .map((lbl) => {
        const s = ld.labels[lbl];
        return s ? statsRow("", lbl, s, "dstat-sub") : "";
      })
      .join("");
    return `
      <tbody class="dstat-lang-group">
        <tr class="dstat-lang-header">
          <td colspan="10" class="dstat-lang-name">${escapeHtml(lang)}</td>
        </tr>
        ${statsRow("All", null, ld.all, "dstat-lang-all")}
        ${labelRows}
      </tbody>`;
  }).join("");

  return `
    <div class="stats-card dstat-card">
      <h2 class="stats-heading">
        Benchmark construction outcomes
        <span class="stats-subtitle">(all ${ds.problem_count} problems · each case = problem–language–label)</span>
      </h2>
      <div class="stats-table-wrap">
        <table class="dstat-table">
          <thead>
            <tr>
              <th class="dstat-label-col">Label</th>
              <th class="dstat-num" title="Total cases attempted">Cases</th>
              <th class="dstat-num dstat-succ" title="Succeeded">Succ.</th>
              <th class="dstat-num dstat-fail" title="Failed">Fail.</th>
              <th class="dstat-num" title="Success rate">Rate</th>
              <th class="dstat-num" title="Total attempts">Tot.</th>
              <th class="dstat-num" title="Average attempts per case">Avg.</th>
              <th class="dstat-num" title="Median attempts per case">Med.</th>
              <th class="dstat-num" title="First-attempt successes">1st</th>
              <th class="dstat-num dstat-opp" title="Valid captures with oracle label ≠ target">Opp.</th>
            </tr>
          </thead>
          <tbody class="dstat-overall-body">
            ${statsRow("Overall", null, ds.overall, "dstat-overall")}
          </tbody>
          ${langRows}
        </table>
      </div>
      <p class="dstat-note">
        <em>Succ./Fail. = retained/failed cases · Rate = success rate · Tot./Avg./Med. = attempt counts ·
        1st = first-attempt success · Opp. = valid captures with oracle label ≠ target</em>
      </p>
    </div>`;
}

function renderPage(filter = "", familyFilter = ""): void {
  const families = [...new Set(rows.map((r) => r.family))].sort();
  const familyOptions = families
    .map(
      (f) =>
        `<option value="${escapeHtml(f)}" ${f === familyFilter ? "selected" : ""}>${escapeHtml(f)}</option>`
    )
    .join("");

  const filteredCount = filterRows(filter, familyFilter).length;

  app.innerHTML = `
    <header class="page-header">
      <h1>Benchmark Analyzer</h1>
      <p>DCP-Bench generation status · ${rows.length} problems · ${filteredCount} shown</p>
    </header>
    ${renderStats()}
    ${renderDetailedStats()}
    <div class="toolbar">
      <label>
        Search
        <input type="search" id="search-input" placeholder="Problem id or family…" value="${escapeHtml(filter)}" />
      </label>
      <label>
        Family
        <select id="family-filter">
          <option value="">All families</option>
          ${familyOptions}
        </select>
      </label>
    </div>
    <div class="table-wrap">
      <table class="benchmark-table">
        ${renderTableHeader()}
        ${renderTableBody(filter, familyFilter)}
      </table>
    </div>
    <div id="modal-root" class="modal-overlay hidden" aria-hidden="true"></div>
  `;

  document.getElementById("search-input")?.addEventListener("input", (e) => {
    const family = (document.getElementById("family-filter") as HTMLSelectElement).value;
    renderPage((e.target as HTMLInputElement).value, family);
    bindTableEvents();
  });

  document.getElementById("family-filter")?.addEventListener("change", (e) => {
    const search = (document.getElementById("search-input") as HTMLInputElement)?.value ?? "";
    renderPage(search, (e.target as HTMLSelectElement).value);
    bindTableEvents();
  });

  bindTableEvents();
}

function bindTableEvents(): void {
  document.querySelectorAll(".cell-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = btn as HTMLButtonElement;
      openDetail(
        el.dataset.problemId!,
        el.dataset.language!,
        el.dataset.label!
      );
    });
  });
}

async function openDetail(
  problemId: string,
  language: string,
  label: string
): Promise<void> {
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return;

  modalRoot.classList.remove("hidden");
  modalRoot.setAttribute("aria-hidden", "false");
  modalRoot.innerHTML = `<div class="modal"><div class="modal-body loading">Loading…</div></div>`;

  modalRoot.addEventListener(
    "click",
    (e) => {
      if (e.target === modalRoot) closeModal();
    },
    { once: true }
  );

  try {
    const res = await fetch(
      `/api/problem/${encodeURIComponent(problemId)}?language=${encodeURIComponent(language)}&label=${encodeURIComponent(label)}`
    );
    if (!res.ok) throw new Error(await res.text());
    const detail: ProblemDetail = await res.json();
    activeCodeTab = 0;
    renderModal(detail);
  } catch (err) {
    modalRoot.innerHTML = `<div class="modal"><div class="modal-body error-banner">Failed to load: ${escapeHtml(String(err))}</div></div>`;
  }
}

function closeModal(): void {
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return;
  modalRoot.classList.add("hidden");
  modalRoot.setAttribute("aria-hidden", "true");
  modalRoot.innerHTML = "";
}

function renderMetricsBlock(detail: ProblemDetail): string {
  const gc = detail.generated_codes;
  const fp = gc.final_fp;
  const fn = gc.final_fn;
  const spaceSize = gc.final_candidate_space_size;
  const truncated = gc.final_candidate_truncated;

  if (fp == null && fn == null && spaceSize == null) return "";

  const fpClass =
    fp == null ? "metric-na" : fp === 0 ? "metric-good" : "metric-bad";
  const fnClass =
    fn == null ? "metric-na" : fn === 0 ? "metric-good" : "metric-bad";

  const fpText = fp == null ? "—" : String(fp);
  const fnText = fn == null ? "—" : String(fn);
  const spaceText =
    spaceSize == null ? "—" : formatSpaceSize(spaceSize) + (truncated ? "*" : "");
  const spaceTitle = truncated
    ? "Candidate space was truncated (sample only)"
    : "";

  return `
    <div class="metrics-row">
      <span class="metric-item">
        <span class="metric-label">FP</span>
        <span class="metric-value ${fpClass}" title="False positives: solutions in generated model not in reference">${escapeHtml(fpText)}</span>
      </span>
      <span class="metric-item">
        <span class="metric-label">FN</span>
        <span class="metric-value ${fnClass}" title="False negatives: solutions in reference not in generated model">${escapeHtml(fnText)}</span>
      </span>
      <span class="metric-item">
        <span class="metric-label">Candidate space</span>
        <span class="metric-value metric-space" title="${escapeHtml(spaceTitle)}">${escapeHtml(spaceText)}</span>
      </span>
    </div>
  `;
}

function renderModal(detail: ProblemDetail): void {
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return;

  const gen = detail.generation;
  const genStatus =
    gen.succeed === null ? "—" : gen.succeed ? "succeed" : "failed";
  const codes = detail.generated_codes.attempts;
  const hasTabs = codes.length > 1;

  const tabs = codes
    .map((a, i) => {
      const label = `Attempt ${a.attempt}`;
      const meta = a.observed_label
        ? `${a.observed_label}${a.exec_status ? ` · ${a.exec_status}` : ""}`
        : "";
      return `<button type="button" class="code-tab ${i === activeCodeTab ? "active" : ""}" data-tab="${i}">
        ${escapeHtml(label)}
        ${meta ? `<span class="tab-meta">${escapeHtml(meta)}</span>` : ""}
      </button>`;
    })
    .join("");

  const active = codes[activeCodeTab] ?? codes[0];
  const codeText = codes.length
    ? attemptCodeText(active)
    : CODE_NOT_AVAILABLE;
  const codeUnavailable =
    codeText === CODE_NOT_AVAILABLE && codes.length > 0;

  const dvPills = detail.decision_variables
    .map((v) => `<span class="pill">${escapeHtml(v)}</span>`)
    .join("");

  const summaryLine = detail.summary
    ? `${detail.summary.problem_type} · space ${formatSpaceSize(detail.summary.solution_space_size)} · ${formatRuntimeSec(detail.summary.runtime_sec)} · ${formatLimitLine(detail.summary)}`
    : "";

  modalRoot.innerHTML = `
    <div class="modal" role="dialog" aria-labelledby="modal-title">
      <div class="modal-header">
        <div>
          <h2 id="modal-title">${escapeHtml(detail.id)}</h2>
          <p class="subtitle">
            ${escapeHtml(detail.family)} · ${escapeHtml(detail.language)} · ${escapeHtml(detail.label)}
            · generation: <strong>${escapeHtml(genStatus)}</strong>
            ${gen.attempts != null ? ` · ${gen.attempts} attempt(s)` : ""}
            ${gen.generator_llm ? ` · ${escapeHtml(gen.generator_llm)}` : ""}
            ${summaryLine ? `<br>${escapeHtml(summaryLine)}` : ""}
          </p>
          ${renderMetricsBlock(detail)}
        </div>
        <button type="button" class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <section class="section">
          <h3>Problem description</h3>
          <pre class="pre-block">${escapeHtml(detail.description)}</pre>
        </section>
        <section class="section">
          <h3>Decision variables</h3>
          <div class="pill-row">${dvPills || "<span class='pill'>—</span>"}</div>
        </section>
        <section class="section">
          <h3>Default instance</h3>
          <pre class="pre-block">${escapeHtml(detail.example_instance || "—")}</pre>
        </section>
        <section class="section">
          <h3>Sample solution</h3>
          <pre class="pre-block">${escapeHtml(formatJson(detail.example_solution))}</pre>
        </section>
        <section class="section section-compare">
          <h3>Code comparison${hasTabs ? ` · attempt ${active?.attempt ?? activeCodeTab + 1}` : ""}</h3>
          ${hasTabs ? `<div class="code-tabs">${tabs}</div>` : ""}
          ${active?.error_summary ? `<p class="stats">${escapeHtml(active.error_summary)}</p>` : ""}
          <div class="code-compare">
            <div class="code-compare-pane">
              <h4 class="code-compare-label">Reference model</h4>
              <pre class="pre-block code-panel">${escapeHtml(detail.model)}</pre>
            </div>
            <div class="code-compare-pane">
              <h4 class="code-compare-label">Generated</h4>
              ${
                codeUnavailable
                  ? `<p class="code-unavailable">${escapeHtml(codeText)}</p>`
                  : `<pre class="pre-block code-panel">${escapeHtml(codeText)}</pre>`
              }
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  modalRoot.querySelector(".modal-close")?.addEventListener("click", closeModal);

  modalRoot.querySelectorAll(".code-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeCodeTab = Number((tab as HTMLButtonElement).dataset.tab);
      renderModal(detail);
    });
  });
}

async function init(): Promise<void> {
  app.innerHTML = `<div class="loading">Loading benchmark data…</div>`;
  try {
    const [metaRes, tableRes, statsRes] = await Promise.all([
      fetch("/api/meta"),
      fetch("/api/table"),
      fetch("/api/stats"),
    ]);
    if (!metaRes.ok || !tableRes.ok) {
      throw new Error("API request failed");
    }
    meta = await metaRes.json();
    const tableData = await tableRes.json();
    rows = (tableData.rows as TableRow[]).sort((a, b) =>
      a.problem_id.localeCompare(b.problem_id)
    );
    if (statsRes.ok) {
      detailedStats = await statsRes.json();
    }
    renderPage();
  } catch (err) {
    app.innerHTML = `<div class="error-banner">Could not load data. Start the API server (uvicorn) and refresh.<br>${escapeHtml(String(err))}</div>`;
  }
}

init();
