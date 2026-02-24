require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const connectDB = require("./src/config/db");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

// Attach socket handler and expose quizHandler to REST controllers
const socketModule = require("./src/socket/index");
socketModule(io);
// After socket init, io._quizHandler is set; make it accessible via app
setImmediate(() => app.set("quizHandler", io._quizHandler));

connectDB();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({ message: "API running..." });
});

const authRoutes = require("./src/routes/authRoutes");
const testRoutes = require("./src/routes/testRoutes");
const profileRoutes = require("./src/routes/profileRoutes");
const groupRoutes = require("./src/routes/groupRoutes");
const chatRoutes = require("./src/routes/chatRoutes");
const threadRoutes = require("./src/routes/threadRoutes");
const aiRoutes = require("./src/routes/aiRoutes");
const quizRoutes = require("./src/routes/quizRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");
const resourceRoutes = require("./src/routes/resourceRoutes");
const forumRoutes = require("./src/routes/forumRoutes");
const eventRoutes = require("./src/routes/eventRoutes");
const clubRoutes = require("./src/routes/clubRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/threads", threadRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/forums", forumRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/clubs", clubRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});