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
 * Order by a date, with everything undated last.
 *
 * The one rule both lists need and neither can get from a plain comparator: a
 * date we don't have is not an early date. Sorting a null as zero drops
 * everybody who hasn't replied into "earliest first", which is precisely the
 * list you were trying to see. So the undated sink to the bottom whichever way
 * the column points, and fall back to the tiebreak among themselves so the tail
 * is still something you can read down.
 */
export function sortByDate<T>(
  rows: readonly T[],
  of: (row: T) => number | null,
  dir: "asc" | "desc",
  tiebreak: (a: T, b: T) => number,
): T[] {
  const flip = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = of(a);
    const right = of(b);
    if (left === null && right === null) return tiebreak(a, b);
    if (left === null) return 1;
    if (right === null) return -1;
    return left === right ? tiebreak(a, b) : (left - right) * flip;
  });
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
  const flip = sort.dir === "asc" ? 1 : -1;
  switch (sort.key) {
    case "name":
      return [...rows].sort((a, b) => byName(a, b) * flip);
    case "sent":
      return sortByDate(rows, (row) => row.sentAt, sort.dir, byName);
    case "replied":
      return sortByDate(rows, (row) => row.repliedAt, sort.dir, byName);
    default:
      return [...rows];
  }
}

/** A household on the invitations list. Ordered by the same rules, on one name. */
export interface InvitationSortable {
  name: string;
  sentAt: number | null;
  repliedAt: number | null;
}

export type InvitationSortKey = "name" | "sent" | "replied";

export function sortInvitationRows<T extends InvitationSortable>(
  rows: readonly T[],
  sort: { key: InvitationSortKey; dir: "asc" | "desc" },
): T[] {
  const byHousehold = (a: T, b: T) => a.name.localeCompare(b.name);
  const flip = sort.dir === "asc" ? 1 : -1;
  switch (sort.key) {
    case "sent":
      return sortByDate(rows, (row) => row.sentAt, sort.dir, byHousehold);
    case "replied":
      return sortByDate(rows, (row) => row.repliedAt, sort.dir, byHousehold);
    default:
      return [...rows].sort((a, b) => byHousehold(a, b) * flip);
  }
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

// ────────────────────────────────────────────────────────────── Filtering

/** Answers. A guest is exactly one of these, so choosing several means "or". */
export type ReplyFilter = "confirmed" | "pending" | "declined" | "not-contacted";

/** Attributes. Independent of the answer and of each other, so these mean "and". */
export type NeedFilter = "accommodation" | "vip";

/**
 * Whose list somebody is on.
 *
 * "" is everybody. "BOTH" is its own answer and not the absence of one — the
 * couples and relatives who belong to both families — which the old control
 * could not express at all: it offered "Both sides" meaning "don't filter",
 * so the one label that looked like it selected mutual guests was the one that
 * selected everybody.
 */
export type SideFilter = "" | "BOTH" | "BRIDE" | "GROOM";

export interface GuestFilters {
  reply: ReadonlySet<ReplyFilter>;
  needs: ReadonlySet<NeedFilter>;
}

export const NO_GUEST_FILTERS: GuestFilters = {
  reply: new Set<ReplyFilter>(),
  needs: new Set<NeedFilter>(),
};

export function anyGuestFilter(filters: GuestFilters): boolean {
  return filters.reply.size > 0 || filters.needs.size > 0;
}

/** Everything a filter looks at. */
export interface GuestFilterable {
  stdResponse: "YES" | "NO" | null;
  needsAccommodation: boolean;
  isVIP: boolean;
  rsvp: Record<string, string>;
}

function matchesReply(
  row: GuestFilterable,
  which: ReplyFilter,
  stage: "SAVE_THE_DATE" | "INVITATION",
): boolean {
  const statuses = Object.values(row.rsvp);
  if (stage === "SAVE_THE_DATE") {
    switch (which) {
      case "confirmed": return row.stdResponse === "YES";
      case "pending": return row.stdResponse === null;
      case "declined": return row.stdResponse === "NO";
      case "not-contacted": return statuses.every((s) => s === "NOT_INVITED");
    }
  }
  switch (which) {
    case "confirmed": return statuses.includes("CONFIRMED");
    case "pending": return statuses.some((s) => s === "PENDING");
    case "declined":
      return (
        statuses.length > 0 &&
        statuses.includes("DECLINED") &&
        statuses.every((s) => s === "DECLINED" || s === "NOT_INVITED")
      );
    case "not-contacted": return statuses.every((s) => s === "NOT_INVITED");
  }
}

/**
 * Whether a guest survives the chips.
 *
 * Two kinds of chip, and they combine differently on purpose. Answers are one
 * group and mean *or*, because nobody is both a yes and a no and requiring both
 * would always return nothing — picking "said yes" and "said no" asks for
 * everybody who has answered either way, which is a real question. Needs are
 * separate toggles and mean *and*, because "a VIP who still has no room" is the
 * list somebody is actually trying to build.
 *
 * An empty group is not a filter. Nothing selected is everybody.
 */
export function matchesGuestFilters(
  row: GuestFilterable,
  filters: GuestFilters,
  stage: "SAVE_THE_DATE" | "INVITATION",
): boolean {
  if (filters.reply.size > 0) {
    let any = false;
    for (const which of filters.reply) {
      if (matchesReply(row, which, stage)) {
        any = true;
        break;
      }
    }
    if (!any) return false;
  }

  if (filters.needs.has("accommodation") && !row.needsAccommodation) return false;
  if (filters.needs.has("vip") && !row.isVIP) return false;

  return true;
}
