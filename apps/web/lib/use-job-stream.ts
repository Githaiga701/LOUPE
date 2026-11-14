"use client";

import { useEffect, useReducer } from "react";
import { JobEvent, type CheckDescriptor, type Signal, type Verdict } from "@loupe/schema";

export interface JobView {
  checks: CheckDescriptor[];
  started: Set<string>;
  signals: Record<string, Signal>;
  verdict?: Verdict;
  limits: string[];
  reportId?: string;
  error?: string;
  /** Most recent announcement for the aria-live region. */
  announce: string;
  /** Connection state so the UI can say "reconnecting" honestly. */
  connection: "connecting" | "open" | "closed";
}

type Action = { type: "event"; event: JobEvent } | { type: "connection"; state: JobView["connection"] };

const initial: JobView = { checks: [], started: new Set(), signals: {}, limits: [], announce: "", connection: "connecting" };

function reducer(state: JobView, action: Action): JobView {
  if (action.type === "connection") return { ...state, connection: action.state };
  const e = action.event;
  switch (e.type) {
    case "plan":
      return { ...state, checks: e.checks };
    case "stage_started":
      return { ...state, started: new Set([...state.started, e.check_id]) };
    case "signal":
      return { ...state, signals: { ...state.signals, [e.signal.id]: e.signal }, announce: `${e.signal.title}: ${e.signal.plain}` };
    case "stage_failed":
      return state; // the matching not_run signal follows
    case "verdict":
      return { ...state, verdict: e.verdict, limits: e.limits, announce: `Verdict: ${e.verdict.label.replace("_", " ")}, ${Math.round(e.verdict.confidence * 100)} percent confidence.` };
    case "done":
      return { ...state, reportId: e.report_id, connection: "closed" };
    case "error":
      return { ...state, error: e.message };
  }
}

/** Subscribes to /api/v1/jobs/{id}/stream and folds the events into a view. */
export function useJobStream(jobId: string | null) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/v1/jobs/${jobId}/stream`);
    const handle = (ev: MessageEvent) => {
      const parsed = JobEvent.safeParse(JSON.parse(ev.data));
      if (parsed.success) dispatch({ type: "event", event: parsed.data });
    };
    for (const t of ["plan", "stage_started", "signal", "stage_failed", "verdict", "done", "error", "message"]) es.addEventListener(t, handle as EventListener);
    es.onopen = () => dispatch({ type: "connection", state: "open" });
    es.onerror = () => dispatch({ type: "connection", state: "connecting" });
    const stopOnDone = (ev: MessageEvent) => { void ev; es.close(); dispatch({ type: "connection", state: "closed" }); };
    es.addEventListener("done", stopOnDone as EventListener);
    return () => es.close();
  }, [jobId]);

  return state;
}
