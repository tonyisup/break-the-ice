"use client";

import * as React from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  Mail,
  Search,
  Send,
  Users,
  UserCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Filter,
  ArrowRight,
  History,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const NEWSLETTER_TIME_ZONE = "America/Los_Angeles";
const DEFAULT_SEND_HOUR = 10;
const PENDING_SIGNUP_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SEND_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const STATUS_FILTERS = {
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  never: "Never subscribed",
  all: "All users",
} as const;

type StatusFilter = keyof typeof STATUS_FILTERS;

function getLosAngelesDeliveryDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NEWSLETTER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function formatSendHour(hour: number) {
  const period = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:00 ${period} PT`;
}

function formatPacificTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEWSLETTER_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function DeliveryHistoryDialog({
  user,
  onClose,
}: {
  user: { _id: Id<"users">; name?: string; email?: string };
  onClose: () => void;
}) {
  const history = useQuery(api.admin.newsletter.getDeliveryHistory, {
    userId: user._id,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delivery history</DialogTitle>
          <DialogDescription>
            Last 14 daily emails for {user.email ?? user.name ?? "this user"}.
          </DialogDescription>
        </DialogHeader>
        {history === undefined ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No emails have been sent to this user.
          </p>
        ) : (
          <ul className="divide-y">
            {history.map((delivery) => (
              <li key={delivery._id} className="space-y-1 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium tabular-nums">
                    {delivery.sentAt
                      ? formatPacificTime(delivery.sentAt)
                      : delivery.deliveryDate}
                  </span>
                  <Badge
                    variant={
                      delivery.status === "failed" ? "destructive" : "secondary"
                    }
                  >
                    {delivery.status}
                  </Badge>
                </div>
                {delivery.questionText && (
                  <p className="text-muted-foreground">
                    {delivery.questionText}
                  </p>
                )}
                {delivery.error && (
                  <p className="text-xs text-destructive">{delivery.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function NewsletterPage() {
  const [deliveryDate, setDeliveryDate] = React.useState(() =>
    getLosAngelesDeliveryDate(),
  );
  const [statusFilter, setStatusFilter] =
    React.useState<StatusFilter>("subscribed");

  // Update deliveryDate when page regains focus (handles day changes)
  React.useEffect(() => {
    const handleFocus = () => {
      const newDate = getLosAngelesDeliveryDate();
      setDeliveryDate(newDate);
    };

    window.addEventListener("focus", handleFocus);

    // Also check periodically (every minute) in case the page stays open past midnight
    const interval = setInterval(() => {
      const newDate = getLosAngelesDeliveryDate();
      setDeliveryDate(newDate);
    }, 60000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, []);

  const subscribers = useQuery(api.admin.newsletter.getSubscribers, {
    status: statusFilter,
  });
  const stats = useQuery(api.admin.newsletter.getStats, { deliveryDate });
  const pendingSignups = useQuery(
    api.admin.newsletter.getPendingSubscriptions,
    {},
  );
  const setSubscriptionStatus = useMutation(
    api.admin.newsletter.setSubscriptionStatus,
  );
  const setSendHour = useMutation(api.admin.newsletter.setSendHour);
  const removePendingSubscription = useMutation(
    api.admin.newsletter.removePendingSubscription,
  );
  const triggerDailyNewsletter = useAction(
    api.admin.newsletter.triggerDailyNewsletter,
  );
  const [search, setSearch] = React.useState("");
  const [isTriggering, setIsTriggering] = React.useState(false);
  const [lastTriggerResult, setLastTriggerResult] = React.useState<{
    success: boolean;
    skipped: boolean;
    message: string;
    scheduledBatchCount: number;
    pendingCount: number;
  } | null>(null);
  const [updatingUserId, setUpdatingUserId] =
    React.useState<Id<"users"> | null>(null);
  const [historyUser, setHistoryUser] = React.useState<{
    _id: Id<"users">;
    name?: string;
    email?: string;
  } | null>(null);

  const filteredSubscribers =
    subscribers?.filter((user) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return (
        user.name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
      );
    }) ?? [];
  const hasSubscriberRecords = stats
    ? stats.subscribedCount +
        stats.unsubscribedCount +
        stats.pendingVerificationCount >
      0
    : false;

  const handleToggleSubscription = async (
    user: {
      _id: Id<"users">;
      email?: string;
      newsletterSubscriptionStatus?: "subscribed" | "unsubscribed";
    },
    subscribed: boolean,
  ) => {
    const isResubscribe =
      subscribed && user.newsletterSubscriptionStatus === "unsubscribed";
    if (
      isResubscribe &&
      !confirm(
        `${user.email ?? "This person"} unsubscribed earlier. Subscribe them again anyway?`,
      )
    ) {
      return;
    }

    setUpdatingUserId(user._id);
    try {
      await setSubscriptionStatus({
        userId: user._id,
        status: subscribed ? "subscribed" : "unsubscribed",
        confirmResubscribe: isResubscribe || undefined,
      });
      toast.success(
        subscribed
          ? `${user.email ?? "User"} subscribed to newsletter`
          : `${user.email ?? "User"} unsubscribed from newsletter`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update subscription";
      toast.error(message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleSendHourChange = async (
    user: { _id: Id<"users">; email?: string },
    hour: number,
  ) => {
    setUpdatingUserId(user._id);
    try {
      await setSendHour({
        userId: user._id,
        hour: hour === DEFAULT_SEND_HOUR ? null : hour,
      });
      toast.success(
        `${user.email ?? "User"} will get the email at ${formatSendHour(hour)}`,
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update send time",
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleRemovePending = async (signup: {
    _id: Id<"pendingSubscriptions">;
    email: string;
  }) => {
    if (
      !confirm(
        `Remove the pending sign-up for ${signup.email}? Their confirmation link will stop working.`,
      )
    ) {
      return;
    }
    try {
      await removePendingSubscription({ pendingId: signup._id });
      toast.success(`Removed pending sign-up for ${signup.email}`);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to remove pending sign-up",
      );
    }
  };

  const handleTriggerNewsletter = async () => {
    if (
      !confirm(
        `Send today's newsletter (${deliveryDate}) now to every subscriber who hasn't received it, regardless of their send time? Outside production, only test recipients are emailed.`,
      )
    ) {
      return;
    }

    setIsTriggering(true);
    setLastTriggerResult(null);
    try {
      const result = await triggerDailyNewsletter({ deliveryDate });
      setLastTriggerResult(result);
      if (result.success && !result.skipped) {
        toast.success(result.message);
      } else if (result.skipped) {
        toast.info(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to trigger newsletter";
      toast.error(message);
    } finally {
      setIsTriggering(false);
    }
  };

  if (!subscribers || !stats || !pendingSignups) {
    return (
      <div className="flex flex-col gap-4 animate-pulse">
        <div className="h-10 bg-muted rounded w-1/4" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-muted rounded w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Newsletter</h1>
          <p className="text-muted-foreground">
            Manage subscriptions and send times, and manually trigger the daily
            icebreaker email.
          </p>
        </div>
        <Button
          onClick={handleTriggerNewsletter}
          disabled={isTriggering || stats.subscribedCount === 0}
          className="gap-2"
          title={
            stats.subscribedCount === 0
              ? "No subscribed users to email"
              : undefined
          }
        >
          {isTriggering ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {isTriggering ? "Sending..." : "Send Daily Newsletter"}
        </Button>
      </div>

      <section
        aria-label="Newsletter metrics"
        className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4"
      >
        <div className="bg-card p-5">
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Subscribed</span>
            <Users className="size-4" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {stats.subscribedCount}
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Unsubscribed</span>
            <Mail className="size-4" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {stats.unsubscribedCount}
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Pending verification</span>
            <Clock className="size-4" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {stats.pendingVerificationCount}
          </p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Sent today</span>
            <CheckCircle2 className="size-4" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {stats.deliveryCounts.sent}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.deliveryCounts.pending} pending ·{" "}
            {stats.deliveryCounts.processing} processing ·{" "}
            {stats.deliveryCounts.failed} failed
          </p>
        </div>
      </section>

      {lastTriggerResult && (
        <Card
          className={`rounded-2xl ${lastTriggerResult.success ? "border-green-200 bg-green-50/50 dark:bg-green-950/20" : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"}`}
        >
          <CardContent className="pt-6 flex items-start gap-3">
            {lastTriggerResult.success ? (
              <CheckCircle2 className="size-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <p className="font-medium">{lastTriggerResult.message}</p>
              {!lastTriggerResult.skipped && (
                <p className="text-sm text-muted-foreground">
                  Scheduled {lastTriggerResult.scheduledBatchCount} batch(es)
                  for {lastTriggerResult.pendingCount} pending delivery(ies).
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hasSubscriberRecords || statusFilter !== "subscribed" ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex items-center gap-2 flex-1 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <Search className="size-4 text-muted-foreground" />
              <Input
                placeholder="Search name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0 shadow-none focus-visible:ring-0 px-1 py-1"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="size-4" />
                  {STATUS_FILTERS[statusFilter]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(STATUS_FILTERS) as StatusFilter[]).map(
                  (filter) => (
                    <DropdownMenuItem
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                    >
                      {STATUS_FILTERS[filter]}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm text-left">
              <thead className="bg-muted/50 border-b text-muted-foreground font-medium uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Send time</th>
                  <th className="px-6 py-4">History</th>
                  <th className="px-6 py-4 text-right">Subscribed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredSubscribers.map((user) => {
                  const isSubscribed =
                    user.newsletterSubscriptionStatus === "subscribed";
                  const label = user.email ?? user.name ?? "user";
                  return (
                    <tr
                      key={user._id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-full bg-muted flex items-center justify-center border">
                            <UserCircle className="size-6 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col">
                            <Link
                              to={`/admin/users/${user._id}`}
                              className="font-bold hover:underline decoration-blue-500 underline-offset-4"
                            >
                              {user.name || "Unknown"}
                            </Link>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="size-3" />
                              {user.email || "No email"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={isSubscribed ? "default" : "secondary"}
                          className={
                            isSubscribed
                              ? "bg-green-600 hover:bg-green-700"
                              : ""
                          }
                        >
                          {user.newsletterSubscriptionStatus ??
                            "never subscribed"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          aria-label={`Send time for ${label}`}
                          value={user.newsletterSendHour ?? DEFAULT_SEND_HOUR}
                          disabled={
                            updatingUserId === user._id || !isSubscribed
                          }
                          onChange={(event) =>
                            handleSendHourChange(
                              user,
                              Number(event.target.value),
                            )
                          }
                          className="h-9 rounded-md border bg-background px-2 text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {SEND_HOURS.map((hour) => (
                            <option key={hour} value={hour}>
                              {formatSendHour(hour)}
                              {hour === DEFAULT_SEND_HOUR ? " (default)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          aria-label={`Delivery history for ${label}`}
                          onClick={() => setHistoryUser(user)}
                        >
                          <History className="size-4" />
                          View
                        </Button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Switch
                          aria-label={`Newsletter subscription for ${label}`}
                          checked={isSubscribed}
                          disabled={updatingUserId === user._id || !user.email}
                          onCheckedChange={(checked) =>
                            handleToggleSubscription(user, checked)
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredSubscribers.length === 0 && (
              <div className="py-20 text-center space-y-2">
                <Mail className="size-12 text-muted-foreground/20 mx-auto" />
                <p className="text-lg font-medium">No users found</p>
                <p className="text-muted-foreground">
                  Try a different search or filter.
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            A new send time applies from the next send. Nobody gets more than
            one email a day.
          </p>
        </>
      ) : (
        <section className="rounded-xl border bg-card px-6 py-10 sm:px-10 sm:py-12">
          <div className="max-w-xl">
            <Mail className="size-9 text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-xl font-semibold">
              Build your newsletter audience
            </h2>
            <p className="mt-2 text-muted-foreground">
              Subscribers appear here after users opt in. You can also manage
              any user&apos;s newsletter preference from the full list.
            </p>
            <Button
              variant="outline"
              className="mt-6 h-11 gap-2 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
              onClick={() => setStatusFilter("all")}
            >
              Manage user subscriptions
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {pendingSignups.length > 0 && (
        <section aria-labelledby="pending-signups" className="space-y-3">
          <div>
            <h2 id="pending-signups" className="text-lg font-semibold">
              Pending verification
            </h2>
            <p className="text-sm text-muted-foreground">
              These people asked to subscribe and haven&apos;t confirmed by
              email. Links expire after 24 hours.
            </p>
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {pendingSignups.map((signup) => {
              const expired =
                Date.now() - signup._creationTime > PENDING_SIGNUP_LIFETIME_MS;
              return (
                <li
                  key={signup._id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{signup.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested {formatPacificTime(signup._creationTime)} PT
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {expired && <Badge variant="secondary">expired</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      aria-label={`Remove pending sign-up for ${signup.email}`}
                      onClick={() => handleRemovePending(signup)}
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {historyUser && (
        <DeliveryHistoryDialog
          user={historyUser}
          onClose={() => setHistoryUser(null)}
        />
      )}
    </div>
  );
}
