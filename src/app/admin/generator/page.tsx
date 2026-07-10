"use client"

import * as React from "react"
import { useQuery, useAction, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Id } from "../../../../convex/_generated/dataModel"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import {
    Sparkles,
    Loader2,
    Save,
    RefreshCw,
    Plus,
    ChevronRight,
    Check,
    X
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type GeneratedPreview = {
    text: string
    runId: Id<"generationRuns">
}

export default function GeneratorPage() {
    const styles = useQuery(api.core.styles.getStyles, {})
    const tones = useQuery(api.core.tones.getTones, {})
    const topics = useQuery(api.core.topics.getTopics, {})
    const tags = useQuery(api.core.tags.getTags)
    const promptBlueprints = useQuery(api.admin.promptBlueprints.listBlueprints, { limit: 50 })

    const generateAIQuestions = useAction(api.admin.ai.generateAIQuestions)
    const saveAIQuestion = useMutation(api.core.questions.saveAIQuestion)

    const [selectedTags, setSelectedTags] = React.useState<string[]>([])
    const [customTag, setCustomTag] = React.useState("")
    const [selectedStyleId, setSelectedStyleId] = React.useState<Id<"styles"> | null>(null)
    const [selectedToneId, setSelectedToneId] = React.useState<Id<"tones"> | null>(null)
    const [selectedTopicId, setSelectedTopicId] = React.useState<Id<"topics"> | null>(null)
    const [selectedBlueprintSlug, setSelectedBlueprintSlug] = React.useState("icebreaker-default")
    const [isGenerating, setIsGenerating] = React.useState(false)
    const [isSaving, setIsSaving] = React.useState(false)
    const [expandedTagGroupings, setExpandedTagGroupings] = React.useState<Set<string>>(new Set())
    const [generatedQuestions, setGeneratedQuestions] = React.useState<GeneratedPreview[]>([])
    const [activeTabIndex, setActiveTabIndex] = React.useState<string>("0")

    // Convenience for active question
    const activeQuestion = generatedQuestions[parseInt(activeTabIndex)]

    // Reset generated questions when major configuration changes
    React.useEffect(() => {
        setGeneratedQuestions([])
        setActiveTabIndex("0")
    }, [selectedStyleId, selectedToneId, selectedTopicId, selectedBlueprintSlug])

    const handleTagToggle = (tagName: string) => {
        setGeneratedQuestions([]) // Reset on tag change too
        setActiveTabIndex("0")
        setSelectedTags(prev =>
            prev.includes(tagName)
                ? prev.filter(tag => tag !== tagName)
                : [...prev, tagName]
        )
    }

    const handleAddCustomTag = () => {
        const newTag = customTag.trim()
        if (newTag && !selectedTags.includes(newTag)) {
            setGeneratedQuestions([]) // Reset on tag change
            setActiveTabIndex("0")
            setSelectedTags(prev => [...prev, newTag])
            setCustomTag("")
        } else if (selectedTags.includes(newTag)) {
            toast.info("Tag already selected")
        }
    }

    const toggleTagGrouping = (grouping: string) => {
        setExpandedTagGroupings(prev => {
            const newSet = new Set(prev)
            if (newSet.has(grouping)) {
                newSet.delete(grouping)
            } else {
                newSet.add(grouping)
            }
            return newSet
        })
    }

    const expandAllTagGroupings = () => {
        if (tags) {
            const groupings = Array.from(new Set(tags.map(tag => tag.grouping)))
            setExpandedTagGroupings(new Set(groupings))
        }
    }

    const collapseAllTagGroupings = () => {
        setExpandedTagGroupings(new Set())
    }

    const handleGenerate = async () => {
        setIsGenerating(true)
        try {
            if (!selectedStyleId || !selectedToneId) {
                toast.error("Please select a style and tone")
                return
            }

            const generatedQuestion = await generateAIQuestions({
                selectedTags,
                excludedQuestions: generatedQuestions.length > 0 ? generatedQuestions.map(question => question.text) : undefined,
                styleId: selectedStyleId,
                toneId: selectedToneId,
                topicId: selectedTopicId || undefined,
                blueprintSlug: selectedBlueprintSlug,
            })
            if (generatedQuestion?.text) {
                const newQuestions = [...generatedQuestions, generatedQuestion]
                setGeneratedQuestions(newQuestions)
                setActiveTabIndex((newQuestions.length - 1).toString())
                toast.success("Preview generated")
            } else {
                toast.error("No question generated")
            }
        } catch (error) {
            console.error("Error generating question:", error)
            toast.error("Failed to generate question")
        } finally {
            setIsGenerating(false)
        }
    }

    const handleAccept = async () => {
        if (!activeQuestion) return

        setIsSaving(true)
        try {
            if (!selectedStyleId || !selectedToneId) {
                toast.error("Please select a style and tone")
                return
            }

            const selectedStyle = styles?.find(s => s._id === selectedStyleId)
            const selectedTone = tones?.find(t => t._id === selectedToneId)
            const selectedTopic = topics?.find(t => t._id === selectedTopicId)

            const result = await saveAIQuestion({
                text: activeQuestion.text,
                tags: selectedTags,
                styleId: selectedStyleId,
                style: selectedStyle?.slug,
                toneId: selectedToneId,
                tone: selectedTone?.slug,
                topicId: selectedTopicId || undefined,
                topic: selectedTopic?.slug,
                styleSlug: selectedStyle?.slug,
                toneSlug: selectedTone?.slug,
                topicSlug: selectedTopic?.slug,
                styleVersion: selectedStyle?.version,
                toneVersion: selectedTone?.version,
                topicVersion: selectedTopic?.version,
                generationRunId: activeQuestion.runId,
            })

            if (result === null) {
                toast.warning("This question already exists in the database")
                return
            }

            toast.success("Question saved to database!")
            const newQuestions = generatedQuestions.filter((_, i) => i !== parseInt(activeTabIndex))
            setGeneratedQuestions(newQuestions)
            setActiveTabIndex(Math.max(0, newQuestions.length - 1).toString())
        } catch (error) {
            console.error("Error saving question:", error)
            toast.error("Failed to save question")
        } finally {
            setIsSaving(false)
        }
    }

    const tagGroupings = tags ? Array.from(new Set(tags.map(tag => tag.grouping))).sort() : []

    if (!styles || !tones || !tags || !topics || !promptBlueprints) {
        return (
            <div className="flex items-center justify-center h-full p-12">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">AI Generator</h1>
                <p className="text-muted-foreground">Configure, preview, and save one question at a time.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-12 items-start">
                {/* Left Column: Controls */}
                <div className="space-y-6 lg:col-span-7 xl:col-span-8">
                    <Card className="rounded-xl">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">Generation setup</CardTitle>
                            <CardDescription>Choose a style and tone, then refine the prompt if needed.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5 md:grid-cols-2">
                            <label className="grid gap-2 text-sm font-medium">
                                <span>Style <span className="text-destructive">*</span></span>
                                <select
                                    value={selectedStyleId ?? ""}
                                    onChange={(event) => setSelectedStyleId((event.target.value || null) as Id<"styles"> | null)}
                                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">Choose a style</option>
                                    {styles.map(style => <option key={style._id} value={style._id}>{style.name}</option>)}
                                </select>
                            </label>

                            <label className="grid gap-2 text-sm font-medium">
                                <span>Tone <span className="text-destructive">*</span></span>
                                <select
                                    value={selectedToneId ?? ""}
                                    onChange={(event) => setSelectedToneId((event.target.value || null) as Id<"tones"> | null)}
                                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">Choose a tone</option>
                                    {tones.map(tone => <option key={tone._id} value={tone._id}>{tone.name}</option>)}
                                </select>
                            </label>

                            <label className="grid gap-2 text-sm font-medium">
                                <span>Topic <span className="font-normal text-muted-foreground">Optional</span></span>
                                <select
                                    value={selectedTopicId ?? ""}
                                    onChange={(event) => setSelectedTopicId((event.target.value || null) as Id<"topics"> | null)}
                                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">General</option>
                                    {topics.map(topic => <option key={topic._id} value={topic._id}>{topic.name}</option>)}
                                </select>
                            </label>

                            <label className="grid gap-2 text-sm font-medium">
                                <span>Prompt blueprint</span>
                                <select
                                    value={selectedBlueprintSlug}
                                    onChange={(event) => setSelectedBlueprintSlug(event.target.value)}
                                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    {promptBlueprints.map(blueprint => (
                                        <option key={blueprint._id} value={blueprint.slug}>
                                            {blueprint.slug} v{blueprint.version} · {blueprint.status}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </CardContent>
                    </Card>

                    {/* Tags Selection */}
                    <Card className="flex h-[600px] flex-col rounded-xl">
                        <CardHeader className="pb-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <CardTitle className="text-lg">Tags</CardTitle>
                                    <CardDescription>Add optional constraints to guide the prompt.</CardDescription>
                                </div>
                                <div className="flex gap-2 sm:shrink-0">
                                    <Button variant="outline" size="sm" className="h-10 max-sm:flex-1 max-sm:h-11" onClick={expandAllTagGroupings}>Expand all</Button>
                                    <Button variant="outline" size="sm" className="h-10 max-sm:flex-1 max-sm:h-11" onClick={collapseAllTagGroupings}>Collapse all</Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 flex flex-col gap-4">
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Add custom tag..."
                                    value={customTag}
                                    onChange={(e) => setCustomTag(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleAddCustomTag()}
                                    className="h-11"
                                />
                                <Button size="icon" className="!size-11 shrink-0" onClick={handleAddCustomTag} aria-label="Add custom tag"><Plus className="size-4" /></Button>
                            </div>

                            <ScrollArea className="flex-1 pr-4">
                                <div className="space-y-2">
                                    {tagGroupings.map(grouping => {
                                        const isExpanded = expandedTagGroupings.has(grouping)
                                        const groupingTags = tags.filter(tag => tag.grouping === grouping)
                                        const selectedCount = groupingTags.filter(tag => selectedTags.includes(tag.name)).length

                                        return (
                                            <div key={grouping} className="border rounded-lg overflow-hidden bg-card">
                                                <button
                                                    onClick={() => toggleTagGrouping(grouping)}
                                                    className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <ChevronRight className={`size-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                                                        <span className="font-medium capitalize">{grouping}</span>
                                                        {selectedCount > 0 && (
                                                            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                                                                {selectedCount}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">{groupingTags.length} tags</span>
                                                </button>

                                                <AnimatePresence>
                                                    {isExpanded && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.2 }}
                                                        >
                                                            <div className="p-4 flex flex-wrap gap-2 border-t bg-background/50">
                                                                {groupingTags.map(tag => (
                                                                    <button
                                                                        key={tag._id}
                                                                        type="button"
                                                                        onClick={() => handleTagToggle(tag.name)}
                                                                        aria-pressed={selectedTags.includes(tag.name)}
                                                                        className={`
                                                                            min-h-9 rounded-md border px-2.5 py-1 text-sm transition-colors max-sm:min-h-11
                                                                            ${selectedTags.includes(tag.name)
                                                                                ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                                                                                : "bg-background border-input hover:border-muted-foreground/50 hover:bg-muted/50"}
                                                                        `}
                                                                    >
                                                                        {tag.name}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        )
                                    })}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Preview & Actions */}
                <div className="space-y-6 lg:sticky lg:top-24 lg:col-span-5 xl:col-span-4">
                    <Card className="overflow-hidden rounded-xl">
                        <CardHeader className="border-b bg-muted/20">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Sparkles className="size-5 text-primary" />
                                Preview
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 min-h-[300px] flex flex-col justify-between">
                            {generatedQuestions.length > 0 ? (
                                <Tabs value={activeTabIndex} onValueChange={setActiveTabIndex} className="w-full flex flex-col min-h-[250px]">
                                    <div className="flex items-center justify-between mb-4">
                                        <TabsList className="bg-muted/50 w-full justify-start overflow-x-auto h-auto p-1 gap-1">
                                            {generatedQuestions.map((_, i) => (
                                                <TabsTrigger 
                                                    key={i} 
                                                    value={i.toString()}
                                                    className="px-3 py-1 h-8 min-w-[32px]"
                                                >
                                                    {i + 1}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="ml-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                const indexToRemove = parseInt(activeTabIndex)
                                                const newQuestions = generatedQuestions.filter((_, i) => i !== indexToRemove)
                                                setGeneratedQuestions(newQuestions)
                                                setActiveTabIndex(Math.max(0, indexToRemove - 1).toString())
                                            }}
                                        >
                                            <X className="size-4" />
                                        </Button>
                                    </div>

                                    {generatedQuestions.map((q, i) => (
                                        <TabsContent 
                                            key={i} 
                                            value={i.toString()} 
                                            className="flex-1 mt-0 flex flex-col justify-between space-y-6 animate-in fade-in zoom-in duration-300"
                                        >
                                            <div className="space-y-4">
                                                <p className="text-xl font-medium leading-relaxed">{q.text}</p>
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge variant="outline">run {q.runId.slice(-6)}</Badge>
                                                    {selectedTags.map(tag => (
                                                        <Badge key={tag} variant="secondary" className="text-xs">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 pt-6 border-t">
                                                <Button
                                                    variant="outline"
                                                    onClick={handleGenerate}
                                                    disabled={isGenerating}
                                                    className="w-full"
                                                >
                                                    {isGenerating ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
                                                    Generate Another
                                                </Button>
                                                <Button
                                                    onClick={handleAccept}
                                                    disabled={isSaving}
                                                    className="w-full bg-green-600 hover:bg-green-700"
                                                >
                                                    {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Check className="size-4 mr-2" />}
                                                    Accept
                                                </Button>
                                            </div>
                                        </TabsContent>
                                    ))}
                                </Tabs>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12 text-muted-foreground">
                                    <div className="flex size-14 items-center justify-center rounded-full bg-muted/50">
                                        <Sparkles className="size-8 opacity-50" />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="font-medium text-foreground">{selectedStyleId && selectedToneId ? "Ready to generate" : "Choose a style and tone"}</p>
                                        <p className="text-sm">{selectedStyleId && selectedToneId ? "Generate a preview, then accept it to save." : "Both fields are required before a preview can be generated."}</p>
                                    </div>
                                    <Button
                                        onClick={handleGenerate}
                                        disabled={isGenerating || !selectedStyleId || !selectedToneId}
                                        className="mt-4 h-11 w-full"
                                    >
                                        {isGenerating ? (
                                            <>
                                                <Loader2 className="size-4 animate-spin mr-2" />
                                                Generating...
                                            </>
                                        ) : (
                                            "Generate Question"
                                        )}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {selectedTags.length > 0 && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Active Selection</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-2">
                                    {selectedTags.map(tag => (
                                        <Badge
                                            key={tag}
                                            variant="secondary"
                                            className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                            onClick={() => handleTagToggle(tag)}
                                        >
                                            {tag}
                                            <span className="ml-1 opacity-50">×</span>
                                        </Badge>
                                    ))}
                                    <Button
                                        variant="ghost"
                                        className="h-5 text-xs text-muted-foreground hover:text-destructive"
                                        onClick={() => setSelectedTags([])}
                                    >
                                        Clear all
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
