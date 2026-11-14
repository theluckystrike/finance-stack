import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

// jsdom has no layout, so the container's scrollWidth/clientWidth are both
// zero unless they are supplied. These are the two numbers the component
// compares to decide whether the container can actually scroll.
let scrollWidth = 0;
let clientWidth = 0;

// The vitest-setup ResizeObserver is a no-op. Capture the callback here so a
// test can fire it after changing the measurements, which is what a real
// observer does when the table or its card changes width.
let resizeCallback: ResizeObserverCallback | null = null;

class ControlledResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  scrollWidth = 0;
  clientWidth = 0;
  resizeCallback = null;
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => clientWidth,
  });
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
});

afterEach(() => {
  // Remove the getters rather than leaving this file's measurements in place
  // for every later test in the same worker.
  delete (HTMLElement.prototype as unknown as { scrollWidth?: number })
    .scrollWidth;
  delete (HTMLElement.prototype as unknown as { clientWidth?: number })
    .clientWidth;
});

function renderTable(containerLabel = "Liability Performance") {
  return render(
    <Table containerLabel={containerLabel}>
      <TableBody>
        <TableRow>
          <TableCell>Visa ...1234</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

const container = () =>
  document.querySelector('[data-slot="table-container"]') as HTMLElement;

describe("Table scroll container", () => {
  it("makes an overflowing container a named, focusable region", () => {
    scrollWidth = 320;
    clientWidth = 200;
    renderTable();

    const region = screen.getByRole("region", {
      name: "Liability Performance",
    });
    expect(region).toBe(container());
    expect(region).toHaveAttribute("tabindex", "0");
    // The ring has to be visible when the container is reached by keyboard.
    expect(region).toHaveClass("focus-visible:ring-2");
  });

  it("leaves a table that fits without a pointless tab stop or region", () => {
    scrollWidth = 200;
    clientWidth = 200;
    renderTable();

    expect(container()).not.toHaveAttribute("role");
    expect(container()).not.toHaveAttribute("tabindex");
    expect(container()).not.toHaveAttribute("aria-label");
  });

  it("drops the tab stop when a resize makes the table fit", () => {
    scrollWidth = 320;
    clientWidth = 200;
    renderTable();
    expect(screen.getByRole("region")).toBeInTheDocument();

    scrollWidth = 200;
    clientWidth = 200;
    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });

    expect(container()).not.toHaveAttribute("role");
    expect(container()).not.toHaveAttribute("tabindex");
  });
});
