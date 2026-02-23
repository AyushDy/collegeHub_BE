const StudentProfile = require("../models/StudentProfile");
const AcademicGroup = require("../models/AcademicGroup");
const GroupMembership = require("../models/GroupMembership");

/**
 * Returns the YEAR_SECTION AcademicGroup for a student (backward compat).
 */
const getStudentGroup = async (userId) => {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile) return null;
  return AcademicGroup.findOne({
    branch: profile.branch.toUpperCase(),
    year: profile.year,
    section: profile.section.toUpperCase(),
    type: "YEAR_SECTION",
    isActive: true,
  });
};

/**
 * Returns ALL AcademicGroups a student is a member of via GroupMembership.
 */
const getStudentGroups = async (userId) => {
  const memberships = await GroupMembership.find({ userId }).lean();
  if (!memberships.length) return [];
  const groupIds = memberships.map((m) => m.groupId);
  return AcademicGroup.find({ _id: { $in: groupIds }, isActive: true }).sort({ type: 1 });
};

/**
 * Returns true if user belongs to a group.
 * FACULTY / ADMIN always bypass (read-only access to all groups).
 */
const isMember = async (userId, role, groupId) => {
  if (role === "FACULTY" || role === "ADMIN") return true;
  const membership = await GroupMembership.findOne({ userId, groupId });
  return !!membership;
};

module.exports = { getStudentGroup, getStudentGroups, isMember };
