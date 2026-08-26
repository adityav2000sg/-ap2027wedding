/**
 * The North Indian wedding planning library.
 *
 * These are *templates*, not tasks. When a wedding is created they're
 * instantiated against its real dates and real event list — templates tagged
 * with `eventKinds` produce one task per matching event, so a five-function
 * wedding gets five "confirm venue walkthrough" tasks, correctly named and
 * correctly dated, while a two-function wedding gets two.
 *
 * `offsetDays` is relative to the first day of the wedding (negative = before).
 * Because every generated task keeps its offset, moving the wedding date can
 * re-derive every deadline in one pass.
 *
 * Traditions are opt-in. Families differ enormously — no ritual is assumed.
 */

import type { EventKind, PlanPhase, TaskPriority } from "./types";

export interface TaskTemplateDefinition {
  key: string;
  title: string;
  description?: string;
  area: string;
  phase: PlanPhase;
  offsetDays: number;
  /** Readiness weight, 1 (trivial) to 5 (the wedding doesn't happen without it). */
  importance: number;
  priority: TaskPriority;
  /** Present = instantiate once per matching event. */
  eventKinds?: EventKind[];
  /** Only generated when the family has opted into this ritual. */
  requiresTradition?: string;
  /** Template keys that must finish first. Resolved into real dependencies. */
  dependsOn?: string[];
  isMilestone?: boolean;
}

/** Anchor offset for each planning phase, in days before the wedding. */
const PHASE_ANCHOR: Record<PlanPhase, number> = {
  TWELVE_PLUS_MONTHS: -400,
  NINE_TO_TWELVE_MONTHS: -320,
  SIX_TO_NINE_MONTHS: -230,
  FOUR_TO_SIX_MONTHS: -150,
  THREE_MONTHS: -90,
  TWO_MONTHS: -60,
  ONE_MONTH: -30,
  TWO_WEEKS: -14,
  WEDDING_WEEK: -5,
  WEDDING_DAY: 0,
  POST_WEDDING: 10,
};

/** How far tasks in the same phase are spread apart, so nothing bunches up. */
const PHASE_SPREAD: Record<PlanPhase, number> = {
  TWELVE_PLUS_MONTHS: 6,
  NINE_TO_TWELVE_MONTHS: 5,
  SIX_TO_NINE_MONTHS: 4,
  FOUR_TO_SIX_MONTHS: 3,
  THREE_MONTHS: 2,
  TWO_MONTHS: 2,
  ONE_MONTH: 1,
  TWO_WEEKS: 1,
  WEDDING_WEEK: 1,
  WEDDING_DAY: 0,
  POST_WEDDING: 2,
};

/** All the rituals a family can switch on or off. */
export const TRADITIONS: { key: string; label: string; description: string }[] = [
  { key: "baraat", label: "Baraat", description: "The groom's procession to the venue." },
  { key: "ghodi", label: "Ghodi", description: "Groom arrives on horseback." },
  { key: "milni", label: "Milni", description: "Formal greeting between the two families." },
  { key: "sehra", label: "Sehra", description: "Groom's floral veil." },
  { key: "varmala", label: "Varmala / Jaimala", description: "Exchange of garlands." },
  { key: "pheras", label: "Pheras", description: "Circling the sacred fire." },
  { key: "sindoor", label: "Sindoor", description: "Applying sindoor to the bride's parting." },
  { key: "mangalsutra", label: "Mangalsutra", description: "Tying of the mangalsutra." },
  { key: "kanyadaan", label: "Kanyadaan", description: "The bride's parents give her away." },
  { key: "joota-chupai", label: "Joota Chupai", description: "Hiding the groom's shoes." },
  { key: "vidaai", label: "Vidaai", description: "The bride's farewell." },
  { key: "griha-pravesh", label: "Griha Pravesh", description: "The bride's welcome into her new home." },
  { key: "chooda", label: "Chooda Ceremony", description: "Red-and-white bangles for the bride." },
  { key: "kalire", label: "Kalire", description: "Ornaments tied to the bride's chooda." },
  { key: "sagan", label: "Sagan / Roka", description: "Formal engagement blessing." },
  { key: "havan", label: "Havan", description: "Sacred fire ritual." },
  { key: "anand-karaj", label: "Anand Karaj", description: "Sikh wedding ceremony." },
];

type Spec = [
  key: string,
  title: string,
  phase: PlanPhase,
  importance: number,
  priority: TaskPriority,
  extra?: Partial<TaskTemplateDefinition>,
];

/** Builds one area's templates, spreading their due dates within the phase. */
function area(areaName: string, specs: Spec[]): TaskTemplateDefinition[] {
  const perPhase = new Map<PlanPhase, number>();
  return specs.map(([key, title, phase, importance, priority, extra]) => {
    const index = perPhase.get(phase) ?? 0;
    perPhase.set(phase, index + 1);
    return {
      key,
      title,
      area: areaName,
      phase,
      offsetDays: PHASE_ANCHOR[phase] + index * PHASE_SPREAD[phase],
      importance,
      priority,
      ...extra,
    };
  });
}

const ALL_MAIN_EVENTS: EventKind[] = [
  "HALDI", "MEHENDI", "SANGEET", "SHAADI", "RECEPTION",
];

// ─────────────────────────────────────────────────────────────── Foundation

const foundation = area("Foundation", [
  ["foundation-date", "Lock the wedding dates with both families", "TWELVE_PLUS_MONTHS", 5, "CRITICAL", { isMilestone: true }],
  ["foundation-muhurat", "Confirm the muhurat with the family pandit", "TWELVE_PLUS_MONTHS", 5, "CRITICAL"],
  ["foundation-guest-estimate", "Agree a rough guest estimate with both sides", "TWELVE_PLUS_MONTHS", 5, "CRITICAL"],
  ["foundation-budget", "Set the overall wedding budget", "TWELVE_PLUS_MONTHS", 5, "CRITICAL", { isMilestone: true, dependsOn: ["foundation-guest-estimate"] }],
  ["foundation-split", "Decide who is paying for which categories", "TWELVE_PLUS_MONTHS", 4, "HIGH", { dependsOn: ["foundation-budget"] }],
  ["foundation-events", "Define the full list of functions", "TWELVE_PLUS_MONTHS", 5, "CRITICAL"],
  ["foundation-cities", "Shortlist the cities for each function", "TWELVE_PLUS_MONTHS", 4, "HIGH"],
  ["foundation-style", "Agree the overall style and feel of the wedding", "TWELVE_PLUS_MONTHS", 3, "MEDIUM"],
  ["foundation-planner", "Decide whether to appoint a wedding planner", "TWELVE_PLUS_MONTHS", 4, "HIGH"],
  ["foundation-decision-makers", "Agree who makes the final call on each area", "TWELVE_PLUS_MONTHS", 3, "MEDIUM"],
  ["foundation-owners", "Assign a responsible person to every major area", "NINE_TO_TWELVE_MONTHS", 4, "HIGH"],
  ["foundation-comms", "Create the family planning group chat", "NINE_TO_TWELVE_MONTHS", 2, "LOW"],
  ["foundation-contingency", "Set aside an emergency contingency reserve", "NINE_TO_TWELVE_MONTHS", 4, "HIGH", { dependsOn: ["foundation-budget"] }],
  ["foundation-traditions", "Confirm which rituals this family will observe", "NINE_TO_TWELVE_MONTHS", 4, "HIGH"],
  ["foundation-calendar", "Share the full event calendar with both families", "SIX_TO_NINE_MONTHS", 3, "MEDIUM"],
]);

// ───────────────────────────────────────────────────────────────────── Venue

const venue = area("Venue", [
  ["venue-research", "Research venues", "TWELVE_PLUS_MONTHS", 5, "CRITICAL", { eventKinds: ALL_MAIN_EVENTS }],
  ["venue-availability", "Check date availability", "NINE_TO_TWELVE_MONTHS", 5, "CRITICAL", { eventKinds: ALL_MAIN_EVENTS, dependsOn: ["venue-research"] }],
  ["venue-walkthrough", "Do a site walkthrough", "NINE_TO_TWELVE_MONTHS", 5, "CRITICAL", { eventKinds: ALL_MAIN_EVENTS, dependsOn: ["venue-availability"] }],
  ["venue-capacity", "Confirm capacity against the guest estimate", "NINE_TO_TWELVE_MONTHS", 5, "CRITICAL", { eventKinds: ALL_MAIN_EVENTS }],
  ["venue-pricing", "Get written pricing and what's included", "NINE_TO_TWELVE_MONTHS", 5, "CRITICAL", { eventKinds: ALL_MAIN_EVENTS }],
  ["venue-book", "Book the venue and pay the deposit", "SIX_TO_NINE_MONTHS", 5, "CRITICAL", { eventKinds: ALL_MAIN_EVENTS, isMilestone: true, dependsOn: ["venue-walkthrough", "venue-pricing"] }],
  ["venue-restrictions", "Note venue restrictions and house rules", "SIX_TO_NINE_MONTHS", 4, "HIGH", { eventKinds: ALL_MAIN_EVENTS }],
  ["venue-curfew", "Confirm the music and guest curfew", "SIX_TO_NINE_MONTHS", 4, "HIGH", { eventKinds: ALL_MAIN_EVENTS }],
  ["venue-alcohol", "Confirm alcohol rules and licensing", "SIX_TO_NINE_MONTHS", 3, "MEDIUM"],
  ["venue-catering-rules", "Confirm whether outside catering is allowed", "SIX_TO_NINE_MONTHS", 4, "HIGH"],
  ["venue-vendor-rules", "Confirm restrictions on outside vendors", "SIX_TO_NINE_MONTHS", 3, "MEDIUM"],
  ["venue-decor-rules", "Confirm what decor the venue permits", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["venue-stage", "Get stage dimensions and power points", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["venue-rain-backup", "Confirm the wet-weather backup plan", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL"],
  ["venue-power-backup", "Confirm generator and power backup", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["venue-bathrooms", "Check bathroom count and condition", "FOUR_TO_SIX_MONTHS", 2, "LOW"],
  ["venue-accessibility", "Check step-free access for elderly guests", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["venue-green-rooms", "Confirm green rooms and changing spaces", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["venue-bridal-room", "Confirm the bridal room and its facilities", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["venue-groom-room", "Confirm the groom's room", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["venue-family-holding", "Agree family holding areas", "THREE_MONTHS", 2, "LOW"],
  ["venue-loading", "Confirm loading access for vendors", "THREE_MONTHS", 3, "MEDIUM"],
  ["venue-parking", "Confirm parking capacity and valet", "THREE_MONTHS", 3, "MEDIUM"],
  ["venue-setup-time", "Agree vendor setup and teardown windows", "TWO_MONTHS", 4, "HIGH"],
  ["venue-final-walkthrough", "Final venue walkthrough with the planner", "ONE_MONTH", 5, "CRITICAL"],
  ["venue-final-payment", "Settle the venue final payment", "TWO_WEEKS", 5, "CRITICAL"],
]);

// ─────────────────────────────────────────────────────────────────── Catering

const catering = area("Catering", [
  ["catering-shortlist", "Shortlist caterers", "NINE_TO_TWELVE_MONTHS", 5, "CRITICAL"],
  ["catering-tasting", "Attend tastings and score the shortlist", "SIX_TO_NINE_MONTHS", 5, "CRITICAL", { dependsOn: ["catering-shortlist"] }],
  ["catering-book", "Contract the caterer", "SIX_TO_NINE_MONTHS", 5, "CRITICAL", { isMilestone: true, dependsOn: ["catering-tasting"] }],
  ["catering-cuisine", "Agree the cuisine structure across all functions", "SIX_TO_NINE_MONTHS", 4, "HIGH"],
  ["catering-menu", "Approve the menu", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL", { eventKinds: ALL_MAIN_EVENTS, dependsOn: ["catering-book"] }],
  ["catering-veg", "Confirm vegetarian coverage on every menu", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL"],
  ["catering-jain", "Arrange Jain food for guests who need it", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["catering-vegan", "Arrange vegan options", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["catering-allergies", "Collect and brief the caterer on allergies", "THREE_MONTHS", 5, "CRITICAL"],
  ["catering-children", "Agree a children's menu", "THREE_MONTHS", 2, "LOW"],
  ["catering-vendor-meals", "Agree vendor and crew meals", "TWO_MONTHS", 3, "MEDIUM"],
  ["catering-family-meals", "Arrange family meals between functions", "TWO_MONTHS", 3, "MEDIUM"],
  ["catering-breakfast", "Arrange breakfast for resident guests", "TWO_MONTHS", 3, "MEDIUM"],
  ["catering-high-tea", "Plan high tea", "TWO_MONTHS", 2, "LOW"],
  ["catering-snacks", "Plan snacks and passed canapés", "TWO_MONTHS", 2, "LOW"],
  ["catering-late-night", "Arrange late-night food", "TWO_MONTHS", 2, "LOW"],
  ["catering-baraat", "Arrange baraat refreshments and water", "TWO_MONTHS", 3, "MEDIUM", { requiresTradition: "baraat" }],
  ["catering-live-counters", "Confirm live counters", "TWO_MONTHS", 3, "MEDIUM"],
  ["catering-dessert", "Finalise the dessert selection", "TWO_MONTHS", 2, "LOW"],
  ["catering-beverages", "Confirm the beverage plan", "TWO_MONTHS", 3, "MEDIUM"],
  ["catering-tea-coffee", "Arrange tea and coffee service", "ONE_MONTH", 2, "LOW"],
  ["catering-staff", "Confirm service staff numbers per function", "ONE_MONTH", 4, "HIGH"],
  ["catering-crockery", "Confirm crockery, cutlery and linen", "ONE_MONTH", 3, "MEDIUM"],
  ["catering-service-style", "Agree buffet vs plated service per function", "ONE_MONTH", 3, "MEDIUM"],
  ["catering-guarantee", "Give the caterer the final guaranteed headcount", "TWO_WEEKS", 5, "CRITICAL", { isMilestone: true }],
  ["catering-final-payment", "Settle the catering balance", "WEDDING_WEEK", 5, "CRITICAL"],
]);

// ────────────────────────────────────────────────────── Photography & video

const photography = area("Photography & Video", [
  ["photo-shortlist", "Shortlist photographers", "NINE_TO_TWELVE_MONTHS", 5, "CRITICAL"],
  ["photo-portfolios", "Review full wedding portfolios, not just highlights", "NINE_TO_TWELVE_MONTHS", 4, "HIGH", { dependsOn: ["photo-shortlist"] }],
  ["photo-compare", "Compare photography quotes side by side", "SIX_TO_NINE_MONTHS", 4, "HIGH", { dependsOn: ["photo-portfolios"] }],
  ["photo-book", "Contract the photographer", "SIX_TO_NINE_MONTHS", 5, "CRITICAL", { isMilestone: true, dependsOn: ["photo-compare"] }],
  ["photo-coverage", "Confirm coverage across every function", "SIX_TO_NINE_MONTHS", 5, "CRITICAL", { dependsOn: ["photo-book"] }],
  ["photo-second-shooter", "Confirm second shooter and team size", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["photo-cinematography", "Contract the cinematography team", "SIX_TO_NINE_MONTHS", 4, "HIGH"],
  ["photo-drone", "Check drone permissions at each venue", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["photo-deliverables", "Agree deliverables in writing", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["photo-turnaround", "Agree delivery turnaround times", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["photo-film", "Confirm the wedding film format and length", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["photo-teaser", "Confirm teaser and reel deliverables", "THREE_MONTHS", 2, "LOW"],
  ["photo-raw", "Agree whether raw footage is included", "THREE_MONTHS", 2, "LOW"],
  ["photo-albums", "Confirm album specification", "THREE_MONTHS", 2, "LOW"],
  ["photo-family-list", "Write the family photo list", "TWO_MONTHS", 4, "HIGH"],
  ["photo-couple-shots", "Write the couple shot list", "TWO_MONTHS", 3, "MEDIUM"],
  ["photo-getting-ready", "Confirm getting-ready coverage times", "ONE_MONTH", 3, "MEDIUM"],
  ["photo-details", "Brief on detail shots — outfits, jewellery, invites", "ONE_MONTH", 2, "LOW"],
  ["photo-ceremony", "Brief the ceremony shot requirements with the pandit", "ONE_MONTH", 4, "HIGH"],
  ["photo-baraat", "Brief baraat coverage", "ONE_MONTH", 3, "MEDIUM", { requiresTradition: "baraat" }],
  ["photo-schedule", "Share the final run of show with the photo team", "TWO_WEEKS", 5, "CRITICAL"],
  ["photo-briefing", "Final briefing call with the photography team", "WEDDING_WEEK", 4, "HIGH", { dependsOn: ["photo-schedule"] }],
  ["photo-meals", "Confirm vendor meals for the photo team", "WEDDING_WEEK", 2, "LOW"],
  ["photo-selection", "Select photos for the album", "POST_WEDDING", 2, "LOW"],
]);

// ─────────────────────────────────────────────────────────────────── Decor

const decor = area("Decor", [
  ["decor-concept", "Agree the decor concept", "SIX_TO_NINE_MONTHS", 4, "HIGH", { eventKinds: ALL_MAIN_EVENTS }],
  ["decor-moodboard", "Build a mood board", "SIX_TO_NINE_MONTHS", 3, "MEDIUM", { eventKinds: ALL_MAIN_EVENTS }],
  ["decor-shortlist", "Shortlist decorators", "SIX_TO_NINE_MONTHS", 5, "CRITICAL"],
  ["decor-book", "Contract the decorator", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL", { isMilestone: true, dependsOn: ["decor-shortlist"] }],
  ["decor-stage", "Approve the stage design", "FOUR_TO_SIX_MONTHS", 4, "HIGH", { eventKinds: ["SANGEET", "SHAADI", "RECEPTION"] }],
  ["decor-mandap", "Approve the mandap design", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL", { eventKinds: ["SHAADI"] }],
  ["decor-entrance", "Design the entrance moment", "THREE_MONTHS", 3, "MEDIUM", { eventKinds: ALL_MAIN_EVENTS }],
  ["decor-floral", "Approve the floral plan", "THREE_MONTHS", 4, "HIGH"],
  ["decor-aisle", "Design the aisle", "THREE_MONTHS", 3, "MEDIUM", { eventKinds: ["SHAADI"] }],
  ["decor-signage", "Order signage and wayfinding", "TWO_MONTHS", 2, "LOW"],
  ["decor-backdrop", "Set up a photo backdrop", "TWO_MONTHS", 2, "LOW"],
  ["decor-lounge", "Arrange lounge furniture", "TWO_MONTHS", 2, "LOW"],
  ["decor-tables", "Finalise table decor and centrepieces", "TWO_MONTHS", 3, "MEDIUM"],
  ["decor-lighting", "Approve the lighting plan", "TWO_MONTHS", 4, "HIGH"],
  ["decor-ceiling", "Confirm ceiling installations and rigging safety", "TWO_MONTHS", 3, "MEDIUM"],
  ["decor-dance-floor", "Confirm the dance floor", "TWO_MONTHS", 3, "MEDIUM", { eventKinds: ["SANGEET", "RECEPTION"] }],
  ["decor-bar", "Design the bar setup", "TWO_MONTHS", 2, "LOW"],
  ["decor-welcome-desk", "Set up the welcome desk", "ONE_MONTH", 3, "MEDIUM"],
  ["decor-seating", "Confirm bride, groom and family seating", "ONE_MONTH", 4, "HIGH"],
  ["decor-mockup", "Review the decor mockup", "ONE_MONTH", 4, "HIGH"],
  ["decor-schedule", "Agree the setup and teardown schedule", "TWO_WEEKS", 4, "HIGH"],
  ["decor-final-walkthrough", "Final decor walkthrough on site", "WEDDING_WEEK", 4, "HIGH"],
]);

// ─────────────────────────────────────────────────────────────────── Haldi

const haldi = area("Haldi", [
  ["haldi-venue", "Confirm the Haldi setup and space", "THREE_MONTHS", 4, "HIGH"],
  ["haldi-decor", "Plan the Haldi decor — marigolds and drapes", "THREE_MONTHS", 3, "MEDIUM"],
  ["haldi-outfits", "Confirm Haldi outfits for the couple and family", "THREE_MONTHS", 3, "MEDIUM"],
  ["haldi-turmeric", "Arrange the haldi paste and ceremonial items", "TWO_MONTHS", 4, "HIGH"],
  ["haldi-floral-jewellery", "Order floral jewellery for the bride", "TWO_MONTHS", 3, "MEDIUM"],
  ["haldi-seating", "Arrange low seating for the ceremony", "TWO_MONTHS", 2, "LOW"],
  ["haldi-floor", "Arrange floor protection and matting", "TWO_MONTHS", 3, "MEDIUM"],
  ["haldi-towels", "Stock towels, wipes and cleanup supplies", "ONE_MONTH", 2, "LOW"],
  ["haldi-backup-clothes", "Pack backup clothing for after the ceremony", "ONE_MONTH", 2, "LOW"],
  ["haldi-change-rooms", "Confirm change rooms and showers", "ONE_MONTH", 3, "MEDIUM"],
  ["haldi-music", "Prepare the Haldi playlist and dholak", "ONE_MONTH", 2, "LOW"],
  ["haldi-food", "Confirm the Haldi menu", "ONE_MONTH", 3, "MEDIUM"],
  ["haldi-photographer", "Brief the photographer on Haldi coverage", "TWO_WEEKS", 3, "MEDIUM"],
  ["haldi-transport", "Arrange transport to the Haldi venue", "TWO_WEEKS", 3, "MEDIUM"],
  ["haldi-cleanup", "Arrange post-Haldi cleanup crew", "TWO_WEEKS", 2, "LOW"],
]);

// ────────────────────────────────────────────────────────────────── Mehendi

const mehendi = area("Mehendi", [
  ["mehendi-artists-shortlist", "Shortlist mehendi artists", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["mehendi-artists-book", "Book the mehendi artists", "THREE_MONTHS", 5, "CRITICAL", { dependsOn: ["mehendi-artists-shortlist"] }],
  ["mehendi-artist-count", "Confirm how many artists are needed for the guest count", "THREE_MONTHS", 4, "HIGH"],
  ["mehendi-bride-timing", "Book the bride's mehendi session", "THREE_MONTHS", 5, "CRITICAL", { dependsOn: ["mehendi-artists-book"] }],
  ["mehendi-designs", "Agree design references with the artist", "TWO_MONTHS", 3, "MEDIUM"],
  ["mehendi-family-bookings", "Book family mehendi slots", "TWO_MONTHS", 3, "MEDIUM"],
  ["mehendi-guest-mehendi", "Arrange guest mehendi stations", "TWO_MONTHS", 3, "MEDIUM"],
  ["mehendi-decor", "Plan the Mehendi decor and seating", "TWO_MONTHS", 3, "MEDIUM"],
  ["mehendi-cushions", "Arrange cushions and low seating", "TWO_MONTHS", 2, "LOW"],
  ["mehendi-lighting", "Confirm lighting is bright enough for the artists", "ONE_MONTH", 3, "MEDIUM"],
  ["mehendi-outfits", "Confirm Mehendi outfits", "ONE_MONTH", 3, "MEDIUM"],
  ["mehendi-music", "Prepare the Mehendi playlist", "ONE_MONTH", 2, "LOW"],
  ["mehendi-food", "Confirm the Mehendi menu and finger food", "ONE_MONTH", 3, "MEDIUM"],
  ["mehendi-aftercare", "Prepare mehendi aftercare — oils and sugar mix", "TWO_WEEKS", 2, "LOW"],
  ["mehendi-artist-meals", "Arrange meals for the mehendi artists", "TWO_WEEKS", 2, "LOW"],
  ["mehendi-artist-transport", "Arrange transport for the artists", "TWO_WEEKS", 2, "LOW"],
  ["mehendi-photography", "Brief the photographer on Mehendi coverage", "TWO_WEEKS", 3, "MEDIUM"],
]);

// ────────────────────────────────────────────────────────────────── Sangeet

const sangeet = area("Sangeet", [
  ["sangeet-concept", "Agree the Sangeet format and running order", "SIX_TO_NINE_MONTHS", 4, "HIGH"],
  ["sangeet-choreographer", "Book a choreographer", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["sangeet-performer-list", "Confirm who is performing", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM", { dependsOn: ["sangeet-choreographer"] }],
  ["sangeet-song-selection", "Finalise the song list", "THREE_MONTHS", 4, "HIGH", { dependsOn: ["sangeet-performer-list"] }],
  ["sangeet-song-editing", "Get the performance tracks edited and mixed", "THREE_MONTHS", 3, "MEDIUM", { dependsOn: ["sangeet-song-selection"] }],
  ["sangeet-rehearsal-schedule", "Set the rehearsal schedule", "THREE_MONTHS", 4, "HIGH", { dependsOn: ["sangeet-performer-list"] }],
  ["sangeet-couple-performance", "Rehearse the couple's performance", "TWO_MONTHS", 3, "MEDIUM", { dependsOn: ["sangeet-rehearsal-schedule"] }],
  ["sangeet-parents-performance", "Rehearse the parents' performance", "TWO_MONTHS", 2, "LOW"],
  ["sangeet-siblings-performance", "Rehearse the siblings' performance", "TWO_MONTHS", 2, "LOW"],
  ["sangeet-performance-order", "Lock the performance order", "TWO_MONTHS", 4, "HIGH", { dependsOn: ["sangeet-song-editing"] }],
  ["sangeet-dj", "Book the DJ", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["sangeet-mc", "Book the MC and brief them", "THREE_MONTHS", 3, "MEDIUM"],
  ["sangeet-av", "Confirm the AV and sound specification", "TWO_MONTHS", 4, "HIGH"],
  ["sangeet-led", "Confirm the LED wall and content", "TWO_MONTHS", 3, "MEDIUM"],
  ["sangeet-lighting", "Confirm the Sangeet lighting design", "TWO_MONTHS", 3, "MEDIUM"],
  ["sangeet-stage", "Confirm stage size and entry points", "TWO_MONTHS", 4, "HIGH"],
  ["sangeet-costumes", "Arrange performance costumes", "TWO_MONTHS", 2, "LOW"],
  ["sangeet-props", "Arrange performance props", "ONE_MONTH", 2, "LOW"],
  ["sangeet-cue-sheet", "Write the technical cue sheet", "ONE_MONTH", 4, "HIGH", { dependsOn: ["sangeet-performance-order"] }],
  ["sangeet-backstage", "Plan backstage and green room flow", "ONE_MONTH", 3, "MEDIUM"],
  ["sangeet-speeches", "Confirm the speeches and their order", "ONE_MONTH", 3, "MEDIUM"],
  ["sangeet-entry", "Plan the couple's entry", "ONE_MONTH", 3, "MEDIUM"],
  ["sangeet-sound-check", "Run a full sound check", "WEDDING_WEEK", 4, "HIGH", { dependsOn: ["sangeet-av"] }],
  ["sangeet-tech-rehearsal", "Hold the technical rehearsal on site", "WEDDING_WEEK", 5, "CRITICAL", { dependsOn: ["sangeet-cue-sheet", "sangeet-sound-check"] }],
  ["sangeet-bar", "Confirm the Sangeet bar plan", "TWO_WEEKS", 2, "LOW"],
]);

// ─────────────────────────────────────────────────────────────────── Shaadi

const shaadi = area("Shaadi", [
  ["shaadi-pandit", "Book the pandit", "SIX_TO_NINE_MONTHS", 5, "CRITICAL"],
  ["shaadi-ceremony-requirements", "Get the full ceremony requirements list from the pandit", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL", { dependsOn: ["shaadi-pandit"] }],
  ["shaadi-muhurat-confirm", "Confirm the exact muhurat timing", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL", { dependsOn: ["shaadi-pandit"] }],
  ["shaadi-pooja-materials", "Source the pooja samagri", "TWO_MONTHS", 4, "HIGH", { dependsOn: ["shaadi-ceremony-requirements"] }],
  ["shaadi-havan", "Arrange the havan kund and firewood", "TWO_MONTHS", 4, "HIGH", { requiresTradition: "havan" }],
  ["shaadi-fire-permission", "Confirm the venue permits a sacred fire", "THREE_MONTHS", 5, "CRITICAL", { requiresTradition: "havan" }],
  ["shaadi-ventilation", "Confirm ventilation around the mandap", "TWO_MONTHS", 3, "MEDIUM", { requiresTradition: "havan" }],
  ["shaadi-varmala-stage", "Design the varmala stage", "TWO_MONTHS", 3, "MEDIUM", { requiresTradition: "varmala" }],
  ["shaadi-varmala-garlands", "Order the varmala garlands", "ONE_MONTH", 4, "HIGH", { requiresTradition: "varmala" }],
  ["shaadi-bride-entry", "Plan the bride's entry", "TWO_MONTHS", 4, "HIGH"],
  ["shaadi-groom-entry", "Plan the groom's entry", "TWO_MONTHS", 3, "MEDIUM"],
  ["shaadi-baraat-route", "Plan the baraat route and timing", "TWO_MONTHS", 4, "HIGH", { requiresTradition: "baraat" }],
  ["shaadi-baraat-assembly", "Confirm the baraat assembly point", "ONE_MONTH", 4, "HIGH", { requiresTradition: "baraat" }],
  ["shaadi-baraat-traffic", "Check traffic and police permissions for the baraat", "ONE_MONTH", 4, "HIGH", { requiresTradition: "baraat" }],
  ["shaadi-dhol", "Book the dhol players", "THREE_MONTHS", 3, "MEDIUM", { requiresTradition: "baraat" }],
  ["shaadi-band", "Book the baraat band", "THREE_MONTHS", 3, "MEDIUM", { requiresTradition: "baraat" }],
  ["shaadi-ghodi", "Arrange the ghodi and handler", "TWO_MONTHS", 3, "MEDIUM", { requiresTradition: "ghodi" }],
  ["shaadi-baraat-water", "Arrange water and refreshments along the baraat", "TWO_WEEKS", 3, "MEDIUM", { requiresTradition: "baraat" }],
  ["shaadi-sehra", "Order the groom's sehra", "TWO_MONTHS", 3, "MEDIUM", { requiresTradition: "sehra" }],
  ["shaadi-safas", "Order safas for the groom's side", "TWO_MONTHS", 3, "MEDIUM"],
  ["shaadi-milni", "Plan the milni and confirm who greets whom", "ONE_MONTH", 4, "HIGH", { requiresTradition: "milni" }],
  ["shaadi-milni-garlands", "Order milni garlands", "TWO_WEEKS", 3, "MEDIUM", { requiresTradition: "milni" }],
  ["shaadi-kanyadaan", "Confirm who performs the kanyadaan", "ONE_MONTH", 4, "HIGH", { requiresTradition: "kanyadaan" }],
  ["shaadi-pheras", "Confirm the pheras timing with the pandit", "ONE_MONTH", 5, "CRITICAL", { requiresTradition: "pheras" }],
  ["shaadi-sindoor", "Arrange the sindoor", "TWO_WEEKS", 3, "MEDIUM", { requiresTradition: "sindoor" }],
  ["shaadi-mangalsutra", "Confirm the mangalsutra is collected", "ONE_MONTH", 5, "CRITICAL", { requiresTradition: "mangalsutra" }],
  ["shaadi-chooda", "Arrange the chooda ceremony", "ONE_MONTH", 3, "MEDIUM", { requiresTradition: "chooda" }],
  ["shaadi-kalire", "Order the kalire", "ONE_MONTH", 2, "LOW", { requiresTradition: "kalire" }],
  ["shaadi-joota-chupai", "Brief the sisters on joota chupai", "TWO_WEEKS", 1, "LOW", { requiresTradition: "joota-chupai" }],
  ["shaadi-ceremony-seating", "Plan ceremony seating for elders and family", "ONE_MONTH", 4, "HIGH"],
  ["shaadi-family-rituals", "Confirm each family's specific rituals", "TWO_MONTHS", 4, "HIGH"],
  ["shaadi-family-responsibilities", "Assign ritual responsibilities to family members", "ONE_MONTH", 4, "HIGH"],
  ["shaadi-bridal-room", "Set up the bridal room with essentials", "WEDDING_WEEK", 3, "MEDIUM"],
  ["shaadi-groom-room", "Set up the groom's room", "WEDDING_WEEK", 2, "LOW"],
  ["shaadi-pandit-meals", "Arrange the pandit's meals and dakshina", "WEDDING_WEEK", 3, "MEDIUM"],
  ["shaadi-vidaai", "Plan the vidaai", "TWO_WEEKS", 4, "HIGH", { requiresTradition: "vidaai" }],
  ["shaadi-vidaai-vehicle", "Arrange and decorate the vidaai vehicle", "TWO_WEEKS", 4, "HIGH", { requiresTradition: "vidaai" }],
  ["shaadi-griha-pravesh", "Plan the griha pravesh", "TWO_WEEKS", 3, "MEDIUM", { requiresTradition: "griha-pravesh" }],
  ["shaadi-emergency-supplies", "Pack the ceremony emergency kit", "WEDDING_WEEK", 3, "MEDIUM"],
  ["shaadi-runsheet", "Publish the final Shaadi run of show", "WEDDING_WEEK", 5, "CRITICAL"],
]);

// ────────────────────────────────────────────────────────────────── Reception

const reception = area("Reception", [
  ["reception-format", "Agree the Reception format", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["reception-entry", "Plan the couple's entry", "TWO_MONTHS", 3, "MEDIUM"],
  ["reception-stage", "Confirm the stage and couple seating", "TWO_MONTHS", 3, "MEDIUM"],
  ["reception-speeches", "Confirm speeches and their order", "TWO_MONTHS", 3, "MEDIUM"],
  ["reception-entertainment", "Book Reception entertainment", "THREE_MONTHS", 3, "MEDIUM"],
  ["reception-dj", "Confirm the Reception DJ and playlist", "TWO_MONTHS", 3, "MEDIUM"],
  ["reception-lighting", "Confirm Reception lighting", "TWO_MONTHS", 3, "MEDIUM"],
  ["reception-decor", "Approve Reception decor", "TWO_MONTHS", 3, "MEDIUM"],
  ["reception-dinner", "Confirm the Reception dinner service", "ONE_MONTH", 4, "HIGH"],
  ["reception-bar", "Confirm the Reception bar", "ONE_MONTH", 2, "LOW"],
  ["reception-cake", "Arrange the cake", "ONE_MONTH", 1, "LOW"],
  ["reception-photo-moments", "Plan the key photo moments", "ONE_MONTH", 2, "LOW"],
  ["reception-family-intro", "Plan the family introductions", "TWO_WEEKS", 2, "LOW"],
  ["reception-guest-flow", "Plan the receiving line and guest flow", "TWO_WEEKS", 3, "MEDIUM"],
  ["reception-departure", "Plan the couple's final departure", "TWO_WEEKS", 2, "LOW"],
]);

// ───────────────────────────────────────────────────────────── Entertainment

const entertainment = area("Entertainment", [
  ["ent-dj-book", "Book the DJ across all functions", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["ent-live-band", "Book a live band or singers", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["ent-dhol-book", "Book dhol players", "THREE_MONTHS", 3, "MEDIUM"],
  ["ent-musicians", "Book live musicians for the ceremony", "THREE_MONTHS", 3, "MEDIUM"],
  ["ent-dancers", "Book professional dancers", "THREE_MONTHS", 2, "LOW"],
  ["ent-mc-brief", "Brief the MC on names and pronunciations", "ONE_MONTH", 3, "MEDIUM"],
  ["ent-rider", "Collect the technical rider from every act", "TWO_MONTHS", 3, "MEDIUM"],
  ["ent-microphones", "Confirm microphone count and types", "ONE_MONTH", 3, "MEDIUM"],
  ["ent-sound", "Confirm the sound system per venue", "ONE_MONTH", 4, "HIGH"],
  ["ent-playlists", "Build the playlists for each function", "ONE_MONTH", 2, "LOW"],
  ["ent-do-not-play", "Give the DJ the do-not-play list", "TWO_WEEKS", 2, "LOW"],
  ["ent-sound-limits", "Confirm decibel limits at each venue", "TWO_WEEKS", 3, "MEDIUM"],
]);

// ────────────────────────────────────────────────── Invitations & stationery

const invitations = area("Invitations & Stationery", [
  ["invite-guest-list", "Build the full guest list with both families", "NINE_TO_TWELVE_MONTHS", 5, "CRITICAL", { isMilestone: true }],
  ["invite-save-date", "Send save-the-dates", "SIX_TO_NINE_MONTHS", 4, "HIGH", { dependsOn: ["invite-guest-list"] }],
  ["invite-design", "Approve the invitation design", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["invite-wording", "Finalise the invitation wording", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["invite-family-names", "Check every family name and spelling", "FOUR_TO_SIX_MONTHS", 4, "HIGH", { dependsOn: ["invite-wording"] }],
  ["invite-quantities", "Confirm print quantities", "THREE_MONTHS", 4, "HIGH", { dependsOn: ["invite-guest-list"] }],
  ["invite-print", "Print the invitations", "THREE_MONTHS", 5, "CRITICAL", { dependsOn: ["invite-design", "invite-family-names", "invite-quantities"] }],
  ["invite-digital", "Prepare the digital invitation", "THREE_MONTHS", 3, "MEDIUM"],
  ["invite-rsvp-setup", "Set up RSVP collection", "THREE_MONTHS", 4, "HIGH"],
  ["invite-addressing", "Address the envelopes", "TWO_MONTHS", 3, "MEDIUM", { dependsOn: ["invite-print"] }],
  ["invite-distribute", "Distribute the invitations", "TWO_MONTHS", 5, "CRITICAL", { isMilestone: true, dependsOn: ["invite-addressing"] }],
  ["invite-vip-hand-deliver", "Hand-deliver VIP invitations", "TWO_MONTHS", 3, "MEDIUM", { dependsOn: ["invite-print"] }],
  ["invite-rsvp-chase", "Chase outstanding RSVPs", "ONE_MONTH", 4, "HIGH", { dependsOn: ["invite-distribute"] }],
  ["invite-rsvp-close", "Close RSVPs and lock the list", "TWO_WEEKS", 5, "CRITICAL", { isMilestone: true, dependsOn: ["invite-rsvp-chase"] }],
  ["invite-programs", "Print the ceremony programmes", "ONE_MONTH", 2, "LOW"],
  ["invite-welcome-cards", "Prepare welcome cards for hotel rooms", "ONE_MONTH", 2, "LOW"],
  ["invite-itineraries", "Print room itinerary cards", "TWO_WEEKS", 2, "LOW"],
  ["invite-menu-cards", "Print menu cards", "TWO_WEEKS", 1, "LOW"],
  ["invite-signage", "Order event signage", "TWO_WEEKS", 2, "LOW"],
  ["invite-transport-info", "Print transport information cards", "TWO_WEEKS", 2, "LOW"],
]);

// ──────────────────────────────────────────────────────────── Bride wardrobe

const brideWardrobe = area("Bride Wardrobe", [
  ["bride-budget", "Set the bridal wardrobe budget", "NINE_TO_TWELVE_MONTHS", 3, "MEDIUM"],
  ["bride-designer", "Shortlist designers and stores", "NINE_TO_TWELVE_MONTHS", 4, "HIGH"],
  ["bride-shaadi-outfit", "Choose the Shaadi lehenga", "SIX_TO_NINE_MONTHS", 5, "CRITICAL", { dependsOn: ["bride-designer"] }],
  ["bride-shaadi-order", "Order the Shaadi lehenga and pay the deposit", "SIX_TO_NINE_MONTHS", 5, "CRITICAL", { dependsOn: ["bride-shaadi-outfit"] }],
  ["bride-outfit", "Choose the bride's outfit", "FOUR_TO_SIX_MONTHS", 4, "HIGH", { eventKinds: ["HALDI", "MEHENDI", "SANGEET", "RECEPTION"] }],
  ["bride-fitting-first", "First fitting", "THREE_MONTHS", 4, "HIGH", { dependsOn: ["bride-shaadi-order"] }],
  ["bride-fitting-second", "Second fitting", "TWO_MONTHS", 4, "HIGH", { dependsOn: ["bride-fitting-first"] }],
  ["bride-fitting-final", "Final fitting", "ONE_MONTH", 5, "CRITICAL", { dependsOn: ["bride-fitting-second"] }],
  ["bride-blouse", "Finalise blouse fittings", "TWO_MONTHS", 3, "MEDIUM"],
  ["bride-dupatta", "Confirm dupatta styling and pinning", "ONE_MONTH", 3, "MEDIUM"],
  ["bride-shoes", "Buy and break in the bridal shoes", "TWO_MONTHS", 3, "MEDIUM"],
  ["bride-bag", "Choose the bridal potli or clutch", "ONE_MONTH", 1, "LOW"],
  ["bride-hair-accessory", "Choose the maang tikka and hair accessories", "TWO_MONTHS", 3, "MEDIUM"],
  ["bride-bangles", "Buy the bangles and chooda", "TWO_MONTHS", 3, "MEDIUM"],
  ["bride-makeup-reference", "Collect makeup reference images", "TWO_MONTHS", 2, "LOW"],
  ["bride-hair-reference", "Collect hair reference images", "TWO_MONTHS", 2, "LOW"],
  ["bride-backup-items", "Pack backup blouse, safety pins and tape", "TWO_WEEKS", 3, "MEDIUM"],
  ["bride-steaming", "Get every outfit steamed and pressed", "WEDDING_WEEK", 3, "MEDIUM"],
  ["bride-storage", "Arrange safe garment storage at the venue", "WEDDING_WEEK", 3, "MEDIUM"],
  ["bride-transport", "Arrange garment transport between venues", "WEDDING_WEEK", 3, "MEDIUM"],
]);

// ──────────────────────────────────────────────────────────── Groom wardrobe

const groomWardrobe = area("Groom Wardrobe", [
  ["groom-shortlist", "Shortlist stores and tailors", "SIX_TO_NINE_MONTHS", 3, "MEDIUM"],
  ["groom-shaadi-outfit", "Choose the Shaadi sherwani", "SIX_TO_NINE_MONTHS", 5, "CRITICAL", { dependsOn: ["groom-shortlist"] }],
  ["groom-shaadi-order", "Order the sherwani", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL", { dependsOn: ["groom-shaadi-outfit"] }],
  ["groom-outfit", "Choose the groom's outfit", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM", { eventKinds: ["HALDI", "MEHENDI", "SANGEET", "RECEPTION"] }],
  ["groom-fitting-first", "First tailoring fitting", "THREE_MONTHS", 4, "HIGH", { dependsOn: ["groom-shaadi-order"] }],
  ["groom-fitting-final", "Final tailoring fitting", "ONE_MONTH", 4, "HIGH", { dependsOn: ["groom-fitting-first"] }],
  ["groom-shoes", "Buy the mojris and formal shoes", "TWO_MONTHS", 3, "MEDIUM"],
  ["groom-watch", "Choose the watch", "TWO_MONTHS", 1, "LOW"],
  ["groom-accessories", "Buy the brooch, stole and pocket square", "TWO_MONTHS", 2, "LOW"],
  ["groom-safa", "Arrange the safa and get a tying trial", "ONE_MONTH", 3, "MEDIUM"],
  ["groom-kalgi", "Buy the kalgi and kamarbandh", "ONE_MONTH", 2, "LOW"],
  ["groom-backup", "Pack a backup kurta and emergency kit", "TWO_WEEKS", 2, "LOW"],
  ["groom-steaming", "Get every outfit steamed", "WEDDING_WEEK", 2, "LOW"],
]);

// ─────────────────────────────────────────────────────────── Family wardrobe

const familyWardrobe = area("Family Wardrobe", [
  ["family-parents-outfits", "Plan outfits for both sets of parents", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["family-siblings-outfits", "Plan outfits for the siblings", "FOUR_TO_SIX_MONTHS", 3, "MEDIUM"],
  ["family-grandparents-outfits", "Plan outfits for the grandparents", "THREE_MONTHS", 2, "LOW"],
  ["family-colour-coordination", "Coordinate colours so nothing clashes on camera", "THREE_MONTHS", 2, "LOW"],
  ["family-fittings", "Book family fittings", "TWO_MONTHS", 3, "MEDIUM"],
  ["family-outfit-check", "Confirm every family outfit is ready", "TWO_WEEKS", 3, "MEDIUM", { dependsOn: ["family-fittings"] }],
]);

// ──────────────────────────────────────────────────────────── Hair & makeup

const hairMakeup = area("Hair & Makeup", [
  ["hmua-shortlist", "Shortlist makeup artists", "SIX_TO_NINE_MONTHS", 4, "HIGH"],
  ["hmua-book", "Book the makeup artist", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL", { dependsOn: ["hmua-shortlist"] }],
  ["hmua-trial", "Do the bridal makeup trial", "THREE_MONTHS", 4, "HIGH", { dependsOn: ["hmua-book"] }],
  ["hmua-hair-trial", "Do the hairstyle trial", "THREE_MONTHS", 4, "HIGH", { dependsOn: ["hmua-book"] }],
  ["hmua-final-look", "Approve the final look for each function", "TWO_MONTHS", 4, "HIGH", { dependsOn: ["hmua-trial", "hmua-hair-trial"] }],
  ["hmua-bride-schedule", "Set the bride's makeup call times", "ONE_MONTH", 5, "CRITICAL", { dependsOn: ["hmua-final-look"] }],
  ["hmua-mother-schedule", "Book slots for both mothers", "ONE_MONTH", 3, "MEDIUM"],
  ["hmua-sibling-schedule", "Book slots for the siblings", "ONE_MONTH", 2, "LOW"],
  ["hmua-assistants", "Confirm assistant artists for family", "ONE_MONTH", 3, "MEDIUM"],
  ["hmua-room-setup", "Confirm the getting-ready room and lighting", "TWO_WEEKS", 3, "MEDIUM"],
  ["hmua-draping", "Confirm who is draping the saree and lehenga", "TWO_WEEKS", 3, "MEDIUM"],
  ["hmua-touchups", "Arrange touch-up presence through the day", "TWO_WEEKS", 3, "MEDIUM"],
  ["hmua-travel", "Arrange the artist's travel and stay", "TWO_WEEKS", 3, "MEDIUM"],
]);

// ─────────────────────────────────────────────────────────────── Jewellery

const jewellery = area("Jewellery", [
  ["jewel-plan", "Plan jewellery for each function", "SIX_TO_NINE_MONTHS", 3, "MEDIUM"],
  ["jewel-family-heirlooms", "Confirm which family heirlooms are being used", "FOUR_TO_SIX_MONTHS", 4, "HIGH"],
  ["jewel-purchase", "Buy the bridal jewellery", "FOUR_TO_SIX_MONTHS", 4, "HIGH", { dependsOn: ["jewel-plan"] }],
  ["jewel-rental", "Arrange rented jewellery", "THREE_MONTHS", 3, "MEDIUM"],
  ["jewel-mangalsutra-buy", "Buy the mangalsutra", "THREE_MONTHS", 5, "CRITICAL", { requiresTradition: "mangalsutra" }],
  ["jewel-insurance", "Insure the high-value pieces", "TWO_MONTHS", 3, "MEDIUM", { dependsOn: ["jewel-purchase"] }],
  ["jewel-pickup", "Collect all jewellery from the jeweller", "TWO_WEEKS", 4, "HIGH", { dependsOn: ["jewel-purchase"] }],
  ["jewel-custody", "Name one person responsible for jewellery each day", "TWO_WEEKS", 4, "HIGH"],
  ["jewel-storage", "Arrange a safe or locker at the venue", "WEDDING_WEEK", 4, "HIGH"],
  ["jewel-checklist", "Make a per-function jewellery checklist", "WEDDING_WEEK", 3, "MEDIUM"],
  ["jewel-return", "Return all rented and borrowed jewellery", "POST_WEDDING", 4, "HIGH"],
]);

// ────────────────────────────────────────────────────────── Accommodation

const accommodation = area("Accommodation", [
  ["hotel-estimate", "Estimate how many guests need rooms", "SIX_TO_NINE_MONTHS", 4, "HIGH"],
  ["hotel-shortlist", "Shortlist hotels near the venues", "SIX_TO_NINE_MONTHS", 4, "HIGH", { dependsOn: ["hotel-estimate"] }],
  ["hotel-negotiate", "Negotiate the room block rate", "FOUR_TO_SIX_MONTHS", 4, "HIGH", { dependsOn: ["hotel-shortlist"] }],
  ["hotel-block", "Confirm the hotel room block", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL", { isMilestone: true, dependsOn: ["hotel-negotiate"] }],
  ["hotel-contract", "Sign the hotel contract", "FOUR_TO_SIX_MONTHS", 5, "CRITICAL", { dependsOn: ["hotel-block"] }],
  ["hotel-room-types", "Confirm room types and inventory", "THREE_MONTHS", 3, "MEDIUM"],
  ["hotel-bridal-suite", "Book the bridal suite", "THREE_MONTHS", 4, "HIGH"],
  ["hotel-groom-suite", "Book the groom's suite", "THREE_MONTHS", 3, "MEDIUM"],
  ["hotel-vip-rooms", "Allocate VIP rooms", "TWO_MONTHS", 3, "MEDIUM"],
  ["hotel-elderly", "Allocate accessible rooms for elderly guests", "TWO_MONTHS", 4, "HIGH"],
  ["hotel-family-allocation", "Allocate family rooms", "TWO_MONTHS", 3, "MEDIUM"],
  ["hotel-children", "Arrange extra beds and cots", "TWO_MONTHS", 2, "LOW"],
  ["hotel-early-checkin", "Arrange early check-ins", "ONE_MONTH", 3, "MEDIUM"],
  ["hotel-late-arrivals", "Brief the hotel on late arrivals", "ONE_MONTH", 3, "MEDIUM"],
  ["hotel-rooming-list", "Send the final rooming list", "TWO_WEEKS", 5, "CRITICAL", { dependsOn: ["hotel-family-allocation"] }],
  ["hotel-guarantee", "Confirm the final room guarantee", "TWO_WEEKS", 4, "HIGH", { dependsOn: ["hotel-rooming-list"] }],
  ["hotel-hampers", "Arrange room hampers", "TWO_WEEKS", 2, "LOW"],
  ["hotel-desk", "Set up the hospitality desk", "WEDDING_WEEK", 4, "HIGH"],
  ["hotel-settlement", "Settle the hotel bill", "POST_WEDDING", 4, "HIGH"],
]);

// ───────────────────────────────────────────────────────────────── Travel

const travel = area("Travel", [
  ["travel-collect", "Collect travel details from every out-of-town guest", "THREE_MONTHS", 4, "HIGH"],
  ["travel-arrivals", "Build the arrivals sheet", "TWO_MONTHS", 4, "HIGH", { dependsOn: ["travel-collect"] }],
  ["travel-departures", "Build the departures sheet", "TWO_MONTHS", 3, "MEDIUM", { dependsOn: ["travel-collect"] }],
  ["travel-vip", "Confirm VIP and elderly guest travel", "TWO_MONTHS", 4, "HIGH"],
  ["travel-international", "Check visas for international guests", "THREE_MONTHS", 3, "MEDIUM"],
  ["travel-emergency-contacts", "Collect an emergency contact for every travelling guest", "ONE_MONTH", 3, "MEDIUM"],
  ["travel-confirm", "Reconfirm all flights and trains", "WEDDING_WEEK", 3, "MEDIUM", { dependsOn: ["travel-arrivals"] }],
]);

// ──────────────────────────────────────────────────────────────── Transport

const transport = area("Transport", [
  ["transport-plan", "Plan transport across every function", "THREE_MONTHS", 4, "HIGH"],
  ["transport-vendor", "Book the transport vendor", "THREE_MONTHS", 4, "HIGH", { dependsOn: ["transport-plan"] }],
  ["transport-airport", "Schedule airport pickups", "TWO_MONTHS", 4, "HIGH", { dependsOn: ["transport-vendor"] }],
  ["transport-station", "Schedule railway station pickups", "TWO_MONTHS", 3, "MEDIUM"],
  ["transport-shuttles", "Schedule shuttles between hotel and venues", "TWO_MONTHS", 4, "HIGH"],
  ["transport-capacity", "Check vehicle capacity against guest numbers", "TWO_MONTHS", 4, "HIGH", { dependsOn: ["transport-shuttles"] }],
  ["transport-family-cars", "Arrange family cars", "ONE_MONTH", 3, "MEDIUM"],
  ["transport-bride-car", "Arrange and decorate the bride's car", "ONE_MONTH", 4, "HIGH"],
  ["transport-groom-car", "Arrange the groom's car", "ONE_MONTH", 3, "MEDIUM"],
  ["transport-baraat", "Arrange baraat transport", "ONE_MONTH", 4, "HIGH", { requiresTradition: "baraat" }],
  ["transport-vendor-transport", "Arrange vendor transport and load-in", "ONE_MONTH", 3, "MEDIUM"],
  ["transport-drivers", "Build the driver roster with phone numbers", "TWO_WEEKS", 4, "HIGH", { dependsOn: ["transport-vendor"] }],
  ["transport-parking", "Confirm parking and valet", "TWO_WEEKS", 3, "MEDIUM"],
  ["transport-backup", "Arrange backup vehicles", "TWO_WEEKS", 3, "MEDIUM"],
  ["transport-departure-schedule", "Publish the departure schedule", "WEDDING_WEEK", 4, "HIGH", { dependsOn: ["transport-drivers"] }],
  ["transport-settlement", "Settle the transport bill", "POST_WEDDING", 3, "MEDIUM"],
]);

// ───────────────────────────────────────────────────────────── Hospitality

const hospitality = area("Hospitality", [
  ["hosp-desk", "Plan the welcome desk and staffing", "TWO_MONTHS", 3, "MEDIUM"],
  ["hosp-team", "Assign the hospitality team", "TWO_MONTHS", 4, "HIGH"],
  ["hosp-contacts", "Publish a contact sheet for every family group", "ONE_MONTH", 4, "HIGH"],
  ["hosp-hampers", "Order welcome hampers", "ONE_MONTH", 2, "LOW"],
  ["hosp-water", "Arrange water at every venue and vehicle", "TWO_WEEKS", 3, "MEDIUM"],
  ["hosp-room-delivery", "Arrange in-room delivery of itineraries", "TWO_WEEKS", 2, "LOW"],
  ["hosp-emergency-kits", "Prepare guest emergency kits", "TWO_WEEKS", 2, "LOW"],
  ["hosp-vip", "Assign VIP handlers", "TWO_WEEKS", 3, "MEDIUM"],
  ["hosp-elderly", "Assign helpers for elderly guests", "TWO_WEEKS", 4, "HIGH"],
  ["hosp-children", "Arrange childcare or a kids' corner", "TWO_WEEKS", 2, "LOW"],
  ["hosp-briefing", "Brief the hospitality team", "WEDDING_WEEK", 4, "HIGH", { dependsOn: ["hosp-team", "hosp-contacts"] }],
]);

// ──────────────────────────────────────────────────────────────────── Gifts

const gifts = area("Gifts", [
  ["gifts-favours", "Choose the wedding favours", "THREE_MONTHS", 2, "LOW"],
  ["gifts-favours-order", "Order the favours", "TWO_MONTHS", 2, "LOW", { dependsOn: ["gifts-favours"] }],
  ["gifts-hampers", "Order guest hampers", "TWO_MONTHS", 2, "LOW"],
  ["gifts-family", "Buy gifts for the immediate family", "TWO_MONTHS", 3, "MEDIUM"],
  ["gifts-milni", "Buy milni gifts", "ONE_MONTH", 3, "MEDIUM", { requiresTradition: "milni" }],
  ["gifts-party", "Buy gifts for the bridal party", "ONE_MONTH", 2, "LOW"],
  ["gifts-vendors", "Prepare vendor tips and thank-yous", "TWO_WEEKS", 2, "LOW"],
  ["gifts-inventory", "Build the gift inventory and quantities", "TWO_WEEKS", 2, "LOW", { dependsOn: ["gifts-favours-order"] }],
  ["gifts-wrapping", "Wrap and label the gifts", "WEDDING_WEEK", 2, "LOW", { dependsOn: ["gifts-inventory"] }],
  ["gifts-distribution", "Plan gift distribution to rooms", "WEDDING_WEEK", 2, "LOW"],
  ["gifts-log", "Log the gifts received", "POST_WEDDING", 2, "LOW"],
]);

// ────────────────────────────────────────────────────────── Legal & admin

const legal = area("Legal & Admin", [
  ["legal-research", "Check the marriage registration requirements", "SIX_TO_NINE_MONTHS", 4, "HIGH"],
  ["legal-documents", "Collect the required documents and IDs", "THREE_MONTHS", 4, "HIGH", { dependsOn: ["legal-research"] }],
  ["legal-witnesses", "Confirm the witnesses", "TWO_MONTHS", 3, "MEDIUM"],
  ["legal-appointment", "Book the registration appointment", "TWO_MONTHS", 4, "HIGH", { dependsOn: ["legal-documents"] }],
  ["legal-photos", "Get the passport photographs taken", "ONE_MONTH", 2, "LOW"],
  ["legal-register", "Complete the marriage registration", "POST_WEDDING", 5, "CRITICAL", { dependsOn: ["legal-appointment"] }],
  ["legal-certificate", "Collect the marriage certificate", "POST_WEDDING", 4, "HIGH", { dependsOn: ["legal-register"] }],
  ["legal-name-change", "Handle any name-change paperwork", "POST_WEDDING", 2, "LOW", { dependsOn: ["legal-certificate"] }],
]);

// ─────────────────────────────────────────────────────── Emergency planning

const emergency = area("Emergency Planning", [
  ["emg-rain-plan", "Write the rain plan for every outdoor function", "TWO_MONTHS", 5, "CRITICAL"],
  ["emg-vendor-contacts", "Compile an emergency contact sheet for all vendors", "ONE_MONTH", 4, "HIGH"],
  ["emg-medical", "Pack a medical kit and note the nearest hospital", "ONE_MONTH", 4, "HIGH"],
  ["emg-sewing-kit", "Pack a sewing kit and safety pins", "TWO_WEEKS", 2, "LOW"],
  ["emg-stain-remover", "Pack stain remover and wet wipes", "TWO_WEEKS", 2, "LOW"],
  ["emg-painkillers", "Pack painkillers and basic medication", "TWO_WEEKS", 3, "MEDIUM"],
  ["emg-chargers", "Pack power banks and chargers", "TWO_WEEKS", 2, "LOW"],
  ["emg-footwear", "Pack backup footwear for the couple", "TWO_WEEKS", 2, "LOW"],
  ["emg-umbrellas", "Arrange umbrellas", "TWO_WEEKS", 2, "LOW"],
  ["emg-generator", "Confirm the backup generator is on standby", "WEDDING_WEEK", 4, "HIGH"],
  ["emg-transport", "Keep an emergency vehicle on standby", "WEDDING_WEEK", 3, "MEDIUM"],
  ["emg-cash", "Keep emergency cash for on-the-day payments", "WEDDING_WEEK", 3, "MEDIUM"],
  ["emg-documents", "Keep duplicate copies of key documents", "WEDDING_WEEK", 3, "MEDIUM"],
  ["emg-point-person", "Name one emergency point person per day", "WEDDING_WEEK", 4, "HIGH"],
]);

// ────────────────────────────────────────────────────────── Wedding week

const weddingWeek = area("Wedding Week", [
  ["week-vendor-confirm", "Reconfirm every vendor's arrival time", "WEDDING_WEEK", 5, "CRITICAL"],
  ["week-runsheet", "Publish the full run of show to the family", "WEDDING_WEEK", 5, "CRITICAL"],
  ["week-payments", "Prepare all on-the-day payments and envelopes", "WEDDING_WEEK", 4, "HIGH"],
  ["week-family-briefing", "Hold the family briefing meeting", "WEDDING_WEEK", 4, "HIGH", { dependsOn: ["week-runsheet"] }],
  ["week-pack", "Pack for every function, labelled by day", "WEDDING_WEEK", 3, "MEDIUM"],
  ["week-rest", "Block out rest time for the couple", "WEDDING_WEEK", 3, "MEDIUM"],
]);

// ──────────────────────────────────────────────────────────── After wedding

const afterWedding = area("After the Wedding", [
  ["post-vendor-balances", "Settle every outstanding vendor balance", "POST_WEDDING", 5, "CRITICAL"],
  ["post-rental-returns", "Return all rented items", "POST_WEDDING", 4, "HIGH"],
  ["post-outfit-returns", "Return or store the outfits", "POST_WEDDING", 3, "MEDIUM"],
  ["post-outfit-cleaning", "Get the outfits dry cleaned and preserved", "POST_WEDDING", 3, "MEDIUM"],
  ["post-thank-you", "Send thank-you messages", "POST_WEDDING", 3, "MEDIUM"],
  ["post-vendor-reviews", "Leave reviews for the vendors who did well", "POST_WEDDING", 1, "LOW"],
  ["post-photo-selection", "Select the photos for the album", "POST_WEDDING", 2, "LOW"],
  ["post-film-review", "Review the wedding film", "POST_WEDDING", 2, "LOW"],
  ["post-album", "Approve the album layout", "POST_WEDDING", 2, "LOW", { dependsOn: ["post-photo-selection"] }],
  ["post-archive", "Archive every contract and document", "POST_WEDDING", 2, "LOW"],
  ["post-reconciliation", "Do the final budget reconciliation", "POST_WEDDING", 4, "HIGH", { dependsOn: ["post-vendor-balances"] }],
]);

export const TASK_LIBRARY: TaskTemplateDefinition[] = [
  ...foundation,
  ...venue,
  ...catering,
  ...photography,
  ...decor,
  ...haldi,
  ...mehendi,
  ...sangeet,
  ...shaadi,
  ...reception,
  ...entertainment,
  ...invitations,
  ...brideWardrobe,
  ...groomWardrobe,
  ...familyWardrobe,
  ...hairMakeup,
  ...jewellery,
  ...accommodation,
  ...travel,
  ...transport,
  ...hospitality,
  ...gifts,
  ...legal,
  ...emergency,
  ...weddingWeek,
  ...afterWedding,
];

export const TASK_AREAS = [...new Set(TASK_LIBRARY.map((t) => t.area))];

export const PHASE_LABEL: Record<PlanPhase, string> = {
  TWELVE_PLUS_MONTHS: "12+ months out",
  NINE_TO_TWELVE_MONTHS: "9–12 months out",
  SIX_TO_NINE_MONTHS: "6–9 months out",
  FOUR_TO_SIX_MONTHS: "4–6 months out",
  THREE_MONTHS: "3 months out",
  TWO_MONTHS: "2 months out",
  ONE_MONTH: "1 month out",
  TWO_WEEKS: "2 weeks out",
  WEDDING_WEEK: "Wedding week",
  WEDDING_DAY: "Wedding day",
  POST_WEDDING: "After the wedding",
};

/**
 * Which templates apply to this wedding, expanded per event where relevant.
 *
 * Templates scoped to event kinds only fire for events that actually exist,
 * and ritual-specific templates only fire for rituals the family observes.
 */
export function resolveTemplates(
  events: { id: string; name: string; kind: EventKind }[],
  traditions: string[],
): {
  template: TaskTemplateDefinition;
  eventId: string | null;
  eventName: string | null;
  title: string;
  instanceKey: string;
}[] {
  const enabled = new Set(traditions);
  const output: ReturnType<typeof resolveTemplates> = [];

  for (const template of TASK_LIBRARY) {
    if (template.requiresTradition && !enabled.has(template.requiresTradition)) continue;

    if (template.eventKinds?.length) {
      const matches = events.filter((e) => template.eventKinds!.includes(e.kind));
      for (const event of matches) {
        output.push({
          template,
          eventId: event.id,
          eventName: event.name,
          title: `${template.title} — ${event.name}`,
          instanceKey: `${template.key}:${event.id}`,
        });
      }
    } else {
      output.push({
        template,
        eventId: null,
        eventName: null,
        title: template.title,
        instanceKey: template.key,
      });
    }
  }

  return output;
}
