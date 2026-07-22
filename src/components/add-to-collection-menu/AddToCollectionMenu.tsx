import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { FolderPlus, Settings } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

type AddToCollectionMenuProps = {
  questionId: Id<"questions">;
  className?: string;
};

export function AddToCollectionMenu({ questionId, className }: AddToCollectionMenuProps) {
  const { activeWorkspace } = useWorkspace();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCollectionId, setPendingCollectionId] = useState<Id<"collections"> | null>(null);
  const entitlements = useQuery(
    api.core.billing.getEffectiveEntitlements,
    activeWorkspace ? { organizationId: activeWorkspace } : "skip"
  );
  const collections = useQuery(
    api.core.collections.getCollectionsByOrganization,
    activeWorkspace && entitlements?.canUseTeamFeatures
      ? { organizationId: activeWorkspace }
      : "skip"
  );
  const memberCollectionIds = useQuery(
    api.core.collections.getCollectionMembershipForQuestion,
    activeWorkspace && entitlements?.canUseTeamFeatures
      ? { questionId, organizationId: activeWorkspace }
      : "skip"
  );
  const addQuestionToCollection = useMutation(api.core.collections.addQuestionToCollection);
  const removeQuestionFromCollection = useMutation(api.core.collections.removeQuestionFromCollection);
  const createCollection = useMutation(api.core.collections.createCollection);

  const membershipSet = useMemo(
    () => new Set(memberCollectionIds ?? []),
    [memberCollectionIds]
  );
  const inAnyCollection = (memberCollectionIds?.length ?? 0) > 0;

  if (!activeWorkspace || entitlements === undefined) {
    return null;
  }

  if (!entitlements?.canUseTeamFeatures) {
    return null;
  }

  const handleCollectionError = (error: unknown, collectionName: string) => {
    const message = error instanceof Error ? error.message : "Something went wrong";
    if (message.includes("required role")) {
      toast.error("Only workspace admins and managers can manage collections");
      return;
    }
    if (message.includes("already in this collection")) {
      toast.message(`Already in "${collectionName}"`);
      return;
    }
    toast.error(message);
  };

  const handleToggle = async (
    collectionId: Id<"collections">,
    collectionName: string,
    shouldBeMember: boolean
  ) => {
    setPendingCollectionId(collectionId);
    try {
      if (shouldBeMember) {
        await addQuestionToCollection({ questionId, collectionId });
        toast.success(`Added to "${collectionName}"`);
      } else {
        await removeQuestionFromCollection({ questionId, collectionId });
        toast.success(`Removed from "${collectionName}"`);
      }
    } catch (error) {
      handleCollectionError(error, collectionName);
    } finally {
      setPendingCollectionId(null);
    }
  };

  const handleCreateAndAdd = async () => {
    const normalized = newCollectionName.trim();
    if (!normalized || !activeWorkspace || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const collectionId = await createCollection({
        name: normalized,
        organizationId: activeWorkspace,
      });
      await addQuestionToCollection({ questionId, collectionId });
      toast.success(`Created "${normalized}" and added question`);
      setNewCollectionName("");
    } catch (error) {
      handleCollectionError(error, normalized);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative bg-black/10 dark:bg-white/10 p-2 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors",
            className
          )}
          title={
            inAnyCollection
              ? "In shared collections — click to manage"
              : "Add to shared collection"
          }
          aria-label={
            inAnyCollection
              ? "Manage shared collection membership"
              : "Add to shared collection"
          }
        >
          <FolderPlus
            size={16}
            className={cn(
              inAnyCollection
                ? "text-amber-500 dark:text-amber-400"
                : "text-gray-600 dark:text-gray-400"
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px]">
        <DropdownMenuLabel>
          <div className="flex justify-between items-center gap-2">
            {inAnyCollection ? "Collections" : "Add to collection"}
            <Link
              to="/settings?expand=collections"
              title="Manage collections in Settings"
              aria-label="Manage collections in Settings"
              className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {collections === undefined || memberCollectionIds === undefined ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : collections.length === 0 ? (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No collections yet
          </DropdownMenuItem>
        ) : (
          collections.map((collection) => {
            const isMember = membershipSet.has(collection._id);
            const isPending = pendingCollectionId === collection._id;
            return (
              <DropdownMenuCheckboxItem
                key={collection._id}
                checked={isMember}
                disabled={isPending || isSubmitting}
                onCheckedChange={(checked) =>
                  void handleToggle(collection._id, collection.name, checked === true)
                }
              >
                {collection.name}
              </DropdownMenuCheckboxItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <div
          className="p-2 space-y-2"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Input
            placeholder="New collection name"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreateAndAdd();
              }
            }}
            disabled={isSubmitting}
            aria-label="New collection name"
          />
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={!newCollectionName.trim() || isSubmitting}
            onClick={() => void handleCreateAndAdd()}
          >
            {isSubmitting ? "Saving…" : "Create & add"}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
