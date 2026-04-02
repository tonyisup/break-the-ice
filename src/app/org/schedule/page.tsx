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
  day: typeof DAYS_DISPLAY[number];
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

function DaySlot({ day, date, assignment, canEdit, onAssignClick, onUnassign, isTarget }: DaySlotProps) {
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
            {day.abbr}
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
                onClick={() => onAssignClick(day.key)}
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

  /* Build day rows with dates */
  const dayRows = React.useMemo(() => {
    const rows: { key: typeof DAYS_DISPLAY[number]["key"]; date: Date }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(week.start);
      d.setDate(d.getDate() + i);
      const dayObj = DAYS_DISPLAY[i];
      rows.push({ key: dayObj.key, date: d });
    }
    return rows;
  }, [week]);

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
    return filtered;
  }, [questionPool, axisY, axisX, axisYSelected, axisXSelected, styles, tones, topics]);

  /* Taxonomy items for the axis dropdowns */
  const axisYItems = React.useMemo(
    () =>
      (axisY === "style" ? styles : axisY === "tone" ? tones : topics)?.map((t) => ({
        id: t.id,
        name: t.name as string,
        slug: t.slug as string,
      })) ?? [],
    [axisY, styles, tones, topics]
  );
  const axisXItems = React.useMemo(
    () =>
      (axisX === "style" ? styles : axisX === "tone" ? tones : topics)?.map((t) => ({
        id: t.id,
        name: t.name as string,
        slug: t.slug as string,
      })) ?? [],
    [axisX, styles, tones, topics]
  );

  /* Handlers */
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
    if (!currentSchedule) return;
    try {
      await assignQuestion({
        scheduleId: currentSchedule._id,
        dayOfWeek: dayKey as any,
        questionId: questionId as Id<"questions">,
      });
      setAssignTargetDay(null);
      toast.success("Assigned");
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
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleX = (id: string) =>
    setAxisXSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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
              <Button variant="outline" size="sm" onClick={handleAutoSchedule}>
                <Sparkles className="size-4 mr-1" /> Auto-fill
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
                      onClick={() => {
                        setAxisY(t);
                        setAxisYSelected(new Set());
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
                      onClick={() => {
                        setAxisX(t);
                        setAxisXSelected(new Set());
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

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{filteredPool.length} questions</span>
                {filteredPool.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => {
                      setAxisYSelected(new Set());
                      setAxisXSelected(new Set());
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── MAIN AREA ─── */}
        <div className="space-y-6">
          {/* Weekly schedule grid */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Weekly Schedule</h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {dayRows.map((row) => (
                <DaySlot
                  key={row.key}
                  day={DAYS_DISPLAY[row.key === "sunday" ? 6 : DAYS_DISPLAY.findIndex((d) => d.key === row.key)]}
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

          {/* Question pool */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Question Pool</h2>
              {assignTargetDay && (
                <div className="flex items-center gap-2">
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
                </div>
              )}
            </div>

            {questionPool === undefined ? (
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="h-[100px] animate-pulse bg-muted/30" />
                ))}
              </div>
            ) : filteredPool.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No questions match the current filters.
                </p>
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={() => {
                    setAxisYSelected(new Set());
                    setAxisXSelected(new Set());
                  }}
                >
                  Clear filters
                </Button>
              </Card>
            ) : (
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPool.map((q) => {
                  const alreadyAssigned = assignedIds.has(q._id);
                  return (
                    <Card
                      key={q._id}
                      className={cn(
                        "cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm",
                        assignTargetDay && !alreadyAssigned && "ring-1 ring-primary/20",
                        alreadyAssigned && "opacity-50"
                      )}
                      onClick={() => {
                        if (assignTargetDay && !alreadyAssigned && canEdit) {
                          handleAssign(assignTargetDay, q._id);
                        }
                      }}
                    >
                      <CardContent className="p-3 space-y-2">
                        <p className="text-sm leading-snug line-clamp-3">
                          {q.text ?? <em className="text-muted-foreground">No text</em>}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {q.style && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {q.style}
                            </Badge>
                          )}
                          {q.tone && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {q.tone}
                            </Badge>
                          )}
                          {q.topic && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {q.topic}
                            </Badge>
                          )}
                          {q.isAIGenerated && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              AI
                            </Badge>
                          )}
                          {alreadyAssigned && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Assigned
                            </Badge>
                          )}
                          {assignTargetDay && !alreadyAssigned && canEdit && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              Click to assign
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
