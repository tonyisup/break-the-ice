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

export default function GeneratorPage() {
    const styles = useQuery(api.core.styles.getStyles, {})
    const tones = useQuery(api.core.tones.getTones, {})
    const topics = useQuery(api.core.topics.getTopics, {})
    const tags = useQuery(api.core.tags.getTags)

    const generateAIQuestions = useAction(api.admin.ai.generateAIQuestions)
    const saveAIQuestion = useMutation(api.core.questions.saveAIQuestion)

    const [selectedTags, setSelectedTags] = React.useState<string[]>([])
    const [customTag, setCustomTag] = React.useState("")
    const [selectedStyleId, setSelectedStyleId] = React.useState<Id<"styles"> | null>(null)
    const [selectedToneId, setSelectedToneId] = React.useState<Id<"tones"> | null>(null)
    const [selectedTopicId, setSelectedTopicId] = React.useState<Id<"topics"> | null>(null)
    const [isGenerating, setIsGenerating] = React.useState(false)
    const [isSaving, setIsSaving] = React.useState(false)
    const [expandedTagGroupings, setExpandedTagGroupings] = React.useState<Set<string>>(new Set())
    const [generatedQuestions, setGeneratedQuestions] = React.useState<string[]>([])
    const [activeTabIndex, setActiveTabIndex] = React.useState<string>("0")

    // Convenience for active question
    const activeQuestion = generatedQuestions[parseInt(activeTabIndex)]

    // Reset generated questions when major configuration changes
    React.useEffect(() => {
        setGeneratedQuestions([])
        setActiveTabIndex("0")
    }, [selectedStyleId, selectedToneId, selectedTopicId])

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
        if (selectedTags.length === 0) {
            toast.error("Please select at least one tag")
            return
        }

        setIsGenerating(true)
        try {
            if (!selectedStyleId || !selectedToneId) {
                toast.error("Please select a style and tone")
                return
            }

            const generatedQuestion = await generateAIQuestions({
                count: 1,
                selectedTags,
                excludedQuestions: generatedQuestions.length > 0 ? generatedQuestions : undefined,
                styleId: selectedStyleId,
                toneId: selectedToneId,
                topicId: selectedTopicId || undefined
            })
            if (generatedQuestion) {
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
                text: activeQuestion,
                tags: selectedTags,
                styleId: selectedStyleId,
                style: selectedStyle?.id,
                toneId: selectedToneId,
                tone: selectedTone?.id,
                topicId: selectedTopicId || undefined,
                topic: selectedTopic?.id,
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

    if (!styles || !tones || !tags || !topics) {
        return (
            <div className="flex items-center justify-center h-full p-12">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">AI Generator</h2>
                <p className="text-muted-foreground">Generate new questions using AI based on styles, tones, topics, and tags.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-12 items-start">
                {/* Left Column: Controls */}
                <div className="space-y-6 lg:col-span-7 xl:col-span-8">
                    {/* Style & Tone Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Configuration</CardTitle>
                            <CardDescription>Choose the personality of the question.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-sm font-medium">Style</label>
                                <div className="flex flex-wrap gap-2">
                                    {styles.map(style => (
                                        <div
                                            key={style.id}
                                            onClick={() => setSelectedStyleId(style._id)}
                                            className={`
                                                cursor-pointer px-3 py-1.5 rounded-full text-sm font-medium border transition-all
                                                ${selectedStyleId === style._id
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-muted/50 hover:bg-muted border-transparent hover:border-muted-foreground/20"}
                                            `}
                                        >
                                            {style.name}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-medium">Tone</label>
                                <div className="flex flex-wrap gap-2">
                                    {tones.map(tone => (
                                        <div
                                            key={tone.id}
                                            onClick={() => setSelectedToneId(tone._id)}
                                            className={`
                                                cursor-pointer px-3 py-1.5 rounded-full text-sm font-medium border transition-all
                                                ${selectedToneId === tone._id
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-muted/50 hover:bg-muted border-transparent hover:border-muted-foreground/20"}
                                            `}
                                        >
                                            {tone.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Topic Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Topic</CardTitle>
                            <CardDescription>Select a thematic focus (optional).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                <div
                                    onClick={() => setSelectedTopicId(null)}
                                    className={`
                                        cursor-pointer px-3 py-1.5 rounded-full text-sm font-medium border transition-all
                                        ${selectedTopicId === null
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-muted/50 hover:bg-muted border-transparent hover:border-muted-foreground/20"}
                                    `}
                                >
                                    None (General)
                                </div>
                                {topics.map(topic => (
                                    <div
                                        key={topic._id}
                                        onClick={() => setSelectedTopicId(topic._id)}
                                        className={`
                                            cursor-pointer px-3 py-1.5 rounded-full text-sm font-medium border transition-all
                                            ${selectedTopicId === topic._id
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-muted/50 hover:bg-muted border-transparent hover:border-muted-foreground/20"}
                                        `}
                                    >
                                        {topic.name}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tags Selection */}
                    <Card className="flex flex-col h-[600px]">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Tags</CardTitle>
                                    <CardDescription>Select categories to guide the AI.</CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={expandAllTagGroupings}>Expand All</Button>
                                    <Button variant="outline" onClick={collapseAllTagGroupings}>Collapse All</Button>
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
                                />
                                <Button size="icon" onClick={handleAddCustomTag}><Plus className="size-4" /></Button>
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
                                                                    <div
                                                                        key={tag._id}
                                                                        onClick={() => handleTagToggle(tag.name)}
                                                                        className={`
                                                                            cursor-pointer px-2.5 py-1 rounded-md text-sm border transition-all
                                                                            ${selectedTags.includes(tag.name)
                                                                                ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                                                                                : "bg-background border-input hover:border-muted-foreground/50 hover:bg-muted/50"}
                                                                        `}
                                                                    >
                                                                        {tag.name}
                                                                    </div>
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
                <div className="space-y-6 lg:col-span-5 xl:col-span-4 lg:sticky lg:top-6">
                    <Card className="border-2 border-primary/10 shadow-lg">
                        <CardHeader className="bg-muted/20">
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="size-5 text-purple-500" />
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
                                                <p className="text-xl font-medium leading-relaxed">{q}</p>
                                                <div className="flex flex-wrap gap-2">
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
                                    <div className="p-4 rounded-full bg-muted/50">
                                        <Sparkles className="size-8 opacity-50" />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="font-medium text-foreground">Ready to Generate</p>
                                        <p className="text-sm">Select your preferences and tags, then click generate to create a new question.</p>
                                    </div>
                                    <Button
                                        onClick={handleGenerate}
                                        disabled={isGenerating || selectedTags.length === 0}
                                        className="w-full mt-4"
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
