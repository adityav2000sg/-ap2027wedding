/**
 * Guests who share a planning/accommodation group with their partner but must
 * each receive a private invitation link and reply only for themselves.
 *
 * This is deliberately a narrow exception list. Everyone else continues to
 * use the link attached to their household/group.
 */
export const PERSONAL_INVITATION_COUPLES = [
  ["Muttaqee Dar", "Bintay Zahra"],
  ["Josh Keeling", "Jelena Vukovic"],
  ["Sebastien Santhiapillai", "Sophie Norman"],
  ["Alistair McGuire", "Priyanka Nankani"],
  ["Angus Forbes", "Katie O'Byrne"],
  ["John Nicolaou", "Marilena Nicolaou"],
  ["Josh Ray", "Ellie Cherrill"],
  ["Abi Bateman", "Stef Roxanis"],
] as const;

const personalInvitationNames = new Set(
  PERSONAL_INVITATION_COUPLES.flat().map((name) => name.toLocaleLowerCase()),
);

export function hasPersonalInvitation(firstName: string, lastName: string): boolean {
  return personalInvitationNames.has(
    `${firstName} ${lastName}`.trim().replace(/\s+/g, " ").toLocaleLowerCase(),
  );
}
