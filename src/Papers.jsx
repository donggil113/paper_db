// 논문 서재 본체 — 목록 · 요약 모음 · 상세 · 편집
// · 논문 1건 = 분야(field) 1개 + 주제(topic) 여러 개. 정리 순서(sort_order)대로 번호가 붙는다.
// · 로그인 여부는 App.jsx 가 가리므로 여기서는 항상 로그인된 사용자를 가정한다.
// · 데이터는 Supabase 에 저장되며 RLS 로 본인 행만 보인다 (supabase/migrations/001_papers.sql)
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Clock,
  Download, ExternalLink, Eye, FileText, Hash, Heart, Info, Layers, LayoutList, Link2, Pencil, Plus,
  Quote, ScrollText, Search, Settings2, Sparkles, Star, Tag, Trash2, X,
} from "lucide-react";
import { Markdown } from "./markdown.jsx";

// ─── 상수 ─────────────────────────────────────────────────────────
const SUMMARY_SECTIONS = [
  { key: "problem",     label: "연구 배경 · 문제 정의", hint: "이 논문이 풀려는 문제, 기존 연구의 한계, 연구 동기" },
  { key: "method",      label: "제안 방법",             hint: "핵심 아이디어, 모델·알고리즘 구조, 실험 설계" },
  { key: "results",     label: "주요 결과",             hint: "핵심 수치, 비교 결과, 새로 발견한 사실" },
  { key: "limitations", label: "한계 · 비판",           hint: "가정의 한계, 재현성, 일반화 가능성, 아쉬운 점" },
  { key: "takeaways",   label: "내 생각 · 적용점",       hint: "내 연구에 어떻게 연결할지, 후속 아이디어" },
];

const STATUS = {
  unread:  { label: "읽기 전", color: "#64748b", bg: "#f1f5f9", Icon: Circle },
  reading: { label: "읽는 중", color: "#b45309", bg: "#fef3c7", Icon: Clock },
  done:    { label: "읽음",   color: "#047857", bg: "#d1fae5", Icon: CheckCircle2 },
};
const STATUS_KEYS = ["unread", "reading", "done"];
const FIELD_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#475569"];
const SORTS = [
  { id: "order",   label: "정리 순서" },
  { id: "year",    label: "연도순 (최신)" },
  { id: "title",   label: "제목순" },
  { id: "created", label: "최근 추가순" },
  { id: "rating",  label: "평점순" },
];
const EMPTY_FORM = {
  title: "", authors: "", year: "", venue: "", doi: "", url: "", pdf_url: "", abstract: "",
  field_id: "", topic_ids: [], reading_status: "unread", rating: 0, favorite: false, read_at: "",
  tldr: "", summary: {}, notes: "",
};

// ─── 유틸 ─────────────────────────────────────────────────────────
function clean(v) {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
}
function softColor(hex, alpha = 0.14) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(79,70,229,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
function doiUrl(doi) {
  const d = clean(doi);
  if (!d) return null;
  return `https://doi.org/${d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`;
}
// 사용자가 적은 링크를 안전한 href 로: http(s) 만 허용, 스킴이 빠진 도메인은 https:// 를 붙인다
function toHref(u) {
  const s = clean(u);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/?#]|$)/i.test(s)) return `https://${s}`;
  return null;
}
// 한글 입력기(IME) 조합 중 Enter 는 글자 확정용이므로 무시한다
function isComposing(e) {
  return !!(e.nativeEvent?.isComposing || e.keyCode === 229);
}
function citation(p) {
  let s = [p.authors, p.year ? `(${p.year})` : null].filter(Boolean).join(" ");
  s += (s ? ". " : "") + p.title + ".";
  if (p.venue) s += ` ${p.venue}.`;
  if (p.doi) s += ` ${doiUrl(p.doi)}`;
  return s;
}
function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
function summarySections(p) {
  return SUMMARY_SECTIONS.filter((s) => clean(p.summary?.[s.key]));
}
function hasSummary(p) {
  return !!clean(p.tldr) || summarySections(p).length > 0;
}
function normalizeRow(row) {
  return {
    ...row,
    summary: row.summary && typeof row.summary === "object" ? row.summary : {},
    topic_ids: (row.paper_topic_links || []).map((l) => l.topic_id),
  };
}
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function toMarkdown(list, { fieldById, topicById, orderIndex }) {
  const out = ["# 논문 요약 모음", "", `생성일: ${fmtDate(new Date())} · 총 ${list.length}편`, ""];
  list.forEach((p) => {
    const field = fieldById[p.field_id];
    const topicNames = p.topic_ids.map((id) => topicById[id]?.name).filter(Boolean);
    out.push(`## ${orderIndex[p.id] ? `${orderIndex[p.id]}. ` : ""}${p.title}`);
    if (p.authors) out.push(`- 저자: ${p.authors}`);
    if (p.venue || p.year) out.push(`- 출처: ${[p.venue, p.year].filter(Boolean).join(", ")}`);
    if (field) out.push(`- 분야: ${field.name}`);
    if (topicNames.length) out.push(`- 주제: ${topicNames.join(", ")}`);
    out.push(`- 상태: ${STATUS[p.reading_status]?.label || ""}${p.rating ? ` · 평점: ${"★".repeat(p.rating)}${"☆".repeat(5 - p.rating)}` : ""}`);
    if (p.doi) out.push(`- DOI: ${doiUrl(p.doi)}`);
    if (p.url) out.push(`- 링크: ${p.url}`);
    out.push("");
    if (clean(p.tldr)) out.push(`**한 줄 요약:** ${p.tldr}`, "");
    summarySections(p).forEach((s) => out.push(`### ${s.label}`, "", String(p.summary[s.key]).trim(), ""));
    if (clean(p.notes)) out.push("### 메모", "", String(p.notes).trim(), "");
    out.push("---", "");
  });
  return out.join("\n");
}

// ─── 서재 본체 ────────────────────────────────────────────────────
export default function Papers({ supabase, userId, toast }) {
  const [fields, setFields] = useState([]);
  const [topics, setTopics] = useState([]);
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  const [fieldFilter, setFieldFilter] = useState("all");   // all | none | <field id>
  const [topicFilter, setTopicFilter] = useState(null);    // null | <topic id>
  const [statusFilter, setStatusFilter] = useState("all"); // all | unread | reading | done | fav
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("order");
  const [view, setView] = useState("list");                // list | digest
  const [digestFull, setDigestFull] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [editor, setEditor] = useState(null);              // { paper: null | 논문 }
  const [manage, setManage] = useState(false);

  // ── 불러오기 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [f, t, p] = await Promise.all([
        supabase.from("paper_fields").select("*").order("sort_order").order("name"),
        supabase.from("paper_topics").select("*").order("name"),
        supabase.from("papers").select("*, paper_topic_links(topic_id)").order("sort_order").order("created_at"),
      ]);
      if (cancelled) return;
      setLoading(false);
      const err = f.error || t.error || p.error;
      if (err) { toast(`논문 데이터를 불러오지 못했습니다: ${err.message}`, "error"); return; }
      setFields(f.data || []);
      setTopics(t.data || []);
      setPapers((p.data || []).map(normalizeRow));
    })();
    return () => { cancelled = true; };
  }, [supabase, userId, tick, toast]);

  // ── 파생 데이터 ──
  const fieldById = useMemo(() => Object.fromEntries(fields.map((f) => [f.id, f])), [fields]);
  const topicById = useMemo(() => Object.fromEntries(topics.map((t) => [t.id, t])), [topics]);
  const orderedAll = useMemo(
    () => papers.slice().sort((a, b) => (a.sort_order - b.sort_order) || String(a.created_at || "").localeCompare(String(b.created_at || ""))),
    [papers],
  );
  const orderIndex = useMemo(() => {
    const m = {};
    orderedAll.forEach((p, i) => { m[p.id] = i + 1; });
    return m;
  }, [orderedAll]);
  const fieldCounts = useMemo(() => {
    const m = { none: 0 };
    papers.forEach((p) => {
      if (p.field_id && fieldById[p.field_id]) m[p.field_id] = (m[p.field_id] || 0) + 1;
      else m.none += 1;
    });
    return m;
  }, [papers, fieldById]);
  const topicTotals = useMemo(() => {
    const m = {};
    papers.forEach((p) => p.topic_ids.forEach((id) => { m[id] = (m[id] || 0) + 1; }));
    return m;
  }, [papers]);
  // 선택한 분야 안의 논문만 (주제 목록·개수는 이 범위 기준)
  const scoped = useMemo(() => {
    if (fieldFilter === "all") return papers;
    if (fieldFilter === "none") return papers.filter((p) => !p.field_id || !fieldById[p.field_id]);
    return papers.filter((p) => p.field_id === fieldFilter);
  }, [papers, fieldFilter, fieldById]);
  const topicCounts = useMemo(() => {
    const m = {};
    scoped.forEach((p) => p.topic_ids.forEach((id) => { m[id] = (m[id] || 0) + 1; }));
    return m;
  }, [scoped]);
  const visibleTopics = useMemo(() => {
    const list = fieldFilter === "all" ? topics : topics.filter((t) => topicCounts[t.id]);
    return list.slice().sort((a, b) => (topicCounts[b.id] || 0) - (topicCounts[a.id] || 0) || a.name.localeCompare(b.name, "ko"));
  }, [topics, topicCounts, fieldFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = scoped;
    if (topicFilter) list = list.filter((p) => p.topic_ids.includes(topicFilter));
    if (statusFilter === "fav") list = list.filter((p) => p.favorite);
    else if (statusFilter !== "all") list = list.filter((p) => p.reading_status === statusFilter);
    if (q) {
      list = list.filter((p) => {
        const hay = [
          p.title, p.authors, p.venue, p.tldr, p.abstract, p.notes, p.doi, p.year,
          ...SUMMARY_SECTIONS.map((s) => p.summary?.[s.key]),
          ...p.topic_ids.map((id) => topicById[id]?.name),
          fieldById[p.field_id]?.name,
        ].filter(Boolean).join("\n").toLowerCase();
        return hay.includes(q);
      });
    }
    const cmp = {
      order:   (a, b) => orderIndex[a.id] - orderIndex[b.id],
      year:    (a, b) => (b.year || 0) - (a.year || 0) || orderIndex[a.id] - orderIndex[b.id],
      title:   (a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ko"),
      created: (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")),
      rating:  (a, b) => (b.rating || 0) - (a.rating || 0) || orderIndex[a.id] - orderIndex[b.id],
    }[sortBy] || ((a, b) => orderIndex[a.id] - orderIndex[b.id]);
    return list.slice().sort(cmp);
  }, [scoped, topicFilter, statusFilter, query, sortBy, orderIndex, topicById, fieldById]);

  const stats = useMemo(() => ({
    total: papers.length,
    done: papers.filter((p) => p.reading_status === "done").length,
    reading: papers.filter((p) => p.reading_status === "reading").length,
    summarized: papers.filter(hasSummary).length,
  }), [papers]);

  const detail = detailId ? papers.find((p) => p.id === detailId) : null;
  const detailIdx = detail ? filtered.findIndex((p) => p.id === detail.id) : -1;
  const prevPaper = detailIdx > 0 ? filtered[detailIdx - 1] : null;
  const nextPaper = detailIdx >= 0 && detailIdx < filtered.length - 1 ? filtered[detailIdx + 1] : null;
  const filterActive = fieldFilter !== "all" || !!topicFilter || statusFilter !== "all" || !!query.trim();

  function selectField(id) { setFieldFilter(id); setTopicFilter(null); }
  function clearFilters() { setFieldFilter("all"); setTopicFilter(null); setStatusFilter("all"); setQuery(""); }

  // ── 분야 ──
  async function createField(name) {
    const n = clean(name);
    if (!n) return null;
    const dup = fields.find((f) => f.name.toLowerCase() === n.toLowerCase());
    if (dup) return dup;
    const color = FIELD_COLORS[fields.length % FIELD_COLORS.length];
    const { data, error } = await supabase.from("paper_fields").insert({ user_id: userId, name: n, color, sort_order: fields.length + 1 }).select().single();
    if (error) { toast(`분야 추가 실패: ${error.message}`, "error"); return null; }
    setFields((prev) => [...prev, data]);
    return data;
  }
  async function updateField(id, patch) {
    const { error } = await supabase.from("paper_fields").update(patch).eq("id", id);
    if (error) { toast(`분야 수정 실패: ${error.message}`, "error"); return false; }
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    return true;
  }
  async function deleteField(field) {
    const n = fieldCounts[field.id] || 0;
    if (!window.confirm(`분야 "${field.name}"을(를) 삭제할까요?${n ? `\n논문 ${n}편은 '분야 없음'으로 바뀝니다.` : ""}`)) return;
    const { error } = await supabase.from("paper_fields").delete().eq("id", field.id);
    if (error) { toast(`분야 삭제 실패: ${error.message}`, "error"); return; }
    setFields((prev) => prev.filter((f) => f.id !== field.id));
    setPapers((prev) => prev.map((p) => (p.field_id === field.id ? { ...p, field_id: null } : p)));
    if (fieldFilter === field.id) selectField("all");
  }

  // ── 주제 ──
  async function createTopic(name) {
    const n = clean(name);
    if (!n) return null;
    const dup = topics.find((t) => t.name.toLowerCase() === n.toLowerCase());
    if (dup) return dup;
    const { data, error } = await supabase.from("paper_topics").insert({ user_id: userId, name: n }).select().single();
    if (error) { toast(`주제 추가 실패: ${error.message}`, "error"); return null; }
    setTopics((prev) => [...prev, data]);
    return data;
  }
  async function updateTopic(id, patch) {
    const { error } = await supabase.from("paper_topics").update(patch).eq("id", id);
    if (error) { toast(`주제 수정 실패: ${error.message}`, "error"); return false; }
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    return true;
  }
  async function deleteTopic(topic) {
    const n = topicTotals[topic.id] || 0;
    if (!window.confirm(`주제 "${topic.name}"을(를) 삭제할까요?${n ? `\n논문 ${n}편에서 이 주제 태그가 빠집니다.` : ""}`)) return;
    const { error } = await supabase.from("paper_topics").delete().eq("id", topic.id);
    if (error) { toast(`주제 삭제 실패: ${error.message}`, "error"); return; }
    setTopics((prev) => prev.filter((t) => t.id !== topic.id));
    setPapers((prev) => prev.map((p) => ({ ...p, topic_ids: p.topic_ids.filter((id) => id !== topic.id) })));
    if (topicFilter === topic.id) setTopicFilter(null);
  }

  // ── 논문 ──
  async function savePaper(form, existing) {
    const year = form.year === "" || form.year == null ? null : Number(form.year);
    const payload = {
      title: clean(form.title),
      authors: clean(form.authors),
      year,
      venue: clean(form.venue),
      doi: clean(form.doi),
      url: clean(form.url),
      pdf_url: clean(form.pdf_url),
      abstract: clean(form.abstract),
      field_id: form.field_id || null,
      reading_status: STATUS[form.reading_status] ? form.reading_status : "unread",
      rating: form.rating ? Number(form.rating) : null,
      favorite: !!form.favorite,
      read_at: form.read_at || null,
      tldr: clean(form.tldr),
      summary: Object.fromEntries(SUMMARY_SECTIONS.map((s) => [s.key, clean(form.summary?.[s.key])]).filter(([, v]) => v)),
      notes: clean(form.notes),
    };
    if (!payload.title) throw new Error("제목을 입력하세요.");
    if (year != null && !Number.isInteger(year)) throw new Error("연도는 숫자로 입력하세요.");

    let id = existing?.id;
    if (id) {
      const { error } = await supabase.from("papers").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const nextOrder = papers.reduce((m, p) => Math.max(m, p.sort_order || 0), 0) + 1;
      const { data, error } = await supabase.from("papers").insert({ ...payload, user_id: userId, sort_order: nextOrder }).select("id").single();
      if (error) throw error;
      id = data.id;
    }
    const { error: unlinkErr } = await supabase.from("paper_topic_links").delete().eq("paper_id", id);
    if (unlinkErr) throw unlinkErr;
    const topicIds = Array.from(new Set(form.topic_ids || []));
    if (topicIds.length) {
      const { error: linkErr } = await supabase.from("paper_topic_links").insert(topicIds.map((topic_id) => ({ paper_id: id, topic_id, user_id: userId })));
      if (linkErr) throw linkErr;
    }
    reload();
    toast(existing ? "논문을 수정했습니다." : "논문을 추가했습니다.");
    return id;
  }
  async function deletePaper(paper) {
    if (!window.confirm(`"${paper.title}" 논문과 요약본을 삭제할까요?`)) return;
    const { error } = await supabase.from("papers").delete().eq("id", paper.id);
    if (error) { toast(`삭제 실패: ${error.message}`, "error"); return; }
    setPapers((prev) => prev.filter((p) => p.id !== paper.id));
    if (detailId === paper.id) setDetailId(null);
    toast("논문을 삭제했습니다.");
  }
  async function patchPaper(paper, patch, failMsg) {
    setPapers((prev) => prev.map((p) => (p.id === paper.id ? { ...p, ...patch } : p)));
    const { error } = await supabase.from("papers").update(patch).eq("id", paper.id);
    if (error) { toast(`${failMsg}: ${error.message}`, "error"); reload(); }
  }
  function setStatus(paper, status) {
    const patch = { reading_status: status };
    if (status === "done" && !paper.read_at) patch.read_at = new Date().toISOString().slice(0, 10);
    return patchPaper(paper, patch, "상태 변경 실패");
  }
  function toggleFavorite(paper) {
    return patchPaper(paper, { favorite: !paper.favorite }, "즐겨찾기 변경 실패");
  }
  // 현재 보이는 목록에서 위/아래 이웃과 자리를 바꾼다 (전체 순서 번호를 1..N 으로 다시 매김)
  async function movePaper(paper, dir) {
    const vi = filtered.findIndex((p) => p.id === paper.id);
    const target = filtered[vi + dir];
    if (!target) return;
    const all = orderedAll.slice();
    const from = all.findIndex((p) => p.id === paper.id);
    const to = all.findIndex((p) => p.id === target.id);
    all.splice(from, 1);
    all.splice(to, 0, paper);
    const changes = all.map((p, i) => ({ id: p.id, order: i + 1, prev: p.sort_order })).filter((c) => c.prev !== c.order);
    if (!changes.length) return;
    const orderOf = Object.fromEntries(changes.map((c) => [c.id, c.order]));
    setPapers((prev) => prev.map((p) => (orderOf[p.id] ? { ...p, sort_order: orderOf[p.id] } : p)));
    const results = await Promise.all(changes.map((c) => supabase.from("papers").update({ sort_order: c.order }).eq("id", c.id)));
    const failed = results.find((r) => r.error);
    if (failed) { toast(`순서 저장 실패: ${failed.error.message}`, "error"); reload(); }
  }
  function exportMarkdown() {
    if (!filtered.length) return;
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadText(`paper-summaries_${stamp}.md`, toMarkdown(filtered, { fieldById, topicById, orderIndex }));
    toast(`${filtered.length}편의 요약을 마크다운으로 내보냈습니다.`);
  }

  // ── 렌더 ──
  return (
    <div className="pp">
      <style>{styles}</style>

      {detail ? (
        <PaperDetail
          paper={detail}
          num={orderIndex[detail.id]}
          field={fieldById[detail.field_id]}
          topics={detail.topic_ids.map((id) => topicById[id]).filter(Boolean)}
          prev={prevPaper}
          next={nextPaper}
          onBack={() => setDetailId(null)}
          onNav={setDetailId}
          onEdit={(p) => setEditor({ paper: p })}
          onDelete={deletePaper}
          onToggleFavorite={toggleFavorite}
          onSetStatus={setStatus}
          toast={toast}
        />
      ) : (
        <div className="pp-layout">
          <aside className="pp-side">
            <div className="pp-side-card">
              <div className="pp-side-head">
                <h4><Layers size={13} /> 분야</h4>
                <button type="button" title="분야·주제 관리" onClick={() => setManage(true)}><Settings2 size={14} /></button>
              </div>
              <nav className="pp-nav">
                <button type="button" className={fieldFilter === "all" ? "on" : ""} onClick={() => selectField("all")}>
                  <BookOpen size={14} /><span className="txt">전체 논문</span><span className="cnt">{papers.length}</span>
                </button>
                {fields.map((f) => (
                  <button type="button" key={f.id} className={fieldFilter === f.id ? "on" : ""} onClick={() => selectField(f.id)}>
                    <i className="dot" style={{ background: f.color }} /><span className="txt">{f.name}</span><span className="cnt">{fieldCounts[f.id] || 0}</span>
                  </button>
                ))}
                {fieldCounts.none > 0 && (
                  <button type="button" className={fieldFilter === "none" ? "on" : ""} onClick={() => selectField("none")}>
                    <i className="dot" style={{ background: "#cbd5e1" }} /><span className="txt">분야 없음</span><span className="cnt">{fieldCounts.none}</span>
                  </button>
                )}
              </nav>
              <QuickAdd placeholder="새 분야 추가" onAdd={createField} />
            </div>

            <div className="pp-side-card">
              <div className="pp-side-head">
                <h4><Tag size={13} /> 주제{fieldFilter !== "all" && <em>선택한 분야 안</em>}</h4>
                {topicFilter && <button type="button" title="주제 필터 해제" onClick={() => setTopicFilter(null)}><X size={14} /></button>}
              </div>
              <nav className="pp-nav">
                {visibleTopics.length === 0 && <p className="pp-dim small">{topics.length ? "이 분야에 쓰인 주제가 없습니다." : "아직 주제가 없습니다."}</p>}
                {visibleTopics.map((t) => (
                  <button type="button" key={t.id} className={topicFilter === t.id ? "on" : ""} onClick={() => setTopicFilter(topicFilter === t.id ? null : t.id)}>
                    <Hash size={12} /><span className="txt">{t.name}</span><span className="cnt">{topicCounts[t.id] || 0}</span>
                  </button>
                ))}
              </nav>
              <QuickAdd placeholder="새 주제 추가" onAdd={createTopic} />
            </div>

            <div className="pp-side-card">
              <div className="pp-side-head"><h4><Eye size={13} /> 읽기 상태</h4></div>
              <nav className="pp-nav">
                <button type="button" className={statusFilter === "all" ? "on" : ""} onClick={() => setStatusFilter("all")}><span className="txt">전체</span><span className="cnt">{papers.length}</span></button>
                {STATUS_KEYS.map((k) => {
                  const StIcon = STATUS[k].Icon;
                  return (
                    <button type="button" key={k} className={statusFilter === k ? "on" : ""} onClick={() => setStatusFilter(k)}>
                      <StIcon size={13} style={{ color: STATUS[k].color }} /><span className="txt">{STATUS[k].label}</span><span className="cnt">{papers.filter((p) => p.reading_status === k).length}</span>
                    </button>
                  );
                })}
                <button type="button" className={statusFilter === "fav" ? "on" : ""} onClick={() => setStatusFilter("fav")}>
                  <Heart size={13} style={{ color: "#e11d48" }} /><span className="txt">즐겨찾기</span><span className="cnt">{papers.filter((p) => p.favorite).length}</span>
                </button>
              </nav>
            </div>
          </aside>

          <section className="pp-main">
            <div className="pp-stats">
              <div className="pp-stat"><i style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}><BookOpen size={17} /></i><div><span>전체 논문</span><strong>{stats.total}편</strong></div></div>
              <div className="pp-stat"><i style={{ background: "linear-gradient(135deg,#34d399,#059669)" }}><CheckCircle2 size={17} /></i><div><span>읽음</span><strong>{stats.done}편</strong></div></div>
              <div className="pp-stat"><i style={{ background: "linear-gradient(135deg,#fbbf24,#d97706)" }}><Clock size={17} /></i><div><span>읽는 중</span><strong>{stats.reading}편</strong></div></div>
              <div className="pp-stat"><i style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)" }}><Sparkles size={17} /></i><div><span>요약 작성</span><strong>{stats.summarized}편</strong></div></div>
            </div>

            <div className="pp-toolbar">
              <label className="pp-search">
                <Search size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목 · 저자 · 요약 · 메모 검색" />
                {query && <button type="button" onClick={() => setQuery("")} title="지우기"><X size={14} /></button>}
              </label>
              <select className="pp-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} title="정렬">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <div className="pp-seg">
                <button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")}><LayoutList size={15} /> 논문 목록</button>
                <button type="button" className={view === "digest" ? "on" : ""} onClick={() => setView("digest")}><ScrollText size={15} /> 요약 모음</button>
              </div>
              {view === "digest" && (
                <button type="button" className="pp-btn" onClick={() => setDigestFull((v) => !v)} title="요약 모음을 한 줄 요약만 / 전체 항목으로 전환">
                  {digestFull ? "간략히" : "자세히"}
                </button>
              )}
              <button type="button" className="pp-btn" onClick={exportMarkdown} disabled={!filtered.length} title="현재 목록의 요약을 마크다운 파일로 내려받기"><Download size={15} /> 내보내기</button>
              <button type="button" className="pp-btn primary" onClick={() => setEditor({ paper: null })}><Plus size={16} /> 논문 추가</button>
            </div>

            <div className="pp-filter-line">
              <span><b>{filtered.length}</b>편{filterActive && " (필터 적용)"}</span>
              {fieldFilter !== "all" && <span className="pp-crumb">분야: {fieldFilter === "none" ? "분야 없음" : fieldById[fieldFilter]?.name}</span>}
              {topicFilter && <span className="pp-crumb">주제: #{topicById[topicFilter]?.name}</span>}
              {statusFilter !== "all" && <span className="pp-crumb">{statusFilter === "fav" ? "즐겨찾기" : STATUS[statusFilter].label}</span>}
              {query.trim() && <span className="pp-crumb">검색: “{query.trim()}”</span>}
              {filterActive && <button type="button" className="pp-link" onClick={clearFilters}>초기화</button>}
              {view === "list" && sortBy === "order" && filtered.length > 1 && <span className="pp-hint">번호 옆 화살표로 순서를 바꿀 수 있습니다</span>}
            </div>

            {loading && papers.length === 0 ? (
              <div className="pp-loading">불러오는 중…</div>
            ) : filtered.length === 0 ? (
              <EmptyState hasAny={papers.length > 0} onAdd={() => setEditor({ paper: null })} onClear={clearFilters} />
            ) : view === "list" ? (
              <div className="pp-list">
                {filtered.map((p) => (
                  <PaperRow
                    key={p.id}
                    paper={p}
                    num={orderIndex[p.id]}
                    field={fieldById[p.field_id]}
                    topics={p.topic_ids.map((id) => topicById[id]).filter(Boolean)}
                    canReorder={sortBy === "order"}
                    onOpen={setDetailId}
                    onMove={movePaper}
                    onToggleFavorite={toggleFavorite}
                    onSetStatus={setStatus}
                    onEdit={(paper) => setEditor({ paper })}
                  />
                ))}
              </div>
            ) : (
              <div className="pp-digest">
                {filtered.map((p) => (
                  <DigestItem
                    key={p.id}
                    paper={p}
                    num={orderIndex[p.id]}
                    field={fieldById[p.field_id]}
                    topics={p.topic_ids.map((id) => topicById[id]).filter(Boolean)}
                    full={digestFull}
                    onOpen={setDetailId}
                    onEdit={(paper) => setEditor({ paper })}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {editor && (
        <PaperEditor
          key={editor.paper?.id || "new"}
          paper={editor.paper}
          fields={fields}
          topics={topics}
          onClose={() => setEditor(null)}
          onSave={(form) => savePaper(form, editor.paper)}
          onCreateField={createField}
          onCreateTopic={createTopic}
          toast={toast}
        />
      )}
      {manage && (
        <ManageModal
          fields={fields}
          topics={topics}
          fieldCounts={fieldCounts}
          topicTotals={topicTotals}
          onClose={() => setManage(false)}
          onCreateField={createField}
          onUpdateField={updateField}
          onDeleteField={deleteField}
          onCreateTopic={createTopic}
          onUpdateTopic={updateTopic}
          onDeleteTopic={deleteTopic}
        />
      )}
    </div>
  );
}

// ─── 작은 부품 ────────────────────────────────────────────────────
function FieldBadge({ field }) {
  return <span className="pp-badge" style={{ color: field.color, background: softColor(field.color) }}><i style={{ background: field.color }} />{field.name}</span>;
}
function TopicChip({ topic }) {
  return <span className="pp-chip"><Hash size={11} />{topic.name}</span>;
}
function StarRating({ value = 0, size = 14, onChange }) {
  return (
    <span className={`pp-stars ${onChange ? "input" : ""}`} title={value ? `${value} / 5` : "평점 없음"}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= value ? "on" : "off"}
          fill={n <= value ? "currentColor" : "none"}
          onClick={onChange ? () => onChange(n === value ? 0 : n) : undefined}
        />
      ))}
    </span>
  );
}
function StatusSelect({ value, onChange }) {
  const st = STATUS[value] || STATUS.unread;
  return (
    <select className="pp-status" style={{ color: st.color, background: st.bg }} value={value} onChange={(e) => onChange(e.target.value)} title="읽기 상태">
      {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
    </select>
  );
}
function QuickAdd({ placeholder, onAdd }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  async function commit() {
    const v = val.trim();
    if (!v) { setOpen(false); return; }
    const created = await onAdd(v);
    if (created) { setVal(""); setOpen(false); }
  }
  if (!open) return <button type="button" className="pp-quick-open" onClick={() => setOpen(true)}><Plus size={13} /> {placeholder}</button>;
  return (
    <div className="pp-quick">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!isComposing(e)) commit(); } if (e.key === "Escape") { setOpen(false); setVal(""); } }}
        placeholder={placeholder}
      />
      <button type="button" onClick={commit} title="추가"><Check size={14} /></button>
      <button type="button" className="ghost" onClick={() => { setOpen(false); setVal(""); }} title="취소"><X size={14} /></button>
    </div>
  );
}
function EmptyState({ hasAny, onAdd, onClear }) {
  return (
    <div className="pp-empty">
      <BookOpen size={34} />
      {hasAny ? (
        <>
          <h3>조건에 맞는 논문이 없습니다</h3>
          <p>검색어나 분야·주제·상태 필터를 바꿔 보세요.</p>
          <button type="button" className="pp-btn" onClick={onClear}>필터 초기화</button>
        </>
      ) : (
        <>
          <h3>첫 논문을 추가해 보세요</h3>
          <p>제목·저자·출처를 적고, 읽은 뒤 요약본을 남기면 분야·주제별로 모아 볼 수 있습니다.</p>
          <button type="button" className="pp-btn primary" onClick={onAdd}><Plus size={16} /> 논문 추가</button>
        </>
      )}
    </div>
  );
}

// ─── 목록 행 ──────────────────────────────────────────────────────
function PaperRow({ paper, num, field, topics, canReorder, onOpen, onMove, onToggleFavorite, onSetStatus, onEdit }) {
  const meta = [paper.authors, paper.venue, paper.year].filter(Boolean);
  return (
    <article className="pp-row" role="button" tabIndex={0} onClick={() => onOpen(paper.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOpen(paper.id); }}>
      <div className="pp-num-col">
        <span className="pp-num">{num}</span>
        {canReorder && (
          <div className="pp-order-btns" onClick={(e) => e.stopPropagation()}>
            <button type="button" title="위로" onClick={() => onMove(paper, -1)}><ChevronUp size={14} /></button>
            <button type="button" title="아래로" onClick={() => onMove(paper, 1)}><ChevronDown size={14} /></button>
          </div>
        )}
      </div>
      <div className="pp-row-main">
        <h3>{paper.title}</h3>
        {meta.length > 0 && <div className="pp-meta">{meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
        {clean(paper.tldr)
          ? <p className="pp-tldr">{paper.tldr}</p>
          : <p className="pp-tldr dim">{hasSummary(paper) ? "요약본 있음 · 한 줄 요약은 아직 없음" : "아직 요약이 없습니다."}</p>}
        {(field || topics.length > 0) && (
          <div className="pp-tags">
            {field && <FieldBadge field={field} />}
            {topics.map((t) => <TopicChip key={t.id} topic={t} />)}
          </div>
        )}
      </div>
      <div className="pp-row-side" onClick={(e) => e.stopPropagation()}>
        <div className="pp-row-actions">
          <button type="button" className={`pp-icon ${paper.favorite ? "fav" : ""}`} title={paper.favorite ? "즐겨찾기 해제" : "즐겨찾기"} onClick={() => onToggleFavorite(paper)}>
            <Heart size={15} fill={paper.favorite ? "currentColor" : "none"} />
          </button>
          <button type="button" className="pp-icon" title="수정" onClick={() => onEdit(paper)}><Pencil size={15} /></button>
        </div>
        <StatusSelect value={paper.reading_status} onChange={(v) => onSetStatus(paper, v)} />
        <StarRating value={paper.rating || 0} size={13} />
        {hasSummary(paper) && <span className="pp-has-summary"><Sparkles size={12} /> 요약본</span>}
      </div>
    </article>
  );
}

// ─── 요약 모음 항목 ───────────────────────────────────────────────
function DigestItem({ paper, num, field, topics, full, onOpen, onEdit }) {
  const sections = summarySections(paper);
  const meta = [paper.authors, paper.venue, paper.year].filter(Boolean).join(" · ");
  return (
    <article className="pp-dg">
      <header className="pp-dg-head">
        <span className="pp-num">{num}</span>
        <div className="pp-dg-title" role="button" tabIndex={0} onClick={() => onOpen(paper.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(paper.id); }}>
          <h3>{paper.title}</h3>
          {meta && <p className="pp-meta">{meta}</p>}
        </div>
        <div className="pp-dg-side">
          {field && <FieldBadge field={field} />}
          <button type="button" className="pp-icon" title="요약 수정" onClick={() => onEdit(paper)}><Pencil size={14} /></button>
        </div>
      </header>
      {clean(paper.tldr) && <p className="pp-dg-tldr">{paper.tldr}</p>}
      {!clean(paper.tldr) && sections.length === 0 && (
        <p className="pp-dim">아직 요약이 없습니다. <button type="button" className="pp-link" onClick={() => onEdit(paper)}>요약 작성</button></p>
      )}
      {full && sections.map((s) => (
        <div className="pp-sec" key={s.key}>
          <h4>{s.label}</h4>
          <Markdown className="pp-md" text={paper.summary[s.key]} />
        </div>
      ))}
      {full && topics.length > 0 && <div className="pp-tags">{topics.map((t) => <TopicChip key={t.id} topic={t} />)}</div>}
    </article>
  );
}

// ─── 상세 페이지 ──────────────────────────────────────────────────
function PaperDetail({ paper, num, field, topics, prev, next, onBack, onNav, onEdit, onDelete, onToggleFavorite, onSetStatus, toast }) {
  const [tab, setTab] = useState("summary");
  const sections = summarySections(paper);
  const summaryEmpty = !clean(paper.tldr) && sections.length === 0;
  const meta = [paper.authors, paper.venue, paper.year].filter(Boolean);
  const urlHref = toHref(paper.url);
  const pdfHref = toHref(paper.pdf_url);

  async function copyCitation() {
    try {
      await navigator.clipboard.writeText(citation(paper));
      toast("인용 정보를 복사했습니다.");
    } catch {
      toast("복사에 실패했습니다. 브라우저 권한을 확인하세요.", "error");
    }
  }

  return (
    <article className="pp-detail">
      <div className="pp-detail-top">
        <button type="button" className="pp-btn sm" onClick={onBack}><ArrowLeft size={14} /> 목록으로</button>
        <div className="pp-detail-nav">
          <button type="button" className="pp-btn sm" disabled={!prev} onClick={() => prev && onNav(prev.id)} title={prev?.title}><ChevronLeft size={14} /> 이전 논문</button>
          {num && <span className="pp-detail-num">#{num}</span>}
          <button type="button" className="pp-btn sm" disabled={!next} onClick={() => next && onNav(next.id)} title={next?.title}>다음 논문 <ChevronRight size={14} /></button>
        </div>
      </div>

      <div className="pp-detail-body">
        <div className="pp-detail-badges">
          {field && <FieldBadge field={field} />}
          <StatusSelect value={paper.reading_status} onChange={(v) => onSetStatus(paper, v)} />
          <StarRating value={paper.rating || 0} size={15} />
          <button type="button" className={`pp-icon ${paper.favorite ? "fav" : ""}`} title={paper.favorite ? "즐겨찾기 해제" : "즐겨찾기"} onClick={() => onToggleFavorite(paper)}>
            <Heart size={15} fill={paper.favorite ? "currentColor" : "none"} />
          </button>
        </div>
        <h2>{paper.title}</h2>
        {meta.length > 0 && <p className="pp-detail-meta">{meta.map((m, i) => <span key={i}>{m}</span>)}</p>}
        {topics.length > 0 && <div className="pp-tags">{topics.map((t) => <TopicChip key={t.id} topic={t} />)}</div>}

        <div className="pp-links">
          {paper.doi && <a className="pp-btn sm" href={doiUrl(paper.doi)} target="_blank" rel="noreferrer"><Link2 size={13} /> DOI</a>}
          {urlHref && <a className="pp-btn sm" href={urlHref} target="_blank" rel="noreferrer"><ExternalLink size={13} /> 논문 페이지</a>}
          {pdfHref && <a className="pp-btn sm" href={pdfHref} target="_blank" rel="noreferrer"><FileText size={13} /> PDF</a>}
          <button type="button" className="pp-btn sm" onClick={copyCitation}><Quote size={13} /> 인용 복사</button>
          <span className="pp-spacer" />
          <button type="button" className="pp-btn sm" onClick={() => onEdit(paper)}><Pencil size={13} /> 수정</button>
          <button type="button" className="pp-btn sm danger" onClick={() => onDelete(paper)}><Trash2 size={13} /> 삭제</button>
        </div>

        <div className="pp-tabs">
          <button type="button" className={tab === "summary" ? "on" : ""} onClick={() => setTab("summary")}><Sparkles size={14} /> 요약본</button>
          <button type="button" className={tab === "info" ? "on" : ""} onClick={() => setTab("info")}><Info size={14} /> 초록 · 메모</button>
        </div>

        {tab === "summary" && (
          summaryEmpty ? (
            <div className="pp-empty compact">
              <Sparkles size={26} />
              <h3>아직 요약본이 없습니다</h3>
              <p>한 줄 요약과 함께 배경·방법·결과·한계·내 생각을 정리해 두면 나중에 빠르게 되짚어 볼 수 있습니다.</p>
              <button type="button" className="pp-btn primary" onClick={() => onEdit(paper)}><Pencil size={14} /> 요약 작성</button>
            </div>
          ) : (
            <>
              {clean(paper.tldr) && <div className="pp-tldr-box"><span>한 줄 요약</span>{paper.tldr}</div>}
              {sections.map((s) => (
                <section className="pp-sec-card" key={s.key}>
                  <h4>{s.label}</h4>
                  <Markdown className="pp-md" text={paper.summary[s.key]} />
                </section>
              ))}
            </>
          )
        )}

        {tab === "info" && (
          <>
            <section className="pp-sec-card">
              <h4>초록</h4>
              {clean(paper.abstract) ? <p className="pp-abstract">{paper.abstract}</p> : <p className="pp-dim">초록이 없습니다.</p>}
            </section>
            <section className="pp-sec-card">
              <h4>메모</h4>
              {clean(paper.notes) ? <Markdown className="pp-md" text={paper.notes} /> : <p className="pp-dim">메모가 없습니다.</p>}
            </section>
            <dl className="pp-facts">
              {paper.doi && <><dt>DOI</dt><dd>{paper.doi}</dd></>}
              {paper.read_at && <><dt>읽은 날짜</dt><dd>{fmtDate(paper.read_at)}</dd></>}
              <dt>추가일</dt><dd>{fmtDate(paper.created_at)}</dd>
              {paper.updated_at && <><dt>마지막 수정</dt><dd>{fmtDate(paper.updated_at)}</dd></>}
            </dl>
          </>
        )}
      </div>
    </article>
  );
}

// ─── 주제 선택기 (기존 주제 선택 / 새 주제 즉시 생성) ───────────────
function TopicPicker({ topics, value, onChange, onCreate }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = value.map((id) => topics.find((t) => t.id === id)).filter(Boolean);
  const lower = q.trim().toLowerCase();
  const suggestions = topics.filter((t) => !value.includes(t.id) && (!lower || t.name.toLowerCase().includes(lower))).slice(0, 10);
  const exact = topics.find((t) => t.name.toLowerCase() === lower);

  function add(id) { if (!value.includes(id)) onChange([...value, id]); setQ(""); }
  async function commit() {
    const name = q.trim();
    if (!name) return;
    if (exact) { add(exact.id); return; }
    setBusy(true);
    const created = await onCreate(name);
    setBusy(false);
    if (created) add(created.id);
  }

  return (
    <div className="pp-topic-picker">
      <div className="pp-topic-box">
        {selected.map((t) => (
          <span key={t.id} className="pp-chip removable">
            <Hash size={11} />{t.name}
            <button type="button" onClick={() => onChange(value.filter((id) => id !== t.id))} title="제거"><X size={11} /></button>
          </span>
        ))}
        <input
          value={q}
          disabled={busy}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (!isComposing(e)) commit(); }
            if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
          }}
          placeholder={selected.length ? "주제 추가…" : "주제 입력 후 Enter (없으면 새로 만듭니다)"}
        />
      </div>
      {(lower || suggestions.length > 0) && (
        <div className="pp-topic-suggest">
          {suggestions.map((t) => <button type="button" key={t.id} onClick={() => add(t.id)}><Hash size={11} />{t.name}</button>)}
          {lower && !exact && <button type="button" className="new" onClick={commit}><Plus size={11} /> “{q.trim()}” 새 주제 만들기</button>}
        </div>
      )}
    </div>
  );
}

// ─── 논문 추가 / 수정 ─────────────────────────────────────────────
function PaperEditor({ paper, fields, topics, onClose, onSave, onCreateField, onCreateTopic, toast }) {
  const [form, setForm] = useState(() => (paper ? {
    title: paper.title || "", authors: paper.authors || "", year: paper.year ?? "", venue: paper.venue || "",
    doi: paper.doi || "", url: paper.url || "", pdf_url: paper.pdf_url || "", abstract: paper.abstract || "",
    field_id: paper.field_id || "", topic_ids: paper.topic_ids || [], reading_status: paper.reading_status || "unread",
    rating: paper.rating || 0, favorite: !!paper.favorite, read_at: paper.read_at || "",
    tldr: paper.tldr || "", summary: { ...(paper.summary || {}) }, notes: paper.notes || "",
  } : { ...EMPTY_FORM }));
  const [saving, setSaving] = useState(false);
  const [newField, setNewField] = useState(null); // null | 입력 중인 이름
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setSummary = (k, v) => setForm((f) => ({ ...f, summary: { ...f.summary, [k]: v } }));

  async function confirmNewField() {
    const created = await onCreateField(newField);
    if (created) set("field_id", created.id);
    setNewField(null);
  }
  async function submit(e) {
    e.preventDefault();
    if (!clean(form.title)) { toast("제목을 입력하세요.", "error"); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      toast(`저장 실패: ${err.message || err}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="pp-modal" onSubmit={submit}>
        <div className="pp-modal-head">
          <div><h3>{paper ? "논문 수정" : "논문 추가"}</h3><p>{paper ? "서지 정보와 요약본을 고칩니다." : "서지 정보를 적고, 읽은 뒤 요약본을 채워 넣으세요."}</p></div>
          <button type="button" onClick={onClose} title="닫기"><X size={18} /></button>
        </div>

        <div className="pp-modal-body">
          <section className="pp-fs">
            <h4><FileText size={14} /> 서지 정보</h4>
            <label className="pp-field">제목 *<input required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="논문 제목" autoFocus /></label>
            <label className="pp-field">저자<input value={form.authors} onChange={(e) => set("authors", e.target.value)} placeholder="예) Vaswani, A., Shazeer, N., … 또는 홍길동, 김철수" /></label>
            <div className="pp-grid2">
              <label className="pp-field">연도<input type="number" min="1900" max="2100" value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2024" /></label>
              <label className="pp-field">학술지 / 학회<input value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="예) NeurIPS 2017, Nature Medicine" /></label>
            </div>
            <div className="pp-grid2">
              <label className="pp-field">DOI<input value={form.doi} onChange={(e) => set("doi", e.target.value)} placeholder="10.xxxx/xxxxx" /></label>
              <label className="pp-field">논문 링크<input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" /></label>
            </div>
            <label className="pp-field">PDF 링크<input value={form.pdf_url} onChange={(e) => set("pdf_url", e.target.value)} placeholder="https://…/paper.pdf (드라이브·arXiv 링크 등)" /></label>
          </section>

          <section className="pp-fs">
            <h4><Layers size={14} /> 분류</h4>
            <div className="pp-grid2">
              <label className="pp-field">분야
                <select value={form.field_id} onChange={(e) => { if (e.target.value === "__new__") setNewField(""); else set("field_id", e.target.value); }}>
                  <option value="">분야 없음</option>
                  {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  <option value="__new__">＋ 새 분야 추가…</option>
                </select>
                {newField !== null && (
                  <div className="pp-inline-new">
                    <input autoFocus value={newField} onChange={(e) => setNewField(e.target.value)} placeholder="새 분야 이름"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!isComposing(e)) confirmNewField(); } if (e.key === "Escape") setNewField(null); }} />
                    <button type="button" className="pp-btn sm primary" onClick={confirmNewField}>추가</button>
                    <button type="button" className="pp-btn sm" onClick={() => setNewField(null)}>취소</button>
                  </div>
                )}
              </label>
              <label className="pp-field">읽기 상태
                <select value={form.reading_status} onChange={(e) => set("reading_status", e.target.value)}>
                  {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
                </select>
              </label>
            </div>
            <div className="pp-field"><span className="pp-label">주제 (여러 개)</span>
              <TopicPicker topics={topics} value={form.topic_ids} onChange={(ids) => set("topic_ids", ids)} onCreate={onCreateTopic} />
            </div>
            <div className="pp-grid3">
              <div className="pp-field"><span className="pp-label">평점</span><div className="pp-rating-input"><StarRating value={form.rating} size={20} onChange={(v) => set("rating", v)} /><small>{form.rating ? `${form.rating} / 5` : "없음"}</small></div></div>
              <label className="pp-field">읽은 날짜<input type="date" value={form.read_at} onChange={(e) => set("read_at", e.target.value)} /></label>
              <label className="pp-field pp-check"><span className="pp-label">즐겨찾기</span><span className="pp-check-row"><input type="checkbox" checked={form.favorite} onChange={(e) => set("favorite", e.target.checked)} /> <Heart size={14} /> 중요한 논문으로 표시</span></label>
            </div>
          </section>

          <section className="pp-fs">
            <h4><Sparkles size={14} /> 요약본</h4>
            <label className="pp-field">한 줄 요약<input value={form.tldr} onChange={(e) => set("tldr", e.target.value)} placeholder="이 논문을 한 문장으로 말하면?" /></label>
            {SUMMARY_SECTIONS.map((s) => (
              <label className="pp-field" key={s.key}>{s.label}<small>{s.hint}</small>
                <textarea value={form.summary[s.key] || ""} onChange={(e) => setSummary(s.key, e.target.value)} placeholder="- 항목별로 적어도 좋고, 문단으로 써도 됩니다" />
              </label>
            ))}
          </section>

          <section className="pp-fs">
            <h4><ScrollText size={14} /> 초록 · 메모</h4>
            <label className="pp-field">초록 (원문)<textarea value={form.abstract} onChange={(e) => set("abstract", e.target.value)} placeholder="논문 초록을 붙여 넣으세요" /></label>
            <label className="pp-field">메모<textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="읽으면서 든 생각, 인용할 문장, 관련 논문 등" /></label>
          </section>
        </div>

        <div className="pp-modal-foot">
          <small>마크다운 지원: **굵게**, *기울임*, - 목록, 1. 번호, &gt; 인용, `코드`, [링크](주소)</small>
          <div className="pp-modal-actions">
            <button type="button" className="pp-btn" onClick={onClose} disabled={saving}>취소</button>
            <button type="submit" className="pp-btn primary" disabled={saving}><Check size={15} /> {saving ? "저장 중…" : paper ? "수정 저장" : "논문 추가"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── 분야 · 주제 관리 ─────────────────────────────────────────────
function ManageModal({ fields, topics, fieldCounts, topicTotals, onClose, onCreateField, onUpdateField, onDeleteField, onCreateTopic, onUpdateTopic, onDeleteTopic }) {
  const [tab, setTab] = useState("fields");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(null); // { id, name }
  const isFields = tab === "fields";
  const items = isFields ? fields : topics;

  async function addNew() {
    const v = newName.trim();
    if (!v) return;
    const created = isFields ? await onCreateField(v) : await onCreateTopic(v);
    if (created) setNewName("");
  }
  async function saveEdit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { setEditing(null); return; }
    const ok = isFields ? await onUpdateField(editing.id, { name }) : await onUpdateTopic(editing.id, { name });
    if (ok) setEditing(null);
  }

  return (
    <div className="pp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pp-modal narrow">
        <div className="pp-modal-head">
          <div><h3>분야 · 주제 관리</h3><p>이름을 바꾸거나 삭제해도 논문 자체는 지워지지 않습니다.</p></div>
          <button type="button" onClick={onClose} title="닫기"><X size={18} /></button>
        </div>
        <div className="pp-tabs in-modal">
          <button type="button" className={isFields ? "on" : ""} onClick={() => { setTab("fields"); setEditing(null); }}><Layers size={14} /> 분야 ({fields.length})</button>
          <button type="button" className={!isFields ? "on" : ""} onClick={() => { setTab("topics"); setEditing(null); }}><Tag size={14} /> 주제 ({topics.length})</button>
        </div>
        <div className="pp-modal-body">
          <div className="pp-quick wide">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={isFields ? "새 분야 이름 (예: 컴퓨터 비전)" : "새 주제 이름 (예: Diffusion)"}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!isComposing(e)) addNew(); } }} />
            <button type="button" onClick={addNew}><Plus size={14} /> 추가</button>
          </div>
          {items.length === 0 && <p className="pp-dim">아직 {isFields ? "분야" : "주제"}가 없습니다.</p>}
          <ul className="pp-manage-list">
            {items.map((it) => {
              const count = isFields ? (fieldCounts[it.id] || 0) : (topicTotals[it.id] || 0);
              const isEditing = editing?.id === it.id;
              return (
                <li key={it.id}>
                  {isFields ? <i className="dot" style={{ background: it.color }} /> : <Hash size={13} className="pp-dim" />}
                  {isEditing ? (
                    <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!isComposing(e)) saveEdit(); } if (e.key === "Escape") setEditing(null); }} />
                  ) : (
                    <span className="name">{it.name}</span>
                  )}
                  <span className="cnt">{count}편</span>
                  {isFields && (
                    <span className="pp-colors">
                      {FIELD_COLORS.map((c) => (
                        <button type="button" key={c} className={c === it.color ? "on" : ""} style={{ background: c }} title="색상" onClick={() => onUpdateField(it.id, { color: c })} />
                      ))}
                    </span>
                  )}
                  {isEditing ? (
                    <>
                      <button type="button" className="pp-icon" title="저장" onClick={saveEdit}><Check size={14} /></button>
                      <button type="button" className="pp-icon" title="취소" onClick={() => setEditing(null)}><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="pp-icon" title="이름 바꾸기" onClick={() => setEditing({ id: it.id, name: it.name })}><Pencil size={14} /></button>
                      <button type="button" className="pp-icon danger" title="삭제" onClick={() => (isFields ? onDeleteField(it) : onDeleteTopic(it))}><Trash2 size={14} /></button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="pp-modal-foot">
          <small>{isFields ? "분야는 논문마다 하나만 고를 수 있는 큰 분류입니다." : "주제는 논문에 여러 개 붙일 수 있는 세부 태그입니다."}</small>
          <div className="pp-modal-actions"><button type="button" className="pp-btn primary" onClick={onClose}>닫기</button></div>
        </div>
      </div>
    </div>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────
const styles = `
.pp { --ink:#1e293b; --mute:#64748b; --line:#e5eaf3; --accent:#4f46e5; --soft:#eef2ff; --serif:"Iowan Old Style","Palatino Linotype","Book Antiqua",Georgia,"Noto Serif KR","Apple SD Gothic Neo",serif; color:var(--ink); }
.pp *, .pp *::before, .pp *::after { box-sizing:border-box; }
.pp button { font-family:inherit; cursor:pointer; }
.pp button:disabled { cursor:not-allowed; opacity:.4; }
.pp input, .pp select, .pp textarea { font-family:inherit; color:var(--ink); }
.pp h2, .pp h3, .pp h4 { margin:0; }

.pp-layout { display:grid; grid-template-columns:236px minmax(0,1fr); gap:22px; align-items:start; }
.pp-side { position:sticky; top:20px; display:grid; gap:14px; }
.pp-side-card { background:#fff; border:1px solid var(--line); border-radius:16px; padding:12px; box-shadow:0 10px 30px rgba(15,23,42,.04); }
.pp-side-head { display:flex; align-items:center; justify-content:space-between; padding:2px 6px 8px; }
.pp-side-head h4 { font-size:12px; font-weight:900; color:#7b879c; letter-spacing:.02em; display:flex; align-items:center; gap:6px; }
.pp-side-head h4 em { font-style:normal; font-weight:700; color:#a5b4fc; margin-left:2px; }
.pp-side-head button { border:0; background:transparent; color:#94a3b8; width:24px; height:24px; border-radius:7px; display:grid; place-items:center; }
.pp-side-head button:hover { background:#f1f5f9; color:var(--accent); }
.pp-nav { display:grid; gap:2px; }
.pp-nav button { display:flex; align-items:center; gap:8px; width:100%; border:0; background:transparent; text-align:left; padding:7px 8px; border-radius:9px; font-size:13px; font-weight:700; color:#334155; }
.pp-nav button:hover { background:#f8fafc; }
.pp-nav button.on { background:var(--soft); color:var(--accent); }
.pp-nav .txt { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pp-nav .dot, .pp-manage-list .dot { width:9px; height:9px; border-radius:50%; flex:0 0 9px; }
.pp-nav .cnt { font-size:11px; font-weight:800; color:#94a3b8; background:#f1f5f9; border-radius:999px; padding:1px 7px; }
.pp-nav button.on .cnt { background:#e0e7ff; color:var(--accent); }
.pp-quick-open { margin-top:6px; width:100%; border:1px dashed #d7ddea; background:transparent; color:#94a3b8; height:32px; border-radius:9px; font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:4px; }
.pp-quick-open:hover { border-color:#a5b4fc; color:var(--accent); background:#fafbff; }
.pp-quick { display:flex; gap:6px; margin-top:6px; }
.pp-quick.wide { margin:0 0 14px; }
.pp-quick input { flex:1; min-width:0; height:34px; border:1px solid var(--line); border-radius:9px; padding:0 10px; font-size:13px; outline:none; }
.pp-quick input:focus { border-color:#a5b4fc; box-shadow:0 0 0 3px rgba(99,102,241,.12); }
.pp-quick button { height:34px; padding:0 10px; border-radius:9px; border:0; background:var(--accent); color:#fff; font-weight:800; font-size:12px; display:inline-flex; align-items:center; gap:4px; }
.pp-quick button.ghost { background:#f1f5f9; color:#64748b; }

.pp-main { min-width:0; display:grid; gap:16px; }
.pp-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.pp-stat { background:#fff; border:1px solid var(--line); border-radius:14px; padding:12px 14px; display:flex; align-items:center; gap:12px; }
.pp-stat i { width:38px; height:38px; border-radius:11px; display:grid; place-items:center; color:#fff; flex:0 0 38px; }
.pp-stat span { font-size:12px; color:var(--mute); font-weight:700; }
.pp-stat strong { display:block; font-size:19px; letter-spacing:-.03em; margin-top:1px; }
.pp-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
.pp-search { flex:1 1 240px; display:flex; align-items:center; gap:8px; height:40px; border:1px solid var(--line); border-radius:12px; background:#fff; padding:0 12px; color:#94a3b8; }
.pp-search:focus-within { border-color:#a5b4fc; box-shadow:0 0 0 3px rgba(99,102,241,.12); }
.pp-search input { flex:1; min-width:0; border:0; outline:none; font-size:14px; background:transparent; }
.pp-search button { border:0; background:transparent; color:#94a3b8; display:grid; place-items:center; padding:2px; }
.pp-select { height:40px; border:1px solid var(--line); border-radius:12px; background:#fff; padding:0 10px; font-weight:700; color:#334155; font-size:13px; outline:none; }
.pp-seg { display:flex; border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#fff; }
.pp-seg button { height:38px; padding:0 13px; border:0; background:transparent; color:#64748b; font-weight:800; font-size:13px; display:flex; align-items:center; gap:6px; white-space:nowrap; }
.pp-seg button.on { background:var(--soft); color:var(--accent); }
.pp-btn { height:40px; padding:0 14px; border-radius:12px; border:1px solid var(--line); background:#fff; color:#334155; font-weight:800; font-size:13px; display:inline-flex; align-items:center; gap:7px; white-space:nowrap; text-decoration:none; }
.pp-btn:hover { border-color:#c7d2fe; color:var(--accent); }
.pp-btn.primary { background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff; border-color:transparent; box-shadow:0 10px 22px rgba(79,70,229,.22); }
.pp-btn.primary:hover { color:#fff; filter:brightness(1.04); }
.pp-btn.danger { color:#e11d48; border-color:#fecdd3; background:#fff1f2; }
.pp-btn.danger:hover { color:#be123c; border-color:#fda4af; }
.pp-btn.sm { height:32px; padding:0 11px; font-size:12px; border-radius:9px; gap:5px; }
.pp-link { border:0; background:transparent; color:var(--accent); font-weight:800; font-size:12px; padding:0; text-decoration:underline; text-underline-offset:2px; }
.pp-filter-line { display:flex; flex-wrap:wrap; align-items:center; gap:8px; color:var(--mute); font-size:13px; padding:0 2px; }
.pp-filter-line b { color:var(--ink); }
.pp-crumb { background:#fff; border:1px solid var(--line); border-radius:999px; padding:2px 10px; font-size:12px; font-weight:700; color:#475569; }
.pp-hint { margin-left:auto; font-size:12px; color:#a1a9ba; }
.pp-loading { padding:60px 0; text-align:center; color:var(--mute); }
.pp-dim { color:#94a3b8; font-size:13px; margin:6px 0 0; }
.pp-dim.small { font-size:12px; padding:4px 8px; margin:0; }

.pp-list { display:grid; gap:10px; }
.pp-row { display:grid; grid-template-columns:48px minmax(0,1fr) auto; gap:14px; align-items:start; background:#fff; border:1px solid var(--line); border-radius:16px; padding:16px 18px 16px 14px; cursor:pointer; transition:box-shadow .15s, transform .15s, border-color .15s; }
.pp-row:hover { border-color:#c7d2fe; box-shadow:0 12px 30px rgba(79,70,229,.10); transform:translateY(-1px); }
.pp-row:focus-visible, .pp-dg-title:focus-visible { outline:2px solid #a5b4fc; outline-offset:2px; }
.pp-num-col { display:grid; justify-items:center; gap:6px; }
.pp-num { font-family:var(--serif); font-size:22px; color:#c7cdd9; font-weight:700; line-height:1; padding-top:3px; font-variant-numeric:tabular-nums; }
.pp-order-btns { display:grid; gap:2px; opacity:0; transition:opacity .15s; }
.pp-row:hover .pp-order-btns, .pp-order-btns:focus-within { opacity:1; }
.pp-order-btns button { width:24px; height:22px; border:1px solid var(--line); background:#fff; border-radius:6px; color:#64748b; display:grid; place-items:center; padding:0; }
.pp-order-btns button:hover { color:var(--accent); border-color:#c7d2fe; }
.pp-row-main { min-width:0; }
.pp-row h3 { font-family:var(--serif); font-size:17.5px; line-height:1.35; letter-spacing:-.01em; color:var(--ink); font-weight:700; }
.pp-meta { color:var(--mute); font-size:13px; display:flex; flex-wrap:wrap; gap:4px 0; margin-top:4px; }
.pp-meta span + span::before { content:"·"; margin:0 7px; color:#cbd5e1; }
.pp-tldr { margin:8px 0 0; color:#475569; font-size:13.5px; line-height:1.55; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.pp-tldr.dim { color:#a1a9ba; font-style:italic; }
.pp-tags { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.pp-badge { display:inline-flex; align-items:center; gap:6px; padding:3px 10px 3px 8px; border-radius:999px; font-size:11.5px; font-weight:800; white-space:nowrap; }
.pp-badge i { width:7px; height:7px; border-radius:50%; }
.pp-chip { display:inline-flex; align-items:center; gap:3px; padding:3px 8px; border-radius:7px; background:#f1f5f9; color:#475569; font-size:11.5px; font-weight:700; white-space:nowrap; }
.pp-chip.removable { padding-right:4px; }
.pp-chip.removable button { border:0; background:transparent; color:#94a3b8; display:grid; place-items:center; padding:2px; border-radius:4px; margin-left:2px; }
.pp-chip.removable button:hover { background:#e2e8f0; color:#e11d48; }
.pp-row-side { display:grid; gap:8px; justify-items:end; }
.pp-row-actions { display:flex; gap:4px; }
.pp-icon { width:30px; height:30px; border:1px solid var(--line); background:#fff; border-radius:9px; color:#94a3b8; display:grid; place-items:center; padding:0; }
.pp-icon:hover { color:var(--accent); border-color:#c7d2fe; }
.pp-icon.fav { color:#e11d48; border-color:#fecdd3; background:#fff1f2; }
.pp-icon.danger:hover { color:#e11d48; border-color:#fecdd3; background:#fff1f2; }
.pp-status { height:28px; border:0; border-radius:999px; padding:0 10px; font-size:12px; font-weight:800; outline:none; cursor:pointer; -webkit-appearance:none; appearance:none; text-align:center; }
.pp-stars { display:inline-flex; gap:1px; color:#f59e0b; }
.pp-stars svg.off { color:#dfe4ee; }
.pp-stars.input svg { cursor:pointer; }
.pp-stars.input svg:hover { transform:scale(1.15); }
.pp-has-summary { display:inline-flex; align-items:center; gap:4px; color:#7c3aed; font-size:11.5px; font-weight:800; }

.pp-empty { background:#fff; border:1px dashed #d7ddea; border-radius:18px; padding:54px 24px; display:grid; justify-items:center; text-align:center; gap:8px; color:#94a3b8; }
.pp-empty h3 { color:var(--ink); font-size:17px; }
.pp-empty p { margin:0; color:var(--mute); font-size:13.5px; max-width:420px; line-height:1.55; }
.pp-empty .pp-btn { margin-top:8px; }
.pp-empty.compact { padding:36px 20px; margin-top:20px; }

.pp-digest { display:grid; gap:14px; }
.pp-dg { background:#fff; border:1px solid var(--line); border-radius:18px; padding:20px 24px; }
.pp-dg-head { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:14px; align-items:start; }
.pp-dg-title { cursor:pointer; min-width:0; }
.pp-dg-title:hover h3 { color:var(--accent); }
.pp-dg h3 { font-family:var(--serif); font-size:18.5px; line-height:1.35; font-weight:700; }
.pp-dg .pp-meta { display:block; }
.pp-dg-side { display:flex; align-items:center; gap:8px; }
.pp-dg-tldr { margin:14px 0 0; padding:12px 14px; border-left:3px solid var(--accent); background:#f8fafc; border-radius:0 10px 10px 0; font-size:14px; line-height:1.6; color:#334155; }
.pp-sec { margin-top:16px; }
.pp-sec h4, .pp-sec-card h4 { font-size:12px; font-weight:900; color:var(--accent); letter-spacing:.04em; display:flex; align-items:center; gap:6px; margin-bottom:6px; }
.pp-sec h4::before, .pp-sec-card h4::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--accent); }

.pp-md { font-size:14px; line-height:1.75; color:#334155; word-break:break-word; }
.pp-md p { margin:0 0 8px; }
.pp-md p:last-child, .pp-md ul:last-child, .pp-md ol:last-child { margin-bottom:0; }
.pp-md ul, .pp-md ol { margin:0 0 8px; padding-left:22px; }
.pp-md li { margin:2px 0; }
.pp-md h3, .pp-md h4, .pp-md h5, .pp-md h6 { margin:12px 0 6px; font-size:14.5px; color:var(--ink); }
.pp-md code { background:#f1f5f9; padding:1px 5px; border-radius:5px; font-size:.9em; }
.pp-md pre { background:#0f172a; color:#e2e8f0; padding:12px 14px; border-radius:10px; overflow:auto; font-size:12.5px; line-height:1.55; margin:0 0 8px; }
.pp-md pre code { background:transparent; padding:0; color:inherit; }
.pp-md blockquote { margin:0 0 8px; padding:6px 12px; border-left:3px solid #cbd5e1; color:#64748b; background:#f8fafc; border-radius:0 8px 8px 0; }
.pp-md a { color:var(--accent); }
.pp-md hr { border:0; border-top:1px solid var(--line); margin:10px 0; }

.pp-detail { background:#fff; border:1px solid var(--line); border-radius:20px; overflow:hidden; box-shadow:0 14px 36px rgba(15,23,42,.045); }
.pp-detail-top { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 18px; border-bottom:1px solid var(--line); background:#fafbff; }
.pp-detail-nav { display:flex; align-items:center; gap:8px; }
.pp-detail-num { font-family:var(--serif); font-weight:700; color:#94a3b8; font-size:14px; }
.pp-detail-body { padding:28px 36px 36px; max-width:900px; }
.pp-detail-badges { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
.pp-detail h2 { font-family:var(--serif); font-size:27px; line-height:1.3; margin:14px 0 8px; letter-spacing:-.01em; font-weight:700; }
.pp-detail-meta { margin:0; color:var(--mute); font-size:14.5px; display:flex; flex-wrap:wrap; }
.pp-detail-meta span + span::before { content:"·"; margin:0 8px; color:#cbd5e1; }
.pp-links { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:16px; }
.pp-spacer { flex:1; }
.pp-tabs { display:flex; gap:4px; border-bottom:1px solid var(--line); margin-top:22px; }
.pp-tabs button { border:0; background:transparent; padding:10px 14px; font-weight:800; font-size:13.5px; color:#64748b; border-bottom:2px solid transparent; margin-bottom:-1px; display:flex; align-items:center; gap:6px; }
.pp-tabs button.on { color:var(--accent); border-bottom-color:var(--accent); }
.pp-tabs.in-modal { margin:0; padding:0 22px; }
.pp-tldr-box { margin:20px 0 4px; padding:16px 18px; background:linear-gradient(135deg,#eef2ff,#f5f3ff); border-radius:14px; font-size:15.5px; line-height:1.65; color:#312e81; }
.pp-tldr-box span { display:block; font-size:11px; font-weight:900; letter-spacing:.06em; color:#6366f1; margin-bottom:4px; }
.pp-sec-card { border:1px solid var(--line); border-radius:14px; padding:16px 18px; margin-top:12px; }
.pp-abstract { margin:0; white-space:pre-wrap; line-height:1.7; font-size:14px; color:#334155; }
.pp-facts { display:grid; grid-template-columns:auto 1fr; gap:6px 16px; margin:18px 0 0; font-size:13px; color:var(--mute); }
.pp-facts dt { font-weight:800; color:#94a3b8; }
.pp-facts dd { margin:0; color:#475569; word-break:break-all; }

.pp-backdrop { position:fixed; inset:0; z-index:70; background:rgba(15,23,42,.45); display:grid; place-items:center; padding:20px; }
.pp-modal { width:min(880px,100%); max-height:92vh; background:#fff; border-radius:22px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 30px 90px rgba(15,23,42,.3); margin:0; }
.pp-modal.narrow { width:min(620px,100%); }
.pp-modal-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:18px 22px; border-bottom:1px solid var(--line); }
.pp-modal-head h3 { font-size:20px; letter-spacing:-.03em; }
.pp-modal-head p { margin:4px 0 0; color:var(--mute); font-size:13px; }
.pp-modal-head > button { width:36px; height:36px; border:0; border-radius:10px; background:#f1f5f9; color:#475569; display:grid; place-items:center; flex:0 0 36px; }
.pp-modal-body { overflow:auto; padding:20px 22px; display:grid; gap:22px; }
.pp-fs { display:grid; gap:12px; }
.pp-fs h4 { font-size:12.5px; font-weight:900; color:#7b879c; letter-spacing:.03em; display:flex; align-items:center; gap:6px; padding-bottom:8px; border-bottom:1px dashed var(--line); }
.pp-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.pp-grid3 { display:grid; grid-template-columns:1fr 1fr 1.3fr; gap:12px; align-items:start; }
.pp-field { display:grid; gap:6px; font-size:12.5px; font-weight:800; color:#334155; min-width:0; }
.pp-field small { font-weight:600; color:#94a3b8; font-size:11.5px; margin-top:-3px; }
.pp-label { font-size:12.5px; font-weight:800; color:#334155; }
.pp-field input, .pp-field select, .pp-field textarea, .pp-inline-new input { width:100%; border:1px solid var(--line); border-radius:11px; min-height:40px; padding:0 12px; font-size:14px; outline:none; font-weight:500; background:#fff; }
.pp-field textarea { min-height:96px; padding:10px 12px; resize:vertical; line-height:1.6; }
.pp-field input:focus, .pp-field select:focus, .pp-field textarea:focus, .pp-inline-new input:focus, .pp-topic-box:focus-within { border-color:#a5b4fc; box-shadow:0 0 0 3px rgba(99,102,241,.12); }
.pp-inline-new { display:flex; gap:6px; align-items:center; }
.pp-inline-new input { min-height:34px; }
.pp-check-row { display:flex; align-items:center; gap:6px; min-height:40px; font-weight:600; color:#475569; }
.pp-check-row input { width:16px; height:16px; min-height:0; margin:0; accent-color:var(--accent); }
.pp-rating-input { display:flex; align-items:center; gap:10px; min-height:40px; }
.pp-rating-input small { color:#94a3b8; font-weight:700; }
.pp-topic-picker { display:grid; gap:6px; }
.pp-topic-box { display:flex; flex-wrap:wrap; gap:6px; align-items:center; border:1px solid var(--line); border-radius:11px; padding:6px 8px; min-height:40px; background:#fff; }
.pp-topic-box input { flex:1; min-width:160px; border:0; outline:none; font-size:14px; padding:4px; background:transparent; }
.pp-topic-suggest { display:flex; flex-wrap:wrap; gap:6px; }
.pp-topic-suggest button { border:1px solid var(--line); background:#f8fafc; color:#475569; border-radius:8px; padding:4px 9px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:3px; }
.pp-topic-suggest button:hover { border-color:#c7d2fe; color:var(--accent); background:#fff; }
.pp-topic-suggest button.new { border-style:dashed; color:var(--accent); background:#fff; }
.pp-modal-foot { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:14px 22px; border-top:1px solid var(--line); background:#fafbff; }
.pp-modal-foot small { color:#94a3b8; font-size:11.5px; }
.pp-modal-actions { display:flex; gap:8px; }
.pp-manage-list { list-style:none; margin:0; padding:0; display:grid; gap:6px; }
.pp-manage-list li { display:flex; align-items:center; gap:10px; border:1px solid var(--line); border-radius:11px; padding:8px 10px; }
.pp-manage-list .name { flex:1; min-width:0; font-weight:700; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pp-manage-list input { flex:1; min-width:0; height:32px; border:1px solid #a5b4fc; border-radius:8px; padding:0 8px; font-size:14px; outline:none; }
.pp-manage-list .cnt { font-size:12px; color:#94a3b8; font-weight:700; white-space:nowrap; }
.pp-colors { display:flex; gap:3px; }
.pp-colors button { width:14px; height:14px; border-radius:50%; border:2px solid transparent; padding:0; opacity:.55; }
.pp-colors button.on { opacity:1; border-color:#fff; box-shadow:0 0 0 2px #94a3b8; }
.pp-colors button:hover { opacity:1; }

@media (max-width: 820px) {
  .pp-layout { grid-template-columns:1fr; gap:12px; }
  .pp-side { position:static; grid-template-columns:1fr; }
  .pp-side-card { padding:10px; }
  .pp-nav { display:flex; flex-wrap:wrap; gap:4px; }
  .pp-nav button { width:auto; padding:6px 10px; background:#f8fafc; }
  .pp-quick-open { width:auto; padding:0 12px; }
  .pp-stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .pp-toolbar .pp-search { flex-basis:100%; }
  .pp-row { grid-template-columns:34px minmax(0,1fr); padding:14px; }
  .pp-row-side { grid-column:1 / -1; grid-auto-flow:column; justify-content:start; justify-items:start; align-items:center; }
  .pp-order-btns { opacity:1; }
  .pp-num { font-size:18px; }
  .pp-dg { padding:16px; }
  .pp-detail-body { padding:20px 16px 28px; }
  .pp-detail h2 { font-size:22px; }
  .pp-detail-top { flex-wrap:wrap; }
  .pp-grid2, .pp-grid3 { grid-template-columns:1fr; }
  .pp-backdrop { padding:0; align-items:end; }
  .pp-modal, .pp-modal.narrow { width:100%; max-height:96vh; border-radius:20px 20px 0 0; }
  .pp-modal-foot { flex-direction:column; align-items:stretch; }
  .pp-modal-foot small { text-align:center; }
  .pp-modal-actions { justify-content:flex-end; }
  .pp-hint { display:none; }
}
`;
