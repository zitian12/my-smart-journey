/**
 * Sustainability report PDF export (UC 5.3).
 * Uses the browser print dialog → Save as PDF.
 * No Google APIs, no extra npm packages.
 *
 * Place at: presentation/src/utils/exportEcoScorePdf.ts
 */

/** CSS class on the printable Eco Score root (optional focus target). */
export const ECO_SCORE_PRINT_ROOT = "msj-eco-score-print-root";

/**
 * Opens the system print dialog so the user can save as PDF.
 * Call after the dashboard has rendered score / footprint data.
 */
export function exportEcoScorePdf(): void {
  if (typeof window === "undefined") return;
  // Let React finish any pending paint (e.g. after selecting a trip).
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.print();
    });
  });
}