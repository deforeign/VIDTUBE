import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = User.findById(userId)
    if (!user) {
      throw new ApiError(400, "User is missing!");
    }
  
    const accessToken=user.generateAccessToken()
    const refreshToken=user.generateRefreshToken()
  
    user.refreshToken=refreshToken
    await user.save(
      {validateBeforeSave: false}
    )
    return {accessToken,refreshToken}
  } catch (error) {
    throw new ApiError(500,"Something Went Wrong while generating access and refresh token!")
    
  }
}

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
})

const loginUser = asyncHandler(async (req,res) => {

  const {email, username, password} = req.body


  if(!email){
    throw new ApiError(400, "Email is missing!")
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if(!user){
    throw new ApiError(403, "User not found")
  }

  const isPasswordValid = await user.isPasswordCorrect(password) 

  if(!isPasswordValid){
    throw new ApiError(401,"Invalid Credentials")
  }

  const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id)

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",

  }

  return res
          .status(200)
          .cookie("accessToken",accessToken,options)
          .cookie(refreshToken,refreshToken,options)
          .json( new ApiResponse(200, loggedInUser, "User logged in successfully"))


})

const refreshAccessToken = asyncHandler( async (req,res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

  if(!incomingRefreshToken){
    throw new ApiError(401, "Refresh Token is required!")
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    )
    const user = await User.findById(decodedToken?._id)
    if(!user){
      throw new ApiError(401, "Invalid Refresh Token")
    }
    if(incomingRefreshToken !== user?.refreshToken){
      throw new ApiError(401, "Invalid refresh token")
    }

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",

    }

    const {accessToken, refreshToken: newRefreshToken}  = await generateAccessAndRefreshToken(user._id)
    return res
          .status(200)
          .cookie("accessToken",accessToken,options)
          .cookie("refreshToken",newRefreshToken,options)
          .json( 
            new ApiResponse(
              200, 
              {accessToken, newRefreshToken: newRefreshToken},
              "Access Token refreshed successfully!"))
  } catch (error) {

    throw new ApiError(500, "Something went wrong while generating access token!")
    
  }
})

const logoutUser = asyncHandler( async (req,res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { 
        refreshToken: undefined, 
      }
    },
    {
      new: true
    }
  )

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  }

  return res
          .status(200)
          .clearCookie("accessToken",options)
          .clearCookie("refreshToken",options)
          .json(new ApiResponse(200, {}, "User logged out successfully!"))
})

const changeCurrentPassword = asyncHandler(async (req, res) => {

  const { oldPassword, newPassword } = req.body

  const user = await User.findById(req.user?._id)

  const isPasswordValid = await user.isPasswordCorrect(oldPassword)

  if(!isPasswordValid){
    throw new ApiError(401, "Old Password is incorrect!")
  }


  user.password = newPassword
  await user.save({ validateBeforeSave: false })
  return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully!"))

  
});

const getCurrentUser = asyncHandler(async (req, res) => {

  return res.status(200).json(new ApiResponse(200, req.user, "Current user fetched successfully!  "))
  
  
});

const updateAccountDetails = asyncHandler(async (req, res) => {

  const { fullName, email } = req.body;

  if ([fullName, email].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email: email
      }
    },
    {
      new: true,
    }
  ).select("-password -refreshToken")

  return res.status(200).json(new ApiResponse(200, user, "Account details updated successfully!"));
  
  
});

const updateUserAvatar = asyncHandler(async (req, res) => {

  const avatarLocalPath = req.files?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "File is required!");
  }

  let avatar;
  try {
    avatar = await uploadOnCloudinary(avatarLocalPath);
    if (!avatar || !avatar.url) {
      throw new Error(500, "Avatar upload failed, no response from Cloudinary.");
    }
    console.log("Uploaded Avatar:", avatar);
  } catch (error) {
    console.error("Error uploading Avatar:", error);
    throw new ApiError(500, "Failed to upload Avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: { avatar: avatar.url },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res.status(200).json(new ApiResponse(200, user, "Avatar updated successfully!"));
  
  
});

const updateUserCoverImage = asyncHandler(async (req, res) => {

  const coverLocalPath = req.files?.path;

  if (!coverLocalPath) {
    throw new ApiError(400, "Cover Image File is required!");
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
    throw new ApiError(500, "Failed to upload Cover Image");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: { coverImage: coverImage.url },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res.status(200).json(new ApiResponse(200, user, "Cover Image updated successfully!"));
  
  
});

export { 
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage
}
