/**
 * How the guest list is ordered.
 *
 * Pulled out of the workspace component so it can be tested against the shapes
 * that actually occur — a wave of replies where some are dated to the person,
 * some to the household, and some not dated at all — rather than only against
 * whatever happens to be on screen.
 */

/** Everything the ordering looks at. The list row itself carries far more. */
export interface GuestListRow {
  firstName: string;
  lastName: string;
  householdName: string | null;
  saveTheDateSent: boolean;
  sentAt: number | null;
  repliedAt: number | null;
}

/**
 * What the list is ordered by.
 *
 * "household" is the list as a wedding list — families together, alphabetical —
 * and is what you want when you're working down it name by name. The other
 * three are what you want when you're watching replies come in, and they can't
 * keep the families together: a household whose four members answered across
 * three weeks has no one place to sit in a list ordered by when people replied.
 */
export type SortKey = "household" | "name" | "sent" | "replied";

export interface GuestSort {
  key: SortKey;
  dir: "asc" | "desc";
}

/**
 * Which way a column points the first time you click it.
 *
 * Names read forwards. Dates read backwards: the reason to sort by "replied" is
 * almost always to see this morning's answers, not the first one from a year
 * ago.
 */
export const SORT_DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  household: "asc",
  name: "asc",
  sent: "desc",
  replied: "desc",
};

export function nextSort(current: GuestSort, key: SortKey): GuestSort {
  return current.key === key
    ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
    : { key, dir: SORT_DEFAULT_DIR[key] };
}

/** Whether a row survives the save-the-date filter. */
export function matchesSentFilter(
  row: Pick<GuestListRow, "saveTheDateSent">,
  filter: "" | "sent" | "unsent",
): boolean {
  if (filter === "") return true;
  return filter === "sent" ? row.saveTheDateSent : !row.saveTheDateSent;
}

function byName(a: GuestListRow, b: GuestListRow): number {
  return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
}

/**
 * Order the list. Returns a new array; the input is left alone.
 *
 * A date we don't have is not an early date. Sorting a null as zero drops
 * everybody who hasn't replied into "earliest first", which is precisely the
 * list you were trying to see — the people still to answer would bury the
 * earliest answers. So the undated sink to the bottom whichever way the column
 * points, and sort by name among themselves so the tail is still readable.
 *
 * "household" is left in the incoming order: the grouping downstream orders by
 * household name, and doing it twice would be one of them lying.
 */
export function sortGuestRows<T extends GuestListRow>(rows: readonly T[], sort: GuestSort): T[] {
  const out = [...rows];
  const flip = sort.dir === "asc" ? 1 : -1;

  const byDate = (of: (row: T) => number | null) => (a: T, b: T) => {
    const left = of(a);
    const right = of(b);
    if (left === null && right === null) return byName(a, b);
    if (left === null) return 1;
    if (right === null) return -1;
    return left === right ? byName(a, b) : (left - right) * flip;
  };

  switch (sort.key) {
    case "name":
      out.sort((a, b) => byName(a, b) * flip);
      break;
    case "sent":
      out.sort(byDate((row) => row.sentAt));
      break;
    case "replied":
      out.sort(byDate((row) => row.repliedAt));
      break;
    default:
      break;
  }
  return out;
}

/**
 * The list as it's laid out: a heading and its rows.
 *
 * A wedding list is families, not individuals, so by default it groups by
 * household. Every other ordering is one flat run with a null heading — see
 * `SortKey`.
 */
export function groupGuestRows<T extends GuestListRow>(
  rows: readonly T[],
  sort: GuestSort,
): [string | null, T[]][] {
  if (sort.key !== "household") return [[null, [...rows]]];

  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.householdName ?? "No household";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return sort.dir === "desc" ? entries.reverse() : entries;
}

/** Everything the figures above the list are counted from. */
export interface GuestListCountable {
  householdId: string | null;
  stdResponse: "YES" | "NO" | null;
  saveTheDateSent: boolean;
  needsAccommodation: boolean;
  /** Per-event invitation statuses, keyed by event id. */
  rsvp: Record<string, string>;
}

export interface GuestListSummary {
  onTheList: number;
  households: number;
  sent: number;
  yes: number;
  no: number;
  awaiting: number;
  confirmed: number;
  pending: number;
  declined: number;
  notContacted: number;
  needARoom: number;
  rooms: number;
}

/**
 * The figures above the list, counted from the list itself.
 *
 * They used to come from the server, counted over the whole wave, so narrowing
 * to one side of the family moved every row on screen and not one number above
 * them — "231 on the list" over a list of 118. A heading that contradicts what
 * it is heading is worse than no heading.
 *
 * Counted here from whatever rows are passed in, which lets the caller decide
 * what "the list" means. It should mean the population — the side, the wave,
 * the search, whether the save-the-date has gone — and not the reply filter,
 * which picks *within* that population: filtering to "said yes" and then
 * reading "said yes 30, not yet 0, said no 0" tells you nothing you didn't
 * just ask for, and throws away the denominator that made 30 mean something.
 */
export function summariseGuestRows(
  rows: readonly GuestListCountable[],
  guestsPerRoom: number,
): GuestListSummary {
  let sent = 0;
  let yes = 0;
  let no = 0;
  let confirmed = 0;
  let pending = 0;
  let declined = 0;
  let notContacted = 0;
  let needARoom = 0;
  // Somebody with no household is their own party of one, or the count would
  // read as fewer invitations than there are.
  const households = new Set<string>();

  for (const row of rows) {
    households.add(row.householdId ?? `solo:${households.size}`);
    if (row.saveTheDateSent) sent += 1;
    if (row.stdResponse === "YES") yes += 1;
    if (row.stdResponse === "NO") no += 1;
    if (row.needsAccommodation) needARoom += 1;

    const statuses = Object.values(row.rsvp);
    if (statuses.includes("CONFIRMED")) confirmed += 1;
    if (statuses.some((s) => s === "PENDING")) pending += 1;
    if (statuses.length > 0 && statuses.includes("DECLINED")
      && statuses.every((s) => s === "DECLINED" || s === "NOT_INVITED")) {
      declined += 1;
    }
    if (statuses.every((s) => s === "NOT_INVITED")) notContacted += 1;
  }

  return {
    onTheList: rows.length,
    households: households.size,
    sent,
    yes,
    no,
    awaiting: rows.length - yes - no,
    confirmed,
    pending,
    declined,
    notContacted,
    needARoom,
    // Sharing a room is only possible within the group being counted, so this
    // is the rooms that slice needs — not its share of a wedding-wide total.
    rooms: Math.ceil(needARoom / Math.max(1, guestsPerRoom)),
  };
}
