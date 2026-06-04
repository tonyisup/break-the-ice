"use client";

import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  CreditCard,
  Users,
  Trash2,
  Eye,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type OrgStatus = "active" | "trialing" | "past_due" | "canceled" | "inactive";
type PlanTier = "free" | "team";

interface OrgRow {
  id: string;
  name: string;
  planTier: PlanTier;
  billingStatus: OrgStatus;
  createdAt: number;
  memberCount: number;
}

function StatusBadge({ status }: { status: OrgStatus }) {
  const config: Record<OrgStatus, { className: string; icon: typeof CheckCircle2 }> = {
    active: { className: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle2 },
    trialing: { className: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Clock },
    past_due: { className: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: AlertCircle },
    canceled: { className: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
    inactive: { className: "bg-gray-500/10 text-gray-500 border-gray-500/20", icon: XCircle },
  };
  const { className, icon: Icon } = config[status] ?? config.inactive;
  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Icon className="size-3" />
      {status}
    </Badge>
  );
}

function OrgDetailModal({
  orgId,
  onClose,
  onRefresh,
}: {
  orgId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const getSubscription = useAction(api.core.clerkAdmin.adminGetOrgSubscription);
  const cancelSub = useAction(api.core.clerkAdmin.adminCancelOrgSubscription);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await getSubscription({ clerkOrganizationId: orgId });
      setData(result);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load subscription details");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this organization's subscription? This cannot be undone.")) return;
    setCancelling(true);
    try {
      await cancelSub({ clerkOrganizationId: orgId });
      toast.success("Subscription canceled");
      onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to cancel subscription");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <Card className="w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Organization Details</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!data && !loading && (
            <Button onClick={load} className="w-full">
              Load Details
            </Button>
          )}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          {data && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Badge variant={data.planTier === "team" ? "default" : "secondary"}>
                  {data.planName}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <StatusBadge status={data.billingStatus} />
              </div>

              {data.subscriptions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Subscription History</h4>
                  {data.subscriptions.map((sub: any) => (
                    <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">{sub.planName}</p>
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(sub.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusBadge status={sub.status as OrgStatus} />
                    </div>
                  ))}
                </div>
              )}

              {data.billingStatus === "active" && (
                <Button variant="destructive" onClick={handleCancel} className="w-full" disabled={cancelling}>
                  {cancelling ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Trash2 className="size-4 mr-2" />}
                  Cancel Subscription
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminOrganizationsPage() {
  const listOrgs = useAction(api.core.clerkAdmin.adminListOrganizations);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  const fetchOrgs = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listOrgs({ limit: 50, offset: 0 });
      setOrgs(result as OrgRow[]);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to load organizations");
      toast.error("Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const teamCount = orgs.filter((o) => o.planTier === "team").length;
  const activeCount = orgs.filter((o) => o.billingStatus === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="size-7" />
            Organizations
          </h2>
          <p className="text-muted-foreground">Manage team workspaces and their Clerk subscriptions.</p>
        </div>
        <Button onClick={fetchOrgs} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{orgs.length}</p>
              <p className="text-xs text-muted-foreground">Total Orgs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
              <CreditCard className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{teamCount}</p>
              <p className="text-xs text-muted-foreground">Team Plans</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-600">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active Subs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-3 text-red-600">
            <AlertCircle className="size-5 shrink-0" />
            <div>
              <p className="font-medium">Failed to load organizations</p>
              <p className="text-sm text-red-500/80">{error}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Make sure CLERK_SECRET_KEY is configured on your Convex deployment.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && orgs.length === 0 && !error && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && orgs.length === 0 && !error && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Building2 className="size-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No organizations found</p>
            <p className="text-sm mt-1">
              Organizations will appear here once users create workspaces and subscribe to Team plans.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Organizations table */}
      {orgs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All Organizations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Organization</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Plan</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Members</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Created</th>
                    <th className="px-4 py-3 text-sm font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org) => (
                    <tr key={org.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-4 text-muted-foreground" />
                          <span className="font-medium">{org.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={org.planTier === "team" ? "default" : "secondary"}>
                          {org.planTier}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={org.billingStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Users className="size-3" />
                          {org.memberCount}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedOrg(org.id)}>
                          <Eye className="size-4 mr-1" />
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedOrg && (
        <OrgDetailModal
          orgId={selectedOrg}
          onClose={() => setSelectedOrg(null)}
          onRefresh={fetchOrgs}
        />
      )}
    </div>
  );
}
