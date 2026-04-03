"use client";

import * as React from "react";
import { CreateOrganization, useAuth, useOrganization } from "@clerk/clerk-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  CalendarDays,
  Plus,
  X,
  Shuffle,
  Crown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Icon, IconComponent } from "@/components/ui/icons/icon";

const DAYS_DISPLAY: {
  key: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  label: string;
  abbr: string;
}[] = [
  { key: "monday", label: "Monday", abbr: "Mon" },
  { key: "tuesday", label: "Tuesday", abbr: "Tue" },
  { key: "wednesday", label: "Wednesday", abbr: "Wed" },
  { key: "thursday", label: "Thursday", abbr: "Thu" },
  { key: "friday", label: "Friday", abbr: "Fri" },
  { key: "saturday", label: "Saturday", abbr: "Sat" },
  { key: "sunday", label: "Sunday", abbr: "Sun" },
];

type AxisType = "style" | "tone" | "topic";

const axisLabels: Record<AxisType, string> = {
  style: "Style",
  tone: "Tone",
  topic: "Topic",
};

/** Map a visible matrix (ySlug × xSlug) to style/tone/topic for generation. */
function generationSlugsForMatrixCell(
  axisY: AxisType,
  axisX: AxisType,
  ySlug: string,
  xSlug: string,
  /** Applied only when neither visible axis is "topic" (matrix topic comes from rows/cols otherwise). */
  globalTopicSlug: string | undefined,
  styleList: Array<{ slug: string }> | undefined,
  toneList: Array<{ slug: string }> | undefined,
): { styleSlug: string; toneSlug: string; topicSlug?: string } {
  if (axisY === axisX) {
    throw new Error("Primary and secondary axes must be different taxonomies.");
  }

  let styleSlug: string | undefined;
  let toneSlug: string | undefined;
  let matrixTopicSlug: string | undefined;

  if (axisY === "style") styleSlug = ySlug;
  else if (axisY === "tone") toneSlug = ySlug;
  else matrixTopicSlug = ySlug;

  if (axisX === "style") styleSlug = xSlug;
  else if (axisX === "tone") toneSlug = xSlug;
  else matrixTopicSlug = xSlug;

  const resolvedTopic =
    axisY === "topic" || axisX === "topic"
      ? matrixTopicSlug
      : globalTopicSlug ?? matrixTopicSlug;

  const defaultStyle = styleList?.[0]?.slug;
  const defaultTone = toneList?.[0]?.slug;
  if (!styleSlug) {
    if (!defaultStyle) {
      throw new Error("At least one style is required to generate questions");
    }
    styleSlug = defaultStyle;
  }
  if (!toneSlug) {
    if (!defaultTone) {
      throw new Error("At least one tone is required to generate questions");
    }
    toneSlug = defaultTone;
  }

  return { styleSlug, toneSlug, topicSlug: resolvedTopic };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function computeWeekRange(weekStartDay: "monday" | "sunday", offset = 0) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const sundayOffset = -dayOfWeek;
  const startOffset = weekStartDay === "monday" ? mondayOffset : sundayOffset;
  const start = new Date(today);
  start.setDate(today.getDate() + startOffset + offset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start,
    end,
    label: `${start.toLocaleString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    isoStart: start.toISOString().slice(0, 10),
  };
}

/** Deterministic shuffle so each cell can pick a stable random question; Remix bumps the seed. */
function shuffleArrayWithSeed<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed >>> 0;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ──────────────────────────────────────────────
// Multi-select axis picker
// ──────────────────────────────────────────────

function AxisMultiSelect({
  items,
  selectedIds,
  onToggle,
  label,
}: {
  items: { id: string; name: string; slug: string }[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  label: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start text-sm font-normal h-8">
          {selectedIds.size > 0
            ? `${selectedIds.size} selected`
            : `Select ${label}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <ScrollArea className="h-48">
          <div className="space-y-1">
            {items.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-sm"
              >
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onChange={() => onToggle(item.id)}
                />
                <span className="truncate">{item.name}</span>
              </label>
            ))}
            {items.length === 0 && (
              <p className="px-2 py-4 text-xs text-muted-foreground text-center">None available</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ──────────────────────────────────────────────
// Day slot card
// ──────────────────────────────────────────────

interface DaySlotProps {
  dayKey: (typeof DAYS_DISPLAY)[number]["key"];
  dayLabel: string;
  dayAbbr: string;
  date: Date;
  assignment:
    | {
        scheduledQuestionId: string;
        questionId: string;
        text: string | undefined;
        style?: string;
        tone?: string;
        topic?: string;
      }
    | undefined;
  canEdit: boolean;
  onAssignClick: (dayKey: string) => void;
  onUnassign: (scheduledQuestionId: string) => void;
  isTarget: boolean;
}

function DaySlot({ dayKey, dayLabel, dayAbbr, date, assignment, canEdit, onAssignClick, onUnassign, isTarget }: DaySlotProps) {
  const isToday = new Date().toDateString() === date.toDateString();

  return (
    <Card
      className={cn(
        "relative transition-all min-h-[120px]",
        assignment ? "border-primary/30 bg-primary/5" : "border-dashed",
        isTarget && "ring-2 ring-primary ring-offset-2",
        isToday && "ring-1 ring-amber-400/50"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {dayAbbr}
          </span>
          {isToday && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Today</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {date.getDate()}
        </span>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {assignment ? (
          <div className="space-y-2">
            <p className="text-sm leading-snug">{assignment.text ?? <em className="text-muted-foreground">Untitled</em>}</p>
            <div className="flex flex-wrap gap-1">
              {assignment.style && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{assignment.style}</Badge>
              )}
              {assignment.tone && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{assignment.tone}</Badge>
              )}
              {assignment.topic && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{assignment.topic}</Badge>
              )}
            </div>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => onUnassign(assignment.scheduledQuestionId)}
              >
                <X className="size-3.5 mr-1" /> Remove
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full pt-2 pb-4">
            {canEdit ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground hover:text-foreground"
                onClick={() => onAssignClick(dayKey)}
              >
                <Plus className="size-3.5 mr-1" /> Assign
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Empty</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────

export default function OrgWeeklyCurationPage() {
  const { activeWorkspace, setActiveWorkspace } = useWorkspace();
  const { isSignedIn, isLoaded: authLoaded, orgId: clerkOrgId } = useAuth();
  const { organization: clerkOrganization, isLoaded: clerkOrgLoaded } = useOrganization();

  /* --- Ensure user is synced to Convex before queries run --- */
  const syncUser = useMutation(api.core.users.store);
  React.useEffect(() => {
    if (isSignedIn) syncUser().catch(() => {});
  }, [isSignedIn, syncUser]);

  /* --- Query schedules across ANY org the user can access --- */
  const allSchedules = useQuery(
    api.core.schedules.listSchedulesForUser,
    isSignedIn ? {} : "skip"
  );

  /** Convex orgs the user belongs to (fallback when there are no schedules yet) */
  const myOrganizations = useQuery(
    api.core.organizations.getOrganizations,
    isSignedIn ? {} : "skip"
  );

  /* --- Auto-connect: prefer an org that has schedules, else any membership --- */
  React.useEffect(() => {
    if (activeWorkspace) return;
    if (allSchedules && allSchedules.length > 0) {
      setActiveWorkspace(allSchedules[0].organizationId);
      return;
    }
    if (myOrganizations && myOrganizations.length > 0) {
      const sorted = [...myOrganizations].sort(
        (a, b) => b._creationTime - a._creationTime
      );
      setActiveWorkspace(sorted[0]._id);
    }
  }, [allSchedules, myOrganizations, activeWorkspace, setActiveWorkspace]);

  const orgId = activeWorkspace;
  const schedules = useQuery(
    api.core.schedules.listSchedules,
    orgId ? { organizationId: orgId } : "skip"
  );

  /* --- Org settings --- */
  const orgSettings = useQuery(
    api.core.orgSettings.getOrgSettings,
    orgId ? { organizationId: orgId } : "skip"
  );
  const weekStartDay = (orgSettings?.weekStartDay ?? "monday") as "monday" | "sunday";

  /* --- Week navigation --- */
  const [weekOffset, setWeekOffset] = React.useState(0);
  const week = computeWeekRange(weekStartDay, weekOffset);

  /* --- Current schedule for this week --- */
  const currentSchedule = schedules?.find(
    (s) => s.weekStart === week.isoStart
  );

  const scheduleDetail = useQuery(
    api.core.schedules.getSchedule,
    currentSchedule ? { scheduleId: currentSchedule._id } : "skip"
  );

  /* --- Question pool updates via real-time subscription --- */
const [isFillingOrRegen, setIsFillingOrRegen] = React.useState(false);

const questionPool = useQuery(
    api.core.questions.getPublicQuestions,
    isSignedIn ? { limit: 200 } : "skip"
  );

  /* --- Axis filter state --- */
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});
  const topics = useQuery(api.core.topics.getTopics, {});

  const [axisY, setAxisY] = React.useState<AxisType>("style");
  const [axisX, setAxisX] = React.useState<AxisType>("tone");
  const [axisYSelected, setAxisYSelected] = React.useState<Set<string>>(new Set());
  const [axisXSelected, setAxisXSelected] = React.useState<Set<string>>(new Set());

  /* --- Third axis control: "Topic" — global vs random per cell --- */
  type TopicPolicy = "global" | "random";
  const [topicPolicy, setTopicPolicy] = React.useState<TopicPolicy>("random");
  const [globalTopicId, setGlobalTopicId] = React.useState<string | undefined>();
  /* Resolve the effective topic slug used for generating questions */
  const effectiveTopicSlug = React.useMemo(() => {
    if (topicPolicy === "global" && topics) {
      return topics.find(t => t.id === globalTopicId)?.slug;
    }
    return undefined; // random
  }, [topicPolicy, globalTopicId, topics]);

  /** Global topic for generation/pool only when topic is not already a visible matrix axis. */
  const globalTopicSlugForMatrix =
    axisY !== "topic" && axisX !== "topic" ? effectiveTopicSlug : undefined;

  /* --- Auto-seed 5 random items per axis on first data load --- */
  const MAX_AXIS_ITEMS = 5;
  const axisYSeededRef = React.useRef(false);
  const axisXSeededRef = React.useRef(false);

  React.useEffect(() => {
    if (!axisYSeededRef.current && styles && styles.length > 5 && axisY === "style") {
      const shuffled = [...styles].sort(() => Math.random() - 0.5).slice(0, MAX_AXIS_ITEMS);
      setAxisYSelected(new Set(shuffled.map(s => s.id)));
      axisYSeededRef.current = true;
    }
  }, [styles, axisY]);

  React.useEffect(() => {
    if (!axisXSeededRef.current && tones && tones.length > 5 && axisX === "tone") {
      const shuffled = [...tones].sort(() => Math.random() - 0.5).slice(0, MAX_AXIS_ITEMS);
      setAxisXSelected(new Set(shuffled.map(t => t.id)));
      axisXSeededRef.current = true;
    }
  }, [tones, axisX]);

  /* --- UI state --- */
  const [assignTargetDay, setAssignTargetDay] = React.useState<string | null>(null);

  /* --- Mutations --- */
  const createSchedule = useMutation(api.core.schedules.createSchedule);
  const assignQuestion = useMutation(api.core.schedules.assignQuestion);
  const unassignQuestion = useMutation(api.core.schedules.unassignQuestion);
  const publishSchedule = useMutation(api.core.schedules.publishSchedule);
  const autoSchedule = useMutation(api.core.schedules.autoSchedule);
  const upsertSettings = useMutation(api.core.orgSettings.upsertOrgSettings);
  const syncOrg = useMutation(api.core.billing.syncOrganizationFromClerk);
  const syncOrgViaClerkApi = useAction(api.core.billingSyncAction.syncOrganizationViaClerkApi);
  const fillEmptyCellsAction = useAction(api.core.fillMatrix.fillEmptyCells);
  const fillSingleCellAction = useAction(api.core.fillMatrix.fillSingleCell);

  /* Generation state */
  const [isFillingEmpty, setIsFillingEmpty] = React.useState(false);
  const [fillingCellKey, setFillingCellKey] = React.useState<string | null>(null);

  /* Clerk → Convex sync when session has an org but workspace id is not set yet */
  React.useEffect(() => {
    if (!isSignedIn || !authLoaded || !clerkOrgLoaded || activeWorkspace) return;
    if (!clerkOrgId || !clerkOrganization?.name) return;
    let cancelled = false;
    void syncOrg({ name: clerkOrganization.name })
      .then((id) => {
        if (cancelled || id) {
          if (id) setActiveWorkspace(id);
          return;
        }
        return syncOrgViaClerkApi({
          clerkOrganizationId: clerkOrgId,
          organizationName: clerkOrganization.name,
        }).then((cid) => {
          if (!cancelled && cid) setActiveWorkspace(cid);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    isSignedIn,
    authLoaded,
    clerkOrgLoaded,
    activeWorkspace,
    clerkOrgId,
    clerkOrganization?.name,
    syncOrg,
    syncOrgViaClerkApi,
    setActiveWorkspace,
  ]);

  /* --- Derived --- */
  const canEdit = !currentSchedule || currentSchedule.status === "draft";

  /* Map assignments by day */
  const assignmentsByDay = React.useMemo(() => {
    const map: Record<string, DaySlotProps["assignment"]> = {};
    if (!scheduleDetail?.assignments) return map;
    for (const a of scheduleDetail.assignments) {
      map[a.dayOfWeek] = {
        scheduledQuestionId: a._id,
        questionId: a.question._id,
        text: a.question.text,
        style: a.question.style,
        tone: a.question.tone,
        topic: a.question.topic,
      };
    }
    return map;
  }, [scheduleDetail]);

  /* Build day rows with dates — labels rotate with week start */
  const dayRows = React.useMemo(() => {
    const rows: { key: typeof DAYS_DISPLAY[number]["key"]; date: Date; label: string; abbr: string }[] = [];
    const orderedDays = weekStartDay === "monday"
      ? DAYS_DISPLAY
      : DAYS_DISPLAY.slice().sort((a, b) => {
          const order = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
          return order.indexOf(a.key) - order.indexOf(b.key);
        });

    for (let i = 0; i < 7; i++) {
      const d = new Date(week.start);
      d.setDate(d.getDate() + i);
      const dayObj = orderedDays[i];
      rows.push({ key: dayObj.key, date: d, label: dayObj.label, abbr: dayObj.abbr });
    }
    return rows;
  }, [week, weekStartDay]);

  const weekIsFull = React.useMemo(
    () => dayRows.length > 0 && dayRows.every((row) => assignmentsByDay[row.key] != null),
    [dayRows, assignmentsByDay]
  );

  /* Filtered pool based on axis selections */
  const filteredPool = React.useMemo(() => {
    if (!questionPool) return [];
    let filtered = questionPool;
    if (axisYSelected.size > 0) {
      const lookup = new Map(
        (axisY === "style" ? styles : axisY === "tone" ? tones : topics)?.map((t) => [
          t.id,
          t.slug,
        ]) ?? []
      );
      const slugs = new Set([...axisYSelected].map((id) => lookup.get(id)).filter(Boolean));
      filtered = filtered.filter((q) => {
        const val = axisY === "style" ? q.style : axisY === "tone" ? q.tone : q.topic;
        return val && slugs.has(val);
      });
    }
    if (axisXSelected.size > 0) {
      const lookup = new Map(
        (axisX === "style" ? styles : axisX === "tone" ? tones : topics)?.map((t) => [
          t.id,
          t.slug,
        ]) ?? []
      );
      const slugs = new Set([...axisXSelected].map((id) => lookup.get(id)).filter(Boolean));
      filtered = filtered.filter((q) => {
        const val = axisX === "style" ? q.style : axisX === "tone" ? q.tone : q.topic;
        return val && slugs.has(val);
      });
    }
    if (globalTopicSlugForMatrix) {
      filtered = filtered.filter((q) => (q.topic ?? "") === globalTopicSlugForMatrix);
    }
    return filtered;
  }, [questionPool, axisY, axisX, axisYSelected, axisXSelected, styles, tones, topics, globalTopicSlugForMatrix]);

  /* Taxonomy items for the axis dropdowns */
  const axisYItems = React.useMemo(
    () =>
      (axisY === "style" ? styles : axisY === "tone" ? tones : topics)?.map((t) => ({
        id: t.id,
        name: t.name as string,
        slug: t.slug as string,
        icon: t.icon as Icon,
        color: t.color as string,
      })) ?? [],
    [axisY, styles, tones, topics]
  );
  const axisXItems = React.useMemo(
    () =>
      (axisX === "style" ? styles : axisX === "tone" ? tones : topics)?.map((t) => ({
        id: t.id,
        name: t.name as string,
        slug: t.slug as string,
        icon: t.icon as Icon,
        color: t.color as string,
      })) ?? [],
    [axisX, styles, tones, topics]
  );

  const [matrixRemixGeneration, setMatrixRemixGeneration] = React.useState(0);

  /* Week auto-assign from filter selections */
  const [isGenerating, setIsGenerating] = React.useState(false);

  type PoolRow = (typeof filteredPool)[number];
  const questionMatrix = React.useMemo(() => {
    const yItems =
      axisYSelected.size > 0 ? axisYItems.filter((t) => axisYSelected.has(t.id)) : axisYItems;
    const xItems =
      axisXSelected.size > 0 ? axisXItems.filter((t) => axisXSelected.has(t.id)) : axisXItems;
    if (yItems.length === 0 || xItems.length === 0) return null;
    if (axisY === axisX) return null;

    const matrix: PoolRow[][][] = yItems.map(() =>
      xItems.map(() => [] as PoolRow[])
    );

    for (const q of filteredPool) {
      const ySlug = axisY === "style" ? q.style : axisY === "tone" ? q.tone : q.topic;
      const xSlug = axisX === "style" ? q.style : axisX === "tone" ? q.tone : q.topic;
      const yIdx = yItems.findIndex((t) => t.slug === ySlug);
      const xIdx = xItems.findIndex((t) => t.slug === xSlug);
      if (yIdx >= 0 && xIdx >= 0) {
        matrix[yIdx][xIdx].push(q);
      }
    }

    // One question per cell: seeded pick so it stays stable until pool or Remix changes.
    for (let yi = 0; yi < yItems.length; yi++) {
      for (let xi = 0; xi < xItems.length; xi++) {
        const bucket = matrix[yi][xi];
        if (bucket.length <= 1) continue;
        const seed = matrixRemixGeneration * 1_000_000 + yi * 1_000 + xi;
        matrix[yi][xi] = [shuffleArrayWithSeed(bucket, seed)[0]];
      }
    }

    return { yItems, xItems, matrix };
  }, [
    filteredPool,
    axisY,
    axisX,
    axisYSelected,
    axisXSelected,
    axisYItems,
    axisXItems,
    matrixRemixGeneration,
  ]);

  /* Handlers */
  const handleRemixGridQuestions = () => {
    if (filteredPool.length === 0) {
      toast.message("No questions match the current filters.");
      return;
    }
    setMatrixRemixGeneration((g) => g + 1);
    toast.success("New random question per cell");
  };

  const handleCreateWeek = async () => {
    if (!orgId) return;
    try {
      await createSchedule({
        organizationId: orgId,
        weekStart: week.isoStart,
        weekStartDay,
      });
      toast.success(`Schedule created for ${week.label}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create schedule");
    }
  };

  const handleGenerateWeek = async () => {
    if (!orgId) return;
    setIsGenerating(true);
    try {
      // Create schedule if needed
      let sched = currentSchedule;
      if (!sched) {
        const newId = await createSchedule({
          organizationId: orgId,
          weekStart: week.isoStart,
          weekStartDay,
        });
        toast.success(`Created week of ${week.label}`);
        sched = { _id: newId } as typeof currentSchedule;
      }
      if (!sched) {
        toast.error("Could not create or find schedule for this week");
        return;
      }

      // Try axis-aware fill: filter by selected axis values
      const axisFilters: { axisYSlugs?: string[]; axisXSlugs?: string[] } = {};
      if (axisYSelected.size > 0) {
        const lookup = new Map(
          (axisY === "style" ? styles : axisY === "tone" ? tones : topics)?.map((t) => [
            t.id, t.slug,
          ]) ?? []
        );
        axisFilters.axisYSlugs = [...axisYSelected].map(id => lookup.get(id)).filter(Boolean) as string[];
      }
      if (axisXSelected.size > 0) {
        const lookup = new Map(
          (axisX === "style" ? styles : axisX === "tone" ? tones : topics)?.map((t) => [
            t.id, t.slug,
          ]) ?? []
        );
        axisFilters.axisXSlugs = [...axisXSelected].map(id => lookup.get(id)).filter(Boolean) as string[];
      }

      // For now use the existing autoSchedule which shuffles public questions
      // Future: pass axis filters to a filtered autoSchedule mutation
      await autoSchedule({ scheduleId: sched._id });
      toast.success("Week auto-filled!");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAutoSchedule = async () => {
    if (!currentSchedule) return;
    try {
      await autoSchedule({ scheduleId: currentSchedule._id });
      toast.success("Week auto-filled!");
    } catch (e: any) {
      toast.error(e.message ?? "Auto-schedule failed");
    }
  };

  const handlePublish = async () => {
    if (!currentSchedule) return;
    try {
      await publishSchedule({ scheduleId: currentSchedule._id });
      toast.success("Week published — coaches can now see their questions");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to publish");
    }
  };

  const handleAssign = async (dayKey: string, questionId: string) => {
    try {
      // Auto-create schedule if missing
      let sched = currentSchedule;
      if (!sched && orgId) {
        const newId = await createSchedule({
          organizationId: orgId,
          weekStart: week.isoStart,
          weekStartDay,
        });
        toast.success("Created schedule, assigning…");
        sched = { _id: newId } as typeof currentSchedule;
      }
      if (!sched) {
        toast.error("Create a week schedule first");
        return;
      }

      await assignQuestion({
        scheduleId: sched._id,
        dayOfWeek: dayKey as any,
        questionId: questionId as Id<"questions">,
      });
      setAssignTargetDay(null);
      toast.success("Assigned to " + (DAYS_DISPLAY.find(d => d.key === dayKey)?.label ?? dayKey));
    } catch (e: any) {
      toast.error(e.message ?? "Failed to assign");
    }
  };

  const handleUnassign = async (scheduledQuestionId: string) => {
    try {
      await unassignQuestion({
        scheduledQuestionId: scheduledQuestionId as Id<"scheduledQuestions">,
      });
      toast.info("Removed");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to unassign");
    }
  };

  const handleWeekStartChange = async (value: "monday" | "sunday") => {
    if (!orgId) return;
    try {
      await upsertSettings({
        organizationId: orgId,
        weekStartDay: value,
      });
      toast.success(`Week now starts on ${value === "monday" ? "Monday" : "Sunday"}`);
    } catch {}
  };

  // Trigger org sync when Clerk org changes
  const handleOrgReady = async (name: string) => {
    try {
      const orgDocId = await syncOrg({ name });
      if (orgDocId) {
        setActiveWorkspace(orgDocId);
        toast.success(`Connected to ${name}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to sync org");
    }
  };

  const toggleY = (id: string) =>
    setAxisYSelected((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      if (prev.size >= MAX_AXIS_ITEMS) return prev; // cap at 5
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const toggleX = (id: string) =>
    setAxisXSelected((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      if (prev.size >= MAX_AXIS_ITEMS) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const remixAxes = () => {
    const allY = axisY === "style" ? styles : axisY === "tone" ? tones : topics;
    const allX = axisX === "style" ? styles : axisX === "tone" ? tones : topics;

    if (allY && allY.length > 0) {
      const shuffled = [...allY].sort(() => Math.random() - 0.5).slice(0, MAX_AXIS_ITEMS);
      setAxisYSelected(new Set(shuffled.map(t => t.id)));
      axisYSeededRef.current = true;
    }
    if (allX && allX.length > 0) {
      const shuffled = [...allX].sort(() => Math.random() - 0.5).slice(0, MAX_AXIS_ITEMS);
      setAxisXSelected(new Set(shuffled.map(t => t.id)));
      axisXSeededRef.current = true;
    }
    toast.success("Axes reshuffled");
  };

  /* --- Fill empty cells in the matrix --- */
  const handleFillEmptyCells = async () => {
    if (!questionMatrix) return;
    setIsFillingOrRegen(true);
    setIsFillingEmpty(true);
    try {
      const cells = questionMatrix.yItems.flatMap((y) =>
        questionMatrix.xItems.map((x) => {
          const gen = generationSlugsForMatrixCell(
            axisY,
            axisX,
            y.slug,
            x.slug,
            globalTopicSlugForMatrix,
            styles,
            tones,
          );
          return {
            ySlug: y.slug,
            xSlug: x.slug,
            styleSlug: gen.styleSlug,
            toneSlug: gen.toneSlug,
          };
        }),
      );

      if (!orgId) {
        toast.error("Select an organization to fill the matrix");
        return;
      }

      const result = await fillEmptyCellsAction({
        organizationId: orgId,
        axisY,
        axisX,
        topicSlug: globalTopicSlugForMatrix,
        cells,
      });

      let msg = `Filled ${result.filledCells}/${result.totalCells} cells (${result.totalQuestionsGenerated} questions)`;
      if (result.skippedInvalidTaxonomy > 0) {
        msg += ` · ${result.skippedInvalidTaxonomy} skipped (deleted taxonomy)`;
      }
      toast.success(msg);
      setForceRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to fill empty cells");
    } finally {
      setIsFillingEmpty(false);
      setIsFillingOrRegen(false);
    }
  };

  const handleFillSingleCell = async (ySlug: string, xSlug: string) => {
    const cellKey = `${ySlug}-${xSlug}`;
    setFillingCellKey(cellKey);
    try {
      if (!orgId) {
        toast.error("Select an organization to generate");
        return;
      }
      const { styleSlug, toneSlug, topicSlug } = generationSlugsForMatrixCell(
        axisY,
        axisX,
        ySlug,
        xSlug,
        globalTopicSlugForMatrix,
        styles,
        tones,
      );
      const result = await fillSingleCellAction({
        organizationId: orgId,
        styleSlug,
        toneSlug,
        topicSlug,
        count: 1,
      });

      toast.success(`Generated ${result.count} question${result.count !== 1 ? "s" : ""} for this cell`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate for this cell");
    } finally {
      setFillingCellKey(null);
    }
  };

  /* Already-assigned question IDs */
  const assignedIds = React.useMemo(
    () => new Set(Object.values(assignmentsByDay).filter(Boolean).map((a) => a!.questionId)),
    [assignmentsByDay]
  );

  const orgContextLoading =
    isSignedIn &&
    (allSchedules === undefined ||
      myOrganizations === undefined ||
      (authLoaded && Boolean(clerkOrgId) && !activeWorkspace && !clerkOrgLoaded));

  /* ── If no org, show Clerk org creation/selection UI ── */
  if (!orgId) {
    if (orgContextLoading) {
      return (
        <div className="relative flex flex-col items-center justify-center py-24 gap-4">
          <div className="absolute top-0 right-0">
            <ThemeToggle
              className="shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              showLabel={false}
            />
          </div>
          <CalendarDays className="size-12 text-muted-foreground/30 animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        </div>
      );
    }
    return (
      <div className="relative space-y-6 max-w-lg mx-auto py-12">
        <div className="absolute top-0 right-0">
          <ThemeToggle
            className="shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            showLabel={false}
          />
        </div>
        <div className="text-center">
          <CalendarDays className="size-12 mx-auto opacity-20 mb-4" />
          <h1 className="text-2xl font-bold tracking-tight">No organization found</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Create a workspace to start curating weekly schedules.
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <CreateOrganization />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Weekly Curation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Set and preview ice-breaker questions for the week.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ThemeToggle
            className="shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            showLabel={false}
          />
          {/* Week nav */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setWeekOffset((o) => o - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-medium min-w-[180px] text-center">
              {week.label}
              {currentSchedule?.status && currentSchedule.status !== "draft" && (
                <Badge
                  variant={currentSchedule.status === "published" ? "default" : "secondary"}
                  className="ml-2 text-[10px]"
                >
                  {currentSchedule.status}
                </Badge>
              )}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setWeekOffset((o) => o + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {currentSchedule?.status === "draft" && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={weekIsFull}
                title={weekIsFull ? "Every day already has a question" : undefined}
                onClick={handleAutoSchedule}
              >
                <CalendarDays className="size-4 mr-1" /> Auto-fill
              </Button>
              <Button size="sm" onClick={handlePublish}>
                <Crown className="size-4 mr-1" /> Publish
              </Button>
            </>
          )}
          {!currentSchedule && (
            <Button size="sm" onClick={handleCreateWeek}>
              <Plus className="size-4 mr-1" /> Create Week
            </Button>
          )}
        </div>
      </div>

      {/* Week start day toggle */}
      <div className="flex items-center gap-3">
        <Label className="text-sm text-muted-foreground">Week starts on</Label>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs", weekStartDay === "sunday" && "font-semibold")}>Sun</span>
          <Switch
            checked={weekStartDay === "monday"}
            onCheckedChange={(v) => handleWeekStartChange(v ? "monday" : "sunday")}
          />
          <span className={cn("text-xs", weekStartDay === "monday" && "font-semibold")}>Mon</span>
        </div>
      </div>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* ─── LEFT SIDEBAR: Axis filters ─── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <h3 className="text-sm font-semibold">Filters</h3>
              <p className="text-xs text-muted-foreground">
                Narrow the pool by two axes.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              {/* Axis Y control */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Primary axis (rows)
                </label>
                <div className="flex gap-1">
                  {(["style", "tone", "topic"] as AxisType[]).map((t) => (
                    <Button
                      key={t}
                      variant={axisY === t ? "default" : "outline"}
                      size="sm"
                      className="flex-1 text-xs px-1"
                      disabled={t === axisX}
                      onClick={() => {
                        setAxisY(t);
                        // Auto-seed 5 random from the new axis type
                        const allItems = t === "style" ? styles : t === "tone" ? tones : topics;
                        if (allItems && allItems.length > 0) {
                          const shuffled = [...allItems].sort(() => Math.random() - 0.5).slice(0, MAX_AXIS_ITEMS);
                          setAxisYSelected(new Set(shuffled.map(item => item.id)));
                          axisYSeededRef.current = true;
                        } else {
                          setAxisYSelected(new Set());
                        }
                      }}
                    >
                      {axisLabels[t]}
                    </Button>
                  ))}
                </div>
                <AxisMultiSelect
                  items={axisYItems}
                  selectedIds={axisYSelected}
                  onToggle={toggleY}
                  label={axisLabels[axisY]}
                />
              </div>

              <Separator />

              {/* Axis X control */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Secondary axis (cols)
                </label>
                <div className="flex gap-1">
                  {(["style", "tone", "topic"] as AxisType[]).map((t) => (
                    <Button
                      key={t}
                      variant={axisX === t ? "default" : "outline"}
                      size="sm"
                      className="flex-1 text-xs px-1"
                      disabled={t === axisY}
                      onClick={() => {
                        setAxisX(t);
                        // Auto-seed 5 random from the new axis type
                        const allItems = t === "style" ? styles : t === "tone" ? tones : topics;
                        if (allItems && allItems.length > 0) {
                          const shuffled = [...allItems].sort(() => Math.random() - 0.5).slice(0, MAX_AXIS_ITEMS);
                          setAxisXSelected(new Set(shuffled.map(item => item.id)));
                          axisXSeededRef.current = true;
                        } else {
                          setAxisXSelected(new Set());
                        }
                      }}
                    >
                      {axisLabels[t]}
                    </Button>
                  ))}
                </div>
                <AxisMultiSelect
                  items={axisXItems}
                  selectedIds={axisXSelected}
                  onToggle={toggleX}
                  label={axisLabels[axisX]}
                />
              </div>

              <Separator />

              {/* Third axis: Topic mode */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Third axis (topic per cell)
                </label>
                <div className="flex gap-1">
                  {(["global", "random"] as TopicPolicy[]).map((m) => (
                    <Button
                      key={m}
                      variant={topicPolicy === m ? "default" : "outline"}
                      size="sm"
                      className="flex-1 text-xs px-1 capitalize"
                      onClick={() => setTopicPolicy(m)}
                    >
                      {m === "global" ? "One topic" : "Random"}
                    </Button>
                  ))}
                </div>
                {topicPolicy === "global" && topics && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-start text-sm font-normal h-8">
                        {globalTopicId
                          ? (topics.find(t => t.id === globalTopicId)?.name ?? "Select topic")
                          : "Select topic"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-2" align="start">
                      <ScrollArea className="h-48">
                        <div className="space-y-1">
                          {topics.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => setGlobalTopicId(t.id)}
                              className={cn(
                                "w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-accent truncate",
                                globalTopicId === t.id && "bg-accent"
                              )}
                            >
                              {t.name as string}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                )}
                {topicPolicy === "random" && (
                  <p className="text-[10px] text-muted-foreground">
                    Each cell gets a random topic from the available pool.
                  </p>
                )}
              </div>

              <Separator />

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={remixAxes}
              >
                <Shuffle className="mr-1.5 size-3.5" />
                Shuffle Axes
              </Button>

              <Separator />

              {/* Generate section */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Generate</p>
                <Button
                  size="sm"
                  className="w-full"
                  variant="secondary"
                  disabled={
                    isGenerating ||
                    questionPool === undefined ||
                    filteredPool.length === 0 ||
                    !questionMatrix
                  }
                  onClick={handleRemixGridQuestions}
                >
                  <Shuffle className="mr-1.5 size-3.5" />
                  Shuffle Grid Questions
                </Button>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={isGenerating || weekIsFull}
                  onClick={handleGenerateWeek}
                >
                  <CalendarDays className="mr-1.5 size-3.5" />
                  {isGenerating ? "Scheduling…" : "Auto-fill Week"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── MAIN AREA ─── */}
        <div className="space-y-6">
          {/* Weekly schedule grid */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Weekly Schedule</h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
              {dayRows.map((row) => (
                <DaySlot
                  key={row.key}
                  dayKey={row.key}
                  dayLabel={row.label}
                  dayAbbr={row.abbr}
                  date={row.date}
                  assignment={assignmentsByDay[row.key]}
                  canEdit={canEdit}
                  isTarget={assignTargetDay === row.key}
                  onAssignClick={(k) =>
                    setAssignTargetDay(assignTargetDay === k ? null : k)
                  }
                  onUnassign={handleUnassign}
                />
              ))}
            </div>
          </section>

          {/* Question pool — axis matrix */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Question Matrix</h2>
              <div className="flex items-center gap-2">
                {questionMatrix && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isFillingEmpty}
                    onClick={handleFillEmptyCells}
                  >
                    {isFillingEmpty ? (
                      <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        Filling…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 size-3.5" />
                        Fill Empty Cells
                      </>
                    )}
                  </Button>
                )}
                {assignTargetDay && (
                  <>
                    <Badge variant="outline">
                      Assigning to {DAYS_DISPLAY.find((d) => d.key === assignTargetDay)?.label}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setAssignTargetDay(null)}
                    >
                      <X className="size-3 mr-1" /> Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>

            {questionPool === undefined ? (
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="h-[100px] animate-pulse bg-muted/30" />
                ))}
              </div>
            ) : !questionMatrix ? (
              <Card className="p-8 text-center">
                <p className="text-sm text-muted-foreground">Select axis values to build the matrix.</p>
              </Card>
            ) : (
                <div className="overflow-auto rounded-xl border">
                  {/* Header row */}
                  <div className="grid gap-[1px] bg-border"
                    style={{ gridTemplateColumns: `140px repeat(${questionMatrix.xItems.length}, 1fr)` }}
                  >
                    <div className="p-2 text-xs font-semibold text-muted-foreground capitalize bg-background" />
                    {questionMatrix.xItems.map(x => (
                      <div key={x.id} className="p-2 text-xs font-semibold text-center capitalize bg-background truncate px-1" title={x.name}>
                        <span className="truncate max-w-[80px]">
                          <IconComponent icon={x.icon} size={12} color={x.color} className="inline-block mr-2"/>
                          {x.name}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Body rows */}
                  {questionMatrix.yItems.map((y, yIndex) => (
                    <div key={y.id}
                      className="grid gap-[1px] bg-border border-t border-border"
                      style={{ gridTemplateColumns: `140px repeat(${questionMatrix.xItems.length}, 1fr)` }}
                    >
                      <div className="p-2 text-xs font-medium flex items-center bg-background px-2">
                        <IconComponent icon={y.icon} size={12} color={y.color} className="inline-block mr-2"/>
                        {y.name}
                      </div>
                      {questionMatrix.xItems.map((x, xIndex) => {
                        const cellQs = questionMatrix.matrix[yIndex][xIndex] ?? [];
                        const cellKey = `${y.slug}-${x.slug}`;
                        const isCellFilling = fillingCellKey === cellKey;

                        return (
                          <div key={`${y.id}-${x.id}`} className="min-h-[60px] bg-background p-1.5 space-y-1.5">
                            {cellQs.map(q => {
                              const alreadyAssigned = assignedIds.has(q._id);
                              return (
                                <div key={q._id} className="space-y-1">
                                  <p className="text-xs leading-snug line-clamp-3">
                                    {q.text ?? <em className="text-muted-foreground/50">No text</em>}
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{q.topic ? q.topic : q.tone ? q.tone : q.style ? q.style : "Unknown"}</Badge>
                                    {q.isAIGenerated && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">AI</Badge>
                                    )}
                                    {alreadyAssigned && (
                                      <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">Used</Badge>
                                    )}
                                  </div>
                                  {assignTargetDay && !alreadyAssigned && canEdit && (
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="w-full h-6 text-xs px-1"
                                      onClick={() => handleAssign(assignTargetDay, q._id)}
                                    >
                                      Assign
                                    </Button>
                                  )}
                                </div>
                              );
                            })}

                            {/* Empty cell — show Generate button or loading */}
                            {cellQs.length === 0 && (
                              <div className="flex flex-col items-center justify-center min-h-[40px] gap-1">
                                {isCellFilling ? (
                                  <>
                                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                    <span className="text-[9px] text-muted-foreground">Generating…</span>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 w-full text-[10px] px-1"
                                    onClick={() => {
                                      handleFillSingleCell(y.slug, x.slug);
                                    }}
                                    disabled={fillingCellKey !== null}
                                  >
                                    <Sparkles className="mr-1 size-2.5" />
                                    Generate
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}