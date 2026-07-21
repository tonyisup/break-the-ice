import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeamPromptComposer } from "./TeamPromptComposer";

const taxonomy = {
  styles: [{ id: "style-1", name: "Reflective" }],
  tones: [{ id: "tone-1", name: "Warm" }],
};

describe("TeamPromptComposer", () => {
  it("assigns manager-written wording as an exact question", async () => {
    const onCreateQuestion = vi.fn().mockResolvedValue(undefined);
    render(
      <TeamPromptComposer
        dayLabel="Monday"
        {...taxonomy}
        onCreateQuestion={onCreateQuestion}
        onPreviewTopic={vi.fn()}
        onAssignTopicQuestion={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /write/i }));
    fireEvent.change(screen.getByLabelText("Exact question"), {
      target: { value: "What assumption should we challenge?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and assign" }));

    await waitFor(() => {
      expect(onCreateQuestion).toHaveBeenCalledWith(
        "What assumption should we challenge?",
      );
    });
  });

  it("previews three topic questions and assigns editable final wording", async () => {
    const onPreviewTopic = vi
      .fn()
      .mockResolvedValue([
        "What feels ready for launch?",
        "What concern deserves more airtime?",
        "Where would another perspective help?",
      ]);
    const onAssignTopicQuestion = vi.fn().mockResolvedValue(undefined);
    render(
      <TeamPromptComposer
        dayLabel="Wednesday"
        {...taxonomy}
        onCreateQuestion={vi.fn()}
        onPreviewTopic={onPreviewTopic}
        onAssignTopicQuestion={onAssignTopicQuestion}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /topic/i }));
    fireEvent.change(screen.getByLabelText("Topic name"), {
      target: { value: "Launch readiness" },
    });
    fireEvent.change(
      screen.getByLabelText("What should this conversation surface?"),
      {
        target: { value: "Surface unspoken concerns." },
      },
    );
    fireEvent.change(screen.getByLabelText(/Boundaries/), {
      target: { value: "Avoid naming individual owners." },
    });

    const generateButton = screen.getByRole("button", {
      name: "Generate three options",
    });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(
        screen.getByText("What concern deserves more airtime?"),
      ).toBeInTheDocument();
    });
    expect(onPreviewTopic).toHaveBeenCalledWith({
      name: "Launch readiness",
      guidance: "Surface unspoken concerns.",
      boundaries: "Avoid naming individual owners.",
      styleId: "style-1",
      toneId: "tone-1",
    });

    fireEvent.click(screen.getByText("What concern deserves more airtime?"));
    fireEvent.change(screen.getByLabelText("Final wording"), {
      target: { value: "What launch concern deserves more airtime?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use this question" }));

    await waitFor(() => {
      expect(onAssignTopicQuestion).toHaveBeenCalledWith(
        "What launch concern deserves more airtime?",
        {
          name: "Launch readiness",
          guidance: "Surface unspoken concerns.",
          boundaries: "Avoid naming individual owners.",
        },
      );
    });
  });

  it("invalidates generated options when their topic inputs change", async () => {
    const onPreviewTopic = vi
      .fn()
      .mockResolvedValue([
        "What feels ready for launch?",
        "What concern deserves more airtime?",
        "Where would another perspective help?",
      ]);
    render(
      <TeamPromptComposer
        dayLabel="Wednesday"
        {...taxonomy}
        onCreateQuestion={vi.fn()}
        onPreviewTopic={onPreviewTopic}
        onAssignTopicQuestion={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /topic/i }));
    fireEvent.change(screen.getByLabelText("Topic name"), {
      target: { value: "Launch readiness" },
    });
    fireEvent.change(
      screen.getByLabelText("What should this conversation surface?"),
      { target: { value: "Surface unspoken concerns." } },
    );
    const generateButton = screen.getByRole("button", {
      name: "Generate three options",
    });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);
    await screen.findByText("What concern deserves more airtime?");

    fireEvent.change(screen.getByLabelText("Topic name"), {
      target: { value: "Launch follow-through" },
    });

    expect(
      screen.queryByLabelText("Topic question previews"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use this question" }),
    ).not.toBeInTheDocument();
  });
});
