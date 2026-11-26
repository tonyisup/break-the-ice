import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** The saved models as chips to switch on for a run, with a form to save another. */
export function ModelChips({
  models,
  selected,
  onToggle,
}: {
  models: Doc<"generatorModels">[];
  selected: ReadonlySet<string>;
  onToggle: (model: string) => void;
}) {
  const saveModel = useMutation(api.admin.generator.saveModel);
  const removeModel = useMutation(api.admin.generator.removeModel);
  const [adding, setAdding] = React.useState(false);
  const [model, setModel] = React.useState("");
  const [label, setLabel] = React.useState("");

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await saveModel({ model: model.trim(), label: label.trim() });
      if (!selected.has(model.trim())) onToggle(model.trim());
      setModel("");
      setLabel("");
      setAdding(false);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the model"));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Models" className="flex flex-wrap items-center gap-2">
        {models.map((saved) => {
          const on = selected.has(saved.model);
          return (
            <span
              key={saved._id}
              className={cn(
                "inline-flex items-center rounded-full border text-sm transition-colors",
                on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <button type="button" aria-pressed={on} title={saved.model} onClick={() => onToggle(saved.model)} className="py-1 pl-3 pr-1 font-medium">
                {saved.label}
              </button>
              <button
                type="button"
                aria-label={`Remove ${saved.label}`}
                onClick={() => void removeModel({ id: saved._id }).catch((error) => toast.error(errorMessage(error, "Couldn't remove the model")))}
                className="mr-1 rounded-full p-1 hover:bg-muted"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          );
        })}
      </div>
      {adding ? (
        <form onSubmit={(event) => void add(event)} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="OpenRouter model id"
            placeholder="openai/gpt-5"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="h-8 w-52 text-sm"
            autoFocus
          />
          <Input aria-label="Label" placeholder="Label" value={label} onChange={(event) => setLabel(event.target.value)} className="h-8 w-32 text-sm" />
          <Button type="submit" size="sm" disabled={!model.trim()}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" className="size-4" /> Add model
        </Button>
      )}
    </div>
  );
}
