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

// Attach socket handler
require("./src/socket/index")(io);

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

app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/threads", threadRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});