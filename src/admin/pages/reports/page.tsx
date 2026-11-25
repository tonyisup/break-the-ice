import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ArrowDown, ArrowUp, Copy, Download, Info, Loader2, Scissors, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Segmented } from "@/admin/components/Segmented";
import { reviewBatches } from "../review/queue";
import {
  VIEW_SORT,
  emailCopy,
  percent,
  questionList,
  questionsCsv,
  rated,
  seconds,
  summarize,
  summaryCsv,
  type Dimension,
  type GroupSummary,
  type QuestionView,
  type RatedRow,
  type Sort,
  type SortKey,
} from "./metrics";

type Tab = "questions" | "style" | "tone" | "topic" | "model";
type Period = "all" | "90" | "30" | "7";
type GroupSortKey = "name" | "live" | "views" | "likeRate" | "hideRate" | "shared" | "avgViewMs" | "approval" | "claude" | "agreement";

const TABS: { value: Tab; label: string }[] = [
  { value: "questions", label: "Questions" },
  { value: "style", label: "Styles" },
  { value: "tone", label: "Tones" },
  { value: "topic", label: "Topics" },
  { value: "model", label: "Models" },
];
const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "90", label: "90 days" },
  { value: "30", label: "30 days" },
  { value: "7", label: "7 days" },
];
const VIEWS: { value: QuestionView; label: string }[] = [
  { value: "top", label: "Top performers" },
  { value: "poor", label: "Needs attention" },
  { value: "all", label: "All" },
];
const DIMENSION_LABEL: Record<Dimension, string> = { style: "Style", tone: "Tone", topic: "Topic", model: "Model" };
const DAY_MS = 24 * 60 * 60 * 1000;

const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab.value === value);
const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** A rate, with the counts it comes from beneath it. Muted when there are too few views to trust. */
function Rate({ value, hits, trials, thin }: { value: number; hits: number; trials: number; thin: boolean }) {
  if (trials === 0) return <span className="text-muted-foreground">–</span>;
  return (
    <span className={cn("inline-flex flex-col items-end leading-tight", thin && "text-muted-foreground")}>
      <span className="font-medium tabular-nums">{percent(value)}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {hits}/{trials}
      </span>
    </span>
  );
}

function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
  className,
}: {
  label: string;
  sortKey: K;
  sort: { key: K; direction: "asc" | "desc" };
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {label}
        {active && (sort.direction === "asc" ? <ArrowUp aria-hidden="true" className="size-3" /> : <ArrowDown aria-hidden="true" className="size-3" />)}
      </button>
    </th>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "questions";
  const [period, setPeriod] = React.useState<Period>("all");
  const [minViews, setMinViews] = React.useState(5);
  // From the start of a day, so the query's argument holds still between renders.
  const since = React.useMemo(() => {
    if (period === "all") return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime() - Number(period) * DAY_MS;
  }, [period]);

  const report = useQuery(api.admin.reports.getPerformanceReport, since === undefined ? {} : { since });
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});
  const topics = useQuery(api.core.topics.getTopics, {});
  const models = useQuery(api.admin.generator.listModels, {});

  const names = React.useMemo(() => {
    const map = (list?: { id: string; slug?: string; name: string }[]) =>
      new Map((list ?? []).flatMap((item) => [[item.id, item.name] as const, ...(item.slug ? [[item.slug, item.name] as const] : [])]));
    return {
      style: map(styles),
      tone: map(tones),
      topic: map(topics),
      model: new Map((models ?? []).map((m) => [m.model, m.label] as const)),
    };
  }, [styles, tones, topics, models]);
  const nameOf = React.useCallback(
    (dimension: Dimension, slug?: string) =>
      slug ? (names[dimension].get(slug) ?? slug) : dimension === "model" ? "Not recorded" : `No ${dimension}`,
    [names],
  );

  const rows = React.useMemo(() => (report?.rows ?? []).map(rated), [report]);
  // A style, tone or topic picked on its tab. "" picks the questions without one.
  const style = params.get("style") ?? undefined;
  const tone = params.get("tone") ?? undefined;
  const topic = params.get("topic") ?? undefined;
  const model = params.get("model") ?? undefined;
  const filter = React.useMemo(() => ({ style, tone, topic, model }), [style, tone, topic, model]);
  const live = rows.filter((row) => row.status === "live");
  const views = rows.reduce((sum, row) => sum + row.views, 0);
  const likes = rows.reduce((sum, row) => sum + row.liked, 0);
  const hides = rows.reduce((sum, row) => sum + row.hidden, 0);

  const setTab = (next: Tab, filter?: { dimension: Dimension; key: string }) => {
    const nextParams = new URLSearchParams();
    if (next !== "questions") nextParams.set("tab", next);
    if (filter) nextParams.set(filter.dimension, filter.key);
    setParams(nextParams);
  };

  if (report === undefined) {
    return (
      <div className="flex h-[50vh] items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading reports</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">How questions do with people, and how styles, tones, topics and models compare.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Period" value={period} options={PERIODS} onChange={setPeriod} />
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Min. views
            <Input
              type="number"
              min={1}
              value={minViews}
              onChange={(event) => setMinViews(Math.max(1, Math.floor(Number(event.target.value)) || 1))}
              className="h-8 w-16 text-sm"
            />
          </label>
        </div>
      </header>

      {(report.eventsTruncated || report.questionsTruncated) && (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {report.eventsTruncated && report.oldestEventAt !== undefined
            ? `Counting the latest ${report.eventsCounted.toLocaleString()} events, back to ${new Date(report.oldestEventAt).toLocaleDateString()}. Pick a shorter period to see all of it.`
            : "Some questions were left out: the report reads a limited number at once."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Library questions" value={live.length.toLocaleString()} />
        <Stat label="Views" value={views.toLocaleString()} detail={report.eventsCounted === 0 ? "None recorded in this period" : undefined} />
        <Stat label="Likes" value={likes.toLocaleString()} detail={views > 0 ? `${percent(likes / views)} of views` : undefined} />
        <Stat label="Hides" value={hides.toLocaleString()} detail={views > 0 ? `${percent(hides / views)} of views` : undefined} />
      </div>

      <div role="tablist" aria-label="Report" className="flex gap-1 border-b">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground",
              tab === item.value && "border-primary text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TABS.find((item) => item.value === tab)!.label}>
        {tab === "questions" ? (
          <QuestionsReport
            rows={rows}
            minViews={minViews}
            filter={filter}
            clearFilter={() => setTab("questions")}
            nameOf={nameOf}
          />
        ) : (
          <GroupReport
            key={tab}
            dimension={tab}
            rows={rows}
            minViews={minViews}
            nameOf={nameOf}
            openQuestions={(key) => setTab("questions", { dimension: tab, key })}
          />
        )}
      </div>

      <details className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <summary className="flex cursor-pointer items-center gap-2 font-medium text-foreground">
          <Info aria-hidden="true" className="size-4" /> How these are measured
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Views, likes, shares and hides come from what people did in the app during the period.</li>
          <li>
            <strong>Top performers</strong> ranks by the lowest like rate the views can vouch for, so one like from one view doesn&rsquo;t beat 30 from
            100. <strong>Needs attention</strong> ranks by the highest like rate the views allow, so questions shown often and rarely liked come
            first. Both leave out questions under the minimum views.
          </li>
          <li>Rates under the minimum views are greyed out. The counts under each rate show how many views it rests on.</li>
          <li>
            <strong>Your approval</strong> is the share of a group&rsquo;s AI questions you approved, out of those you approved or rejected.{" "}
            <strong>Claude keep</strong> is the share Claude&rsquo;s check would keep. <strong>Agreed</strong> is how often your decision matched
            Claude&rsquo;s verdict. Editing a question clears Claude&rsquo;s verdict, so edited questions aren&rsquo;t compared.
          </li>
          <li>
            <strong>Models</strong> groups questions by the model that generated them. Questions from before the generator recorded it show as
            &ldquo;Not recorded&rdquo;.
          </li>
        </ul>
      </details>
    </div>
  );
}

function QuestionsReport({
  rows,
  minViews,
  filter,
  clearFilter,
  nameOf,
}: {
  rows: RatedRow[];
  minViews: number;
  filter: { style?: string; tone?: string; topic?: string; model?: string };
  clearFilter: () => void;
  nameOf: (dimension: Dimension, slug?: string) => string;
}) {
  const pruneQuestions = useMutation(api.admin.review.pruneQuestions);
  const undoReview = useMutation(api.admin.pruning.undoReview);
  const [view, setView] = React.useState<QuestionView>("top");
  const [sort, setSort] = React.useState<Sort>(VIEW_SORT.top);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<Id<"questions">>>(new Set());
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pruning, setPruning] = React.useState(false);

  const list = React.useMemo(
    () => questionList(rows, { view, minViews, search, ...filter }, sort),
    [rows, view, minViews, search, filter, sort],
  );
  // Only what is listed can be acted on, so a filter never hides a selected question.
  const picked = list.filter((row) => selected.has(row.id));
  const allPicked = list.length > 0 && picked.length === list.length;
  const activeFilter = (Object.entries(filter) as [Dimension, string | undefined][]).find(([, value]) => value !== undefined);

  const changeView = (next: QuestionView) => {
    setView(next);
    setSort(VIEW_SORT[next]);
  };
  const onSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "text" ? "asc" : "desc" }));
  const toggle = (id: Id<"questions">) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copyForEmail = async () => {
    try {
      await navigator.clipboard.writeText(emailCopy(picked, window.location.origin));
      toast.success(`Copied ${picked.length === 1 ? "1 question" : `${picked.length} questions`} with their links`);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  };

  const prune = async () => {
    const batches = reviewBatches(picked.map((row) => ({ id: row.id, expectedRevision: row.reviewRevision })));
    const reviewIds: Id<"questionReviews">[] = [];
    setPruning(true);
    try {
      for (const questions of batches) reviewIds.push((await pruneQuestions({ questions })).reviewId);
      const count = picked.length;
      toast.success(`Pruned ${count === 1 ? "1 question" : `${count} questions`}`, {
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              try {
                for (const reviewId of [...reviewIds].reverse()) await undoReview({ reviewId });
                toast.success("Prune undone");
              } catch (error) {
                toast.error(errorMessage(error, "Couldn't undo the prune"));
              }
            })();
          },
        },
      });
      setSelected(new Set());
    } catch (error) {
      const saved = reviewIds.length > 0 ? ` The first ${reviewIds.length * batches[0].length} were pruned.` : "";
      toast.error(errorMessage(error, "Couldn't prune these questions") + saved);
    } finally {
      setPruning(false);
    }
  };

  const exportRows = picked.length > 0 ? picked : list;
  const thin = (row: RatedRow) => row.views < minViews;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        {picked.length > 0 ? (
          <>
            <span className="text-sm font-medium">{picked.length} selected</span>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void copyForEmail()}>
                <Copy aria-hidden="true" className="size-4" /> Copy for email
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => download("questions.csv", questionsCsv(exportRows, nameOf))}>
                <Download aria-hidden="true" className="size-4" /> Export CSV
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" disabled={pruning} onClick={() => setConfirmOpen(true)}>
                {pruning ? <Loader2 className="size-4 animate-spin" /> : <Scissors aria-hidden="true" className="size-4" />}
                Prune {picked.length}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Segmented label="Questions to show" value={view} options={VIEWS} onChange={changeView} />
            <div className="relative">
              <Search aria-hidden="true" className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search questions"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 w-48 pl-8 text-sm"
              />
            </div>
            {activeFilter && (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs font-medium">
                {DIMENSION_LABEL[activeFilter[0]]}: {nameOf(activeFilter[0], activeFilter[1] || undefined)}
                <button type="button" aria-label="Clear filter" onClick={clearFilter} className="rounded-full p-0.5 hover:bg-muted">
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            )}
            <Button size="sm" variant="ghost" className="ml-auto gap-1.5" disabled={list.length === 0} onClick={() => download("questions.csv", questionsCsv(exportRows, nameOf))}>
              <Download aria-hidden="true" className="size-4" /> Export CSV
            </Button>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <Checkbox
                  aria-label="Select all listed"
                  checked={allPicked}
                  disabled={list.length === 0}
                  onChange={() => setSelected(allPicked ? new Set() : new Set(list.map((row) => row.id)))}
                />
              </th>
              <SortHeader label="Question" sortKey="text" sort={sort} onSort={onSort} align="left" />
              <SortHeader label="Views" sortKey="views" sort={sort} onSort={onSort} />
              <SortHeader label="Like rate" sortKey="likeRate" sort={sort} onSort={onSort} />
              <SortHeader label="Shares" sortKey="shared" sort={sort} onSort={onSort} className="max-md:hidden" />
              <SortHeader label="Hide rate" sortKey="hideRate" sort={sort} onSort={onSort} />
              <SortHeader label="Avg time" sortKey="avgViewMs" sort={sort} onSort={onSort} className="max-md:hidden" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.map((row) => (
              <tr key={row.id} className={cn("align-top hover:bg-muted/40", selected.has(row.id) && "bg-primary/5")}>
                <td className="px-3 py-2.5">
                  <Checkbox aria-label={`Select: ${row.text}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                </td>
                <td className="min-w-[16rem] px-3 py-2.5">
                  <Link to={`/admin/questions/${row.id}`} className="font-medium hover:underline">
                    {row.text}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {nameOf("style", row.style)} · {nameOf("tone", row.tone)}
                    {row.topic && ` · ${nameOf("topic", row.topic)}`}
                    {row.byPerson && " · Written by a person"}
                  </p>
                </td>
                <td className={cn("px-3 py-2.5 text-right tabular-nums", thin(row) && "text-muted-foreground")}>{row.views}</td>
                <td className="px-3 py-2.5 text-right">
                  <Rate value={row.likeRate} hits={row.liked} trials={row.views} thin={thin(row)} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums max-md:hidden">{row.shared}</td>
                <td className="px-3 py-2.5 text-right">
                  <Rate value={row.hideRate} hits={row.hidden} trials={row.views} thin={thin(row)} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground max-md:hidden">{seconds(row.avgViewMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {view === "all" ? (
              "No library questions match."
            ) : (
              <>
                <p>No library questions have {minViews}+ views{search || activeFilter ? " among these" : " in this period"}.</p>
                <Button variant="link" size="sm" onClick={() => changeView("all")}>
                  Show all questions
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Prune ${picked.length === 1 ? "1 question" : `${picked.length} questions`}?`}
        description="They leave the library and stop being shown. You can undo from the notice that follows."
        confirmLabel="Prune"
        onConfirm={prune}
      />
    </div>
  );
}

function GroupReport({
  dimension,
  rows,
  minViews,
  nameOf,
  openQuestions,
}: {
  dimension: Dimension;
  rows: RatedRow[];
  minViews: number;
  nameOf: (dimension: Dimension, slug?: string) => string;
  openQuestions: (key: string) => void;
}) {
  const [sort, setSort] = React.useState<{ key: GroupSortKey; direction: "asc" | "desc" }>({ key: "views", direction: "desc" });
  const groups = React.useMemo(() => summarize(rows, dimension), [rows, dimension]);
  const name = (key: string) => nameOf(dimension, key || undefined);
  const share = (hits: number, of: number) => (of > 0 ? hits / of : -1);
  const value = (g: GroupSummary): number | string => {
    switch (sort.key) {
      case "name":
        return name(g.key).toLowerCase();
      case "approval":
        return share(g.approved, g.decided);
      case "claude":
        return share(g.claudeKeep, g.claudeChecked);
      case "agreement":
        return share(g.agreed, g.compared);
      default:
        return g[sort.key];
    }
  };
  const sorted = [...groups].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const order = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return (sort.direction === "asc" ? order : -order) || b.views - a.views;
  });
  const onSort = (key: GroupSortKey) =>
    setSort((current) => (current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "name" ? "asc" : "desc" }));
  const label = DIMENSION_LABEL[dimension];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Pick a {dimension} to see its questions.</p>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => download(`${dimension}s.csv`, summaryCsv(sorted, label, name))}>
          <Download aria-hidden="true" className="size-4" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <SortHeader label={label} sortKey="name" sort={sort} onSort={onSort} align="left" />
              <SortHeader label="Library" sortKey="live" sort={sort} onSort={onSort} />
              <SortHeader label="Views" sortKey="views" sort={sort} onSort={onSort} />
              <SortHeader label="Like rate" sortKey="likeRate" sort={sort} onSort={onSort} />
              <SortHeader label="Hide rate" sortKey="hideRate" sort={sort} onSort={onSort} />
              <SortHeader label="Shares" sortKey="shared" sort={sort} onSort={onSort} className="max-lg:hidden" />
              <SortHeader label="Avg time" sortKey="avgViewMs" sort={sort} onSort={onSort} className="max-lg:hidden" />
              <SortHeader label="Your approval" sortKey="approval" sort={sort} onSort={onSort} />
              <SortHeader label="Claude keep" sortKey="claude" sort={sort} onSort={onSort} />
              <SortHeader label="Agreed" sortKey="agreement" sort={sort} onSort={onSort} className="max-md:hidden" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((g) => {
              const thin = g.views < minViews;
              return (
                <tr key={g.key} className="hover:bg-muted/40">
                  <th scope="row" className="px-3 py-2.5 text-left font-medium">
                    <button type="button" onClick={() => openQuestions(g.key)} className="text-left hover:underline">
                      {name(g.key)}
                    </button>
                    <p className="text-xs font-normal text-muted-foreground">
                      {g.questions} questions{g.pending > 0 && ` · ${g.pending} waiting`}
                      {g.retired > 0 && ` · ${g.retired} retired`}
                    </p>
                  </th>
                  <td className="px-3 py-2.5 text-right tabular-nums">{g.live}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular-nums", thin && "text-muted-foreground")}>{g.views}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Rate value={g.likeRate} hits={g.liked} trials={g.views} thin={thin} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Rate value={g.hideRate} hits={g.hidden} trials={g.views} thin={thin} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums max-lg:hidden">{g.shared}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground max-lg:hidden">{seconds(g.avgViewMs)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Rate value={share(g.approved, g.decided)} hits={g.approved} trials={g.decided} thin={false} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Rate value={share(g.claudeKeep, g.claudeChecked)} hits={g.claudeKeep} trials={g.claudeChecked} thin={false} />
                  </td>
                  <td className="px-3 py-2.5 text-right max-md:hidden">
                    <Rate value={share(g.agreed, g.compared)} hits={g.agreed} trials={g.compared} thin={false} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No questions yet.</div>}
      </div>
    </div>
  );
}
