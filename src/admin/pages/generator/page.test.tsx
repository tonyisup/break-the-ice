import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import GeneratorPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@convex/_generated/api", () => ({
  api: {
    core: { styles: { getStyles: "getStyles" }, tones: { getTones: "getTones" }, topics: { getTopics: "getTopics" } },
    admin: {
      generator: {
        listModels: "listModels",
        listExperiments: "listExperiments",
        getSetup: "getSetup",
        getExperiment: "getExperiment",
        createExperiment: "createExperiment",
        saveModel: "saveModel",
        removeModel: "removeModel",
        retryCall: "retryCall",
        updateExperiment: "updateExperiment",
      },
      review: { reviewPendingQuestions: "reviewPendingQuestions" },
      pruning: { undoReview: "undoReview" },
    },
  },
}));

const OPUS = "anthropic/claude-opus-5.5";
const HAIKU = "anthropic/claude-haiku-5.5";
const models = [
  { _id: "m1", _creationTime: 0, model: OPUS, label: "Opus", createdAt: 0 },
  { _id: "m2", _creationTime: 0, model: HAIKU, label: "Haiku", createdAt: 1 },
];
const setup = {
  coverage: { "pick-one|warm": 4 },
  rates: { perCallUsd: 0.01, perQuestionUsd: 0.005, perCheckUsd: 0.005 },
  budget: { spentUsd: 1, hardCapUsd: 5, leftUsd: 4 },
  busyCalls: 0,
};
const experiment = {
  _id: "exp-1",
  _creationTime: 0,
  name: "Nov 25 · 1 cell · 2 models",
  createdBy: "admin",
  createdAt: 0,
  questionsPerCall: 2,
  cells: [{ style: "pick-one", tone: "warm" }],
  models: [
    { model: HAIKU, label: "Haiku", blindLabel: "Model A" },
    { model: OPUS, label: "Opus", blindLabel: "Model B" },
  ],
  estimatedCostUsd: 0.05,
};
const question = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  _id: id, _creationTime: 0, text, status: "pending", reviewRevision: 1, isAIGenerated: true, totalLikes: 0, totalShows: 0, averageViewDuration: 0, ...extra,
});
const experimentData = {
  experiment,
  calls: [
    {
      call: { _id: "c1", _creationTime: 0, experimentId: "exp-1", style: "pick-one", tone: "warm", model: HAIKU, status: "done", attempts: 1, questionIds: ["q1", "q2"], queuedAt: 0 },
      questions: [
        { question: question("q1", "Beach or mountains for a long weekend?"), status: "pending" },
        { question: question("q2", "Coffee or tea to start the day?", { status: "public" }), status: "live" },
      ],
    },
    {
      call: { _id: "c2", _creationTime: 0, experimentId: "exp-1", style: "pick-one", tone: "warm", model: OPUS, status: "failed", attempts: 1, questionIds: [], queuedAt: 0, error: "No endpoints found" },
      questions: [],
    },
  ],
};

const mutations = {
  createExperiment: vi.fn(),
  saveModel: vi.fn(),
  removeModel: vi.fn(),
  retryCall: vi.fn(),
  updateExperiment: vi.fn(),
  reviewPendingQuestions: vi.fn(),
  undoReview: vi.fn(),
};
let queryArgs: Record<string, unknown> = {};
let setupResult: typeof setup = setup;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setupResult = setup;
  queryArgs = {};
  mutations.createExperiment.mockResolvedValue("exp-1");
  mutations.saveModel.mockResolvedValue("m3");
  mutations.retryCall.mockResolvedValue(null);
  mutations.reviewPendingQuestions.mockResolvedValue({ reviewId: "r1" });
  vi.mocked(useQuery).mockImplementation(((name: string, args: unknown) => {
    queryArgs[name] = args;
    switch (name) {
      case "getStyles":
        return [{ id: "pick-one", slug: "pick-one", name: "Pick One" }, { id: "what-if", slug: "what-if", name: "What If" }];
      case "getTones":
        return [{ id: "warm", slug: "warm", name: "Warm" }, { id: "bold", slug: "bold", name: "Bold" }];
      case "getTopics":
        return [{ id: "music", slug: "music", name: "Music" }];
      case "listModels":
        return models;
      case "listExperiments":
        return [{ experiment, calls: { queued: 0, running: 0, done: 1, failed: 1, questions: 2 } }];
      case "getSetup":
        return setupResult;
      case "getExperiment":
        return experimentData;
    }
    return undefined;
  }) as never);
  vi.mocked(useMutation).mockImplementation(((name: keyof typeof mutations) => mutations[name]) as never);
});

const renderAt = (path = "/admin/generator") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/generator" element={<GeneratorPage />} />
      </Routes>
    </MemoryRouter>,
  );
const cell = (name: RegExp) => screen.getByRole("button", { name });

describe("planning an experiment", () => {
  it("shades each cell by how many library questions it has, and picks cells, rows and gaps", () => {
    renderAt();
    expect(cell(/Pick One × Warm: 4 in the library/)).toBeInTheDocument();
    fireEvent.click(cell(/Pick One × Warm/));
    expect(cell(/Pick One × Warm/)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Select style What If" }));
    expect(cell(/What If × Warm/)).toHaveAttribute("aria-pressed", "true");
    expect(cell(/What If × Bold/)).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Select gaps below" }));
    expect(cell(/Pick One × Warm/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { pressed: true }).filter((b) => b.getAttribute("aria-label")?.includes("×"))).toHaveLength(3);
  });

  it("starts with the last run's models, and generates every cell for every model", async () => {
    renderAt();
    expect(screen.getByRole("button", { name: "Opus" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Haiku" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(cell(/Pick One × Warm/));
    fireEvent.click(cell(/What If × Bold/));
    fireEvent.click(within(screen.getByRole("group", { name: "Questions per call" })).getByRole("button", { name: "3" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Topic" }), { target: { value: "music" } });
    expect(queryArgs.getSetup).toEqual({ topicSlug: "music" });
    fireEvent.change(screen.getByPlaceholderText(/theme or an audience/), { target: { value: "Summer" } });

    expect(screen.getByText("2 cells × 2 models = 4 calls, 12 questions")).toBeInTheDocument();
    // 4 calls × $0.01 + 12 questions × ($0.005 + $0.005).
    expect(screen.getByText(/About \$0\.16 with Claude/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Generate/ }));
    await waitFor(() =>
      expect(mutations.createExperiment).toHaveBeenCalledWith({
        cells: [{ style: "pick-one", tone: "warm" }, { style: "what-if", tone: "bold" }],
        models: [HAIKU, OPUS],
        questionsPerCall: 3,
        topicSlug: "music",
        direction: "Summer",
      }),
    );
    // The new experiment opens.
    expect(await screen.findByRole("textbox", { name: "Experiment name" })).toHaveValue("Nov 25 · 1 cell · 2 models");
  });

  it("won't generate past today's budget, and says why", () => {
    setupResult = { ...setup, budget: { spentUsd: 4.99, hardCapUsd: 5, leftUsd: 0.01 } };
    renderAt();
    fireEvent.click(cell(/Pick One × Warm/));
    expect(screen.getByText(/more than the \$0\.01 left today/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate/ })).toBeDisabled();
  });

  it("saves a new model and switches it on", async () => {
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: /Add model/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "OpenRouter model id" }), { target: { value: "openai/gpt-5" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Label" }), { target: { value: "GPT-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutations.saveModel).toHaveBeenCalledWith({ model: "openai/gpt-5", label: "GPT-5" }));
  });
});

describe("an experiment's results", () => {
  it("names models blind until they are revealed", () => {
    renderAt("/admin/generator?experiment=exp-1");
    const results = cell(/Open Pick One × Warm/);
    expect(results).toHaveTextContent("Model A");
    expect(results).toHaveTextContent("1 waiting");
    expect(results).toHaveTextContent("1 ✓");
    expect(results).toHaveTextContent("failed");
    expect(results).not.toHaveTextContent("Haiku");
    fireEvent.click(screen.getByRole("switch", { name: "Reveal models" }));
    expect(cell(/Open Pick One × Warm/)).toHaveTextContent("Haiku");
    expect(window.localStorage.getItem("admin.revealModels")).toBe("true");
  });

  it("reviews a cell's questions in its panel, and retries a failed call", async () => {
    renderAt("/admin/generator?experiment=exp-1");
    fireEvent.click(cell(/Open Pick One × Warm/));
    const panel = within(await screen.findByRole("dialog"));
    expect(panel.getByText("Beach or mountains for a long weekend?")).toBeInTheDocument();
    expect(panel.getByText("No endpoints found")).toBeInTheDocument();

    fireEvent.click(panel.getByRole("button", { name: /Awkward wording/ }));
    fireEvent.click(panel.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(mutations.reviewPendingQuestions).toHaveBeenCalledWith({
        questions: [{ id: "q1", expectedRevision: 1 }],
        decision: "reject",
        reasons: ["awkward_wording"],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Rejected", expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }));

    act(() => {
      fireEvent.keyDown(window, { key: "a" });
    });
    await waitFor(() => expect(mutations.reviewPendingQuestions).toHaveBeenLastCalledWith({ questions: [{ id: "q1", expectedRevision: 1 }], decision: "approve" }));

    fireEvent.click(panel.getByRole("button", { name: /Retry/ }));
    await waitFor(() => expect(mutations.retryCall).toHaveBeenCalledWith({ callId: "c2" }));
  });
});
