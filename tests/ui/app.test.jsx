// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import App from "../../src/App.jsx";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(cleanup);

const click = (name) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("app shell", () => {
  it("restores the real Create editor and the Grow tools", () => {
    render(<App />);
    expect(screen.getByText("Drop your video on the grill")).toBeTruthy();
    click("Grow");
    expect(screen.getAllByText(/YouTube/i).length).toBeGreaterThan(0);
    click("Film");
    expect(screen.getByText("Start your first film")).toBeTruthy();
    expect(window.location.search).toBe("?studio=film");
  });
});

describe("film workspace journey", () => {
  it("creates a project, writes intention, analyses a story, approves and persists", () => {
    window.history.replaceState(null, "", "/?studio=film");
    const { unmount } = render(<App />);

    type("Working title", "Rain Walk");
    fireEvent.click(screen.getByLabelText(/Animation/));
    click("Create project");
    expect(screen.getByRole("heading", { name: "Rain Walk" })).toBeTruthy();

    // Gate: can't move on without intention.
    expect(screen.getByRole("button", { name: "Move to Interpret" }).disabled).toBe(true);
    expect(screen.getByText("Describe what the audience should feel.")).toBeTruthy();

    type("What do you intend this film to do?", "Show a stranger finding belonging");
    type("What should the audience feel?", "Loneliness easing into warmth");
    click("Save intention");
    click("Move to Interpret");

    fireEvent.click(screen.getByRole("tab", { name: "Story" }));
    click("Load a short sample scene");
    click("Analyse into scenes");
    expect(screen.getByText("EXT. CITY STREET - NIGHT")).toBeTruthy();
    expect(screen.getByText("Animation needs")).toBeTruthy();
    expect(screen.getAllByText(/lip sync/i).length).toBeGreaterThan(0);

    click("Move to Plan");
    click("Move to Approve");
    expect(screen.getByRole("button", { name: "Move to Produce" }).disabled).toBe(true);
    type("Approved by", "Tester");
    click("Approve plan");
    expect(screen.getByText(/Plan approved by Tester/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move to Produce" }).disabled).toBe(false);

    // Persisted across a reload.
    unmount();
    render(<App />);
    expect(screen.getByRole("heading", { name: "Rain Walk" })).toBeTruthy();
    expect(screen.getByText(/Plan approved by Tester/)).toBeTruthy();

    // History recorded the steps.
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/v1 · Project created/)).toBeTruthy();
    expect(screen.getByText(/Plan approved by Tester/, { selector: "strong" })).toBeTruthy();
  });

  it("records a lesson and shows it on the matching scene", () => {
    window.history.replaceState(null, "", "/?studio=film");
    render(<App />);
    type("Working title", "Lessons");
    click("Create project");
    fireEvent.click(screen.getByRole("tab", { name: "Story" }));
    click("Load a short sample scene");
    click("Analyse into scenes");

    fireEvent.click(screen.getByRole("tab", { name: "Lessons" }));
    type("What it should be", "Single sodium streetlight, deep shadow");
    type("The lesson to remember", "Lonely night street scenes need low-key light");
    type("Tags", "night, street");
    click("Save lesson");

    fireEvent.click(screen.getByRole("tab", { name: /Breakdown/ }));
    const first = screen.getByText("EXT. CITY STREET - NIGHT").closest("article");
    expect(within(first).getByText("Lessons that may apply")).toBeTruthy();
  });

  it("refuses an evaluation score without evidence and explains why", () => {
    window.history.replaceState(null, "", "/?studio=film");
    render(<App />);
    type("Working title", "Eval");
    click("Create project");
    fireEvent.click(screen.getByRole("tab", { name: "Evaluate" }));
    type("What is being evaluated", "Cut 1");
    fireEvent.change(screen.getByLabelText(/Pacing/, { selector: "select" }), { target: { value: "3" } });
    click("Record evaluation");
    expect(screen.getByRole("alert").textContent).toMatch(/needs evidence/);
  });
});
