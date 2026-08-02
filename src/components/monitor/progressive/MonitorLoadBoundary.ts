"use client";

import {
  Component,
  createElement,
  type ErrorInfo,
  type ReactNode,
} from "react";

export type MonitorBoundaryId =
  | "monitor-shell"
  | "selected-ticker-core"
  | "selected-ticker-supplemental"
  | "analogue"
  | "filing-evidence"
  | "personal-data"
  | "event-tape"
  | "secondary-dilution"
  | "secondary-personal";

type Props = {
  id: MonitorBoundaryId;
  children: ReactNode;
  pendingFallback?: ReactNode;
  label?: string;
  className?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = {
  error: Error | null;
  retryKey: number;
};

/**
 * Error-isolating boundary for progressive Monitor panels.
 * A failure here never blanks the Priority Ladder / Momentum Field shell.
 */
export class MonitorLoadBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[monitor-boundary:${this.props.id}]`,
        error.message,
        info.componentStack
      );
    }
  }

  private retry = (): void => {
    this.setState((s) => ({ error: null, retryKey: s.retryKey + 1 }));
  };

  render() {
    const { id, label, className, children } = this.props;
    if (this.state.error) {
      return createElement(
        "div",
        {
          className: className ?? "tt-mon-boundary tt-mon-boundary--error",
          "data-testid": `monitor-boundary-${id}`,
          "data-boundary": id,
          "data-state": "error",
          role: "alert",
        },
        createElement(
          "p",
          { className: "tt-mon-boundary__title" },
          label ?? "This panel failed to load"
        ),
        createElement(
          "p",
          { className: "tt-mon-boundary__body" },
          "Other Monitor panels stay available. Retry this section only."
        ),
        createElement(
          "button",
          {
            type: "button",
            className: "tt-monitor__drawer-btn",
            "data-testid": `monitor-boundary-retry-${id}`,
            onClick: this.retry,
          },
          "Retry"
        )
      );
    }

    return createElement(
      "div",
      {
        className,
        "data-testid": `monitor-boundary-${id}`,
        "data-boundary": id,
        "data-state": "ok",
      },
      createElement("div", { key: this.state.retryKey }, children)
    );
  }
}
