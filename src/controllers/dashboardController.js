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

// ─── Static / dummy data sent alongside real data ────────────────────────────

const COMMON_ANNOUNCEMENTS = [
  { id: 1, title: "Welcome to CollegeHub!", body: "Explore groups, clubs, quizzes, and more. Complete your profile to get started.", type: "info", pinned: true },
  { id: 2, title: "Mid-Semester Exams Approaching", body: "Mid-semester examinations are scheduled from the 3rd week of October. Check your department notice board for the detailed timetable.", type: "exam", pinned: false },
  { id: 3, title: "Annual Tech Fest 2025", body: "Registrations now open for TechNova 2025! Participate in hackathons, workshops, and coding contests.", type: "event", pinned: false },
  { id: 4, title: "Library Hours Extended", body: "The central library will remain open until 10 PM on weekdays during the exam period.", type: "info", pinned: false },
];

const ACADEMIC_CALENDAR = [
  { date: "2025-08-01", label: "Semester Begins" },
  { date: "2025-09-15", label: "Last Date to Drop Courses" },
  { date: "2025-10-13", label: "Mid-Semester Exams Start" },
  { date: "2025-10-25", label: "Mid-Semester Exams End" },
  { date: "2025-11-01", label: "Fest Week" },
  { date: "2025-11-25", label: "End-Semester Exams Start" },
  { date: "2025-12-10", label: "End-Semester Exams End" },
  { date: "2025-12-15", label: "Semester Ends" },
];

const STUDENT_QUICK_LINKS = [
  { label: "My Profile", path: "/profile", icon: "user" },
  { label: "My Groups", path: "/groups", icon: "users" },
  { label: "My Clubs", path: "/clubs", icon: "star" },
  { label: "Quizzes", path: "/quizzes", icon: "help-circle" },
  { label: "Forums", path: "/forums", icon: "message-square" },
  { label: "Resources", path: "/resources", icon: "book-open" },
  { label: "Roadmaps", path: "/roadmaps", icon: "map" },
  { label: "Study Plans", path: "/study-plans", icon: "calendar" },
];

const STUDENT_TIPS = [
  "Use the Pomodoro technique: study 25 min, break 5 min, repeat.",
  "Join at least one club — it boosts both skills and your resume.",
  "Review your quiz scores weekly to track progress.",
  "Explore AI-generated roadmaps to plan your learning path.",
  "Upload and share resources to help your group members.",
  "Start forum discussions to clarify doubts before exams.",
];

const STUDENT_TRENDING_TOPICS = [
  { title: "How to prepare for placement season?", tag: "career" },
  { title: "Best resources for Data Structures & Algorithms", tag: "academics" },
  { title: "Tips for final year project selection", tag: "project" },
  { title: "Internship experience sharing thread", tag: "career" },
  { title: "Open-source contributions for beginners", tag: "tech" },
];

const FACULTY_QUICK_LINKS = [
  { label: "Create Quiz", path: "/quizzes/create", icon: "plus-circle" },
  { label: "Upload Resource", path: "/resources/upload", icon: "upload" },
  { label: "Create Event", path: "/events/create", icon: "calendar" },
  { label: "Manage Clubs", path: "/clubs", icon: "star" },
  { label: "Discussion Threads", path: "/threads", icon: "message-circle" },
  { label: "Forums", path: "/forums", icon: "message-square" },
];

const FACULTY_TIPS = [
  "Schedule quizzes regularly to keep students engaged.",
  "Use timed quizzes to simulate exam conditions.",
  "Share resources in groups for easy student access.",
  "Create events for workshops and guest lectures.",
  "Encourage students to participate in forum discussions.",
  "Review unresolved threads to address student doubts.",
];

const PLATFORM_HIGHLIGHTS = [
  { title: "Real-Time Quizzes", description: "Create and run live quizzes with instant scoring and leaderboards." },
  { title: "AI Study Tools", description: "Generate personalized roadmaps and study plans powered by AI." },
  { title: "Club Management", description: "Create clubs, manage members, and organise club events." },
  { title: "Resource Library", description: "Upload and share academic resources within groups." },
  { title: "Discussion Forums", description: "Campus-wide forums with likes, dislikes, and threaded replies." },
];

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
      announcements: COMMON_ANNOUNCEMENTS,
      academicCalendar: ACADEMIC_CALENDAR,
      platformHighlights: PLATFORM_HIGHLIGHTS,
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
        recentQuizResults,
      ] = await Promise.all([
        DiscussionThread.countDocuments({ groupId: { $in: groupIds }, isResolved: false }),
        DiscussionThread.countDocuments({ groupId: { $in: groupIds } }),
        Quiz.countDocuments({ groupId: { $in: groupIds }, status: { $in: ["CREATED", "RUNNING"] } }),
        Quiz.countDocuments({ groupId: { $in: groupIds }, "participants.userId": userId }),
        AcademicResource.countDocuments({ groupId: { $in: groupIds } }),
        Quiz.find(
          { groupId: { $in: groupIds }, "participants.userId": userId, status: "ENDED" }
        )
          .sort({ endedAt: -1 })
          .limit(5)
          .select("title groupId questions participants endedAt")
          .populate("groupId", "name")
          .lean(),
      ]);

      const quizScores = recentQuizResults.map((q) => {
        const entry = q.participants.find((p) => p.userId.toString() === userId.toString());
        return {
          _id: q._id,
          title: q.title,
          group: q.groupId,
          totalQuestions: q.questions.length,
          score: entry ? entry.score : 0,
          totalResponseTimeMs: entry ? entry.totalResponseTimeMs : 0,
          endedAt: q.endedAt,
        };
      });

      return res.json({
        ...base,
        role: "STUDENT",
        profile: profile || null,
        groups: groupMemberships.map((m) => m.groupId).filter(Boolean),
        clubs: clubMemberships.map((m) => ({
          ...m.clubId,
          clubRole: m.role,
        })),
        recentQuizScores: quizScores,
        quickLinks: STUDENT_QUICK_LINKS,
        tips: STUDENT_TIPS,
        trendingTopics: STUDENT_TRENDING_TOPICS,
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
        quickLinks: FACULTY_QUICK_LINKS,
        tips: FACULTY_TIPS,
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
