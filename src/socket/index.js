const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const GroupChatMessage = require("../models/GroupChatMessage");
const AcademicGroup = require("../models/AcademicGroup");
const DiscussionThread = require("../models/DiscussionThread");
const DiscussionReply = require("../models/DiscussionReply");
const { getStudentGroups, isMember } = require("../utils/groupMembership");

module.exports = (io) => {
  // ─── Auth middleware for Socket.IO ─────────────────────────────────────────
  io.use((socket, next) => {
    try {
      const rawCookies = socket.handshake.headers.cookie || "";
      const cookies = cookie.parse(rawCookies);
      const token = cookies.token;

      if (!token) return next(new Error("Not authorized: no token"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded; // { userId, role }
      next();
    } catch {
      next(new Error("Not authorized: invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.user.userId}`);

    // ── joinGroup ─────────────────────────────────────────────────────────────
    socket.on("joinGroup", async ({ groupId }) => {
      try {
        const group = await AcademicGroup.findById(groupId);
        if (!group) return socket.emit("error", { message: "Group not found" });

        // Students must be a member via GroupMembership; faculty/admin can join any
        if (socket.user.role === "STUDENT") {
          const member = await isMember(socket.user.userId, socket.user.role, groupId);
          if (!member)
            return socket.emit("error", { message: "You are not a member of this group" });
        }

        socket.join(groupId);
        socket.emit("joinedGroup", { groupId, groupName: group.name });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // ── sendMessage ───────────────────────────────────────────────────────────
    socket.on("sendMessage", async ({ groupId, message }) => {
      try {
        if (socket.user.role !== "STUDENT")
          return socket.emit("error", { message: "Only students can send messages" });

        const member = await isMember(socket.user.userId, socket.user.role, groupId);
        if (!member)
          return socket.emit("error", { message: "You are not a member of this group" });

        if (!message || !message.trim())
          return socket.emit("error", { message: "Message cannot be empty" });

        const newMsg = await GroupChatMessage.create({
          groupId,
          sender: socket.user.userId,
          message: message.trim(),
        });

        const populated = await newMsg.populate("sender", "email role");

        // Broadcast to everyone in the room including sender
        io.to(groupId).emit("receiveMessage", populated);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // ── editMessage (optional advanced) ───────────────────────────────────────
    socket.on("editMessage", async ({ messageId, message }) => {
      try {
        const msg = await GroupChatMessage.findById(messageId);
        if (!msg) return socket.emit("error", { message: "Message not found" });

        if (msg.sender.toString() !== socket.user.userId)
          return socket.emit("error", { message: "You can only edit your own messages" });

        if (!message || !message.trim())
          return socket.emit("error", { message: "Message cannot be empty" });

        msg.message = message.trim();
        msg.isEdited = true;
        await msg.save();

        const populated = await msg.populate("sender", "email role");
        io.to(msg.groupId.toString()).emit("messageEdited", populated);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // ── deleteMessage (optional advanced) ─────────────────────────────────────
    socket.on("deleteMessage", async ({ messageId }) => {
      try {
        const msg = await GroupChatMessage.findById(messageId);
        if (!msg) return socket.emit("error", { message: "Message not found" });

        if (msg.sender.toString() !== socket.user.userId)
          return socket.emit("error", { message: "You can only delete your own messages" });

        const groupId = msg.groupId.toString();
        await msg.deleteOne();
        io.to(groupId).emit("messageDeleted", { messageId });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // ── createThread ──────────────────────────────────────────────────────────
    socket.on("createThread", async ({ groupId, title, content, subject }) => {
      try {
        if (socket.user.role !== "STUDENT")
          return socket.emit("error", { message: "Only students can create threads" });

        if (!groupId || !title?.trim() || !content?.trim())
          return socket.emit("error", { message: "groupId, title, and content are required" });

        const member = await isMember(socket.user.userId, socket.user.role, groupId);
        if (!member)
          return socket.emit("error", { message: "You are not a member of this group" });

        const thread = await DiscussionThread.create({
          groupId,
          author: socket.user.userId,
          title: title.trim(),
          content: content.trim(),
          subject: subject?.trim() || "General",
        });

        const populated = await thread.populate("author", "email role");
        io.to(groupId).emit("newThread", populated);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // ── replyToThread ─────────────────────────────────────────────────────────
    socket.on("replyToThread", async ({ threadId, content }) => {
      try {
        if (!threadId || !content?.trim())
          return socket.emit("error", { message: "threadId and content are required" });

        const thread = await DiscussionThread.findById(threadId);
        if (!thread)
          return socket.emit("error", { message: "Thread not found" });

        const groupId = thread.groupId.toString();
        const member = await isMember(socket.user.userId, socket.user.role, groupId);
        if (!member)
          return socket.emit("error", { message: "You are not a member of this group" });

        const reply = await DiscussionReply.create({
          threadId,
          author: socket.user.userId,
          content: content.trim(),
        });

        const populated = await reply.populate("author", "email role");
        io.to(groupId).emit("newReply", { threadId, reply: populated });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("resolveThread", async ({ threadId }) => {
      try {
        if (!threadId)
          return socket.emit("error", { message: "threadId is required" });

        const thread = await DiscussionThread.findById(threadId);
        if (!thread)
          return socket.emit("error", { message: "Thread not found" });

        const groupId = thread.groupId.toString();
        const member = await isMember(socket.user.userId, socket.user.role, groupId);
        if (!member)
          return socket.emit("error", { message: "You are not a member of this group" });

        // Only the thread author, FACULTY, or ADMIN can resolve
        const isAuthor = thread.author.toString() === socket.user.userId;
        if (!isAuthor && socket.user.role === "STUDENT")
          return socket.emit("error", { message: "Only the thread author can mark it resolved" });

        thread.isResolved = true;
        thread.resolvedBy = socket.user.userId;
        await thread.save();

        io.to(groupId).emit("threadResolved", {
          threadId,
          resolvedBy: socket.user.userId,
        });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // ── acceptReply ───────────────────────────────────────────────────────────
    socket.on("acceptReply", async ({ replyId }) => {
      try {
        if (socket.user.role !== "STUDENT")
          return socket.emit("error", { message: "Only students can accept replies" });

        if (!replyId)
          return socket.emit("error", { message: "replyId is required" });

        const reply = await DiscussionReply.findById(replyId);
        if (!reply)
          return socket.emit("error", { message: "Reply not found" });

        const thread = await DiscussionThread.findById(reply.threadId);
        if (!thread)
          return socket.emit("error", { message: "Thread not found" });

        if (thread.author.toString() !== socket.user.userId)
          return socket.emit("error", { message: "Only the thread author can accept a reply" });

        reply.isAccepted = true;
        await reply.save();

        const groupId = thread.groupId.toString();
        io.to(groupId).emit("replyAccepted", {
          replyId,
          threadId: thread._id.toString(),
        });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.user.userId}`);
    });
  });
};
