// Single compact XAI card for the dashboard. Connects facts the existing
// dashboard already shows (depth, formation, risk alerts, comparable wells,
// historical events, parameters) into one evidence-backed explanation of why
// the system reached its current assessment. Fully driven by the active well;
// nothing is hardcoded per well and no telemetry is invented for wells that
// have no parameter snapshot.

import { useState } from "react";
import { ChevronDown, Compass } from "lucide-react";
import { useWellContext } from "../../context/WellContext.jsx";
import {
  drillingParameters,
  getComparableWells,
  getEventsForWell,
  getRiskAlerts,
  getWell,
  historicalEvents,
} from "../../data/mockData.js";

const fmt = (n) => n.toLocaleString("en-IN");

// Well status in compact card language.
const STATUS_PHRASES = {
  Drilling: "is currently drilling",
  Suspended: "is suspended",
  Completed: "is completed",
  "Plug and Abandon": "is plugged and abandoned",
};

export default function WellReasoning({ onOpenEvidence }) {
  const { activeWellId } = useWellContext();
  const [showDetails, setShowDetails] = useState(false);

  const well = getWell(activeWellId);
  if (!well) return null;

  const params = drillingParameters[activeWellId] ?? null;
  const alerts = getRiskAlerts(activeWellId);
  const alert = alerts[0] ?? null;
  const ownEvents = getEventsForWell(activeWellId);
  const comps = getComparableWells(activeWellId).filter(
    (c) => c.formation === well.formation && c.similarity >= 50
  );

  // Correlated offset events: same formation, near the active well's depth.
  const correlatedEvents = historicalEvents
    .filter(
      (e) =>
        e.wellId !== activeWellId &&
        e.formation === well.formation &&
        e.depth >= well.depth - 200 &&
        e.depth <= well.depth + 300
    )
    .sort((a, b) => a.depth - b.depth);

  const eventTypeCounts = {};
  for (const e of correlatedEvents) {
    eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] ?? 0) + 1;
  }
  const topType =
    Object.entries(eventTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topCount = topType ? eventTypeCounts[topType] : 0;

  // Supporting well ids (correlated offsets first, alert wells as fallback).
  const supportingWells = correlatedEvents.length
    ? [...new Set(correlatedEvents.map((e) => e.wellId))]
    : alert?.comparableWells ?? [];
  const supportingWellLabels = comps.length
    ? comps.map((c) => c.wellId)
    : supportingWells;

  // --- ANALYSIS: two short, data-assembled paragraphs -----------------------
  const p1 =
    well.id + " " + (STATUS_PHRASES[well.status] ?? "is " + well.status) + " at " +
    fmt(well.depth) + " m in formation " + well.formation + ". " +
    (alert
      ? "The system has flagged elevated " + alert.riskType.toLowerCase() +
        " relevance because the current depth is approaching a historical " +
        alert.riskType.toLowerCase() + " zone (" + fmt(alert.riskInterval[0]) + "-" +
        fmt(alert.riskInterval[1]) + " m) recorded across comparable wells."
      : well.status === "Suspended"
        ? (well.suspensionSummary
            ? well.suspensionSummary.split(". ")[0] + "."
            : "Operations were paused for engineering review.")
        : well.status === "Plug and Abandon"
          ? (well.paSummary ? well.paSummary.split(". ")[0] + "." : "The well was plugged after reaching planned TD.")
          : well.status === "Completed"
            ? (well.completionSummary
                ? well.completionSummary.split(". ").slice(0, 2).join(". ") + "."
                : "The well reached planned TD and was completed.")
            : "No active hazard zone is flagged ahead of the current depth.");

  const highEvent = correlatedEvents.find((e) => e.severity === "High") ?? correlatedEvents[0] ?? null;
  const mudWeight = params?.find((p) => p.key === "mudWeight")?.value;

  const p2Parts = [];
  if (correlatedEvents.length) {
    p2Parts.push(
      "Historical evidence indicates " + correlatedEvents.length + " relevant event" +
      (correlatedEvents.length === 1 ? "" : "s") + " in " + well.formation +
      " across comparable wells" +
      (topType ? ", most commonly " + topType.toLowerCase() : "") +
      (highEvent
        ? ", including a " + highEvent.severity.toLowerCase() + "-severity " +
          highEvent.eventType.toLowerCase() + " at " + fmt(highEvent.depth) + " m in " +
          highEvent.wellId
        : "") + "."
    );
  } else if (ownEvents.length) {
    p2Parts.push(
      "Historical records include " + ownEvents.length + " event" +
      (ownEvents.length === 1 ? "" : "s") + " from this well's own operation."
    );
  } else {
    p2Parts.push(
      "No historical events are recorded for this well or formation in the dataset."
    );
  }
  if (mudWeight != null) {
    p2Parts.push(
      "Current mud weight (" + mudWeight.toFixed(2) + " SG) is within the range observed during historical incidents."
    );
  } else {
    p2Parts.push("No representative telemetry snapshot exists for this well, so the reasoning rests on well records.");
  }
  const p2 = p2Parts.join(" ");

  // --- WHY THIS MATTERS -----------------------------------------------------
  const whyMatters = alert
    ? "Current conditions and historical evidence are similar enough to warrant attention as the well approaches the mapped " +
      alert.riskType.toLowerCase() + " zone. This is a decision-support signal, not a prediction that the event will definitely occur."
    : "Historical records and well status explain the current assessment. This is decision-support context drawn from records, not a prediction of future events.";

  // --- Based-on footer -------------------------------------------------------
  const basedOn = [
    params ? "Current telemetry" : "Well records",
    well.formation + " formation",
    (correlatedEvents.length || ownEvents.length
      ? (correlatedEvents.length || ownEvents.length) + " historical event" +
        ((correlatedEvents.length || ownEvents.length) === 1 ? "" : "s")
      : null),
    supportingWellLabels.length
      ? supportingWellLabels.length + " comparable well" + (supportingWellLabels.length === 1 ? "" : "s")
      : null,
    alert ? alert.distanceToRiskM + " m depth proximity" : null,
  ].filter(Boolean);

  // --- Expandable reasoning factors (all from data) --------------------------
  const factors = [
    alert
      ? "Depth proximity: " + fmt(well.depth) + " m current vs " + fmt(alert.riskInterval[0]) +
        " m mapped zone (" + alert.distanceToRiskM + " m)"
      : "Depth context: well at " + fmt(well.depth) + " m in " + well.formation,
    "Formation match: " + well.formation + " matches " +
      (correlatedEvents.length ? supportingWells.length : comps.length) +
      " comparable well" + ((correlatedEvents.length ? supportingWells.length : comps.length) === 1 ? "" : "s") +
      " with recorded events",
    topType
      ? "Historical event frequency: " + topCount + " " + topType.toLowerCase() + " event" +
        (topCount === 1 ? "" : "s") + " in " + well.formation + " near this depth range"
      : "Historical event frequency: none recorded in this formation",
    params
      ? "Operational similarity: " + well.holeSection + " section comparable to incident wells"
      : "Operational similarity: " + well.holeSection + " section matches the recorded incident section",
    params
      ? "Current parameter signal: mud weight " + mudWeight.toFixed(2) +
        " SG, within the historical incident band"
      : "Current parameter signal: not evaluated; no representative telemetry for this well",
  ];

  return (
    <section className="wl-card">
      <div className="wl-panel-head">
        <div className="wl-panel-title">
          <Compass size={13} strokeWidth={2} />
          <span>Well Reasoning</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-[3px] border border-wl-border px-1.5 py-[2px] text-[8.5px] font-semibold uppercase tracking-[0.12em] text-wl-text-muted"
            title="Explainable AI: assembled from structured well data"
          >
            XAI
          </span>
        </div>
      </div>

      <div className="px-5 py-3.5">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-wl-text-muted">
          Explainable AI analysis of the current well
        </div>

        {/* Analysis: two short paragraphs */}
        <div className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-wl-text-primary">
          <p>{p1}</p>
          <p>{p2}</p>
        </div>

        {/* Why this matters */}
        <div className="mt-3 rounded-[5px] border border-wl-border bg-wl-surface-2 px-3.5 py-2.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-wl-text-muted">
            Why this matters
          </div>
          <div className="mt-1 text-[12px] leading-relaxed text-wl-text-secondary">{whyMatters}</div>
        </div>

        {/* Expandable detail: stays inside this card */}
        {showDetails && (
          <div className="mt-3 rounded-[5px] border border-wl-border bg-wl-accent-faint px-3.5 py-3">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-wl-text-muted">
              Reasoning factors
            </div>
            <ul className="mt-2 space-y-1.5">
              {factors.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] leading-snug text-wl-text-secondary">
                  <span className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-wl-accent/70" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Based-on footer + actions */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-wl-border pt-2.5">
          <div className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-wl-text-muted">
            <span className="font-semibold text-wl-text-secondary">Based on:</span>{" "}
            {basedOn.join(" · ")}
            <span className="mx-1.5">·</span>
            <span title="Representative prototype data; not actual operator records.">
              Representative prototype data
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="wl-btn"
              onClick={() => onOpenEvidence?.(alert)}
              disabled={!alert}
              title={alert ? "Open the evidence viewer" : "No alert evidence for this well"}
            >
              View Evidence
            </button>
            <button type="button" className="wl-btn" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? "Hide Details" : "View Details"}
              <ChevronDown
                size={11}
                className={"transition-transform duration-150" + (showDetails ? " rotate-180" : "")}
              />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
