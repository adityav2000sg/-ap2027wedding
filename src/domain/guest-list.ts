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
