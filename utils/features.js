import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { v2 as cloudinary } from "cloudinary";
import { getBase64, getSockets } from "../lib/helper.js";

// Without HTTPS a browser silently DROPS a 'secure: true' cookie, and
// 'sameSite: none' is not even valid without 'secure'. On minikube the app is
// served over http://canopy.local, so this is driven by the environment.
// The default stays true so real deployments keep their current behaviour -
// being insecure must be OPT-IN, never the default.
const secureCookies = process.env.COOKIE_SECURE !== "false";

const cookieOptions = {
  maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days
  sameSite: secureCookies ? "none" : "lax",
  httpOnly: true,
  secure: secureCookies,
};

const connectDB = async (uri) => {
  await mongoose
    .connect(uri, {
      dbName: "Canopy", //new thing to learn
    })
    .then((data) => {
      console.log(`MongoDB connected to database: ${data.connection.host}`);
    })
    .catch((error) => {
      throw error;
    });
};

const sendToken = (res, user, code, message) => {
  const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);

  return res.status(code).cookie("canopy-token", token, cookieOptions).json({
    success: true,
    user,
    message,
  });
};

const emitEvent = (req, event, users, data) => {
  let io = req.app.get("io");
  const usersSockets = getSockets(users);
  io.to(usersSockets).emit(event, data);
};

const uploadFilesToCloudinary = async (files = []) => {
  const uploadPromises = files.map((file) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        getBase64(file),
        {
          resource_type: "auto",
          public_id: uuid(),
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
    });
  });

  try {
    const results = await Promise.all(uploadPromises);

    const formattedResults = results.map((result) => ({
      public_id: result.public_id,
      url: result.secure_url,
    }));
    return formattedResults;
  } catch (err) {
    throw new Error("Error uploading files to cloudinary", err);
  }
};

const deleteFilesFromCloudinary = async (public_ids) => {
  //Delete Files From Cloudinary
};

export {
  connectDB,
  sendToken,
  cookieOptions,
  emitEvent,
  deleteFilesFromCloudinary,
  uploadFilesToCloudinary,
};
