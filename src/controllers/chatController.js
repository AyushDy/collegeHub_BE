const GroupChatMessage = require("../models/GroupChatMessage");
const { isMember } = require("../utils/groupMembership");

// POST /api/chat/upload-image — upload image for chat, returns imageUrl
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "Image file is required" });

    const { groupId } = req.body;
    if (!groupId)
      return res.status(400).json({ message: "groupId is required" });

    const member = await isMember(req.user.userId, req.user.role, groupId);
    if (!member)
      return res.status(403).json({ message: "You are not a member of this group" });

    res.json({ imageUrl: req.file.path });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PUT /api/chat/:messageId — edit own message
exports.editMessage = async (req, res) => {
  try {
    const msg = await GroupChatMessage.findById(req.params.messageId);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    if (msg.sender.toString() !== req.user.userId)
      return res.status(403).json({ message: "You can only edit your own messages" });

    const { message } = req.body;
    if (!message || !message.trim())
      return res.status(400).json({ message: "Message cannot be empty" });

    msg.message = message.trim();
    msg.isEdited = true;
    await msg.save();

    const populated = await msg.populate("sender", "email role");
    res.json({ message: "Message updated", data: populated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/chat/:messageId — delete own message (students) or any message (faculty/admin)
exports.deleteMessage = async (req, res) => {
  try {
    const msg = await GroupChatMessage.findById(req.params.messageId);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    const isOwner = msg.sender.toString() === req.user.userId;
    const isModerator = req.user.role === "FACULTY" || req.user.role === "ADMIN";

    if (!isOwner && !isModerator)
      return res.status(403).json({ message: "You can only delete your own messages" });

    await msg.deleteOne();
    res.json({ message: "Message deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
