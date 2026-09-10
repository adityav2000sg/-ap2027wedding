const RSVP_CODE_LENGTH = 12;
const SHORT_RSVP_CODE = new RegExp(`-([a-z0-9]{${RSVP_CODE_LENGTH}})$`, "i");

function invitationSlug(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "invitation"
  );
}

/** A readable public alias that keeps a strong private part of the real token. */
export function publicRsvpKey(name: string, fullToken: string): string {
  const code = fullToken.slice(0, RSVP_CODE_LENGTH).toLowerCase();
  if (!/^[a-z0-9]{12}$/.test(code)) {
    throw new Error("An RSVP token must begin with at least 12 letters or numbers.");
  }
  return `${invitationSlug(name)}-${code}`;
}

export function publicRsvpPath(name: string, fullToken: string): string {
  return `/rsvp/${publicRsvpKey(name, fullToken)}`;
}

/** Extract the private lookup prefix from a readable RSVP path segment. */
export function rsvpCodeFromPath(value: string): string | null {
  return value.match(SHORT_RSVP_CODE)?.[1]?.toLowerCase() ?? null;
}
