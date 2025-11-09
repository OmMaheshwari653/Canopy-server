import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { v2 as cloudinary } from "cloudinary";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { corsOptions } from "./constants/config.js";
import {
  CHAT_JOINED,
  CHAT_LEAVED,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  ONLINE_USERS,
  START_TYPING,
  STOP_TYPING,
} from "./constants/events.js";
import { getSockets } from "./lib/helper.js";
import { socketAuthenticator } from "./middlewares/auth.js";
import { errorMiddleware } from "./middlewares/error.js";
import { connectDB } from "./utils/features.js";
import { Message } from "./models/message.js";
import { ErrorHandler } from "./utils/utility.js";

import adminRoute from "./routes/admin.js";
import chatRoute from "./routes/chat.js";
import userRoute from "./routes/user.js";
import cors from "cors";

dotenv.config({
  path: "./.env",
});

const mongoURI = process.env.MONGO_URI;
const port = process.env.PORT || 3000;
const envMode = process.env.NODE_ENV.trim() || "PRODUCTION";
const adminSecretKey = process.env.ADMIN_SECRET_KEY || "adsasdsdfsdfsdfd";
const userSocketIDs = new Map();
const onlineUsers = new Set();

connectDB(mongoURI);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

app.set("io", io);

// Using Middlewares Here
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));

app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/admin", adminRoute);

app.get("/", (req, res) => {
  res.send("Hello World");
});

io.use((socket, next) => {
  cookieParser()(
    socket.request,
    {},
    async (err) => await socketAuthenticator(err, socket, next)
  );
});

// Helper function for socket error handling
const emitSocketError = (socket, error, event = "SOCKET_ERROR") => {
  const errorMessage =
    error instanceof ErrorHandler ? error.message : "Internal Server Error";
  const statusCode = error instanceof ErrorHandler ? error.statusCode : 500;

  socket.emit(event, {
    success: false,
    message: errorMessage,
    statusCode,
  });
};

io.on("connection", (socket) => {
  const user = socket.user;

  if (!user || !user._id) {
    const error = new ErrorHandler(
      "Socket connected without authenticated user",
      401
    );
    emitSocketError(socket, error, "AUTH_ERROR");
    socket.disconnect(true);
    return;
  }

  try {
    const userId = user._id.toString();
    userSocketIDs.set(userId, socket.id);
    onlineUsers.add(userId);

    io.emit(ONLINE_USERS, Array.from(onlineUsers));
  } catch (error) {
    const err = new ErrorHandler("Failed to add user to online list", 500);
    emitSocketError(socket, err, "CONNECTION_ERROR");
    socket.disconnect(true);
    return;
  }

  socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {
    try {
      if (!chatId || !members || !message) {
        throw new ErrorHandler("Invalid message data provided", 400);
      }

      const messageForRealTime = {
        content: message,
        _id: uuid(),
        sender: {
          _id: user._id,
          name: user.name,
        },
        chat: chatId,
        createdAt: new Date().toISOString(),
      };

      const messageForDB = {
        content: message,
        sender: user._id,
        chat: chatId,
      };

      const membersSocket = getSockets(members);
      io.to(membersSocket).emit(NEW_MESSAGE, {
        chatId,
        message: messageForRealTime,
      });
      io.to(membersSocket).emit(NEW_MESSAGE_ALERT, { chatId });

      await Message.create(messageForDB);
    } catch (error) {
      emitSocketError(socket, error, "MESSAGE_ERROR");
    }
  });

  socket.on(START_TYPING, ({ members, chatId }) => {
    try {
      if (!members || !chatId) {
        throw new ErrorHandler("Invalid typing data", 400);
      }

      const membersSockets = getSockets(members);
      socket.to(membersSockets).emit(START_TYPING, { chatId });
    } catch (error) {
      emitSocketError(socket, error, "TYPING_ERROR");
    }
  });

  socket.on(STOP_TYPING, ({ members, chatId }) => {
    try {
      if (!members || !chatId) {
        throw new ErrorHandler("Invalid typing data", 400);
      }

      const membersSockets = getSockets(members);
      socket.to(membersSockets).emit(STOP_TYPING, { chatId });
    } catch (error) {
      emitSocketError(socket, error, "TYPING_ERROR");
    }
  });

  socket.on(CHAT_JOINED, ({ userId, members }) => {
    try {
      if (!userId || !members) {
        throw new ErrorHandler("Invalid chat join data", 400);
      }

      onlineUsers.add(userId.toString());
      const membersSocket = getSockets(members);
      io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
    } catch (error) {
      emitSocketError(socket, error, "CHAT_JOIN_ERROR");
    }
  });

  socket.on(CHAT_LEAVED, ({ userId, members }) => {
    try {
      if (!userId || !members) {
        throw new ErrorHandler("Invalid chat leave data", 400);
      }

      onlineUsers.delete(userId.toString());
      const membersSocket = getSockets(members);
      io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
    } catch (error) {
      emitSocketError(socket, error, "CHAT_LEAVE_ERROR");
    }
  });

  socket.on("disconnect", () => {
    try {
      if (user && user._id) {
        const userId = user._id.toString();

        userSocketIDs.delete(userId);
        onlineUsers.delete(userId);

        socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
      }
    } catch (error) {
      // Silent fail - socket already disconnected
    }
  });
});

app.use(errorMiddleware);

server.listen(port, () => {
  console.log(`Server is running on port ${port} in ${envMode} Mode`);
});

export { envMode, adminSecretKey, userSocketIDs };
