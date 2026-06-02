import "./styles.css";
import type { Meta, ProblemDetail, ProblemSummary, TableRow } from "./types";

const app = document.getElementById("app")!;

let meta: Meta | null = null;
let rows: TableRow[] = [];
let activeCodeTab = 0;

function cellKey(language: string, label: string): string {
  return `${language}|${label}`;
}

function isExcludedFromGeneration(summary: ProblemSummary | null): boolean {
  if (!summary?.stop_reason) return false;
  const reason = summary.stop_reason.toLowerCase();
  return reason === "time_limit" || reason === "solution_limit";
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
    const sec = summary.runtime_sec;
    if (sec != null && sec > 0) {
      return `time_limit (${Math.round(sec)}s)`;
    }
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
  const limit = formatLimitLine(summary);
  const title = [
    type,
    `solution space: ${space}`,
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
        <th class="sticky-col-3" rowspan="2" title="CSP/COP · solution space · stop reason">Type / Space</th>
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
      const excluded = isExcludedFromGeneration(row.summary);
      const rowClass = excluded ? "row-excluded-generation" : "";
      const rowTitle = excluded
        ? "Excluded from data generation (reference run hit time or solution limit)"
        : "";
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
    ? `${detail.summary.problem_type} · space ${formatSpaceSize(detail.summary.solution_space_size)} · ${formatLimitLine(detail.summary)}`
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
    const [metaRes, tableRes] = await Promise.all([
      fetch("/api/meta"),
      fetch("/api/table"),
    ]);
    if (!metaRes.ok || !tableRes.ok) {
      throw new Error("API request failed");
    }
    meta = await metaRes.json();
    const tableData = await tableRes.json();
    rows = (tableData.rows as TableRow[]).sort((a, b) =>
      a.problem_id.localeCompare(b.problem_id)
    );
    renderPage();
  } catch (err) {
    app.innerHTML = `<div class="error-banner">Could not load data. Start the API server (uvicorn) and refresh.<br>${escapeHtml(String(err))}</div>`;
  }
}

init();
