import * as React from "react";
import { BookOpen, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type TeamTopicDraft = {
  name: string;
  guidance: string;
  boundaries?: string;
};

type TaxonomyOption = {
  id: string;
  name: string;
};

type TopicPreviewRequest = TeamTopicDraft & {
  styleId: string;
  toneId: string;
};

export function TeamPromptComposer({
  dayLabel,
  styles,
  tones,
  onCreateQuestion,
  onPreviewTopic,
  onAssignTopicQuestion,
}: {
  dayLabel: string;
  styles: TaxonomyOption[];
  tones: TaxonomyOption[];
  onCreateQuestion: (questionText: string) => Promise<void>;
  onPreviewTopic: (request: TopicPreviewRequest) => Promise<string[]>;
  onAssignTopicQuestion: (
    questionText: string,
    topic: TeamTopicDraft,
  ) => Promise<void>;
}) {
  const [questionText, setQuestionText] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("library");
  const [topicName, setTopicName] = React.useState("");
  const [topicGuidance, setTopicGuidance] = React.useState("");
  const [topicBoundaries, setTopicBoundaries] = React.useState("");
  const [styleId, setStyleId] = React.useState("");
  const [toneId, setToneId] = React.useState("");
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [previewSignature, setPreviewSignature] = React.useState("");
  const [selectedQuestion, setSelectedQuestion] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);

  React.useEffect(() => {
    if (!styleId && styles[0]) setStyleId(styles[0].id);
  }, [styleId, styles]);

  React.useEffect(() => {
    if (!toneId && tones[0]) setToneId(tones[0].id);
  }, [toneId, tones]);

  const currentPreviewRequest: TopicPreviewRequest = {
    name: topicName.trim(),
    guidance: topicGuidance.trim(),
    boundaries: topicBoundaries.trim() || undefined,
    styleId,
    toneId,
  };
  const currentPreviewSignature = JSON.stringify(currentPreviewRequest);
  const previewsAreCurrent =
    previews.length > 0 && previewSignature === currentPreviewSignature;

  const createQuestion = async () => {
    if (!questionText.trim()) return;
    setIsSaving(true);
    try {
      await onCreateQuestion(questionText.trim());
      setQuestionText("");
    } catch {
      // The parent reports the server error and the draft remains available to retry.
    } finally {
      setIsSaving(false);
    }
  };

  const previewTopic = async () => {
    if (!topicName.trim() || !topicGuidance.trim() || !styleId || !toneId)
      return;
    setIsGenerating(true);
    try {
      const request = currentPreviewRequest;
      const requestSignature = currentPreviewSignature;
      const nextPreviews = await onPreviewTopic(request);
      setPreviews(nextPreviews);
      setPreviewSignature(requestSignature);
      setSelectedQuestion(nextPreviews[0] ?? "");
    } catch {
      // The parent reports the server error and the topic draft remains available.
    } finally {
      setIsGenerating(false);
    }
  };

  const assignTopicQuestion = async () => {
    if (!previewsAreCurrent || !selectedQuestion.trim()) return;
    setIsSaving(true);
    try {
      await onAssignTopicQuestion(selectedQuestion.trim(), {
        name: topicName.trim(),
        guidance: topicGuidance.trim(),
        boundaries: topicBoundaries.trim() || undefined,
      });
    } catch {
      // The parent reports the server error and preserves the selected wording.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="space-y-1 px-4 pb-3 pt-4">
        <h3 className="text-sm font-semibold">Add a prompt for {dayLabel}</h3>
        <p className="text-xs text-muted-foreground">
          Pick from the library, write the exact question, or start from a topic
          and review the wording.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="library"
              onClick={() => setActiveTab("library")}
            >
              <BookOpen className="mr-1.5 size-3.5" />
              Library
            </TabsTrigger>
            <TabsTrigger
              value="question"
              onClick={() => setActiveTab("question")}
            >
              <MessageSquareText className="mr-1.5 size-3.5" />
              Write
            </TabsTrigger>
            <TabsTrigger value="topic" onClick={() => setActiveTab("topic")}>
              <Sparkles className="mr-1.5 size-3.5" />
              Topic
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="library"
            className="mt-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground"
          >
            Choose{" "}
            <strong className="font-medium text-foreground">Assign</strong> on a
            question in the matrix below.
          </TabsContent>

          <TabsContent value="question" className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="team-question-text">Exact question</Label>
              <Textarea
                id="team-question-text"
                value={questionText}
                maxLength={500}
                onChange={(event) => setQuestionText(event.target.value)}
                placeholder="What is one assumption about our launch plan that we should challenge?"
              />
            </div>
            <Button
              size="sm"
              disabled={isSaving || !questionText.trim()}
              onClick={() => void createQuestion()}
            >
              {isSaving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Save and assign
            </Button>
          </TabsContent>

          <TabsContent value="topic" className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="team-topic-name">Topic name</Label>
                <Input
                  id="team-topic-name"
                  value={topicName}
                  maxLength={100}
                  onChange={(event) => setTopicName(event.target.value)}
                  placeholder="Launch readiness"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="team-topic-style">Style</Label>
                  <select
                    id="team-topic-style"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={styleId}
                    onChange={(event) => setStyleId(event.target.value)}
                  >
                    {styles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="team-topic-tone">Tone</Label>
                  <select
                    id="team-topic-tone"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={toneId}
                    onChange={(event) => setToneId(event.target.value)}
                  >
                    {tones.map((tone) => (
                      <option key={tone.id} value={tone.id}>
                        {tone.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-topic-guidance">
                What should this conversation surface?
              </Label>
              <Textarea
                id="team-topic-guidance"
                value={topicGuidance}
                maxLength={1000}
                onChange={(event) => setTopicGuidance(event.target.value)}
                placeholder="Surface unspoken concerns without turning this into a status meeting."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-topic-boundaries">
                Boundaries{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="team-topic-boundaries"
                value={topicBoundaries}
                maxLength={1000}
                onChange={(event) => setTopicBoundaries(event.target.value)}
                placeholder="Avoid asking people to name individual owners."
              />
            </div>

            <Button
              variant="secondary"
              size="sm"
              disabled={
                isGenerating ||
                !topicName.trim() ||
                !topicGuidance.trim() ||
                !styleId ||
                !toneId
              }
              onClick={() => void previewTopic()}
            >
              {isGenerating ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" />
              )}
              {previewsAreCurrent
                ? "Generate new options"
                : "Generate three options"}
            </Button>

            {previewsAreCurrent && (
              <div className="space-y-3" aria-label="Topic question previews">
                <div className="grid gap-2 md:grid-cols-3">
                  {previews.map((preview, index) => (
                    <button
                      type="button"
                      key={`${preview}-${index}`}
                      className={cn(
                        "rounded-md border bg-background p-3 text-left text-xs leading-5 transition-colors hover:border-primary/60",
                        selectedQuestion === preview &&
                          "border-primary ring-1 ring-primary",
                      )}
                      onClick={() => setSelectedQuestion(preview)}
                    >
                      {preview}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="selected-topic-question">Final wording</Label>
                  <Textarea
                    id="selected-topic-question"
                    value={selectedQuestion}
                    maxLength={500}
                    onChange={(event) =>
                      setSelectedQuestion(event.target.value)
                    }
                  />
                </div>
                <Button
                  size="sm"
                  disabled={isSaving || !selectedQuestion.trim()}
                  onClick={() => void assignTopicQuestion()}
                >
                  {isSaving && (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  )}
                  Use this question
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
