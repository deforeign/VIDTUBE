import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;

  if ([fullName, email, username, password].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(400, "User Exists!");
  }

  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverLocalPath = req.files?.coverImage?.[0]?.path;


  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar Image is missing!");
  }
  if (!coverLocalPath) {
    throw new ApiError(400, "Cover Image is missing!");
  }

  let avatar;
  try {
    avatar = await uploadOnCloudinary(avatarLocalPath);
    if (!avatar || !avatar.url) {
      throw new Error("Avatar upload failed, no response from Cloudinary.");
    }
    console.log("Uploaded Avatar:", avatar);
  } catch (error) {
    console.error("Error uploading Avatar:", error);
    throw new ApiError(500, "Failed to upload Avatar");
  }

  let coverImage;
  try {
    coverImage = await uploadOnCloudinary(coverLocalPath);
    if (!coverImage || !coverImage.url) {
      throw new Error("Cover Image upload failed, no response from Cloudinary.");
    }
    console.log("Uploaded Cover Image:", coverImage);
  } catch (error) {
    console.error("Error uploading Cover Image:", error);
    // Clean up avatar if cover upload fails to avoid orphan files
    if (avatar?.public_id) {
      try {
        await deleteFromCloudinary(avatar.public_id);
      } catch (delErr) {
        console.error("Failed to delete avatar after cover upload failed:", delErr);
      }
    }
    throw new ApiError(500, "Failed to upload Cover Image");
  }

  try {
    const user = await User.create({
      fullName,
      avatar: avatar.url,
      coverImage: coverImage.url,
      email,
      password,
      username: username.toLowerCase(),
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
      throw new ApiError(500, "Something went wrong while creating user!");
    }

    return res.status(200).json(new ApiResponse(200, createdUser, "User Registered Successfully"));
  } catch (error) {
    console.error("User creation failed:", error);

    // Cleanup Cloudinary images to prevent orphan files
    if (avatar?.public_id) {
      try {
        await deleteFromCloudinary(avatar.public_id);
      } catch (delErr) {
        console.error("Failed to delete avatar during cleanup:", delErr);
      }
    }

    if (coverImage?.public_id) {
      try {
        await deleteFromCloudinary(coverImage.public_id);
      } catch (delErr) {
        console.error("Failed to delete cover image during cleanup:", delErr);
      }
    }

    throw new ApiError(500, "Something went wrong and images were deleted!");
  }
});

export { registerUser };
