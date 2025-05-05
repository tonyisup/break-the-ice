"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { Button } from "~/components/ui/button";
import { Card, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { SearchInput } from "~/components/SearchInput";
import { Trash2, Merge } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import ScrollToTop from "../ScrollToTop";

export default function AdminTags() {
  const { data: tags, isLoading, refetch } = api.tags.getAll.useQuery();
  const removeTag = api.tags.remove.useMutation();
  const mergeTag = api.tags.merge.useMutation();
  const [search, setSearch] = useState("");
  const [selectedTagForMerge, setSelectedTagForMerge] = useState<number | null>(null);
  const { toast } = useToast();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!tags) {
    return <div>No tags found</div>;
  }

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleRemoveTag = (id: number) => {
    removeTag.mutate({ id }, {
      onSuccess: () => {
        void refetch();
        toast({
          title: "Success",
          description: "Tag removed successfully",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  const handleMergeTag = (sourceId: number, targetId: number) => {
    mergeTag.mutate({ sourceId, targetId }, {
      onSuccess: () => {
        void refetch();
        setSelectedTagForMerge(null);
        toast({
          title: "Success",
          description: "Tags merged successfully",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SearchInput
          id="tag-search"
          onSearch={setSearch}
          placeholder="Search tags..."
          delay={300}
        />
      </div>

			<ScrollToTop />
      <div className="grid gap-4">
        {filteredTags.map((tag) => (
          <Card key={tag.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <Badge variant="secondary" className="text-sm">
                  {tag.name}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {tag._count.questions} questions
                </Badge>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Merge className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Merge Tag</AlertDialogTitle>
                      <AlertDialogDescription>
                        Select the tag you want to merge &quot;{tag.name}&quot; into. This will move all questions from this tag to the selected tag and delete this tag.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                      <Select
                        onValueChange={(value) => setSelectedTagForMerge(Number(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select target tag" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredTags
                            .filter((t) => t.id !== tag.id)
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id.toString()}>
                                {t.name} ({t._count.questions} questions)
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          if (selectedTagForMerge) {
                            handleMergeTag(tag.id, selectedTagForMerge);
                          }
                        }}
                        disabled={!selectedTagForMerge}
                      >
                        Merge
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Tag</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove the tag &quot;{tag.name}&quot;? This will remove the tag from all {tag._count.questions} questions.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRemoveTag(tag.id)}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

