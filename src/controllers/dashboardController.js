const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const AcademicGroup = require("../models/AcademicGroup");
const GroupMembership = require("../models/GroupMembership");
const ClubMembership = require("../models/ClubMembership");
const Club = require("../models/Club");
const Event = require("../models/Event");
const Notification = require("../models/Notification");
const DiscussionThread = require("../models/DiscussionThread");
const Quiz = require("../models/Quiz");
const AcademicResource = require("../models/AcademicResource");
const ForumThread = require("../models/ForumThread");
const Roadmap = require("../models/Roadmap");
const StudyPlan = require("../models/StudyPlan");

// ─── GET /api/dashboard ──────────────────────────────────────────────────────
// Returns a role-based data summary for the authenticated user
exports.getDashboard = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const now = new Date();

    // ── Common data (all roles) ────────────────────────────────────────────
    const user = await User.findById(userId).select("-password").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const [unreadNotifications, recentNotifications] = await Promise.all([
      Notification.countDocuments({ targetUserId: userId, isRead: false }),
      Notification.find({ targetUserId: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const upcomingEvents = await Event.find({ isActive: true, date: { $gte: now } })
      .sort({ date: 1 })
      .limit(5)
      .populate("organizer", "name email")
      .populate("clubId", "name logo")
      .populate("groupId", "name")
      .lean();

    const upcomingEventsFormatted = upcomingEvents.map((e) => ({
      _id: e._id,
      title: e.title,
      date: e.date,
      time: e.time,
      venue: e.venue,
      type: e.type,
      poster: e.poster,
      organizer: e.organizer,
      group: e.groupId || null,
      club: e.clubId || null,
      rsvpCount: e.rsvps.length,
      userRsvpd: e.rsvps.some((id) => id.toString() === userId.toString()),
    }));

    const base = {
      user,
      unreadNotifications,
      recentNotifications,
      upcomingEvents: upcomingEventsFormatted,
    };

    // ── STUDENT ────────────────────────────────────────────────────────────
    if (role === "STUDENT") {
      const [
        profile,
        groupMemberships,
        clubMemberships,
        roadmapCount,
        studyPlanCount,
        forumThreadCount,
      ] = await Promise.all([
        StudentProfile.findOne({ userId }).lean(),
        GroupMembership.find({ userId }).populate("groupId", "name branch year section type").lean(),
        ClubMembership.find({ userId }).populate("clubId", "name logo category").lean(),
        Roadmap.countDocuments({ userId }),
        StudyPlan.countDocuments({ userId }),
        ForumThread.countDocuments({ createdBy: userId, isActive: true }),
      ]);

      const groupIds = groupMemberships.map((m) => m.groupId?._id).filter(Boolean);

      const [
        unresolvedThreads,
        totalThreadsInGroups,
        quizzesAvailable,
        quizzesParticipated,
        resourcesInGroups,
      ] = await Promise.all([
        DiscussionThread.countDocuments({ groupId: { $in: groupIds }, isResolved: false }),
        DiscussionThread.countDocuments({ groupId: { $in: groupIds } }),
        Quiz.countDocuments({ groupId: { $in: groupIds }, status: { $in: ["CREATED", "RUNNING"] } }),
        Quiz.countDocuments({ groupId: { $in: groupIds }, "participants.userId": userId }),
        AcademicResource.countDocuments({ groupId: { $in: groupIds } }),
      ]);

      return res.json({
        ...base,
        role: "STUDENT",
        profile: profile || null,
        groups: groupMemberships.map((m) => m.groupId).filter(Boolean),
        clubs: clubMemberships.map((m) => ({
          ...m.clubId,
          clubRole: m.role,
        })),
        stats: {
          groupCount: groupIds.length,
          clubCount: clubMemberships.length,
          unresolvedThreads,
          totalThreadsInGroups,
          quizzesAvailable,
          quizzesParticipated,
          resourcesInGroups,
          roadmaps: roadmapCount,
          studyPlans: studyPlanCount,
          forumThreads: forumThreadCount,
        },
      });
    }

    // ── FACULTY ────────────────────────────────────────────────────────────
    if (role === "FACULTY") {
      const [
        totalGroups,
        totalStudents,
        clubsLed,
        eventsOrganized,
        quizzesCreated,
        resourcesUploaded,
        totalThreads,
        unresolvedThreads,
        totalForumThreads,
      ] = await Promise.all([
        AcademicGroup.countDocuments({ isActive: true }),
        User.countDocuments({ role: "STUDENT" }),
        ClubMembership.find({ userId, role: { $in: ["LEADER", "CO_LEADER"] } })
          .populate("clubId", "name logo category")
          .lean(),
        Event.countDocuments({ organizer: userId, isActive: true }),
        Quiz.countDocuments({ createdBy: userId }),
        AcademicResource.countDocuments({ uploadedBy: userId }),
        DiscussionThread.countDocuments({}),
        DiscussionThread.countDocuments({ isResolved: false }),
        ForumThread.countDocuments({ isActive: true }),
      ]);

      const recentQuizzes = await Quiz.find({ createdBy: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title groupId status createdAt participants")
        .populate("groupId", "name")
        .lean();

      return res.json({
        ...base,
        role: "FACULTY",
        clubsManaged: clubsLed.map((m) => ({
          ...m.clubId,
          clubRole: m.role,
        })),
        recentQuizzes: recentQuizzes.map((q) => ({
          _id: q._id,
          title: q.title,
          group: q.groupId,
          status: q.status,
          participantCount: q.participants.length,
          createdAt: q.createdAt,
        })),
        stats: {
          totalGroups,
          totalStudents,
          eventsOrganized,
          quizzesCreated,
          resourcesUploaded,
          totalThreads,
          unresolvedThreads,
          totalForumThreads,
        },
      });
    }

    // ── ADMIN ──────────────────────────────────────────────────────────────
    if (role === "ADMIN") {
      const [
        totalUsers,
        studentCount,
        facultyCount,
        adminCount,
        totalGroups,
        totalClubs,
        totalActiveEvents,
        totalUpcomingEvents,
        totalQuizzes,
        totalResources,
        totalThreads,
        unresolvedThreads,
        totalForumThreads,
        totalNotifications,
      ] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: "STUDENT" }),
        User.countDocuments({ role: "FACULTY" }),
        User.countDocuments({ role: "ADMIN" }),
        AcademicGroup.countDocuments({ isActive: true }),
        Club.countDocuments({ isActive: true }),
        Event.countDocuments({ isActive: true }),
        Event.countDocuments({ isActive: true, date: { $gte: now } }),
        Quiz.countDocuments({}),
        AcademicResource.countDocuments({}),
        DiscussionThread.countDocuments({}),
        DiscussionThread.countDocuments({ isResolved: false }),
        ForumThread.countDocuments({ isActive: true }),
        Notification.countDocuments({}),
      ]);

      // Recent signups
      const recentUsers = await User.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select("email role name createdAt")
        .lean();

      // Events by type breakdown
      const [collegeEvents, groupEvents, clubEvents] = await Promise.all([
        Event.countDocuments({ isActive: true, type: "COLLEGE" }),
        Event.countDocuments({ isActive: true, type: "GROUP" }),
        Event.countDocuments({ isActive: true, type: "CLUB" }),
      ]);

      return res.json({
        ...base,
        role: "ADMIN",
        recentUsers,
        stats: {
          users: {
            total: totalUsers,
            students: studentCount,
            faculty: facultyCount,
            admins: adminCount,
          },
          groups: totalGroups,
          clubs: totalClubs,
          events: {
            total: totalActiveEvents,
            upcoming: totalUpcomingEvents,
            byType: { college: collegeEvents, group: groupEvents, club: clubEvents },
          },
          quizzes: totalQuizzes,
          resources: totalResources,
          threads: {
            total: totalThreads,
            unresolved: unresolvedThreads,
          },
          forumThreads: totalForumThreads,
          notifications: totalNotifications,
        },
      });
    }

    // Fallback
    res.json(base);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
