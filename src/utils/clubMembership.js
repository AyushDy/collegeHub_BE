const ClubMembership = require("../models/ClubMembership");

/**
 * Returns the ClubMembership doc if user belongs to the club, else null.
 * FACULTY / ADMIN always bypass.
 */
const isClubMember = async (userId, role, clubId) => {
  if (role === "FACULTY" || role === "ADMIN") return { role: "ADMIN" };
  return ClubMembership.findOne({ userId, clubId });
};

/**
 * Returns true if user is the club LEADER or CO_LEADER, or is ADMIN.
 */
const isClubLeader = async (userId, role, clubId) => {
  if (role === "ADMIN") return true;
  const m = await ClubMembership.findOne({ userId, clubId });
  return m && (m.role === "LEADER" || m.role === "CO_LEADER");
};

module.exports = { isClubMember, isClubLeader };
